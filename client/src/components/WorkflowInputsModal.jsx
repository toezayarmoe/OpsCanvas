import { Play, Save, X } from "lucide-react";

function validateInputs(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("Inputs must be a JSON object.");
  for (const [key, inputValue] of Object.entries(value)) {
    if (!/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(key)) throw new Error(`Invalid input name: ${key}.`);
    if (inputValue != null && !["string", "number", "boolean"].includes(typeof inputValue)) {
      throw new Error(`Input "${key}" must be a string, number, boolean, or null.`);
    }
  }
  return value;
}

export default function WorkflowInputsModal({ mode, inputs, onClose, onSubmit }) {
  const isRun = mode === "run";
  let parsed = null;
  let error = "";
  const value = JSON.stringify(inputs || {}, null, 2);

  return (
    <dialog open className="fixed inset-0 z-40 flex h-full w-full items-center justify-center bg-black/60 p-4 text-zinc-100">
      <form
        className="w-full max-w-xl rounded-2xl border border-zinc-800 bg-[#0d121b] shadow-panel"
        onSubmit={(event) => {
          event.preventDefault();
          const form = new FormData(event.currentTarget);
          try {
            parsed = validateInputs(JSON.parse(form.get("inputs")));
            onSubmit(parsed);
          } catch (parseError) {
            error = parseError.message;
            event.currentTarget.querySelector("[data-error]").textContent = error;
          }
        }}
      >
        <header className="flex items-start justify-between border-b border-zinc-800 p-5">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wider text-emerald-400">{isRun ? "Run inputs" : "Workflow inputs"}</p>
            <h2 className="mt-1 text-lg font-semibold">{isRun ? "Set values for this run" : "Define reusable workflow inputs"}</h2>
          </div>
          <button type="button" onClick={onClose} className="text-zinc-500 hover:text-white"><X size={18} /></button>
        </header>
        <div className="space-y-4 p-5">
          <p className="text-sm leading-6 text-zinc-400">
            {isRun
              ? "These values are available to every node during this execution."
              : "Define default values as JSON. Any node can use them with placeholders like {domain} or {wordlist}."}
          </p>
          <textarea
            name="inputs"
            defaultValue={value}
            spellCheck="false"
            className="h-64 w-full rounded-xl border border-zinc-800 bg-[#080c13] p-3 font-mono text-xs leading-5 text-zinc-200 outline-none focus:border-emerald-500/70"
          />
          <p data-error className="min-h-5 text-sm text-rose-300" />
        </div>
        <footer className="flex items-center justify-end gap-2 border-t border-zinc-800 p-5">
          <button type="button" onClick={onClose} className="rounded-lg border border-zinc-700 px-4 py-2 text-sm text-zinc-300 hover:bg-zinc-800">Cancel</button>
          <button type="submit" className="flex items-center gap-2 rounded-lg bg-emerald-400 px-4 py-2 text-sm font-semibold text-zinc-950">
            {isRun ? <Play size={15} fill="currentColor" /> : <Save size={15} />}
            {isRun ? "Run workflow" : "Save inputs"}
          </button>
        </footer>
      </form>
    </dialog>
  );
}
