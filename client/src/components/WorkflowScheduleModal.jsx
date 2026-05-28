import { Clock3, Save, X } from "lucide-react";

function validateSchedule(form) {
  const enabled = form.get("enabled") === "on";
  const cron = String(form.get("cron") || "").trim();
  let inputs;
  try {
    inputs = JSON.parse(form.get("inputs") || "{}");
  } catch {
    throw new Error("Schedule inputs must be valid JSON.");
  }
  if (!inputs || typeof inputs !== "object" || Array.isArray(inputs)) throw new Error("Schedule inputs must be a JSON object.");
  for (const [key, value] of Object.entries(inputs)) {
    if (!/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(key)) throw new Error(`Invalid input name: ${key}.`);
    if (value != null && !["string", "number", "boolean"].includes(typeof value)) throw new Error(`Input "${key}" must be a string, number, boolean, or null.`);
  }
  if (enabled && cron.split(/\s+/).length !== 5) throw new Error("Cron must have five fields: minute hour day month weekday.");
  return { enabled, cron, inputs };
}

export default function WorkflowScheduleModal({ schedule, workflowInputs, onClose, onSubmit }) {
  const current = schedule || {};
  return (
    <dialog open className="fixed inset-0 z-40 flex h-full w-full items-center justify-center bg-black/60 p-4 text-zinc-100">
      <form
        className="w-full max-w-xl rounded-2xl border border-zinc-800 bg-[#0d121b] shadow-panel"
        onSubmit={(event) => {
          event.preventDefault();
          try {
            onSubmit(validateSchedule(new FormData(event.currentTarget)));
          } catch (error) {
            event.currentTarget.querySelector("[data-error]").textContent = error.message;
          }
        }}
      >
        <header className="flex items-start justify-between border-b border-zinc-800 p-5">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wider text-emerald-400">Scheduler</p>
            <h2 className="mt-1 text-lg font-semibold">Run this workflow on cron</h2>
          </div>
          <button type="button" onClick={onClose} className="text-zinc-500 hover:text-white"><X size={18} /></button>
        </header>
        <div className="space-y-4 p-5">
          <label className="flex items-center gap-3 rounded-xl border border-zinc-800 bg-[#080c13] p-3 text-sm text-zinc-300">
            <input name="enabled" type="checkbox" defaultChecked={Boolean(current.enabled)} />
            Enable scheduled runs
          </label>
          <label className="block space-y-1.5">
            <span className="text-[11px] font-medium uppercase tracking-wider text-zinc-500">Cron expression</span>
            <input
              name="cron"
              defaultValue={current.cron || "*/15 * * * *"}
              placeholder="*/15 * * * *"
              className="w-full rounded-xl border border-zinc-800 bg-[#080c13] px-3 py-2 font-mono text-sm text-zinc-200 outline-none focus:border-emerald-500/70"
            />
          </label>
          <div className="rounded-xl border border-zinc-800 bg-[#080c13] p-3 text-xs leading-5 text-zinc-400">
            <p className="font-medium text-zinc-300">Examples</p>
            <p><span className="font-mono text-zinc-200">*/15 * * * *</span> every 15 minutes</p>
            <p><span className="font-mono text-zinc-200">0 9 * * *</span> every day at 09:00 server local time</p>
            <p><span className="font-mono text-zinc-200">0 9 * * 1-5</span> weekdays at 09:00</p>
          </div>
          <label className="block space-y-1.5">
            <span className="text-[11px] font-medium uppercase tracking-wider text-zinc-500">Schedule inputs JSON</span>
            <textarea
              name="inputs"
              defaultValue={JSON.stringify(current.inputs || workflowInputs || {}, null, 2)}
              spellCheck="false"
              className="h-44 w-full rounded-xl border border-zinc-800 bg-[#080c13] p-3 font-mono text-xs leading-5 text-zinc-200 outline-none focus:border-emerald-500/70"
            />
          </label>
          <p className="text-xs leading-5 text-zinc-500">Scheduled runs use these inputs automatically. Cron is evaluated by the server in its local timezone.</p>
          <p data-error className="min-h-5 text-sm text-rose-300" />
        </div>
        <footer className="flex items-center justify-end gap-2 border-t border-zinc-800 p-5">
          <button type="button" onClick={onClose} className="rounded-lg border border-zinc-700 px-4 py-2 text-sm text-zinc-300 hover:bg-zinc-800">Cancel</button>
          <button type="submit" className="flex items-center gap-2 rounded-lg bg-emerald-400 px-4 py-2 text-sm font-semibold text-zinc-950">
            {current.enabled ? <Clock3 size={15} /> : <Save size={15} />} Save schedule
          </button>
        </footer>
      </form>
    </dialog>
  );
}
