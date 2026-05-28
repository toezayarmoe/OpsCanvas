import { randomUUID } from "node:crypto";
import { mkdtempSync } from "node:fs";
import { rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { saveArtifact } from "./artifacts.js";
import { executeNode } from "./executors.js";

const executions = new Map();
const EVENT_LIMIT = 2000;
const MAX_RUNNING_PER_USER = 5;

function normalizeRuntimeInputs(value) {
  if (value == null) return {};
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("Run inputs must be a JSON object.");
  const entries = Object.entries(value);
  const invalidKey = entries.find(([key]) => !/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(key))?.[0];
  if (invalidKey) throw new Error(`Invalid run input name: ${invalidKey}.`);
  const invalidValue = entries.find(([, inputValue]) => inputValue != null && !["string", "number", "boolean"].includes(typeof inputValue));
  if (invalidValue) throw new Error(`Run input "${invalidValue[0]}" must be a string, number, boolean, or null.`);
  return Object.fromEntries(entries);
}

function serializeError(error) {
  return { message: error.message, details: error.details || null };
}

function createGraph(workflow) {
  const nodes = new Map(workflow.nodes.map((node) => [node.id, node]));
  const incoming = new Map(workflow.nodes.map((node) => [node.id, []]));
  const outgoing = new Map(workflow.nodes.map((node) => [node.id, []]));
  workflow.edges.forEach((edge) => {
    if (!nodes.has(edge.source) || !nodes.has(edge.target)) throw new Error("An edge refers to a missing node.");
    incoming.get(edge.target).push(edge.source);
    outgoing.get(edge.source).push(edge.target);
  });
  const degrees = new Map([...incoming].map(([id, dependencies]) => [id, dependencies.length]));
  const queue = [...degrees].filter(([, degree]) => degree === 0).map(([id]) => id);
  let visited = 0;
  while (queue.length) {
    const id = queue.shift();
    visited += 1;
    outgoing.get(id).forEach((child) => {
      degrees.set(child, degrees.get(child) - 1);
      if (degrees.get(child) === 0) queue.push(child);
    });
  }
  if (visited !== nodes.size) throw new Error("Workflow contains a cycle. Execution requires a DAG.");
  return { nodes, incoming };
}

function emit(execution, event) {
  const message = { executionId: execution.id, timestamp: new Date().toISOString(), ...event };
  execution.events.push(message);
  if (execution.events.length > EVENT_LIMIT) execution.events.shift();
  execution.listeners.forEach((listener) => listener(message));
}

function collectVariables(results) {
  return results.reduce((variables, result) => {
    const inherited = result.variables && typeof result.variables === "object" && !Array.isArray(result.variables)
      ? result.variables
      : {};
    const outputVariables = result.output?.variables && typeof result.output.variables === "object" && !Array.isArray(result.output.variables)
      ? result.output.variables
      : {};
    return { ...variables, ...inherited, ...outputVariables };
  }, {});
}

export function subscribeExecution(id, userId, listener) {
  const execution = executions.get(id);
  if (!execution || execution.userId !== userId) return null;
  execution.events.forEach(listener);
  execution.listeners.add(listener);
  return () => execution.listeners.delete(listener);
}

export function getExecution(id, userId) {
  const execution = executions.get(id);
  if (!execution || execution.userId !== userId) return null;
  return {
    id: execution.id,
    workflowId: execution.workflowId,
    status: execution.status,
    startedAt: execution.startedAt,
    completedAt: execution.completedAt,
    nodes: Object.fromEntries(execution.results),
  };
}

export function cancelExecution(id, userId) {
  const execution = executions.get(id);
  if (!execution || execution.userId !== userId || execution.status !== "running") return false;
  execution.cancelled = true;
  execution.cancelHandlers.forEach((cancel) => cancel());
  return true;
}

export function startExecution(workflow, userId, runInputs = {}) {
  const active = [...executions.values()].filter((execution) => execution.userId === userId && execution.status === "running");
  if (active.length >= MAX_RUNNING_PER_USER) throw new Error(`At most ${MAX_RUNNING_PER_USER} workflows may run concurrently.`);
  const graph = createGraph(workflow);
  const variables = normalizeRuntimeInputs({ ...(workflow.inputs || {}), ...runInputs });
  const execution = {
    id: randomUUID(),
    userId,
    workflowId: workflow.id,
    status: "running",
    startedAt: new Date().toISOString(),
    completedAt: null,
    results: new Map(workflow.nodes.map((node) => [node.id, { status: "pending" }])),
    events: [],
    listeners: new Set(),
    cancelHandlers: new Set(),
    cancelled: false,
    variables,
    workspacePath: mkdtempSync(path.join(tmpdir(), "cliflow-run-")),
  };
  executions.set(execution.id, execution);
  emit(execution, { type: "execution.started", workflowId: workflow.id });
  queueMicrotask(() => runGraph(execution, graph));
  return getExecution(execution.id, userId);
}

async function runGraph(execution, graph) {
  const remaining = new Set(graph.nodes.keys());
  const running = new Map();

  const startReadyNodes = () => {
    for (const id of [...remaining]) {
      const dependencies = graph.incoming.get(id);
      const results = dependencies.map((dependency) => execution.results.get(dependency));
      if (results.some((result) => result.status === "pending" || result.status === "running")) continue;
      remaining.delete(id);
      const node = graph.nodes.get(id);
      const failedDependency = results.some((result) => ["failed", "skipped", "cancelled"].includes(result.status));
      if (failedDependency && !node.data?.config?.runAfterFailure) {
        const result = { status: "skipped", error: { message: "A dependency failed or was skipped." } };
        execution.results.set(id, result);
        emit(execution, { type: "node.skipped", nodeId: id, result });
        continue;
      }
      if (execution.cancelled) {
        const result = { status: "cancelled" };
        execution.results.set(id, result);
        emit(execution, { type: "node.cancelled", nodeId: id, result });
        continue;
      }
      running.set(id, runNode(execution, node, dependencies));
    }
  };

  while (remaining.size || running.size) {
    startReadyNodes();
    if (!running.size) continue;
    const completedId = await Promise.race(
      [...running].map(([id, promise]) => promise.then(() => id)),
    );
    running.delete(completedId);
  }

  const values = [...execution.results.values()];
  execution.status = execution.cancelled
    ? "cancelled"
    : values.some((result) => result.status === "failed")
      ? "failed"
      : "success";
  execution.completedAt = new Date().toISOString();
  emit(execution, { type: "execution.completed", status: execution.status, results: Object.fromEntries(execution.results) });
  await rm(execution.workspacePath, { recursive: true, force: true }).catch(() => {});
}

async function runNode(execution, node, dependencies) {
  const startedAt = new Date().toISOString();
  execution.results.set(node.id, { status: "running", startedAt });
  emit(execution, { type: "node.started", nodeId: node.id });
  try {
    const dependencyResults = dependencies.map((nodeId) => execution.results.get(nodeId));
    const variables = { ...execution.variables, ...collectVariables(dependencyResults) };
    const inputs = dependencies.map((nodeId) => ({ nodeId, output: execution.results.get(nodeId).output }));
    const output = await executeNode(node, inputs, {
      log: (stream, content) => emit(execution, { type: "node.log", nodeId: node.id, stream, content }),
      registerCancel: (handler) => execution.cancelHandlers.add(handler),
      saveArtifact: (artifact) => saveArtifact({
        ...artifact,
        userId: execution.userId,
        workflowId: execution.workflowId,
        executionId: execution.id,
        nodeId: node.id,
      }),
      workspacePath: execution.workspacePath,
      variables,
    });
    const requestedStatus = output?.__cliflowStatus === "skipped" ? "skipped" : "success";
    const publicOutput = output && typeof output === "object"
      ? Object.fromEntries(Object.entries(output).filter(([key]) => key !== "__cliflowStatus"))
      : output;
    const result = { status: requestedStatus, startedAt, completedAt: new Date().toISOString(), output: publicOutput, variables: collectVariables([{ output: publicOutput, variables }]) };
    execution.results.set(node.id, result);
    emit(execution, { type: requestedStatus === "skipped" ? "node.skipped" : "node.completed", nodeId: node.id, result });
  } catch (error) {
    const result = { status: execution.cancelled ? "cancelled" : "failed", startedAt, completedAt: new Date().toISOString(), error: serializeError(error) };
    execution.results.set(node.id, result);
    emit(execution, { type: "node.log", nodeId: node.id, stream: "stderr", content: `${error.message}\n` });
    emit(execution, { type: "node.failed", nodeId: node.id, result });
  }
}
