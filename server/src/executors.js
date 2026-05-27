import { spawn } from "node:child_process";

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

export async function executeNode(node, inputs, context) {
  const config = node.data?.config || {};
  const inputJson = stringifyInput(inputs);
  const env = { ...process.env, FLOW_INPUT_JSON: inputJson, ...(config.env || {}) };
  const variables = collectVariables(inputs);

  switch (node.type) {
    case "variable": {
      const declared = config.variables || {};
      if (!declared || typeof declared !== "object" || Array.isArray(declared)) throw new Error("Variables must be a JSON object.");
      const invalidKey = Object.keys(declared).find((key) => !/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(key));
      if (invalidKey) throw new Error(`Invalid variable name: ${invalidKey}.`);
      context.log("stdout", `Defined ${Object.keys(declared).length} workflow variable(s).\n`);
      return { variables: declared };
    }

    case "command":
      if (!config.command?.trim()) throw new Error("Shell command is required.");
      return runProcess(config.shell || "/bin/sh", ["-lc", interpolate(config.command, inputs, variables)], { env }, context);

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
