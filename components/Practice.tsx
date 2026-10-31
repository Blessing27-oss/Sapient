"use client";
import { useEffect, useState } from "react";

type PQ = { question: string; options: string[]; correctAnswer: number; explanation: string };

/** One practice question at a time on a concept. Answers stay in the browser; they are never evidence. */
export default function Practice({ code, studentId, concept, onClose }: {
  code: string; studentId: string; concept: { id: string; name: string }; onClose: () => void;
}) {
  const [q, setQ] = useState<PQ | null>(null);
  const [err, setErr] = useState("");
  const [pick, setPick] = useState<number | null>(null);
  const [checked, setChecked] = useState(false);
  const [score, setScore] = useState({ right: 0, total: 0 });
  const [round, setRound] = useState(0);

  useEffect(() => {
    let live = true;
    setQ(null); setErr(""); setPick(null); setChecked(false);
    fetch(`/api/rooms/${code}/practice`, { method: "POST", body: JSON.stringify({ studentId, conceptId: concept.id }) })
      .then(async (r) => { const j = await r.json(); if (!live) return; if (r.ok) setQ(j); else setErr(j.error ?? "Something went wrong."); })
      .catch(() => live && setErr("Connection lost. Try again."));
    return () => { live = false; };
  }, [code, studentId, concept.id, round]);

  function check() {
    if (pick === null || !q) return;
    setChecked(true);
    setScore((s) => ({ right: s.right + (pick === q.correctAnswer ? 1 : 0), total: s.total + 1 }));
  }

  return (
    <div className="paper rise rounded-2xl py-6 pr-6 pl-[4.25rem]">
      <div className="mb-4 flex items-start justify-between gap-4">
        <div>
          <span className="stamp text-amber-700">Practice · not graded</span>
          <h3 className="mt-2 text-2xl font-semibold">{concept.name}</h3>
          {score.total > 0 && <p className="text-sm text-stone-500">{score.right} of {score.total} right this session</p>}
        </div>
        <button className="btn-ghost shrink-0" onClick={onClose}>Done</button>
      </div>

      {err ? (
        <div className="space-y-3">
          <p className="text-sm text-red-700">{err}</p>
          <button className="btn-ghost" onClick={() => setRound((r) => r + 1)}>Try again</button>
        </div>
      ) : !q ? (
        <div className="space-y-3" aria-busy>
          <div className="h-5 w-4/5 animate-pulse rounded bg-stone-200/70" />
          {[0, 1, 2, 3].map((i) => <div key={i} className="h-12 animate-pulse rounded-xl bg-stone-200/50" />)}
          <p className="serif text-sm text-stone-500 italic">Writing a fresh question for you…</p>
        </div>
      ) : (
        <div className="space-y-4">
          <p className="serif text-xl leading-snug">{q.question}</p>
          <div className="space-y-2" role="radiogroup">
            {q.options.map((o, i) => {
              const right = checked && i === q.correctAnswer, wrong = checked && i === pick && i !== q.correctAnswer;
              return (
                <button key={i} role="radio" aria-checked={pick === i} disabled={checked} onClick={() => setPick(i)}
                  className={`option flex w-full items-center gap-3 rounded-xl border bg-white/80 p-3 text-left text-sm ${right ? "border-green-600 bg-green-50" : wrong ? "border-red-400 bg-red-50" : pick === i ? "border-[var(--green)]" : "border-stone-300"}`}>
                  <span className="serif flex h-7 w-7 shrink-0 items-center justify-center rounded-full border border-stone-300 font-semibold">{"ABCD"[i]}</span>
                  <span className="flex-1">{o}</span>
                  {right && <span className="pop text-green-700">✓</span>}
                  {wrong && <span className="pop text-red-600">✗</span>}
                </button>
              );
            })}
          </div>
          {checked ? (
            <div className="rise space-y-3">
              <p className={`text-sm ${pick === q.correctAnswer ? "text-green-800" : "text-red-800"}`}>
                <strong>{pick === q.correctAnswer ? "Nice." : "Not quite."}</strong> {q.explanation}
              </p>
              <button className="btn" onClick={() => setRound((r) => r + 1)}>Another question</button>
            </div>
          ) : (
            <button className="btn" disabled={pick === null} onClick={check}>Check answer</button>
          )}
          <p className="text-xs text-stone-400">AI-written practice. It doesn&apos;t count toward your results.</p>
        </div>
      )}
    </div>
  );
}
