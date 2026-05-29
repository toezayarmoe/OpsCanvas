import { useMemo, useState } from "react";
import { Search, X } from "lucide-react";

const MAX_CELL_LENGTH = 600;

function stringifyCell(value) {
  if (value == null) return "";
  if (typeof value === "string") return value.length > MAX_CELL_LENGTH ? `${value.slice(0, MAX_CELL_LENGTH)}...` : value;
  const text = JSON.stringify(value);
  return text.length > MAX_CELL_LENGTH ? `${text.slice(0, MAX_CELL_LENGTH)}...` : text;
}

function flatten(value, prefix = "", output = {}) {
  if (value && typeof value === "object" && !Array.isArray(value)) {
    Object.entries(value).forEach(([key, child]) => {
      const nextKey = prefix ? `${prefix}.${key}` : key;
      if (child && typeof child === "object" && !Array.isArray(child)) flatten(child, nextKey, output);
      else output[nextKey] = child;
    });
    return output;
  }
  output[prefix || "value"] = value;
  return output;
}

function rowsFromJson(value) {
  if (Array.isArray(value)) return value;
  if (value && typeof value === "object") {
    const nestedArray = ["results", "items", "data", "findings", "matches"].find((key) => Array.isArray(value[key]));
    return nestedArray ? value[nestedArray] : [value];
  }
  return [{ value }];
}

function parseContent(content) {
  const text = content.trim();
  if (!text) throw new Error("The file is empty.");

  try {
    return rowsFromJson(JSON.parse(text));
  } catch {
    const lines = text.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
    const parsed = lines.map((line) => JSON.parse(line));
    return rowsFromJson(parsed);
  }
}

export default function JsonTableViewer({ content, onClose, title }) {
  const [query, setQuery] = useState("");
  let rows = [];
  let columns = [];
  let error = null;

  try {
    rows = parseContent(content).map((row) => flatten(row));
    columns = [...new Set(rows.flatMap((row) => Object.keys(row)))];
  } catch (parseError) {
    error = parseError;
  }

  const filteredRows = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!needle) return rows;
    return rows.filter((row) => columns.some((column) => stringifyCell(row[column]).toLowerCase().includes(needle)));
  }, [columns, query, rows]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-6 backdrop-blur-sm">
      <section className="flex max-h-[86vh] w-full max-w-6xl flex-col overflow-hidden rounded-2xl border border-zinc-800 bg-[#0b0f17] shadow-panel">
        <header className="flex items-center justify-between border-b border-zinc-800 px-4 py-3">
          <div className="min-w-0">
            <p className="text-xs font-semibold uppercase tracking-wider text-emerald-400">JSON table preview</p>
            <h2 className="mt-1 truncate text-base font-semibold text-zinc-100">{title}</h2>
          </div>
          <button onClick={onClose} className="rounded-lg p-2 text-zinc-500 hover:bg-zinc-800 hover:text-white">
            <X size={18} />
          </button>
        </header>

        {error ? (
          <div className="min-h-0 overflow-auto p-4">
            <div className="mb-3 rounded-xl border border-amber-500/30 bg-amber-500/10 p-3 text-sm text-amber-100">
              This file is not valid JSON or JSONL. Raw content is shown below.
            </div>
            <pre className="max-h-[64vh] overflow-auto rounded-xl border border-zinc-800 bg-[#05070c] p-3 font-mono text-[11px] leading-5 text-zinc-300">
              {content}
            </pre>
          </div>
        ) : (
          <div className="min-h-0 overflow-auto p-4">
            <div className="mb-3 flex items-center justify-between gap-3">
              <p className="text-xs text-zinc-500">
                {filteredRows.length} of {rows.length} row{rows.length === 1 ? "" : "s"} / {columns.length} column{columns.length === 1 ? "" : "s"}
              </p>
              <label className="flex min-w-[260px] items-center gap-2 rounded-lg border border-zinc-800 bg-[#05070c] px-3 py-2 text-xs text-zinc-400">
                <Search size={14} />
                <input
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                  placeholder="Filter rows..."
                  className="w-full bg-transparent text-zinc-200 outline-none placeholder:text-zinc-600"
                />
              </label>
            </div>
            <div className="overflow-auto rounded-xl border border-zinc-800">
              <table className="min-w-full divide-y divide-zinc-800 text-left text-xs">
                <thead className="sticky top-0 bg-[#111827] text-zinc-300">
                  <tr>
                    {columns.map((column) => (
                      <th key={column} className="whitespace-nowrap px-3 py-2 font-semibold">{column}</th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-900 bg-[#070b12] text-zinc-300">
                  {filteredRows.map((row, index) => (
                    <tr key={index} className="hover:bg-zinc-900/80">
                      {columns.map((column) => (
                        <td key={column} className="max-w-sm align-top">
                          <pre className="whitespace-pre-wrap break-words px-3 py-2 font-mono text-[11px] leading-5">
                            {stringifyCell(row[column])}
                          </pre>
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </section>
    </div>
  );
}
