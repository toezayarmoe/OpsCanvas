import { NODE_CATALOG } from "./catalog.js";

const FORMAT = "cliflow-workflow";
const VERSION = 1;
const MAX_NODES = 250;
const MAX_EDGES = 1000;
const NODE_TYPES = new Set(Object.keys(NODE_CATALOG));

function requireObject(value, message) {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error(message);
  return value;
}

function validateInputs(value) {
  const inputs = value == null ? {} : requireObject(value, "Workflow inputs must be a JSON object.");
  for (const [key, inputValue] of Object.entries(inputs)) {
    if (!/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(key)) throw new Error(`Invalid workflow input name: ${key}.`);
    if (inputValue != null && !["string", "number", "boolean"].includes(typeof inputValue)) {
      throw new Error(`Workflow input "${key}" must be a string, number, boolean, or null.`);
    }
  }
  return inputs;
}

function validateSchedule(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return { enabled: false, cron: "", inputs: {} };
  const enabled = Boolean(value.enabled);
  const cron = typeof value.cron === "string" ? value.cron : "";
  if (enabled && cron.trim().split(/\s+/).length !== 5) throw new Error("Workflow schedule cron must have five fields.");
  return { enabled, cron, inputs: validateInputs(value.inputs || {}) };
}

function filenameFor(name) {
  const slug = String(name || "workflow")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
  return `${slug || "workflow"}.cliflow.json`;
}

export function exportWorkflowFile(workflow, nodes, edges) {
  const payload = {
    format: FORMAT,
    version: VERSION,
    exportedAt: new Date().toISOString(),
    workflow: {
      name: workflow.name,
      description: workflow.description || "",
      inputs: workflow.inputs || {},
      schedule: workflow.schedule || { enabled: false, cron: "", inputs: {} },
      nodes,
      edges,
      templates: workflow.templates || [],
    },
  };
  return {
    filename: filenameFor(workflow.name),
    contents: `${JSON.stringify(payload, null, 2)}\n`,
  };
}

export function importWorkflowFile(contents) {
  let payload;
  try {
    payload = JSON.parse(contents);
  } catch {
    throw new Error("Workflow file is not valid JSON.");
  }
  requireObject(payload, "Workflow file does not contain a workflow object.");
  if (payload.format && payload.format !== FORMAT) throw new Error("This file is not a CLIFlow workflow export.");
  if (payload.version != null && payload.version !== VERSION) throw new Error(`Unsupported workflow file version: ${payload.version}.`);

  const source = requireObject(payload.workflow || payload, "Workflow file does not contain a workflow object.");
  const nodes = Array.isArray(source.nodes) ? source.nodes : null;
  const edges = Array.isArray(source.edges) ? source.edges : null;
  if (!nodes || !edges) throw new Error("Workflow file must contain nodes and edges arrays.");
  if (nodes.length > MAX_NODES || edges.length > MAX_EDGES) throw new Error("Workflow file exceeds supported node or connection limits.");

  const nodeIds = new Set();
  const validNodes = nodes.map((node, index) => {
    requireObject(node, `Node ${index + 1} is invalid.`);
    if (typeof node.id !== "string" || !node.id.trim() || nodeIds.has(node.id)) throw new Error("Workflow node IDs must be non-empty and unique.");
    if (!NODE_TYPES.has(node.type)) throw new Error(`Unsupported node type: ${node.type}.`);
    const position = requireObject(node.position, `Node ${node.id} has no valid position.`);
    if (!Number.isFinite(position.x) || !Number.isFinite(position.y)) throw new Error(`Node ${node.id} has an invalid position.`);
    const data = requireObject(node.data, `Node ${node.id} has no configuration.`);
    requireObject(data.config, `Node ${node.id} has no configuration.`);
    nodeIds.add(node.id);
    return { ...node, data: { ...data, status: "idle" } };
  });

  const validEdges = edges.map((edge, index) => {
    requireObject(edge, `Connection ${index + 1} is invalid.`);
    if (!nodeIds.has(edge.source) || !nodeIds.has(edge.target)) throw new Error("A connection refers to a missing node.");
    return {
      ...edge,
      id: typeof edge.id === "string" && edge.id ? edge.id : crypto.randomUUID(),
    };
  });

  const templates = Array.isArray(source.templates) ? source.templates.map((template, index) => {
    requireObject(template, `Custom template ${index + 1} is invalid.`);
    if (!NODE_TYPES.has(template.type)) throw new Error(`Unsupported custom template node type: ${template.type}.`);
    requireObject(template.config, `Custom template ${index + 1} has no configuration.`);
    return template;
  }) : [];
  const inputs = validateInputs(source.inputs);
  const schedule = validateSchedule(source.schedule);

  return {
    name: typeof source.name === "string" && source.name.trim() ? `${source.name.trim()} (imported)` : "Imported workflow",
    description: typeof source.description === "string" ? source.description : "",
    inputs,
    schedule,
    nodes: validNodes,
    edges: validEdges,
    templates,
  };
}
