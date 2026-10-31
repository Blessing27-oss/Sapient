"use client";
import { Suspense, useCallback, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import Graph from "@/components/Graph";
import { LABEL_TEXT } from "@/lib/engine";
import { LABEL_FILL, LABEL_RING } from "@/lib/ui";
import type { Label } from "@/lib/types";

type Q = { id: string; text: string; options: string[] };
type Progress = { answered: number; total: number };
type Next =
  | { question: Q; progress: Progress }
  | { done: true; progress: Progress; edges: { source: string; target: string; weight: number }[]; diagnostic: { conceptId: string; name: string; label: Label }[];
      answered: { questionId: string; text: string; correct: boolean; choice: number; options: string[]; correctAnswer: number; explanation?: string }[] };

function StudentInner() {
  const sp = useSearchParams();
  const [code, setCode] = useState((sp.get("code") ?? "").toUpperCase());
  const [name, setName] = useState("");
  const [sid, setSid] = useState("");
  const [err, setErr] = useState("");
  const [next, setNext] = useState<Next | null>(null);
  const [challenged, setChallenged] = useState<Record<string, boolean>>({});

  const load = useCallback(async (c: string, s: string) => setNext(await (await fetch(`/api/rooms/${c}/next?student=${s}`)).json()), []);
  useEffect(() => {
    if (!sid || !next || !("done" in next)) return;
    const timer = setInterval(() => load(code, sid), 3000);
    return () => clearInterval(timer);
  }, [code, sid, next, load]);
  async function join() {
    const r = await fetch(`/api/rooms/${code}/join`, { method: "POST", body: JSON.stringify({ name }) });
    const j = await r.json();
    if (!r.ok) return setErr(j.error);
    setSid(j.studentId); load(code, j.studentId);
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
      <div className="mx-auto grid max-w-4xl items-start gap-10 py-6 md:grid-cols-2">
        <div className="space-y-6">
          <div>
            <h1 className="text-4xl font-bold">Join your class</h1>
            <p className="mt-2 text-stone-600">Enter the code your professor shared and your name to begin.</p>
          </div>
          <div className="card space-y-3">
            <label className="block text-sm font-medium">Room code
              <input className="input mt-1 text-center font-mono text-3xl uppercase tracking-[0.3em]" maxLength={4} placeholder="ABCD" value={code} onChange={(e) => setCode(e.target.value.toUpperCase())} />
            </label>
            <label className="block text-sm font-medium">Your name
              <input className="input mt-1" placeholder="First name is fine" value={name} onChange={(e) => setName(e.target.value)} onKeyDown={(e) => e.key === "Enter" && code && name && join()} />
            </label>
            {err && <p className="text-sm text-red-600">{err}</p>}
            <button className="btn w-full !py-3" disabled={!code || !name} onClick={join}>Start</button>
          </div>
        </div>
        <div className="card space-y-4">
          <h2 className="text-xl font-bold">What to expect</h2>
          {[
            ["3 questions", "Just three multiple-choice questions, one at a time."],
            ["They adapt", "Your next question depends on how you answered, so you and a classmate may see different ones."],
            ["Your results", "At the end you get a map of what you showed you know, what needs review, and what is only a guess."],
            ["You can push back", "Think a question was unclear? Tell your professor and they can review it."],
          ].map(([t, d]) => (
            <div key={t} className="flex gap-3">
              <span className="mt-1.5 h-2.5 w-2.5 shrink-0 rounded-full bg-[#00693e]" />
              <div><p className="font-semibold">{t}</p><p className="text-sm text-stone-500">{d}</p></div>
            </div>
          ))}
        </div>
      </div>
    );
  if (!next) return <p className="text-stone-500">Loading…</p>;

  if ("question" in next)
    return (
      <div className="mx-auto max-w-xl space-y-5">
        <div>
          <div className="mb-2 h-2 overflow-hidden rounded-full bg-stone-200"><div className="h-full bg-[#00693e] transition-all" style={{ width: `${(next.progress.answered / next.progress.total) * 100}%` }} /></div>
          <p className="text-sm text-stone-500">Question {next.progress.answered + 1} of {next.progress.total}</p>
        </div>
        <h1 className="text-2xl font-bold leading-snug">{next.question.text}</h1>
        <div className="space-y-2">
          {next.question.options.map((o, i) => (
            <button key={i} className="flex w-full items-center gap-3 rounded-xl border border-stone-300 bg-white p-4 text-left transition hover:border-[#00693e] hover:bg-green-50" onClick={() => answer(next.question, i)}>
              <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-stone-100 text-sm font-semibold">{"ABCD"[i]}</span>{o}
            </button>
          ))}
        </div>
      </div>
    );
  if (!("done" in next)) return <p className="text-stone-500">Loading…</p>;

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-3xl font-bold">Your preliminary diagnostic</h1>
        <p className="mt-1 max-w-2xl text-stone-600">Based on only {next.progress.total} questions. Dashed concepts are inferred from related answers, not answered directly. Grey means not enough evidence.</p>
      </div>
      <Graph nodes={next.diagnostic.map((d) => ({ id: d.conceptId, name: d.name, fill: LABEL_FILL[d.label], ring: LABEL_RING.includes(d.label) }))} edges={next.edges} />
      <div className="flex flex-wrap gap-2 text-xs">
        {(Object.keys(LABEL_FILL) as Label[]).map((l) => <span key={l} className="flex items-center gap-1.5 rounded-full border bg-white px-2.5 py-1"><i className="h-3 w-3 rounded-full border" style={{ background: LABEL_FILL[l] }} />{LABEL_TEXT[l]}</span>)}
      </div>
      <div className="space-y-3">
        <h2 className="text-xl font-bold">Your answers</h2>
        {next.answered.map((a) => (
          <div key={a.questionId} className="card space-y-1 text-sm">
            <p className="font-semibold">{a.text}</p>
            <p className={a.correct ? "text-green-700" : "text-red-700"}>You answered: {a.options[a.choice]} {a.correct ? "✓" : `✗ — correct: ${a.options[a.correctAnswer]}`}</p>
            {a.explanation && <p className="text-stone-500">{a.explanation}</p>}
            <button className="text-[#00693e] underline disabled:text-stone-400 disabled:no-underline" disabled={challenged[a.questionId]} onClick={() => challenge(a.questionId)}>
              {challenged[a.questionId] ? "Challenge sent to your professor" : "I disagree with this assessment"}
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
