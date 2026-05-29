import { useState } from "react";
import { ChevronDown, ChevronLeft, ChevronRight, Clock3, Layers3, PlayCircle, Plus, RefreshCw, Trash2, Workflow } from "lucide-react";
import { NODE_CATALOG } from "../lib/catalog";

export default function Sidebar({
  width,
  workflows,
  activeId,
  templates,
  runningExecutions,
  onLoad,
  onNew,
  onDeleteWorkflow,
  onOpenTemplate,
  onCollapse,
  onDragStart,
  onRefreshRunning,
  onResumeRunning,
}) {
  const [libraryOpen, setLibraryOpen] = useState(true);
  const [templatesOpen, setTemplatesOpen] = useState(true);

  return (
    <aside style={{ width }} className="flex shrink-0 flex-col border-r border-zinc-800/80 bg-[#090c13]">
      <div className="border-b border-zinc-800/80 p-5">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2 text-lg font-bold tracking-tight">
            <div className="rounded-lg bg-emerald-400 p-1.5 text-zinc-950"><Workflow size={18} /></div>
            CLIFlow
          </div>
          <button onClick={onCollapse} title="Hide node library" className="rounded-lg border border-zinc-800 p-1.5 text-zinc-500 hover:bg-zinc-800 hover:text-white">
            <ChevronLeft size={15} />
          </button>
        </div>
        <p className="mt-2 text-xs text-zinc-500">Visual automation studio</p>
      </div>
      <div className="border-b border-zinc-800/80 p-4">
        <div className="mb-3 flex items-center justify-between">
          <p className="text-[11px] font-semibold uppercase tracking-wider text-zinc-500">Workflows</p>
          <button onClick={onNew} className="rounded-md p-1 text-zinc-400 hover:bg-zinc-800 hover:text-white"><Plus size={15} /></button>
        </div>
        <div className="max-h-40 space-y-1 overflow-y-auto">
          {workflows.map((workflow) => (
            <div
              key={workflow.id}
              className={`group flex items-center gap-1 rounded-lg transition ${workflow.id === activeId ? "bg-zinc-800/80 text-white" : "text-zinc-400 hover:bg-zinc-900"}`}
            >
              <button onClick={() => onLoad(workflow.id)} className="min-w-0 flex-1 px-3 py-2 text-left">
                <p className="truncate text-sm font-medium">{workflow.name}</p>
                <p className="mt-1 flex items-center gap-1 text-[11px] text-zinc-500"><Clock3 size={10} /> {workflow.nodeCount ?? 0} nodes</p>
              </button>
              <button
                onClick={() => onDeleteWorkflow(workflow.id)}
                title={`Delete ${workflow.name}`}
                className="mr-2 rounded-md p-1.5 text-zinc-600 opacity-0 hover:bg-rose-500/10 hover:text-rose-300 group-hover:opacity-100"
              >
                <Trash2 size={13} />
              </button>
            </div>
          ))}
        </div>
      </div>
      <div className="border-b border-zinc-800/80 p-4">
        <div className="mb-3 flex items-center justify-between">
          <p className="text-[11px] font-semibold uppercase tracking-wider text-zinc-500">Running workflows</p>
          <button onClick={onRefreshRunning} title="Refresh running workflows" className="rounded-md p-1 text-zinc-500 hover:bg-zinc-800 hover:text-white">
            <RefreshCw size={13} />
          </button>
        </div>
        <div className="max-h-32 space-y-1 overflow-y-auto">
          {runningExecutions.length === 0 ? (
            <p className="rounded-lg border border-dashed border-zinc-800 px-3 py-2 text-xs text-zinc-600">No running workflows.</p>
          ) : runningExecutions.map((run) => (
            <button
              key={run.id}
              onClick={() => onResumeRunning(run.id)}
              className="w-full rounded-lg border border-blue-500/20 bg-blue-500/5 px-3 py-2 text-left text-blue-100 hover:border-blue-500/40 hover:bg-blue-500/10"
            >
              <div className="flex items-center gap-2">
                <PlayCircle size={13} className="shrink-0 text-blue-300" />
                <p className="min-w-0 truncate text-sm font-medium">{run.workflowName || run.workflowId}</p>
              </div>
              <p className="mt-1 truncate text-[11px] text-blue-200/60">{new Date(run.startedAt).toLocaleString()}</p>
            </button>
          ))}
        </div>
      </div>
      <div className="flex-1 overflow-y-auto p-4">
        <button onClick={() => setLibraryOpen((open) => !open)} className="mb-3 flex w-full items-center justify-between text-left">
          <span className="text-[11px] font-semibold uppercase tracking-wider text-zinc-500">Node library</span>
          <span className="flex items-center gap-2 text-zinc-600">
            <Layers3 size={13} />
            {libraryOpen ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
          </span>
        </button>
        {libraryOpen && (
          <div className="space-y-2">
            {Object.entries(NODE_CATALOG).map(([type, definition]) => (
              <PaletteItem key={type} type={type} definition={definition} onDragStart={onDragStart} />
            ))}
          </div>
        )}
        {templates.length > 0 && (
          <>
            <button onClick={() => setTemplatesOpen((open) => !open)} className="mb-3 mt-6 flex w-full items-center justify-between text-left">
              <span className="text-[11px] font-semibold uppercase tracking-wider text-zinc-500">Custom templates</span>
              {templatesOpen ? <ChevronDown size={14} className="text-zinc-600" /> : <ChevronRight size={14} className="text-zinc-600" />}
            </button>
            {templatesOpen && (
              <div className="space-y-2">
                {templates.map((template) => <PaletteItem key={template.id} type={template.type} definition={template} onDragStart={onDragStart} />)}
              </div>
            )}
          </>
        )}
        <button onClick={onOpenTemplate} className="mt-4 flex w-full items-center justify-center gap-2 rounded-xl border border-dashed border-zinc-700 px-3 py-2.5 text-sm text-zinc-400 hover:border-emerald-500/50 hover:text-emerald-300">
          <Plus size={15} /> Custom node template
        </button>
      </div>
    </aside>
  );
}

function PaletteItem({ type, definition, onDragStart }) {
  const Icon = NODE_CATALOG[type].icon;
  return (
    <div
      draggable
      onDragStart={(event) => onDragStart(event, type, definition)}
      className="group flex cursor-grab items-center gap-3 rounded-xl border border-zinc-800 bg-[#0d1119] p-3 hover:border-zinc-700 active:cursor-grabbing"
    >
      <div className="rounded-lg bg-zinc-800 p-2 text-zinc-300 group-hover:text-emerald-300"><Icon size={15} /></div>
      <div className="min-w-0">
        <p className="truncate text-sm font-medium text-zinc-200">{definition.label}</p>
        <p className="truncate text-[11px] text-zinc-500">{definition.description}</p>
      </div>
    </div>
  );
}
