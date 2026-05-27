import "dotenv/config";

export const config = {
  nodeEnv: process.env.NODE_ENV || "development",
  port: Number(process.env.PORT || 4000),
  host: process.env.HOST || "127.0.0.1",
  clientOrigin: process.env.CLIENT_ORIGIN || "http://localhost:5173",
  databaseUrl: process.env.DATABASE_URL,
  mysql: {
    host: process.env.DB_HOST || "127.0.0.1",
    port: Number(process.env.DB_PORT || 3306),
    user: process.env.DB_USER || "cliflow",
    password: process.env.DB_PASSWORD || "",
    database: process.env.DB_NAME || "cliflow",
  },
  session: {
    cookieName: "cliflow_session",
    days: Number(process.env.SESSION_DAYS || 7),
    secure: process.env.COOKIE_SECURE === "true" || process.env.NODE_ENV === "production",
  },
  registrationEnabled: (process.env.ALLOW_REGISTRATION || (process.env.NODE_ENV === "production" ? "false" : "true")) === "true",
};

export function assertProductionConfig() {
  if (config.nodeEnv !== "production") return;
  if (!config.session.secure) throw new Error("COOKIE_SECURE must be true in production.");
  if (!config.databaseUrl && (!process.env.DB_PASSWORD || !process.env.DB_USER)) {
    throw new Error("MySQL credentials are required in production.");
  }
  if (!config.clientOrigin.startsWith("https://")) {
    throw new Error("CLIENT_ORIGIN must use HTTPS in production.");
  }
}
