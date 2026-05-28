import { promises as fs } from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { fileURLToPath } from "node:url";
import { pool } from "./db.js";

const seedsDir = path.resolve(fileURLToPath(new URL("../seeds", import.meta.url)));
const MAX_NODES = 250;
const MAX_EDGES = 1000;

function normalizeInputs(value) {
  if (value == null) return {};
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("Workflow inputs must be a JSON object.");
  const entries = Object.entries(value);
  const invalidKey = entries.find(([key]) => !/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(key))?.[0];
  if (invalidKey) throw new Error(`Invalid workflow input name: ${invalidKey}.`);
  const invalidValue = entries.find(([, inputValue]) => inputValue != null && !["string", "number", "boolean"].includes(typeof inputValue));
  if (invalidValue) throw new Error(`Workflow input "${invalidValue[0]}" must be a string, number, boolean, or null.`);
  return Object.fromEntries(entries);
}

function normalizeSchedule(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return { enabled: false, cron: "", inputs: {} };
  const enabled = Boolean(value.enabled);
  const cron = typeof value.cron === "string" ? value.cron.trim().slice(0, 80) : "";
  if (enabled && cron.split(/\s+/).length !== 5) throw new Error("Schedule cron must use five fields: minute hour day month weekday.");
  return {
    enabled,
    cron,
    inputs: normalizeInputs(value.inputs || {}),
  };
}

function iso(value) {
  return value instanceof Date ? value.toISOString() : new Date(value).toISOString();
}

function parseDefinition(value) {
  return typeof value === "string" ? JSON.parse(value) : value;
}

function normalizeWorkflow(body, id = randomUUID()) {
  const nodes = Array.isArray(body.nodes) ? body.nodes : [];
  const edges = Array.isArray(body.edges) ? body.edges : [];
  if (nodes.length > MAX_NODES) throw new Error(`Workflows support at most ${MAX_NODES} nodes.`);
  if (edges.length > MAX_EDGES) throw new Error(`Workflows support at most ${MAX_EDGES} connections.`);
  return {
    id,
    name: typeof body.name === "string" && body.name.trim() ? body.name.trim().slice(0, 160) : "Untitled workflow",
    description: typeof body.description === "string" ? body.description.slice(0, 1000) : "",
    nodes,
    edges,
    inputs: normalizeInputs(body.inputs),
    schedule: normalizeSchedule(body.schedule),
    templates: Array.isArray(body.templates) ? body.templates : [],
  };
}

function fromRow(row) {
  const definition = parseDefinition(row.definition);
  return {
    ...definition,
    id: row.id,
    name: row.name,
    description: row.description,
    createdAt: iso(row.created_at),
    updatedAt: iso(row.updated_at),
  };
}

async function seedWorkflows(userId) {
  const files = await fs.readdir(seedsDir).catch(() => []);
  await Promise.all(
    files.filter((file) => file.endsWith(".json")).map(async (file) => {
      const source = JSON.parse(await fs.readFile(path.join(seedsDir, file), "utf8"));
      const workflow = normalizeWorkflow(source, source.id);
      await pool.execute(
        `INSERT IGNORE INTO workflows (id, user_id, name, description, definition)
         VALUES (?, ?, ?, ?, ?)`,
        [workflow.id, userId, workflow.name, workflow.description, JSON.stringify(workflow)],
      );
    }),
  );
}

export async function listWorkflows(userId) {
  await seedWorkflows(userId);
  const [rows] = await pool.execute(
    `SELECT id, name, description, definition, created_at, updated_at
       FROM workflows WHERE user_id = ? ORDER BY updated_at DESC`,
    [userId],
  );
  return rows.map((row) => {
    const workflow = fromRow(row);
    const { nodes, edges, templates, ...metadata } = workflow;
    return { ...metadata, nodeCount: nodes.length, edgeCount: edges.length };
  });
}

export async function listScheduledWorkflowRows() {
  const [rows] = await pool.execute(
    `SELECT id, user_id, name, description, definition, created_at, updated_at
       FROM workflows
      WHERE JSON_UNQUOTE(JSON_EXTRACT(definition, '$.schedule.enabled')) = 'true'`,
  );
  return rows.map((row) => ({ userId: row.user_id, workflow: fromRow(row) }));
}

export async function getWorkflow(userId, id) {
  const [rows] = await pool.execute(
    `SELECT id, name, description, definition, created_at, updated_at
       FROM workflows WHERE user_id = ? AND id = ? LIMIT 1`,
    [userId, id],
  );
  return rows.length ? fromRow(rows[0]) : null;
}

export async function createWorkflow(userId, body) {
  const workflow = normalizeWorkflow(body);
  await pool.execute(
    "INSERT INTO workflows (id, user_id, name, description, definition) VALUES (?, ?, ?, ?, ?)",
    [workflow.id, userId, workflow.name, workflow.description, JSON.stringify(workflow)],
  );
  return getWorkflow(userId, workflow.id);
}

export async function updateWorkflow(userId, id, body) {
  const workflow = normalizeWorkflow(body, id);
  const [result] = await pool.execute(
    `UPDATE workflows SET name = ?, description = ?, definition = ?, updated_at = NOW(3)
      WHERE user_id = ? AND id = ?`,
    [workflow.name, workflow.description, JSON.stringify(workflow), userId, id],
  );
  return result.affectedRows ? getWorkflow(userId, id) : null;
}

export async function deleteWorkflow(userId, id) {
  const [result] = await pool.execute("DELETE FROM workflows WHERE user_id = ? AND id = ?", [userId, id]);
  return result.affectedRows > 0;
}
