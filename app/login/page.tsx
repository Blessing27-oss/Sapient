"use client";
import { Suspense, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";

function LoginForm() {
  const router = useRouter();
  const sp = useSearchParams();
  const [mode, setMode] = useState<"signin" | "signup">("signin");
  const [role, setRole] = useState<"student" | "professor">(sp.get("role") === "professor" ? "professor" : "student");
  const [f, setF] = useState({ name: "", password: "" });
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement>) => setF({ ...f, [k]: e.target.value });

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true); setErr("");
    const r = await fetch(mode === "signup" ? "/api/auth/signup" : "/api/auth/login", { method: "POST", body: JSON.stringify({ ...f, role }) });
    const j = await r.json();
    setBusy(false);
    if (!r.ok) return setErr(j.error ?? "Something went wrong.");
    const next = sp.get("next");
    router.push(next && next.startsWith("/") ? next : j.role === "professor" ? "/professor" : "/student");
    router.refresh();
  }

  return (
    <div className="mx-auto max-w-md space-y-5 py-6">
      <div className="text-center">
        <h1 className="text-3xl font-bold">{mode === "signin" ? "Welcome back" : "Create your account"}</h1>
        <p className="mt-1 text-stone-500">{mode === "signin" ? "Sign in to continue." : "Professors build rooms. Students join them."}</p>
      </div>
      <form onSubmit={submit} className="card space-y-4">
        {mode === "signup" && (
          <div className="grid grid-cols-2 gap-2">
            {(["student", "professor"] as const).map((r) => (
              <button type="button" key={r} onClick={() => setRole(r)} className={`rounded-lg border px-3 py-3 text-sm font-semibold capitalize ${role === r ? "border-[#00693e] bg-green-50 text-[#00693e]" : "border-stone-300 text-stone-600"}`}>
                {r === "student" ? "🎓 " : "🧑‍🏫 "}{r}
              </button>
            ))}
          </div>
        )}
        <label className="block text-sm font-medium">Name<input className="input mt-1" value={f.name} onChange={set("name")} autoComplete="username" required /></label>
        <label className="block text-sm font-medium">Password<input className="input mt-1" type="password" value={f.password} onChange={set("password")} autoComplete={mode === "signup" ? "new-password" : "current-password"} minLength={mode === "signup" ? 6 : undefined} required /></label>
        {err && <p role="alert" className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{err}</p>}
        <button className="btn w-full !py-3" disabled={busy}>{busy ? "…" : mode === "signin" ? "Sign in" : "Create account"}</button>
      </form>
      <p className="text-center text-sm text-stone-500">
        {mode === "signin" ? "New here?" : "Already have an account?"}{" "}
        <button className="font-semibold text-[#00693e] underline" onClick={() => { setMode(mode === "signin" ? "signup" : "signin"); setErr(""); }}>
          {mode === "signin" ? "Create an account" : "Sign in"}
        </button>
      </p>
    </div>
  );
}

export default function LoginPage() {
  return <Suspense><LoginForm /></Suspense>;
}
