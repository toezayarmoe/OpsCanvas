import { CopyPlus, RefreshCw, Trash2, X } from "lucide-react";

export default function WorkflowTemplatesPanel({ templates, onClose, onRefresh, onCreateFromTemplate, onDelete }) {
  return (
    <aside className="absolute right-6 top-20 z-30 flex max-h-[calc(100vh-7rem)] w-96 flex-col overflow-hidden rounded-2xl border border-zinc-800 bg-[#0d121b] shadow-panel">
      <header className="flex items-center justify-between border-b border-zinc-800 p-4">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wider text-emerald-400">Reusable templates</p>
          <h2 className="mt-1 text-base font-semibold">Workflow templates</h2>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={onRefresh} className="rounded-lg border border-zinc-700 p-2 text-zinc-400 hover:bg-zinc-800 hover:text-white"><RefreshCw size={15} /></button>
          <button onClick={onClose} className="text-zinc-500 hover:text-white"><X size={18} /></button>
        </div>
      </header>
      <div className="overflow-y-auto p-4">
        {templates.length === 0 && <p className="rounded-xl border border-zinc-800 bg-[#090d14] p-4 text-sm text-zinc-500">No workflow templates yet. Use **Save as template** from the header.</p>}
        <div className="space-y-3">
          {templates.map((template) => (
            <div key={template.id} className="rounded-xl border border-zinc-800 bg-[#090d14] p-4">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold text-zinc-100">{template.name}</p>
                  <p className="mt-1 line-clamp-2 text-xs text-zinc-500">{template.description || "No description"}</p>
                  <p className="mt-2 text-[11px] text-zinc-500">{template.nodeCount} nodes / {template.edgeCount} connections</p>
                </div>
                <button onClick={() => onDelete(template.id)} className="shrink-0 rounded-lg border border-rose-500/30 p-2 text-rose-300 hover:bg-rose-500/10"><Trash2 size={14} /></button>
              </div>
              <button onClick={() => onCreateFromTemplate(template.id)} className="mt-3 flex w-full items-center justify-center gap-2 rounded-lg bg-emerald-400 px-3 py-2 text-sm font-semibold text-zinc-950">
                <CopyPlus size={15} /> Create workflow
              </button>
            </div>
          ))}
        </div>
      </div>
    </aside>
  );
}
