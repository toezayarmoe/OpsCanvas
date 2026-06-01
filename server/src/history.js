import { pool } from "./db.js";

function parseJson(value) {
  return typeof value === "string" ? JSON.parse(value) : value;
}

function iso(value) {
  return value ? (value instanceof Date ? value.toISOString() : new Date(value).toISOString()) : null;
}

function summaryFromRow(row) {
  const nodes = parseJson(row.nodes || "{}");
  return {
    id: row.id,
    workflowId: row.workflow_id,
    workflowName: row.workflow_name,
    status: row.status,
    startedAt: iso(row.started_at),
    completedAt: iso(row.completed_at),
    nodeCount: Object.keys(nodes || {}).length,
    failedCount: Object.values(nodes || {}).filter((node) => node.status === "failed").length,
  };
}

export async function recordExecutionStarted(execution) {
  await pool.execute(
    `INSERT INTO executions (id, user_id, workflow_id, workflow_name, status, inputs, nodes, events, started_at, completed_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      execution.id,
      execution.userId,
      execution.workflowId,
      execution.workflowName,
      execution.status,
      JSON.stringify(execution.variables || {}),
      JSON.stringify(Object.fromEntries(execution.results)),
      JSON.stringify(execution.events || []),
      execution.startedAt.slice(0, 19).replace("T", " "),
      null,
    ],
  );
}

export async function recordExecutionCompleted(execution) {
  await pool.execute(
    `UPDATE executions SET status = ?, nodes = ?, events = ?, completed_at = ?
      WHERE id = ? AND user_id = ?`,
    [
      execution.status,
      JSON.stringify(Object.fromEntries(execution.results)),
      JSON.stringify(execution.events || []),
      execution.completedAt.slice(0, 19).replace("T", " "),
      execution.id,
      execution.userId,
    ],
  );
}

export async function markInterruptedExecutions() {
  await pool.execute(
    `UPDATE executions
        SET status = 'interrupted',
            completed_at = COALESCE(completed_at, NOW(3))
      WHERE status = 'running'`,
  );
}

export async function markExecutionInterrupted(userId, id) {
  await pool.execute(
    `UPDATE executions
        SET status = 'interrupted',
            completed_at = COALESCE(completed_at, NOW(3))
      WHERE user_id = ? AND id = ? AND status = 'running'`,
    [userId, id],
  );
}

export async function listExecutionHistory(userId, workflowId) {
  const params = [userId];
  let where = "WHERE user_id = ?";
  if (workflowId) {
    where += " AND workflow_id = ?";
    params.push(workflowId);
  }
  const [rows] = await pool.execute(
    `SELECT id, workflow_id, workflow_name, status, nodes, started_at, completed_at
       FROM executions ${where}
      ORDER BY started_at DESC
      LIMIT 100`,
    params,
  );
  return rows.map(summaryFromRow);
}

export async function getExecutionHistory(userId, id) {
  const [rows] = await pool.execute(
    `SELECT id, workflow_id, workflow_name, status, inputs, nodes, events, started_at, completed_at
       FROM executions WHERE user_id = ? AND id = ? LIMIT 1`,
    [userId, id],
  );
  if (!rows.length) return null;
  const row = rows[0];
  return {
    ...summaryFromRow(row),
    inputs: parseJson(row.inputs || "{}"),
    nodes: parseJson(row.nodes || "{}"),
    events: parseJson(row.events || "[]"),
  };
}
