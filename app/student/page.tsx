"use client";
import { Suspense, useCallback, useState } from "react";
import { useSearchParams } from "next/navigation";
import { LABEL_TEXT } from "@/lib/engine";
import type { Label } from "@/lib/types";

type Q = { id: string; text: string; options: string[] };
type Next =
  | { question: Q; progress: { answered: number; total: number } }
  | { done: true; progress: { answered: number; total: number }; diagnostic: { conceptId: string; name: string; label: Label; evidence: { correct: number; wrong: number } }[];
      answered: { questionId: string; text: string; correct: boolean; choice: number; options: string[]; correctAnswer: number; explanation?: string }[] };

const COLORS: Record<Label, string> = {
  strength: "bg-green-100 text-green-800", review: "bg-red-100 text-red-800", mixed: "bg-amber-100 text-amber-800",
  "tentative-up": "bg-sky-50 text-sky-700 border border-dashed border-sky-300", "tentative-down": "bg-orange-50 text-orange-700 border border-dashed border-orange-300",
  unknown: "bg-slate-100 text-slate-500",
};

function StudentInner() {
  const sp = useSearchParams();
  const [code, setCode] = useState((sp.get("code") ?? "").toUpperCase());
  const [name, setName] = useState("");
  const [sid, setSid] = useState("");
  const [err, setErr] = useState("");
  const [next, setNext] = useState<Next | null>(null);
  const [challenged, setChallenged] = useState<Record<string, boolean>>({});

  const load = useCallback(async (c: string, s: string) => {
    const r = await fetch(`/api/rooms/${c}/next?student=${s}`);
    setNext(await r.json());
  }, []);

  async function join() {
    const r = await fetch(`/api/rooms/${code}/join`, { method: "POST", body: JSON.stringify({ name }) });
    const j = await r.json();
    if (!r.ok) return setErr(j.error);
    setSid(j.studentId);
    load(code, j.studentId);
  }
  async function answer(q: Q, choice: number) {
    await fetch(`/api/rooms/${code}/answer`, { method: "POST", body: JSON.stringify({ studentId: sid, questionId: q.id, choice }) });
    load(code, sid);
  }
  async function challenge(questionId: string) {
    const reason = prompt("Why do you disagree with this question?");
    if (!reason) return;
    await fetch(`/api/rooms/${code}/challenge`, { method: "POST", body: JSON.stringify({ studentId: sid, questionId, reason }) });
    setChallenged((c) => ({ ...c, [questionId]: true }));
  }

  if (!sid)
    return (
      <div className="card max-w-sm space-y-3">
        <h1 className="text-xl font-semibold">Join a room</h1>
        <input className="input uppercase" placeholder="Room code" value={code} onChange={(e) => setCode(e.target.value.toUpperCase())} />
        <input className="input" placeholder="Your name" value={name} onChange={(e) => setName(e.target.value)} />
        {err && <p className="text-sm text-red-600">{err}</p>}
        <button className="btn" disabled={!code || !name} onClick={join}>Start</button>
      </div>
    );
  if (!next) return <p>Loading…</p>;

  if ("question" in next)
    return (
      <div className="card max-w-xl space-y-3">
        <p className="text-xs text-slate-500">Question {next.progress.answered + 1} of {next.progress.total}</p>
        <h2 className="text-lg font-medium">{next.question.text}</h2>
        {next.question.options.map((o, i) => (
          <button key={i} className="btn-ghost block w-full text-left" onClick={() => answer(next.question, i)}>{o}</button>
        ))}
      </div>
    );

  if (!("done" in next)) return <p>Loading…</p>;
  return (
    <div className="space-y-6">
      <h1 className="text-xl font-semibold">Your preliminary diagnostic</h1>
      <p className="max-w-2xl text-sm text-slate-600">
        Based on only {next.progress.total} questions. “Tentative” labels are inferences from related concepts, not things you answered. “Unknown” means not enough evidence.
      </p>
      <div className="grid gap-2 sm:grid-cols-2">
        {next.diagnostic.map((d) => (
          <div key={d.conceptId} className={`rounded-md px-3 py-2 text-sm ${COLORS[d.label]}`}>
            <b>{d.name}</b> — {LABEL_TEXT[d.label]}
          </div>
        ))}
      </div>
      <div className="space-y-3">
        {next.answered.map((a) => (
          <div key={a.questionId} className="card text-sm">
            <p className="font-medium">{a.text}</p>
            <p>You said: {a.options[a.choice]} {a.correct ? "✓" : `✗ (correct: ${a.options[a.correctAnswer]})`}</p>
            {a.explanation && <p className="text-slate-500">{a.explanation}</p>}
            <button className="mt-1 text-indigo-700 underline disabled:text-slate-400 disabled:no-underline" disabled={challenged[a.questionId]} onClick={() => challenge(a.questionId)}>
              {challenged[a.questionId] ? "Challenge sent to professor" : "I disagree with this assessment"}
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}

export default function Student() {
  return <Suspense><StudentInner /></Suspense>;
}
