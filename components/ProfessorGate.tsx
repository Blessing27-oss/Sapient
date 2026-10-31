"use client";
import { useEffect, useState } from "react";

export default function ProfessorGate({ children }: { children: React.ReactNode }) {
  const [professor, setProfessor] = useState<boolean | null>(null);
  const [err, setErr] = useState("");
  const [word, setWord] = useState("");
  const refresh = () => fetch("/api/auth/me").then((r) => r.json()).then((m) => setProfessor(m.professor));
  useEffect(() => { refresh(); }, []);

  async function login() {
    const r = await fetch("/api/auth/login", { method: "POST", body: JSON.stringify({ word }) });
    if (r.ok) { setErr(""); refresh(); } else setErr((await r.json()).error);
  }

  if (professor === null) return <p className="text-stone-500">Loading…</p>;
  if (professor) return <>{children}</>;
  return (
    <div className="mx-auto mt-10 max-w-md rounded-2xl border border-stone-200 bg-white p-8 text-center shadow-sm">
      <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-[#00693e] text-xl text-white">🔒</div>
      <h1 className="text-xl font-semibold">Professor sign-in</h1>
      <div className="mt-6 flex flex-col gap-3">
        <input className="input" type="password" placeholder="Enter the word" value={word} onChange={(e) => setWord(e.target.value)} onKeyDown={(e) => e.key === "Enter" && login()} />
        <button className="btn w-full" onClick={login}>Continue</button>
        {err && <p className="text-sm text-red-600">{err}</p>}
      </div>
    </div>
  );
}
