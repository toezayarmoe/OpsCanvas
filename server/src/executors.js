import { spawn } from "node:child_process";
import { promises as fs } from "node:fs";
import path from "node:path";

const MAX_OUTPUT_FILE_BYTES = 5 * 1024 * 1024;

function stringifyInput(inputs) {
  return JSON.stringify(inputs.length === 1 ? inputs[0].output : inputs);
}

function shellQuote(value) {
  return `'${String(value).replaceAll("'", `'\"'\"'`)}'`;
}

function collectVariables(inputs) {
  return inputs.reduce((variables, input) => {
    const provided = input.output?.variables;
    if (!provided || typeof provided !== "object" || Array.isArray(provided)) return variables;
    return { ...variables, ...provided };
  }, {});
}

function formatArtifactInput(inputs) {
  if (inputs.length === 1) {
    const output = inputs[0].output;
    if (output && typeof output === "object" && typeof output.stdout === "string") return output.stdout;
    if (typeof output === "string") return output;
    return JSON.stringify(output, null, 2);
  }
  return JSON.stringify(inputs, null, 2);
}

function extractParserValues(output) {
  if (output == null) return [];
  if (Array.isArray(output)) return output;
  if (typeof output === "string") return [output];
  if (typeof output !== "object") return [String(output)];
  if (Array.isArray(output.items)) return output.items;
  if (Array.isArray(output.lines)) return output.lines;
  if (Array.isArray(output.results)) return output.results;
  if (typeof output.stdout === "string") return [output.stdout];
  if (typeof output.body === "string") return [output.body];
  return [JSON.stringify(output)];
}

function compileFilterRegex(pattern, label) {
  if (!pattern) return null;
  try {
    return new RegExp(pattern);
  } catch (error) {
    throw new Error(`${label} regex is invalid: ${error.message}`);
  }
}

function executeParser(config, inputs, context) {
  const splitLines = config.splitLines !== false;
  const trim = config.trim !== false;
  const removeEmpty = config.removeEmpty !== false;
  const dedupe = config.dedupe !== false;
  const includeRegex = compileFilterRegex(config.includeRegex, "Include");
  const excludeRegex = compileFilterRegex(config.excludeRegex, "Exclude");
  const limit = Number(config.limit) > 0 ? Number(config.limit) : 0;

  let items = inputs.flatMap((input) => extractParserValues(input.output));
  items = items.flatMap((item) => {
    const value = typeof item === "string" ? item : JSON.stringify(item);
    return splitLines ? value.split(/\r?\n/) : [value];
  });
  if (trim) items = items.map((item) => item.trim());
  if (removeEmpty) items = items.filter(Boolean);
  if (includeRegex) items = items.filter((item) => includeRegex.test(item));
  if (excludeRegex) items = items.filter((item) => !excludeRegex.test(item));
  if (dedupe) {
    const seen = new Set();
    items = items.filter((item) => {
      if (seen.has(item)) return false;
      seen.add(item);
      return true;
    });
  }
  if (limit) items = items.slice(0, limit);

  context.log("stdout", `Parser kept ${items.length} item(s).\n`);
  if (config.outputMode === "json") return { items, count: items.length };
  return { items, stdout: items.join("\n"), count: items.length };
}

function extractForEachItems(config, inputs) {
  const splitLines = config.splitLines !== false;
  const trim = config.trim !== false;
  const removeEmpty = config.removeEmpty !== false;
  let items = inputs.flatMap((input) => extractParserValues(input.output));
  items = items.flatMap((item) => {
    const value = typeof item === "string" ? item : JSON.stringify(item);
    return splitLines ? value.split(/\r?\n/) : [value];
  });
  if (trim) items = items.map((item) => item.trim());
  if (removeEmpty) items = items.filter(Boolean);
  return items;
}

