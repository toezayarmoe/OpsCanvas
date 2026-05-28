import { Handle, Position } from "reactflow";
import { NODE_CATALOG } from "../lib/catalog";

const statusClass = {
  idle: "bg-zinc-700",
  pending: "bg-zinc-500",
  running: "bg-blue-400 animate-pulse",
  success: "bg-emerald-400",
  failed: "bg-rose-400",
  skipped: "bg-amber-400",
  cancelled: "bg-zinc-400",
};

export default function NodeCard({ data, type, selected }) {
  const definition = NODE_CATALOG[type];
  const Icon = definition.icon;
  const isOutput = type === "output";
  const summary = type === "variable"
    ? Object.entries(data.config.variables || {}).map(([key, value]) => `${key}=${value}`).join(", ")
    : type === "output"
      ? `${data.config.sourceMode === "workspace" ? `${data.config.sourcePath || "file"} -> ` : ""}${data.config.filename}`
    : type === "parser"
      ? `${data.config.dedupe === false ? "keep duplicates" : "dedupe"} -> ${data.config.outputMode || "lines"}`
    : type === "foreach"
      ? `${data.config.concurrency || 1}x ${data.config.command || "command"}`
    : type === "webhook"
    ? `${data.config.method} ${data.config.url}`
    : type === "docker"
      ? data.config.image
      : type === "ssh"
        ? `${data.config.user ? `${data.config.user}@` : ""}${data.config.host || "host"}`
        : data.config.command;

  return (
    <div className={`w-64 overflow-hidden rounded-2xl border bg-[#10151f]/95 shadow-panel transition ${selected ? "border-emerald-400 shadow-glow" : "border-zinc-800"}`}>
      <Handle type="target" position={Position.Top} className="!h-2.5 !w-2.5 !border-2 !border-[#10151f] !bg-zinc-400" />
      <div className="flex items-start gap-3 border-b border-zinc-800/80 p-3">
        <div className="mt-0.5 shrink-0 rounded-lg bg-zinc-800 p-2 text-zinc-200"><Icon size={15} /></div>
        <div className="min-w-0 flex-1">
          <p title={data.label} className="truncate text-sm font-semibold text-zinc-100">{data.label}</p>
          <p className="text-[11px] text-zinc-500">{definition.label}</p>
        </div>
        <span className={`mt-1 h-2.5 w-2.5 shrink-0 rounded-full ${statusClass[data.status || "idle"]}`} />
      </div>
      <div className="p-3">
        <div title={summary || "Not configured"} className="min-w-0 truncate rounded-lg border border-zinc-800 bg-[#090c13] px-2.5 py-2 font-mono text-[11px] text-zinc-400">
          {summary || "Not configured"}
        </div>
      </div>
      {!isOutput && <Handle type="source" position={Position.Bottom} className="!h-2.5 !w-2.5 !border-2 !border-[#10151f] !bg-emerald-400" />}
    </div>
  );
}
