import { mkdtempSync } from "node:fs";
import { rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import pty from "node-pty";

const terminals = new Map();
const MAX_INPUT_BYTES = 64 * 1024;

function terminalShell() {
  return process.env.TERMINAL_SHELL || (process.platform === "win32" ? "powershell.exe" : "/bin/sh");
}

function send(socket, payload) {
  if (socket.readyState === socket.OPEN) socket.send(JSON.stringify(payload));
}

export function openTerminal(socket, user) {
  const existing = terminals.get(user.id);
  if (existing) {
    existing.socket.close(1000, "Terminal replaced by a new session.");
    existing.process.kill();
  }

  const cwd = mkdtempSync(path.join(tmpdir(), "cliflow-terminal-"));
  const shell = terminalShell();
  const terminal = pty.spawn(shell, [], {
    name: "xterm-256color",
    cols: 100,
    rows: 28,
    cwd,
    env: {
      ...process.env,
      TERM: "xterm-256color",
      HOME: process.env.HOME || cwd,
    },
  });
  const session = { process: terminal, socket, cwd };
  terminals.set(user.id, session);

  send(socket, { type: "terminal.ready", shell, cwd });
  terminal.onData((data) => send(socket, { type: "terminal.data", data }));
  terminal.onExit(({ exitCode }) => {
    send(socket, { type: "terminal.exit", exitCode });
    if (terminals.get(user.id) === session) terminals.delete(user.id);
    rm(cwd, { recursive: true, force: true }).catch(() => {});
    socket.close();
  });

  socket.on("message", (raw) => {
    try {
      const message = JSON.parse(raw.toString());
      if (message.type === "terminal.input" && typeof message.data === "string" && Buffer.byteLength(message.data) <= MAX_INPUT_BYTES) {
        terminal.write(message.data);
      }
      if (message.type === "terminal.resize") {
        const cols = Math.max(20, Math.min(300, Number(message.cols) || 100));
        const rows = Math.max(5, Math.min(100, Number(message.rows) || 28));
        terminal.resize(cols, rows);
      }
    } catch {
      send(socket, { type: "terminal.error", message: "Invalid terminal message." });
    }
  });

  socket.on("close", () => {
    if (terminals.get(user.id) !== session) return;
    terminals.delete(user.id);
    terminal.kill();
    rm(cwd, { recursive: true, force: true }).catch(() => {});
  });

  terminal.write("printf '\\r\\nOpsCanvas interactive terminal ready\\r\\n'\r");
}
