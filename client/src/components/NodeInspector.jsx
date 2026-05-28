import { ChevronRight, Trash2, X } from "lucide-react";
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

const conditionalOperators = [
  { value: "truthy", label: "Truthy", description: "Passes when the selected value is not empty, false, null, or zero.", pseudo: "if value:" },
  { value: "falsy", label: "Falsy", description: "Passes when the selected value is empty, false, null, zero, or missing.", pseudo: "if not value:" },
  { value: "exists", label: "Exists", description: "Passes when the selected path exists and is not null.", pseudo: "if value is not undefined and value is not null:" },
  { value: "notExists", label: "Does not exist", description: "Passes when the selected path is missing or null.", pseudo: "if value is undefined or value is null:" },
  { value: "equals", label: "Equals", description: "Passes when the selected value equals the compare value.", pseudo: "if string(value) == compareValue:" },
  { value: "notEquals", label: "Does not equal", description: "Passes when the selected value is different from the compare value.", pseudo: "if string(value) != compareValue:" },
  { value: "contains", label: "Contains", description: "Passes when the selected text contains the compare value.", pseudo: "if compareValue in string(value):" },
  { value: "regex", label: "Regex match", description: "Passes when the selected text matches the regular expression.", pseudo: "if regex(compareValue).test(string(value)):" },
  { value: "greaterThan", label: "Greater than", description: "Passes when the selected value is numerically greater than the compare value.", pseudo: "if number(value) > number(compareValue):" },
  { value: "lessThan", label: "Less than", description: "Passes when the selected value is numerically less than the compare value.", pseudo: "if number(value) < number(compareValue):" },
  { value: "countGreaterThan", label: "Count greater than", description: "Passes when the selected array, object, or line count is greater than the compare value.", pseudo: "if count(value) > number(compareValue):" },
  { value: "countEquals", label: "Count equals", description: "Passes when the selected array, object, or line count equals the compare value.", pseudo: "if count(value) == number(compareValue):" },
];

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

