import { useState } from "react";
import { ArrowRight, LockKeyhole, Workflow } from "lucide-react";
import { api } from "../lib/api";

export default function AuthScreen({ registrationEnabled, message, onAuthenticated }) {
  const [mode, setMode] = useState("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const registering = mode === "register";

  const submit = async (event) => {
    event.preventDefault();
    setBusy(true);
    setError("");
    try {
      const result = registering
        ? await api.register({ email, password })
        : await api.login({ email, password });
      onAuthenticated(result.user);
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <main className="flex min-h-screen bg-[#080b12] text-zinc-100">
      <section className="hidden flex-1 flex-col justify-between border-r border-zinc-800/80 bg-[radial-gradient(circle_at_35%_30%,rgba(52,211,153,.13),transparent_42%),#090c13] p-12 lg:flex">
        <div className="flex items-center gap-2 text-lg font-bold">
          <div className="rounded-lg bg-emerald-400 p-1.5 text-zinc-950"><Workflow size={18} /></div>
          CLIFlow
        </div>
        <div className="max-w-lg">
          <p className="mb-5 text-xs font-semibold uppercase tracking-[.24em] text-emerald-400">Automation Studio</p>
          <h1 className="text-5xl font-semibold leading-tight tracking-tight">Orchestrate command workflows with precision.</h1>
          <p className="mt-6 max-w-md text-base leading-7 text-zinc-400">
            Compose shell, SSH, container and API tasks as secure, observable execution graphs.
          </p>
        </div>
        <p className="text-xs text-zinc-600">Access is protected by authenticated sessions.</p>
      </section>
      <section className="flex w-full items-center justify-center p-6 lg:w-[500px]">
        <form onSubmit={submit} className="w-full max-w-sm">
          <div className="mb-9 flex h-11 w-11 items-center justify-center rounded-xl border border-emerald-500/25 bg-emerald-500/10 text-emerald-300">
            <LockKeyhole size={20} />
          </div>
          <h2 className="text-2xl font-semibold tracking-tight">{registering ? "Create account" : "Sign in"}</h2>
          <p className="mb-8 mt-2 text-sm text-zinc-500">
            {registering ? "Create your private workflow workspace." : "Enter your credentials to access workflows."}
          </p>
          {message && <div className="mb-5 rounded-xl border border-amber-500/25 bg-amber-500/10 p-3 text-sm text-amber-200">{message}</div>}
          <label className="mb-4 block space-y-2">
            <span className="text-xs font-medium text-zinc-400">Email</span>
            <input
              required
              type="email"
              autoComplete="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              className="w-full rounded-xl border border-zinc-800 bg-[#0c1119] px-4 py-3 text-sm outline-none focus:border-emerald-500"
            />
          </label>
          <label className="block space-y-2">
            <span className="text-xs font-medium text-zinc-400">Password</span>
            <input
              required
              minLength={registering ? 12 : undefined}
              type="password"
              autoComplete={registering ? "new-password" : "current-password"}
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              className="w-full rounded-xl border border-zinc-800 bg-[#0c1119] px-4 py-3 text-sm outline-none focus:border-emerald-500"
            />
            {registering && <p className="text-[11px] text-zinc-500">At least 12 characters.</p>}
          </label>
          {error && <div className="mt-5 rounded-xl border border-rose-500/25 bg-rose-500/10 p-3 text-sm text-rose-300">{error}</div>}
          <button
            type="submit"
            disabled={busy}
            className="mt-7 flex w-full items-center justify-center gap-2 rounded-xl bg-emerald-400 px-4 py-3 text-sm font-semibold text-zinc-950 transition hover:bg-emerald-300 disabled:opacity-60"
          >
            {busy ? "Working..." : registering ? "Create account" : "Sign in"} <ArrowRight size={15} />
          </button>
          {registrationEnabled && (
            <button
              type="button"
              onClick={() => { setMode(registering ? "login" : "register"); setError(""); }}
              className="mt-5 w-full text-center text-sm text-zinc-500 hover:text-zinc-300"
            >
              {registering ? "Already registered? Sign in" : "Need an account? Register"}
            </button>
          )}
        </form>
      </section>
    </main>
  );
}
