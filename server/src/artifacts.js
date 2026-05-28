import { randomUUID } from "node:crypto";
import { pool } from "./db.js";

const MAX_ARTIFACT_BYTES = 5 * 1024 * 1024;

function validateFilename(value) {
  const filename = typeof value === "string" ? value.trim() : "";
  if (!filename || filename.length > 180 || filename.includes("/") || filename.includes("\\") || /[\u0000-\u001f\u007f]/.test(filename)) {
    throw new Error("Output filename must be 1-180 characters and cannot contain paths or control characters.");
  }
  return filename;
}

function validateContentType(value) {
  const contentType = typeof value === "string" && value.trim() ? value.trim() : "application/json";
  if (contentType.length > 120 || !/^[\w!#$&^_.+-]+\/[\w!#$&^_.+-]+(?:;\s*charset=[\w-]+)?$/i.test(contentType)) {
    throw new Error("Output content type is invalid.");
  }
  return contentType;
}

function metadata(row) {
  return {
    id: row.id,
    workflowId: row.workflow_id,
    executionId: row.execution_id,
    nodeId: row.node_id,
    filename: row.filename,
    contentType: row.content_type,
    sizeBytes: row.size_bytes,
    createdAt: row.created_at instanceof Date ? row.created_at.toISOString() : new Date(row.created_at).toISOString(),
  };
}

export async function saveArtifact({ userId, workflowId, executionId, nodeId, filename, contentType, content }) {
  const validFilename = validateFilename(filename);
  const validContentType = validateContentType(contentType);
  const buffer = Buffer.isBuffer(content) ? content : Buffer.from(String(content), "utf8");
  if (buffer.length > MAX_ARTIFACT_BYTES) {
    throw new Error(`Output files support at most ${MAX_ARTIFACT_BYTES / (1024 * 1024)} MB.`);
  }
  const id = randomUUID();
  await pool.execute(
    `INSERT INTO artifacts
       (id, user_id, workflow_id, execution_id, node_id, filename, content_type, size_bytes, content)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [id, userId, workflowId, executionId, nodeId, validFilename, validContentType, buffer.length, buffer],
  );
  return {
    id,
    workflowId,
    executionId,
    nodeId,
    filename: validFilename,
    contentType: validContentType,
    sizeBytes: buffer.length,
    downloadUrl: `/api/artifacts/${id}/download`,
  };
}

export async function listArtifacts(userId, workflowId) {
  const params = [userId];
  let filter = "";
  if (workflowId) {
    filter = " AND workflow_id = ?";
    params.push(workflowId);
  }
  const [rows] = await pool.execute(
    `SELECT id, workflow_id, execution_id, node_id, filename, content_type, size_bytes, created_at
       FROM artifacts
      WHERE user_id = ?${filter}
      ORDER BY created_at DESC
      LIMIT 100`,
    params,
  );
  return rows.map(metadata);
}

export async function getArtifact(userId, id) {
  const [rows] = await pool.execute(
    `SELECT id, workflow_id, execution_id, node_id, filename, content_type, size_bytes, created_at, content
       FROM artifacts
      WHERE user_id = ? AND id = ?
      LIMIT 1`,
    [userId, id],
  );
  return rows.length ? { ...metadata(rows[0]), content: rows[0].content } : null;
}

export async function deleteArtifact(userId, id) {
  const [result] = await pool.execute("DELETE FROM artifacts WHERE user_id = ? AND id = ?", [userId, id]);
  return result.affectedRows > 0;
}
