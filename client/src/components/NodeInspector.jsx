import { Trash2, X } from "lucide-react";
import { NODE_CATALOG } from "../lib/catalog";

function Field({ label, children }) {
  return (
    <label className="block space-y-1.5">
      <span className="text-[11px] font-medium uppercase tracking-wider text-zinc-500">{label}</span>
      {children}
    </label>
  );
}

const inputClass = "w-full rounded-lg border border-zinc-800 bg-[#0b0f17] px-3 py-2 text-sm text-zinc-200 outline-none transition focus:border-emerald-500/70";

function JsonField({ label, value, onChange }) {
  return (
    <Field label={label}>
      <textarea
        className={`${inputClass} h-20 font-mono text-xs`}
        value={JSON.stringify(value || {}, null, 2)}
        onChange={(event) => {
          try { onChange(JSON.parse(event.target.value)); } catch { /* retain valid config until JSON parses */ }
        }}
      />
    </Field>
  );
}

export default function NodeInspector({ node, onUpdate, onDelete, onClose }) {
  if (!node) {
    return (
      <aside className="flex w-80 items-center justify-center border-l border-zinc-800/80 bg-[#0b0f16] p-8 text-center text-sm text-zinc-500">
        Select a node to configure execution settings.
      </aside>
    );
  }
  const config = node.data.config;
  const setConfig = (field, value) => onUpdate({ config: { ...config, [field]: value } });

  return (
    <aside className="w-80 shrink-0 overflow-y-auto border-l border-zinc-800/80 bg-[#0b0f16]">
      <div className="flex items-start justify-between border-b border-zinc-800/80 p-5">
        <div>
          <p className="text-xs font-medium uppercase tracking-wider text-emerald-400">Inspector</p>
          <h2 className="mt-1 text-base font-semibold">{NODE_CATALOG[node.type].label}</h2>
        </div>
        <button onClick={onClose} className="text-zinc-500 hover:text-white"><X size={17} /></button>
      </div>
      <div className="space-y-4 p-5">
        <Field label="Label">
          <input className={inputClass} value={node.data.label} onChange={(event) => onUpdate({ label: event.target.value })} />
        </Field>
        {node.type === "variable" && (
          <>
            <JsonField label="Variables JSON" value={config.variables} onChange={(value) => setConfig("variables", value)} />
            <p className="text-xs leading-5 text-zinc-500">Connect this node to a task and use values as <span className="font-mono text-zinc-300">{"{url}"}</span>.</p>
          </>
        )}
        {node.type === "command" && (
          <>
            <Field label="Shell"><input className={inputClass} value={config.shell} onChange={(event) => setConfig("shell", event.target.value)} /></Field>
            <Field label="Command"><textarea className={`${inputClass} h-32 font-mono text-xs`} value={config.command} onChange={(event) => setConfig("command", event.target.value)} /></Field>
            <JsonField label="Environment JSON" value={config.env} onChange={(value) => setConfig("env", value)} />
          </>
        )}
        {node.type === "ssh" && (
          <>
            <Field label="Host"><input className={inputClass} value={config.host} onChange={(event) => setConfig("host", event.target.value)} placeholder="server.example.com" /></Field>
            <div className="flex gap-2">
              <Field label="User"><input className={inputClass} value={config.user} onChange={(event) => setConfig("user", event.target.value)} /></Field>
              <Field label="Port"><input className={inputClass} type="number" value={config.port} onChange={(event) => setConfig("port", Number(event.target.value))} /></Field>
            </div>
            <Field label="Private key path"><input className={inputClass} value={config.privateKeyPath} onChange={(event) => setConfig("privateKeyPath", event.target.value)} /></Field>
            <Field label="Remote command"><textarea className={`${inputClass} h-28 font-mono text-xs`} value={config.command} onChange={(event) => setConfig("command", event.target.value)} /></Field>
            <JsonField label="Remote environment JSON" value={config.env} onChange={(value) => setConfig("env", value)} />
          </>
        )}
        {node.type === "docker" && (
          <>
            <Field label="Image"><input className={inputClass} value={config.image} onChange={(event) => setConfig("image", event.target.value)} /></Field>
            <Field label="Container command"><textarea className={`${inputClass} h-28 font-mono text-xs`} value={config.command} onChange={(event) => setConfig("command", event.target.value)} /></Field>
            <JsonField label="Environment JSON" value={config.env} onChange={(value) => setConfig("env", value)} />
          </>
        )}
        {node.type === "webhook" && (
          <>
            <Field label="Method">
              <select className={inputClass} value={config.method} onChange={(event) => setConfig("method", event.target.value)}>
                {["GET", "POST", "PUT", "PATCH", "DELETE"].map((method) => <option key={method}>{method}</option>)}
              </select>
            </Field>
            <Field label="URL"><input className={inputClass} value={config.url} onChange={(event) => setConfig("url", event.target.value)} /></Field>
            <JsonField label="Headers JSON" value={config.headers} onChange={(value) => setConfig("headers", value)} />
            <Field label="Request body"><textarea className={`${inputClass} h-28 font-mono text-xs`} value={config.body} onChange={(event) => setConfig("body", event.target.value)} /></Field>
          </>
        )}
        <label className="flex items-center gap-2 rounded-lg border border-zinc-800 p-3 text-xs text-zinc-400">
          <input type="checkbox" checked={Boolean(config.runAfterFailure)} onChange={(event) => setConfig("runAfterFailure", event.target.checked)} />
          Run when a dependency fails
        </label>
        <button onClick={() => onDelete(node.id)} className="flex w-full items-center justify-center gap-2 rounded-lg border border-rose-500/30 bg-rose-500/10 py-2.5 text-sm text-rose-300 hover:bg-rose-500/20">
          <Trash2 size={15} /> Delete node
        </button>
      </div>
    </aside>
  );
}
