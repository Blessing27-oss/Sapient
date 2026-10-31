"use client";
import { useEffect, useRef, useState } from "react";

type Me = { professor: boolean; googleClientId: string; dev: boolean };
declare global { interface Window { google?: { accounts: { id: { initialize: (o: object) => void; renderButton: (el: HTMLElement, o: object) => void } } } } }

export default function ProfessorGate({ children }: { children: React.ReactNode }) {
  const [me, setMe] = useState<Me | null>(null);
  const [err, setErr] = useState("");
  const [email, setEmail] = useState("");
  const btn = useRef<HTMLDivElement>(null);
  const refresh = () => fetch("/api/auth/me").then((r) => r.json()).then(setMe);
  useEffect(() => { refresh(); }, []);

  useEffect(() => {
    if (!me || me.professor || !me.googleClientId) return;
    const s = document.createElement("script");
    s.src = "https://accounts.google.com/gsi/client";
    s.async = true;
    s.onload = () => {
      window.google?.accounts.id.initialize({
        client_id: me.googleClientId,
        callback: async ({ credential }: { credential: string }) => {
          const r = await fetch("/api/auth/google", { method: "POST", body: JSON.stringify({ credential }) });
          if (r.ok) refresh(); else setErr((await r.json()).error);
        },
      });
      if (btn.current) window.google?.accounts.id.renderButton(btn.current, { theme: "outline", size: "large", text: "signin_with" });
    };
    document.body.appendChild(s);
    return () => { s.remove(); };
  }, [me]);

  async function devLogin() {
    const r = await fetch("/api/auth/dev", { method: "POST", body: JSON.stringify({ email }) });
    if (r.ok) { setErr(""); refresh(); } else setErr((await r.json()).error);
  }

  if (!me) return <p className="text-stone-500">Loading…</p>;
  if (me.professor) return <>{children}</>;
  return (
    <div className="mx-auto mt-10 max-w-md rounded-2xl border border-stone-200 bg-white p-8 text-center shadow-sm">
      <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-[#00693e] text-xl text-white">🔒</div>
      <h1 className="text-xl font-semibold">Professor sign-in</h1>
      <div className="mt-6 flex flex-col items-center gap-3">
        {me.googleClientId && <div ref={btn} />}
        {me.dev && (
          <>
            <input className="input" placeholder="Email" value={email} onChange={(e) => setEmail(e.target.value)} onKeyDown={(e) => e.key === "Enter" && devLogin()} />
            <button className="btn w-full" onClick={devLogin}>Continue</button>
          </>
        )}
        {!me.googleClientId && !me.dev && <p className="text-sm text-red-600">Sign-in is not configured on this server.</p>}
        {err && <p className="text-sm text-red-600">{err}</p>}
      </div>
    </div>
  );
}