function runProcess(command, args, options, context) {
  return new Promise((resolve, reject) => {
    const process = spawn(command, args, { ...options, stdio: ["ignore", "pipe", "pipe"] });
    let stdout = "";
    let stderr = "";

    process.stdout.on("data", (chunk) => {
      const text = chunk.toString();
      stdout += text;
      context.log("stdout", text);
    });
    process.stderr.on("data", (chunk) => {
      const text = chunk.toString();
      stderr += text;
      context.log("stderr", text);
    });
    process.on("error", reject);
    process.on("close", (code, signal) => {
      if (code !== 0) {
        const error = new Error(`Process exited with code ${code}${signal ? ` (${signal})` : ""}.`);
        error.details = { stdout, stderr, code };
        reject(error);
        return;
      }
      const trimmed = stdout.trim();
      try {
        resolve(trimmed ? JSON.parse(trimmed) : { stdout: trimmed, stderr: stderr.trim() });
      } catch {
        resolve({ stdout: trimmed, stderr: stderr.trim() });
      }
    });
    context.registerCancel(() => process.kill("SIGTERM"));
  });
}

function interpolate(value, inputs, variables) {
  if (typeof value !== "string") return value;
  return value.replace(/\{\{input\}\}|\{([a-zA-Z_][a-zA-Z0-9_]*)\}/g, (placeholder, key) => {
    if (!key) return stringifyInput(inputs);
    return Object.hasOwn(variables, key) ? String(variables[key]) : placeholder;
  });
}

async function readWorkspaceFile(workspacePath, sourcePath) {
  const relativePath = typeof sourcePath === "string" ? sourcePath.trim() : "";
  if (!relativePath || path.isAbsolute(relativePath)) throw new Error("Workspace source path must be a relative file path.");
  const resolvedPath = path.resolve(workspacePath, relativePath);
  if (!resolvedPath.startsWith(`${workspacePath}${path.sep}`)) throw new Error("Workspace source path cannot leave the execution workspace.");
  const details = await fs.stat(resolvedPath).catch((error) => {
    if (error.code === "ENOENT") throw new Error(`Workspace output file not found: ${relativePath}.`);
    throw error;
  });
  if (!details.isFile()) throw new Error("Workspace source path must point to a file.");
  if (details.size > MAX_OUTPUT_FILE_BYTES) throw new Error("Output files support at most 5 MB.");
  return fs.readFile(resolvedPath);
}

async function executeForEach(config, inputs, context, variables) {
  if (!config.command?.trim()) throw new Error("For Each command is required.");
  const itemVariable = config.itemVariable || "item";
  if (!/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(itemVariable)) throw new Error("For Each item variable must be a valid placeholder name.");
  const concurrency = Math.max(1, Math.min(50, Number(config.concurrency) || 1));
  const items = extractForEachItems(config, inputs);
  const results = new Array(items.length);
  const failures = [];
  let nextIndex = 0;
  let stopped = false;

  context.log("stdout", `For Each running ${items.length} item(s) with concurrency ${concurrency}.\n`);

  async function worker() {
    while (nextIndex < items.length) {
      if (stopped) return;
      const index = nextIndex;
      nextIndex += 1;
      const item = items[index];
      const loopVariables = { ...variables, [itemVariable]: item, item, index };
      context.log("stdout", `[${index + 1}/${items.length}] ${item}\n`);
      try {
        const output = await runProcess(config.shell || "/bin/sh", ["-lc", interpolate(config.command, inputs, loopVariables)], {
          cwd: context.workspacePath,
          env: {
            ...process.env,
            ...(config.env || {}),
            FLOW_INPUT_JSON: stringifyInput(inputs),
            FLOW_ITEM: String(item),
            FLOW_ITEM_INDEX: String(index),
            FLOW_WORKSPACE: context.workspacePath,
          },
        }, context);
        results[index] = { item, index, status: "success", output };
      } catch (error) {
        const failure = {
          item,
          index,
          status: "failed",
          error: { message: error.message, details: error.details || null },
        };
        results[index] = failure;
        failures.push(failure);
        context.log("stderr", `[${index + 1}/${items.length}] failed: ${error.message}\n`);
        if (!config.continueOnError) stopped = true;
      }
    }
  }

  await Promise.all(Array.from({ length: Math.min(concurrency, Math.max(items.length, 1)) }, () => worker()));
  const completed = results.filter(Boolean);
  if (failures.length && !config.continueOnError) {
    const error = new Error(`For Each failed on ${failures.length} of ${items.length} item(s).`);
    error.details = { results: completed };
    throw error;
  }

  const stdout = completed
    .map((result) => result.output?.stdout)
    .filter((value) => typeof value === "string" && value.length)
    .join("\n");
  return {
    items,
    results: completed,
    count: items.length,
    successCount: completed.filter((result) => result.status === "success").length,
    failedCount: failures.length,
    stdout,
  };
}

