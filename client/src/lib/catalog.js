import { Box, Braces, FileOutput, Filter, Globe, Server, TerminalSquare } from "lucide-react";

export const NODE_CATALOG = {
  variable: {
    label: "Variables",
    description: "Define reusable values",
    accent: "cyan",
    icon: Braces,
    config: { variables: { url: "google.com" } },
  },
  output: {
    label: "Output file",
    description: "Save a downloadable artifact",
    accent: "cyan",
    icon: FileOutput,
    config: { filename: "output.json", contentType: "application/json", sourceMode: "input", sourcePath: "", content: "{{input}}" },
  },
  parser: {
    label: "Parser / Filter",
    description: "Clean text or JSON lists",
    accent: "teal",
    icon: Filter,
    config: { splitLines: true, trim: true, removeEmpty: true, dedupe: true, includeRegex: "", excludeRegex: "", limit: 0, outputMode: "lines" },
  },
  command: {
    label: "Shell command",
    description: "Execute on this host",
    accent: "emerald",
    icon: TerminalSquare,
    config: { command: "echo '{\"status\":\"ready\"}'", shell: "/bin/sh", env: {} },
  },
  ssh: {
    label: "SSH command",
    description: "Execute remotely over SSH",
    accent: "blue",
    icon: Server,
    config: { host: "", user: "", port: 22, privateKeyPath: "", command: "uname -a", env: {} },
  },
  docker: {
    label: "Docker container",
    description: "Run an isolated workload",
    accent: "purple",
    icon: Box,
    config: { image: "alpine:latest", command: "echo \"$FLOW_INPUT_JSON\"", env: {} },
  },
  webhook: {
    label: "Webhook",
    description: "Call an HTTP API",
    accent: "amber",
    icon: Globe,
    config: { method: "POST", url: "https://httpbin.org/post", headers: {}, body: "{{input}}" },
  },
};

export function createNode(type, position, template) {
  const definition = template || NODE_CATALOG[type];
  return {
    id: crypto.randomUUID(),
    type,
    position,
    data: {
      label: definition.label,
      description: definition.description,
      config: structuredClone(definition.config),
      status: "idle",
    },
  };
}
