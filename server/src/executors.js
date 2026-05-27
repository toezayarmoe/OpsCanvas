import { spawn } from "node:child_process";

function stringifyInput(inputs) {
  return JSON.stringify(inputs.length === 1 ? inputs[0].output : inputs);
}

function shellQuote(value) {
  return `'${String(value).replaceAll("'", `'\"'\"'`)}'`;
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

function interpolate(value, inputs) {
  return typeof value === "string" ? value.replaceAll("{{input}}", stringifyInput(inputs)) : value;
}

export async function executeNode(node, inputs, context) {
  const config = node.data?.config || {};
  const inputJson = stringifyInput(inputs);
  const env = { ...process.env, FLOW_INPUT_JSON: inputJson, ...(config.env || {}) };

  switch (node.type) {
    case "command":
      if (!config.command?.trim()) throw new Error("Shell command is required.");
      return runProcess(config.shell || "/bin/sh", ["-lc", interpolate(config.command, inputs)], { env }, context);

    case "ssh": {
      if (!config.host || !config.command?.trim()) throw new Error("SSH host and command are required.");
      const destination = config.user ? `${config.user}@${config.host}` : config.host;
      const args = [];
      if (config.port) args.push("-p", String(config.port));
      if (config.privateKeyPath) args.push("-i", config.privateKeyPath);
      const remoteEnv = { FLOW_INPUT_JSON: inputJson, ...(config.env || {}) };
      const environment = Object.entries(remoteEnv)
        .filter(([key]) => /^[a-zA-Z_][a-zA-Z0-9_]*$/.test(key))
        .map(([key, value]) => `${key}=${shellQuote(value)}`)
        .join(" ");
      args.push(destination, `${environment} ${interpolate(config.command, inputs)}`);
      return runProcess("ssh", args, { env }, context);
    }

    case "docker": {
      if (!config.image) throw new Error("Docker image is required.");
      const args = ["run", "--rm", "-e", `FLOW_INPUT_JSON=${inputJson}`];
      Object.entries(config.env || {}).forEach(([key, value]) => args.push("-e", `${key}=${value}`));
      args.push(config.image);
      if (config.command?.trim()) args.push("sh", "-lc", interpolate(config.command, inputs));
      return runProcess("docker", args, { env }, context);
    }

    case "webhook": {
      if (!config.url) throw new Error("Webhook URL is required.");
      const controller = new AbortController();
      context.registerCancel(() => controller.abort());
      const method = config.method || "POST";
      const response = await fetch(interpolate(config.url, inputs), {
        method,
        signal: controller.signal,
        headers: { "content-type": "application/json", ...(config.headers || {}) },
        body: ["GET", "HEAD"].includes(method) ? undefined : interpolate(config.body || "{{input}}", inputs),
      });
      const text = await response.text();
      context.log("stdout", `${method} ${config.url} -> ${response.status}\n${text}\n`);
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
