import { createHash, randomBytes, randomUUID } from "node:crypto";
import bcrypt from "bcryptjs";
import { pool } from "./db.js";
import { config } from "./config.js";

const loginAttempts = new Map();
const MAX_ATTEMPTS = 10;
const WINDOW_MS = 15 * 60 * 1000;

function normalizeEmail(value) {
  return typeof value === "string" ? value.trim().toLowerCase() : "";
}

function hashToken(token) {
  return createHash("sha256").update(token).digest("hex");
}

function parseCookie(header) {
  return Object.fromEntries(
    (header || "").split(";").map((entry) => entry.trim().split("=")).filter(([key, value]) => key && value),
  );
}

function cookieOptions() {
  return {
    httpOnly: true,
    secure: config.session.secure,
    sameSite: "strict",
    path: "/",
    maxAge: config.session.days * 24 * 60 * 60 * 1000,
  };
}

function recordAttempt(key) {
  const now = Date.now();
  const existing = (loginAttempts.get(key) || []).filter((timestamp) => now - timestamp < WINDOW_MS);
  existing.push(now);
  loginAttempts.set(key, existing);
  return existing.length <= MAX_ATTEMPTS;
}

function clearAttempts(key) {
  loginAttempts.delete(key);
}

export function checkAuthRateLimit(req, res, next) {
  const key = req.ip || req.socket.remoteAddress || "unknown";
  if (!recordAttempt(key)) return res.status(429).json({ error: "Too many authentication attempts. Try again later." });
  req.authRateKey = key;
  next();
}

export async function createUser(emailValue, password) {
  const email = normalizeEmail(emailValue);
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new Error("Enter a valid email address.");
  if (typeof password !== "string" || password.length < 12 || password.length > 128) {
    throw new Error("Password must be between 12 and 128 characters.");
  }
  const id = randomUUID();
  const passwordHash = await bcrypt.hash(password, 12);
  try {
    await pool.execute("INSERT INTO users (id, email, password_hash) VALUES (?, ?, ?)", [id, email, passwordHash]);
  } catch (error) {
    if (error.code === "ER_DUP_ENTRY") throw new Error("An account with that email already exists.");
    throw error;
  }
  return { id, email };
}

export async function verifyUser(emailValue, password) {
  const email = normalizeEmail(emailValue);
  const [rows] = await pool.execute("SELECT id, email, password_hash FROM users WHERE email = ? LIMIT 1", [email]);
  const user = rows[0];
  if (!user || !(await bcrypt.compare(String(password || ""), user.password_hash))) {
    throw new Error("Invalid email or password.");
  }
  return { id: user.id, email: user.email };
}

export async function establishSession(res, user) {
  const token = randomBytes(32).toString("base64url");
  const expiresAt = new Date(Date.now() + cookieOptions().maxAge);
  await pool.execute("INSERT INTO sessions (token_hash, user_id, expires_at) VALUES (?, ?, ?)", [
    hashToken(token),
    user.id,
    expiresAt,
  ]);
  res.cookie(config.session.cookieName, token, cookieOptions());
}

export async function revokeSession(req, res) {
  const token = parseCookie(req.headers.cookie)[config.session.cookieName];
  if (token) await pool.execute("DELETE FROM sessions WHERE token_hash = ?", [hashToken(token)]);
  res.clearCookie(config.session.cookieName, { ...cookieOptions(), maxAge: undefined });
}

export async function findRequestUser(request) {
  const token = parseCookie(request.headers.cookie)[config.session.cookieName];
  if (!token) return null;
  const [rows] = await pool.execute(
    `SELECT u.id, u.email
       FROM sessions s JOIN users u ON u.id = s.user_id
      WHERE s.token_hash = ? AND s.expires_at > NOW(3)
      LIMIT 1`,
    [hashToken(token)],
  );
  return rows[0] || null;
}

export async function requireAuth(req, res, next) {
  try {
    req.user = await findRequestUser(req);
    if (!req.user) return res.status(401).json({ error: "Authentication required." });
    next();
  } catch (error) {
    next(error);
  }
}

export function requireTrustedOrigin(req, res, next) {
  if (["GET", "HEAD", "OPTIONS"].includes(req.method)) return next();
  if (req.headers.origin && req.headers.origin === config.clientOrigin) return next();
  return res.status(403).json({ error: "Request origin is not allowed." });
}

export function authenticationSucceeded(req) {
  clearAttempts(req.authRateKey);
}
