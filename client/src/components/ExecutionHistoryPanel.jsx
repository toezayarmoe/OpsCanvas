import { Clock3, PlayCircle, RefreshCw, X } from "lucide-react";

const statusClass = {
  success: "text-emerald-300",
  failed: "text-rose-300",
  running: "text-blue-300",
  cancelled: "text-zinc-300",
  interrupted: "text-amber-300",
  skipped: "text-zinc-400",
};

export default function ExecutionHistoryPanel({ executions, detail, onClose, onRefresh, onResume, onSelect }) {
  const logs = detail?.events?.filter((event) => event.type === "node.log") || [];
  return (
    <aside className="absolute right-6 top-20 z-30 flex max-h-[calc(100vh-7rem)] w-[560px] flex-col overflow-hidden rounded-2xl border border-zinc-800 bg-[#0d121b] shadow-panel">
      <header className="flex items-center justify-between border-b border-zinc-800 p-4">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wider text-emerald-400">Run history</p>
          <h2 className="mt-1 text-base font-semibold">Executions</h2>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={onRefresh} className="rounded-lg border border-zinc-700 p-2 text-zinc-400 hover:bg-zinc-800 hover:text-white"><RefreshCw size={15} /></button>
          <button onClick={onClose} className="text-zinc-500 hover:text-white"><X size={18} /></button>
        </div>
      </header>
      <div className="grid min-h-0 flex-1 grid-cols-[210px_1fr]">
        <div className="overflow-y-auto border-r border-zinc-800 p-3">
          {executions.length === 0 && <p className="p-3 text-sm text-zinc-500">No executions yet.</p>}
          {executions.map((run) => (
            <button key={run.id} onClick={() => onSelect(run.id)} className={`mb-2 w-full rounded-xl border p-3 text-left hover:bg-zinc-900 ${detail?.id === run.id ? "border-emerald-500/40 bg-emerald-500/5" : "border-zinc-800 bg-[#090d14]"}`}>
              <p className={`text-sm font-semibold ${statusClass[run.status] || "text-zinc-300"}`}>{run.status}</p>
              <p className="mt-1 truncate text-xs text-zinc-500">{run.workflowName}</p>
              <p className="mt-2 flex items-center gap-1 text-[11px] text-zinc-500"><Clock3 size={11} /> {new Date(run.startedAt).toLocaleString()}</p>
            </button>
          ))}
        </div>
        <div className="min-w-0 overflow-y-auto p-4">
          {!detail ? (
            <p className="text-sm text-zinc-500">Select a run to view details.</p>
          ) : (
            <div className="space-y-4">
              <div className="rounded-xl border border-zinc-800 bg-[#090d14] p-3">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className={`text-sm font-semibold ${statusClass[detail.status] || "text-zinc-300"}`}>{detail.status}</p>
                    <p className="mt-1 text-xs text-zinc-500">Started: {new Date(detail.startedAt).toLocaleString()}</p>
                    {detail.completedAt && <p className="text-xs text-zinc-500">Completed: {new Date(detail.completedAt).toLocaleString()}</p>}
                  </div>
                  {detail.status === "running" && (
                    <button
                      onClick={() => onResume(detail.id)}
                      className="flex shrink-0 items-center gap-1 rounded-lg border border-blue-500/40 bg-blue-500/10 px-2.5 py-1.5 text-xs font-medium text-blue-200 hover:bg-blue-500/20"
                    >
                      <PlayCircle size={14} /> Reattach
                    </button>
                  )}
                </div>
                {detail.status === "interrupted" && (
                  <p className="mt-3 rounded-lg border border-amber-500/20 bg-amber-500/10 p-2 text-xs text-amber-200">
                    This run was still marked running when the server started, so the live process is no longer available.
                  </p>
                )}
              </div>
              <div>
                <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-zinc-500">Node results</p>
                <div className="space-y-2">
                  {Object.entries(detail.nodes || {}).map(([nodeId, result]) => (
                    <div key={nodeId} className="rounded-lg border border-zinc-800 bg-[#090d14] p-3">
                      <div className="flex items-center justify-between gap-3">
                        <p className="truncate font-mono text-xs text-zinc-300">{nodeId}</p>
                        <span className={`text-xs ${statusClass[result.status] || "text-zinc-400"}`}>{result.status}</span>
                      </div>
                      {result.error?.message && <p className="mt-2 text-xs text-rose-300">{result.error.message}</p>}
                    </div>
                  ))}
                </div>
              </div>
              <div>
                <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-zinc-500">Logs</p>
                <pre className="max-h-72 overflow-auto rounded-xl border border-zinc-800 bg-[#05070c] p-3 font-mono text-[11px] leading-5 text-zinc-300">
                  {logs.map((event) => `[${event.nodeId}] ${event.content}`).join("") || "No logs captured."}
                </pre>
              </div>
            </div>
          )}
        </div>
      </div>
    </aside>
  );
}