export async function executeNode(node, inputs, context) {
  const config = node.data?.config || {};
  const inputJson = stringifyInput(inputs);
  const env = { ...process.env, FLOW_INPUT_JSON: inputJson, ...(config.env || {}) };
  const variables = { ...(context.variables || {}), ...collectVariables(inputs) };

  switch (node.type) {
    case "variable": {
      const declared = config.variables || {};
      if (!declared || typeof declared !== "object" || Array.isArray(declared)) throw new Error("Variables must be a JSON object.");
      const invalidKey = Object.keys(declared).find((key) => !/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(key));
      if (invalidKey) throw new Error(`Invalid variable name: ${invalidKey}.`);
      context.log("stdout", `Defined ${Object.keys(declared).length} workflow variable(s).\n`);
      return { variables: declared };
    }

    case "output": {
      const filename = interpolate(config.filename || "output.json", inputs, variables);
      let content;
      if (config.sourceMode === "workspace") {
        content = await readWorkspaceFile(context.workspacePath, interpolate(config.sourcePath, inputs, variables));
      } else {
        const template = config.content || "{{input}}";
        content = template === "{{input}}" ? formatArtifactInput(inputs) : interpolate(template, inputs, variables);
      }
      const artifact = await context.saveArtifact({
        filename,
        contentType: config.contentType || "application/json",
        content,
      });
      context.log("stdout", `Saved output file ${artifact.filename} (${artifact.sizeBytes} bytes).\n`);
      return { artifact };
    }

    case "parser":
      return executeParser(config, inputs, context);

    case "foreach":
      return executeForEach(config, inputs, context, variables);

    case "command":
      if (!config.command?.trim()) throw new Error("Shell command is required.");
      return runProcess(config.shell || "/bin/sh", ["-lc", interpolate(config.command, inputs, variables)], {
        cwd: context.workspacePath,
        env: { ...env, FLOW_WORKSPACE: context.workspacePath },
      }, context);

    case "ssh": {
      if (!config.host || !config.command?.trim()) throw new Error("SSH host and command are required.");
      const host = interpolate(config.host, inputs, variables);
      const user = interpolate(config.user, inputs, variables);
      const destination = user ? `${user}@${host}` : host;
      const args = [];
      if (config.port) args.push("-p", String(config.port));
      if (config.privateKeyPath) args.push("-i", config.privateKeyPath);
      const remoteEnv = { FLOW_INPUT_JSON: inputJson, ...(config.env || {}) };
      const environment = Object.entries(remoteEnv)
        .filter(([key]) => /^[a-zA-Z_][a-zA-Z0-9_]*$/.test(key))
        .map(([key, value]) => `${key}=${shellQuote(value)}`)
        .join(" ");
      args.push(destination, `${environment} ${interpolate(config.command, inputs, variables)}`);
      return runProcess("ssh", args, { env }, context);
    }

    case "docker": {
      if (!config.image) throw new Error("Docker image is required.");
      const args = ["run", "--rm", "-e", `FLOW_INPUT_JSON=${inputJson}`];
      Object.entries(config.env || {}).forEach(([key, value]) => args.push("-e", `${key}=${value}`));
      args.push(interpolate(config.image, inputs, variables));
      if (config.command?.trim()) args.push("sh", "-lc", interpolate(config.command, inputs, variables));
      return runProcess("docker", args, { env }, context);
    }

    case "webhook": {
      if (!config.url) throw new Error("Webhook URL is required.");
      const controller = new AbortController();
      context.registerCancel(() => controller.abort());
      const method = config.method || "POST";
      const url = interpolate(config.url, inputs, variables);
      const response = await fetch(url, {
        method,
        signal: controller.signal,
        headers: { "content-type": "application/json", ...(config.headers || {}) },
        body: ["GET", "HEAD"].includes(method) ? undefined : interpolate(config.body || "{{input}}", inputs, variables),
      });
      const text = await response.text();
      context.log("stdout", `${method} ${url} -> ${response.status}\n${text}\n`);
      if (!response.ok) throw new Error(`Webhook returned HTTP ${response.status}.`);
      try {
        return text ? JSON.parse(text) : { status: response.status };
      } catch {
        return { status: response.status, body: text };
      }
    }

    default:
      throw new Error(`Unsupported node type: ${node.type}.`);
  }
}
