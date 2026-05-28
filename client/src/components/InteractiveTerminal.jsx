import { useEffect, useRef, useState } from "react";
import { TerminalSquare, X } from "lucide-react";
import { Terminal } from "@xterm/xterm";
import { FitAddon } from "@xterm/addon-fit";
import "@xterm/xterm/css/xterm.css";

export default function InteractiveTerminal({ onClose }) {
  const elementRef = useRef(null);
  const [status, setStatus] = useState("Connecting");

  useEffect(() => {
    const terminal = new Terminal({
      cursorBlink: true,
      convertEol: true,
      fontFamily: '"JetBrains Mono", "SFMono-Regular", Consolas, monospace',
      fontSize: 13,
      theme: {
        background: "#090c13",
        foreground: "#d4d4d8",
        cursor: "#34d399",
        selectionBackground: "#334155",
      },
    });
    const fitAddon = new FitAddon();
    terminal.loadAddon(fitAddon);
    terminal.open(elementRef.current);
    requestAnimationFrame(() => fitAddon.fit());
    terminal.focus();

    const protocol = location.protocol === "https:" ? "wss" : "ws";
    const socket = new WebSocket(`${protocol}://${location.host}/terminal`);
    const resize = () => {
      if (!elementRef.current) return;
      fitAddon.fit();
      if (socket.readyState === WebSocket.OPEN) {
        socket.send(JSON.stringify({ type: "terminal.resize", cols: terminal.cols, rows: terminal.rows }));
      }
    };
    const observer = new ResizeObserver(resize);
    observer.observe(elementRef.current);

    socket.onopen = () => {
      setStatus("Connected");
      resize();
    };
    socket.onmessage = ({ data }) => {
      const message = JSON.parse(data);
      if (message.type === "terminal.data") terminal.write(message.data);
      if (message.type === "terminal.exit") {
        setStatus("Exited");
        terminal.writeln(`\r\n[terminal exited: ${message.exitCode}]`);
      }
      if (message.type === "terminal.error") terminal.writeln(`\r\n[error] ${message.message}`);
    };
    socket.onclose = ({ code, reason }) => {
      const message = reason || (code === 1000 ? "Closed" : "Connection closed");
      setStatus(message);
      if (reason) terminal.writeln(`\r\n[terminal disconnected: ${reason}]`);
    };
    socket.onerror = () => {
      setStatus("Connection failed");
      terminal.writeln("\r\n[unable to connect to interactive terminal]");
    };
    const input = terminal.onData((data) => {
      if (socket.readyState === WebSocket.OPEN) socket.send(JSON.stringify({ type: "terminal.input", data }));
    });

    return () => {
      input.dispose();
      observer.disconnect();
      socket.close();
      terminal.dispose();
    };
  }, []);

  return (
    <section style={{ height: "min(430px, calc(100% - 4rem))" }} className="absolute bottom-0 left-0 right-0 z-30 flex flex-col overflow-hidden border-t border-zinc-700 bg-[#090c13] shadow-panel">
      <header className="flex h-12 shrink-0 items-center justify-between border-b border-zinc-800 px-5">
        <div className="flex items-center gap-3">
          <TerminalSquare size={15} className="text-emerald-400" />
          <span className="text-sm font-medium">Interactive terminal</span>
          <span className="rounded-md bg-zinc-800 px-2 py-0.5 text-[11px] text-zinc-400">{status}</span>
        </div>
        <div className="flex items-center gap-3 text-zinc-500">
          <button onClick={onClose} title="Close terminal" className="hover:text-white"><X size={16} /></button>
        </div>
      </header>
      <div className="min-h-0 flex-1 overflow-hidden p-3 pb-5">
        <div ref={elementRef} className="h-full min-h-0 overflow-hidden" />
      </div>
    </section>
  );
}
