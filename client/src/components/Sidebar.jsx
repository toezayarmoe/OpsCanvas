import { Clock3, Layers3, Plus, Workflow } from "lucide-react";
import { NODE_CATALOG } from "../lib/catalog";

export default function Sidebar({ workflows, activeId, templates, onLoad, onNew, onOpenTemplate, onDragStart }) {
  return (
    <aside className="flex w-72 shrink-0 flex-col border-r border-zinc-800/80 bg-[#090c13]">
      <div className="border-b border-zinc-800/80 p-5">
        <div className="flex items-center gap-2 text-lg font-bold tracking-tight">
          <div className="rounded-lg bg-emerald-400 p-1.5 text-zinc-950"><Workflow size={18} /></div>
          CLIFlow
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
            <button
              key={workflow.id}
              onClick={() => onLoad(workflow.id)}
              className={`w-full rounded-lg px-3 py-2 text-left transition ${workflow.id === activeId ? "bg-zinc-800/80 text-white" : "text-zinc-400 hover:bg-zinc-900"}`}
            >
              <p className="truncate text-sm font-medium">{workflow.name}</p>
              <p className="mt-1 flex items-center gap-1 text-[11px] text-zinc-500"><Clock3 size={10} /> {workflow.nodeCount ?? 0} nodes</p>
            </button>
          ))}
        </div>
      </div>
      <div className="flex-1 overflow-y-auto p-4">
        <div className="mb-3 flex items-center justify-between">
          <p className="text-[11px] font-semibold uppercase tracking-wider text-zinc-500">Node library</p>
          <Layers3 size={13} className="text-zinc-600" />
        </div>
        <div className="space-y-2">
          {Object.entries(NODE_CATALOG).map(([type, definition]) => (
            <PaletteItem key={type} type={type} definition={definition} onDragStart={onDragStart} />
          ))}
        </div>
        {templates.length > 0 && (
          <>
            <p className="mb-3 mt-6 text-[11px] font-semibold uppercase tracking-wider text-zinc-500">Custom templates</p>
            <div className="space-y-2">
              {templates.map((template) => <PaletteItem key={template.id} type={template.type} definition={template} onDragStart={onDragStart} />)}
            </div>
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
