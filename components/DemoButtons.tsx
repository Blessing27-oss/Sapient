"use client";
import { useRouter } from "next/navigation";
import { useState } from "react";

// One-click entry into the demo, as the demo professor or as a fresh guest student.
export default function DemoButtons({ className = "" }: { className?: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState<"professor" | "student" | null>(null);
  const [err, setErr] = useState("");

  async function start(role: "professor" | "student") {
    setBusy(role); setErr("");
    try {
      const r = await fetch("/api/demo", { method: "POST", body: JSON.stringify({ role }) });
      const j = await r.json();
      if (!r.ok) return setErr(j.error ?? "The demo isn't available right now.");
      router.push(j.next);
      router.refresh();
    } catch {
      setErr("The demo isn't available right now.");
    } finally { setBusy(null); }
  }

  const link = "font-semibold fold-text underline underline-offset-2 disabled:opacity-50";
  return (
    <div className={`text-sm text-stone-500 ${className}`}>
      <p>
        Just looking? Try the demo, no sign-up needed:{" "}
        <button className={link} disabled={!!busy} onClick={() => start("professor")}>{busy === "professor" ? "opening…" : "as a professor"}</button>
        {" · "}
        <button className={link} disabled={!!busy} onClick={() => start("student")}>{busy === "student" ? "opening…" : "as a student"}</button>
      </p>
      {err && <p role="alert" className="mt-1 text-red-700">{err}</p>}
    </div>
  );
}