export default function NodeInspector({ width, node, onUpdate, onDelete, onClose, onCollapse }) {
  if (!node) {
    return (
      <aside style={{ width }} className="flex shrink-0 flex-col border-l border-zinc-800/80 bg-[#0b0f16]">
        <div className="flex items-center justify-between border-b border-zinc-800/80 p-5">
          <p className="text-xs font-medium uppercase tracking-wider text-emerald-400">Inspector</p>
          <button onClick={onCollapse} title="Hide inspector" className="rounded-lg border border-zinc-800 p-1.5 text-zinc-500 hover:bg-zinc-800 hover:text-white"><ChevronRight size={15} /></button>
        </div>
        <div className="flex flex-1 items-center justify-center p-8 text-center text-sm text-zinc-500">
          Select a node to configure execution settings.
        </div>
      </aside>
    );
  }
  const config = node.data.config;
  const setConfig = (field, value) => onUpdate({ config: { ...config, [field]: value } });
  const conditionalOperator = conditionalOperators.find((operator) => operator.value === (config.operator || "truthy")) || conditionalOperators[0];

  return (
    <aside style={{ width }} className="shrink-0 overflow-y-auto border-l border-zinc-800/80 bg-[#0b0f16]">
      <div className="flex items-start justify-between border-b border-zinc-800/80 p-5">
        <div>
          <p className="text-xs font-medium uppercase tracking-wider text-emerald-400">Inspector</p>
          <h2 className="mt-1 text-base font-semibold">{NODE_CATALOG[node.type].label}</h2>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={onClose} title="Clear selection" className="text-zinc-500 hover:text-white"><X size={17} /></button>
          <button onClick={onCollapse} title="Hide inspector" className="rounded-lg border border-zinc-800 p-1.5 text-zinc-500 hover:bg-zinc-800 hover:text-white"><ChevronRight size={15} /></button>
        </div>
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
        {node.type === "output" && (
          <>
            <Field label="Filename"><input className={inputClass} value={config.filename} onChange={(event) => setConfig("filename", event.target.value)} placeholder="result.json" /></Field>
            <Field label="Content type"><input className={inputClass} value={config.contentType} onChange={(event) => setConfig("contentType", event.target.value)} placeholder="application/json" /></Field>
            <Field label="Source">
              <select className={inputClass} value={config.sourceMode || "input"} onChange={(event) => setConfig("sourceMode", event.target.value)}>
                <option value="input">Connected node output</option>
                <option value="workspace">Workspace file path</option>
              </select>
            </Field>
            {(config.sourceMode || "input") === "workspace" ? (
              <Field label="Workspace file path"><input className={`${inputClass} font-mono text-xs`} value={config.sourcePath || ""} onChange={(event) => setConfig("sourcePath", event.target.value)} placeholder="final_sub.txt" /></Field>
            ) : (
              <Field label="File content"><textarea className={`${inputClass} h-32 font-mono text-xs`} value={config.content} onChange={(event) => setConfig("content", event.target.value)} /></Field>
            )}
            <p className="text-xs leading-5 text-zinc-500">Use connected output or publish a relative file created by earlier shell nodes. Maximum file size: 5 MB.</p>
          </>
        )}
        {node.type === "parser" && (
          <>
            <div className="grid grid-cols-2 gap-2 text-xs text-zinc-400">
              {[
                ["splitLines", "Split lines"],
                ["trim", "Trim values"],
                ["removeEmpty", "Remove empty"],
                ["dedupe", "Dedupe"],
              ].map(([field, label]) => (
                <label key={field} className="flex items-center gap-2 rounded-lg border border-zinc-800 p-3">
                  <input
                    type="checkbox"
                    checked={config[field] !== false}
                    onChange={(event) => setConfig(field, event.target.checked)}
                  />
                  {label}
                </label>
              ))}
            </div>
            <Field label="Include regex"><input className={`${inputClass} font-mono text-xs`} value={config.includeRegex || ""} onChange={(event) => setConfig("includeRegex", event.target.value)} placeholder="^https?://" /></Field>
            <Field label="Exclude regex"><input className={`${inputClass} font-mono text-xs`} value={config.excludeRegex || ""} onChange={(event) => setConfig("excludeRegex", event.target.value)} placeholder="\\.png$" /></Field>
            <Field label="Limit">
              <input className={inputClass} type="number" min="0" value={config.limit || 0} onChange={(event) => setConfig("limit", Number(event.target.value))} />
            </Field>
            <Field label="Output mode">
              <select className={inputClass} value={config.outputMode || "lines"} onChange={(event) => setConfig("outputMode", event.target.value)}>
                <option value="lines">Text lines</option>
                <option value="json">JSON array</option>
              </select>
            </Field>
            <p className="text-xs leading-5 text-zinc-500">Consumes upstream stdout, text, JSON arrays, or items fields. Text lines are best for feeding Output file nodes or shell scripts.</p>
          </>
        )}
        {node.type === "foreach" && (
          <>
            <Field label="Shell"><input className={inputClass} value={config.shell} onChange={(event) => setConfig("shell", event.target.value)} /></Field>
            <Field label="Command per item">
              <textarea className={`${inputClass} h-32 font-mono text-xs`} value={config.command} onChange={(event) => setConfig("command", event.target.value)} />
            </Field>
            <div className="grid grid-cols-2 gap-2">
              <Field label="Item variable">
                <input className={inputClass} value={config.itemVariable || "item"} onChange={(event) => setConfig("itemVariable", event.target.value)} />
              </Field>
              <Field label="Concurrency">
                <input className={inputClass} type="number" min="1" max="50" value={config.concurrency || 1} onChange={(event) => setConfig("concurrency", Number(event.target.value))} />
              </Field>
            </div>
            <div className="grid grid-cols-2 gap-2 text-xs text-zinc-400">
              {[
                ["splitLines", "Split lines"],
                ["trim", "Trim values"],
                ["removeEmpty", "Remove empty"],
                ["continueOnError", "Continue on error"],
              ].map(([field, label]) => (
                <label key={field} className="flex items-center gap-2 rounded-lg border border-zinc-800 p-3">
                  <input
                    type="checkbox"
                    checked={field === "continueOnError" ? Boolean(config[field]) : config[field] !== false}
                    onChange={(event) => setConfig(field, event.target.checked)}
                  />
                  {label}
                </label>
              ))}
            </div>
            <p className="text-xs leading-5 text-zinc-500">Consumes upstream parser items, arrays, or stdout lines. Use <span className="font-mono text-zinc-300">{"{item}"}</span> in the command, or read <span className="font-mono text-zinc-300">FLOW_ITEM</span> and <span className="font-mono text-zinc-300">FLOW_ITEM_INDEX</span>.</p>
          </>
        )}
        {node.type === "conditional" && (
          <>
            <Field label="JSON path">
              <input className={`${inputClass} font-mono text-xs`} value={config.path || ""} onChange={(event) => setConfig("path", event.target.value)} placeholder="stdout, count, items.0" />
            </Field>
            <Field label="Operator">
              <select className={inputClass} value={config.operator || "truthy"} onChange={(event) => setConfig("operator", event.target.value)}>
                {conditionalOperators.map((operator) => <option key={operator.value} value={operator.value}>{operator.label}</option>)}
              </select>
            </Field>
            <div className="rounded-xl border border-amber-500/20 bg-amber-500/5 p-3">
              <p className="text-xs font-medium text-amber-200">{conditionalOperator.label}</p>
              <p className="mt-1 text-xs leading-5 text-zinc-400">{conditionalOperator.description}</p>
              <pre className="mt-2 overflow-x-auto rounded-lg border border-zinc-800 bg-[#080b11] p-2 font-mono text-[11px] text-amber-100">{conditionalOperator.pseudo}</pre>
              {config.invert && <p className="mt-2 text-xs text-zinc-500">Invert result changes this to: <span className="font-mono text-zinc-300">if not condition:</span></p>}
            </div>
            <Field label="Compare value">
              <input className={inputClass} value={config.value || ""} onChange={(event) => setConfig("value", event.target.value)} placeholder="ready" />
            </Field>
            <div className="grid grid-cols-2 gap-2 text-xs text-zinc-400">
              <label className="flex items-center gap-2 rounded-lg border border-zinc-800 p-3">
                <input type="checkbox" checked={config.caseSensitive !== false} onChange={(event) => setConfig("caseSensitive", event.target.checked)} />
                Case sensitive
              </label>
              <label className="flex items-center gap-2 rounded-lg border border-zinc-800 p-3">
                <input type="checkbox" checked={Boolean(config.invert)} onChange={(event) => setConfig("invert", event.target.checked)} />
                Invert result
              </label>
            </div>
            <p className="text-xs leading-5 text-zinc-500">When true, connected child nodes continue. When false, this node is skipped, so downstream nodes are skipped unless they explicitly run after failure/skip.</p>
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
