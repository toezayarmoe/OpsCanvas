import { ChevronDown, ChevronUp, Square, TerminalSquare, Trash2 } from "lucide-react";

export default function ExecutionConsole({ height, events, execution, selectedNodeId, onClear, onCancel, collapsed, onToggleCollapsed, onResizeStart }) {
  const logs = events.filter((event) => event.type === "node.log" && (!selectedNodeId || event.nodeId === selectedNodeId));
  return (
    <section style={{ height: collapsed ? 48 : height }} className="relative shrink-0 border-t border-zinc-800/80 bg-[#090c13] transition-[height]">
      {!collapsed && (
        <div
          onMouseDown={onResizeStart}
          title="Resize live terminal"
          className="absolute -top-1 left-0 right-0 z-10 h-2 cursor-row-resize hover:bg-emerald-500/30"
        />
      )}
      <header className="flex h-12 items-center justify-between border-b border-zinc-800/80 px-5">
        <div className="flex items-center gap-3">
          <TerminalSquare size={15} className="text-emerald-400" />
          <span className="text-sm font-medium">Live terminal</span>
          <span className="rounded-md bg-zinc-800 px-2 py-0.5 text-[11px] text-zinc-400">
            {selectedNodeId ? "Selected node" : "All nodes"}
          </span>
          {execution && <StatusBadge status={execution.status} />}
        </div>
        <div className="flex items-center gap-2">
          {execution?.status === "running" && (
            <button onClick={onCancel} className="flex items-center gap-1.5 rounded-lg bg-rose-500/10 px-3 py-1.5 text-xs text-rose-300"><Square size={11} /> Stop</button>
          )}
          <button onClick={onClear} className="rounded-md p-1.5 text-zinc-500 hover:text-zinc-200"><Trash2 size={14} /></button>
          <button
            onClick={onToggleCollapsed}
            title={collapsed ? "Expand live terminal" : "Minimize live terminal"}
            className="rounded-md p-1.5 text-zinc-500 hover:bg-zinc-800 hover:text-zinc-200"
          >
            {collapsed ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
          </button>
        </div>
      </header>
      {!collapsed && <div className="h-[calc(100%-3rem)] overflow-y-auto p-4 font-mono text-xs leading-6">
        {logs.length === 0 ? (
          <p className="text-zinc-600">$ Logs will stream here while a workflow runs.</p>
        ) : logs.map((log, index) => (
          <div key={`${log.timestamp}-${index}`} className={log.stream === "stderr" ? "text-rose-300" : "text-zinc-300"}>
            <span className="mr-3 text-zinc-600">[{log.nodeId.slice(0, 6)}]</span>
            <span className="whitespace-pre-wrap">{log.content}</span>
          </div>
        ))}
      </div>}
    </section>
  );
}

function StatusBadge({ status }) {
  const color = status === "success" ? "text-emerald-300 bg-emerald-500/10" : status === "failed" ? "text-rose-300 bg-rose-500/10" : "text-blue-300 bg-blue-500/10";
  return <span className={`rounded-full px-2.5 py-1 text-[11px] font-medium capitalize ${color}`}>{status}</span>;
}
