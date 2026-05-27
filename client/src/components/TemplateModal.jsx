import { useState } from "react";
import { X } from "lucide-react";
import { NODE_CATALOG } from "../lib/catalog";

export default function TemplateModal({ onClose, onCreate }) {
  const [type, setType] = useState("command");
  const [label, setLabel] = useState("");
  const definition = NODE_CATALOG[type];

  const submit = (event) => {
    event.preventDefault();
    onCreate({
      id: crypto.randomUUID(),
      type,
      label: label.trim() || definition.label,
      description: `Custom ${definition.label.toLowerCase()}`,
      config: structuredClone(definition.config),
    });
  };

  return (
    <div className="absolute inset-0 z-20 flex items-center justify-center bg-black/60 backdrop-blur-sm">
      <form onSubmit={submit} className="w-[420px] rounded-2xl border border-zinc-800 bg-[#11151e] p-6 shadow-panel">
        <div className="mb-6 flex items-center justify-between">
          <h2 className="font-semibold">Create node template</h2>
          <button type="button" onClick={onClose} className="text-zinc-500 hover:text-white"><X size={17} /></button>
        </div>
        <label className="mb-4 block space-y-2 text-xs uppercase tracking-wider text-zinc-500">
          Base type
          <select value={type} onChange={(event) => setType(event.target.value)} className="w-full rounded-lg border border-zinc-800 bg-[#090c13] p-3 text-sm normal-case tracking-normal text-white">
            {Object.entries(NODE_CATALOG).map(([id, entry]) => <option key={id} value={id}>{entry.label}</option>)}
          </select>
        </label>
        <label className="block space-y-2 text-xs uppercase tracking-wider text-zinc-500">
          Template name
          <input autoFocus value={label} onChange={(event) => setLabel(event.target.value)} placeholder="Production deploy" className="w-full rounded-lg border border-zinc-800 bg-[#090c13] p-3 text-sm normal-case tracking-normal text-white outline-none focus:border-emerald-500" />
        </label>
        <div className="mt-6 flex justify-end gap-2">
          <button type="button" onClick={onClose} className="rounded-lg px-4 py-2 text-sm text-zinc-400">Cancel</button>
          <button type="submit" className="rounded-lg bg-emerald-400 px-4 py-2 text-sm font-medium text-zinc-950">Create template</button>
        </div>
      </form>
    </div>
  );
}
