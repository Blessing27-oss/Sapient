"use client";
import { use, useCallback, useEffect, useState } from "react";
import Graph from "@/components/Graph";
import ProfessorGate from "@/components/ProfessorGate";
import QuestionList from "@/components/QuestionList";
import ShareCard from "@/components/ShareCard";
import { isLive } from "@/lib/questions";
import type { Concept, Insight, Label, MapLayout, Question } from "@/lib/types";

type Dash = {
  room: { code: string; title: string; concepts: Concept[]; edges: { source: string; target: string; weight: number }[]; layout?: MapLayout; questions: Question[] };
  answeredQuestionIds: string[];
  students: { id: string; name: string; answered: number; done: boolean; path: { questionId: string; correct: boolean; invalidated: boolean; revised: boolean }[]; concepts: { conceptId: string; label: Label; directCount: number; correctCount: number; inferred: number }[] }[];
  classRows: { conceptId: string; name: string; asked: number; missed: number; flag: boolean }[];
  challengeGroups: { question: Question; reasons: { student: string; reason: string }[] }[];
  insights: Insight[];
};
const GROUPS: { label: Label; title: string; chip: string }[] = [
  { label: "strength", title: "Showed they know", chip: "bg-green-100 text-green-800" },
  { label: "review", title: "Needs review", chip: "bg-red-100 text-red-800" },
  { label: "mixed", title: "Mixed answers", chip: "bg-amber-100 text-amber-800" },
  { label: "tentative-up", title: "Probably fine (inferred)", chip: "bg-sky-50 text-sky-700 ring-1 ring-sky-200" },
  { label: "tentative-down", title: "Might struggle (inferred)", chip: "bg-orange-50 text-orange-700 ring-1 ring-orange-200" },
];

export default function Page({ params }: { params: Promise<{ code: string }> }) {
  return <ProfessorGate><Dashboard code={use(params).code} /></ProfessorGate>;
}

function Dashboard({ code }: { code: string }) {
  const [d, setD] = useState<Dash | null>(null);
  const [editing, setEditing] = useState<Question | null>(null);
  // Local copy of the room's unanswered questions for editing; the 3s refresh must not overwrite unsaved edits.
  const [qDraft, setQDraft] = useState<Question[]>([]);
  const [qDirty, setQDirty] = useState(false);
  const [qSaved, setQSaved] = useState(false);
  useEffect(() => { if (d && !qDirty) setQDraft(d.room.questions.filter((q) => !d.answeredQuestionIds.includes(q.id))); }, [d, qDirty]);

  const [error, setError] = useState("");
  const [revisionMode, setRevisionMode] = useState<"regrade" | "reset">("regrade");
  const load = useCallback(async () => {
    try {
      const response = await fetch(`/api/rooms/${code}/dashboard`, { cache: "no-store" });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? "Could not load dashboard.");
      setD(data);
    } catch (err) { setError(err instanceof Error ? err.message : "Could not load dashboard."); }
  }, [code]);
  useEffect(() => { load(); const t = setInterval(load, 3000); return () => clearInterval(t); }, [load]);

  const post = async (path: string, body: unknown) => {
    setError("");
    try {
      const response = await fetch(`/api/rooms/${code}/${path}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? "Could not save changes.");
      await load();
      return true;
    } catch (err) { setError(err instanceof Error ? err.message : "Could not save changes."); return false; }
  };
  if (!d) return <p>{error || "Loading…"}</p>;
  const qText = (id: string) => d.room.questions.find((q) => q.id === id)?.text ?? id;
  const insight = (id: string) => d.insights.find((i) => i.conceptId === id);

  return (
    <div className="space-y-8">
      {error && <p role="alert" className="text-red-700">{error}</p>}
      <div>
        <h1 className="text-3xl font-bold">{d.room.title}</h1>
        <p className="text-stone-500">{d.students.length} student{d.students.length === 1 ? "" : "s"} joined · updates live</p>
      </div>
      <ShareCard code={d.room.code} />

      {d.room.questions.filter(isLive).length === 0 && (
        <div role="alert" className="rounded-2xl border border-amber-300 bg-amber-50 p-4 text-sm text-amber-900">
          <b>No questions are live.</b> Students who join will see nothing to answer. Approve or add questions in the Questions section below.
        </div>
      )}

      <section className="space-y-2">
        <h2 className="text-xl font-bold">Class concept map</h2>
        <Graph
          nodes={d.classRows.map((r) => ({ id: r.conceptId, name: (d.room.concepts.find((c) => c.id === r.conceptId)?.foundational ? "★ " : "") + r.name, fill: r.asked === 0 ? "#f5f5f4" : r.flag ? "#fca5a5" : r.missed > 0 ? "#fde68a" : "#86efac", accent: r.asked === 0 ? "#a8a29e" : r.flag ? "#dc2626" : r.missed > 0 ? "#d97706" : "#16a34a" }))}
          edges={d.room.edges}
          layout={d.room.layout}
        />
        <p className="text-xs text-stone-500">Red: at least half of students who directly answered missed it · Amber: some missed · Green: none missed · Grey: no direct answers yet.</p>
      </section>

      <section className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-xl font-bold">Questions <span className="text-base font-normal text-stone-500">· {d.room.questions.filter(isLive).length} live</span></h2>
          {qDirty && <button className="btn" onClick={async () => {
            const r = await fetch(`/api/rooms/${code}/questions`, { method: "POST", body: JSON.stringify({ questions: qDraft }) });
            if (r.ok) { setQDirty(false); setQSaved(true); setTimeout(() => setQSaved(false), 2000); load(); } else setError("Could not save the questions.");
          }}>Save question changes</button>}
          {!qDirty && qSaved && <span className="text-sm font-semibold text-green-700">Saved ✓</span>}
        </div>
        {d.answeredQuestionIds.length > 0 && <p className="text-xs text-stone-500">{d.answeredQuestionIds.length} question{d.answeredQuestionIds.length === 1 ? " has" : "s have"} already been answered and can’t be edited here. Use the challenge tools for those.</p>}
        <QuestionList questions={qDraft} concepts={d.room.concepts} onChange={(q) => { setQDraft(q); setQDirty(true); }} />
      </section>

      {d.challengeGroups.length > 0 && (
        <section className="space-y-3">
          <h2 className="text-xl font-bold">Challenged questions</h2>
          {d.challengeGroups.map((g) => (
            <div key={g.question.id} className="card space-y-2 border-amber-400">
              <p className="font-medium">{g.reasons.length} student{g.reasons.length > 1 ? "s" : ""} challenged: “{g.question.text}” — review recommended.</p>
              <ul className="list-disc pl-5 text-sm text-slate-600">{g.reasons.map((r, i) => <li key={i}><b>{r.student}:</b> {r.reason}</li>)}</ul>
              <div className="flex gap-2">
                <button className="btn-ghost" onClick={() => setEditing(g.question)}>Revise question</button>
                <button className="btn-ghost" onClick={() => post("resolve", { questionId: g.question.id, action: "invalidate" })}>Invalidate for everyone</button>
                <button className="btn-ghost" onClick={() => post("resolve", { questionId: g.question.id, action: "dismiss" })}>Dismiss</button>
              </div>
            </div>
          ))}
        </section>
      )}

      {editing && (
        <div className="card space-y-2 border-indigo-400">
          <h3 className="font-semibold">Revise question</h3>
          <label className="block text-sm">Existing answers
            <select className="input" value={revisionMode} onChange={(e) => setRevisionMode(e.target.value as "regrade" | "reset")}>
              <option value="regrade">Keep choices and re-grade</option>
              <option value="reset">Clear answers so students can answer again</option>
            </select>
          </label>
          <p className="text-xs text-stone-500">{revisionMode === "regrade" ? "Use for answer-key corrections. Keep each option in its original position; saved choices are re-graded everywhere." : "Use when changing the meaning of a question or its options. Students will answer it again."}</p>
          <textarea className="input" value={editing.text} onChange={(e) => setEditing({ ...editing, text: e.target.value })} />
          {editing.options.map((o, i) => (
            <div key={i} className="flex gap-2">
              <input type="radio" checked={editing.correctAnswer === i} onChange={() => setEditing({ ...editing, correctAnswer: i })} />
              <input className="input" value={o} onChange={(e) => setEditing({ ...editing, options: editing.options.map((x, j) => (j === i ? e.target.value : x)) })} />
            </div>
          ))}
          <div className="flex gap-2">
            <button className="btn" onClick={async () => { if (await post("resolve", { questionId: editing.id, action: "revise", patch: editing, mode: revisionMode })) setEditing(null); }}>Save revision</button>
            <button className="btn-ghost" onClick={() => setEditing(null)}>Cancel</button>
          </div>
        </div>
      )}

      <section className="space-y-3">
        <h2 className="text-xl font-bold">Questions</h2>
        {d.room.questions.map((q, i) => <div key={q.id} className="card flex items-center justify-between gap-3 text-sm">
          <span className={q.invalidated ? "text-stone-400 line-through" : ""}>Q{i + 1}: {q.text}{q.sourcePage ? ` · p.${q.sourcePage}` : ""}{q.invalidated ? " (invalidated)" : ""}</span>
          <button className="btn-ghost" onClick={() => setEditing(q)}>Revise</button>
        </div>)}
      </section>

      <section className="space-y-3">
        <h2 className="text-xl font-bold">Class diagnostic</h2>
        <p className="text-sm text-slate-500">Counts include only students who directly answered a question on the concept. Inferences are excluded.</p>
        <div className="space-y-2">
          {d.classRows.map((r) => (
            <div key={r.conceptId} className={`card ${r.flag ? "border-red-300" : ""}`}>
              <div className="flex items-center justify-between">
                <span className="font-medium">{r.name}</span>
                <span className="text-sm">{r.asked === 0 ? "Insufficient evidence" : `${r.missed}/${r.asked} students missed a direct question`}</span>
              </div>
              {r.flag && (
                <div className="mt-2 border-t pt-2 text-sm">
                  <p>Consider revisiting <b>{r.name}</b>: {r.missed} of {r.asked} students who answered a relevant question missed it.</p>
                  <div className="mt-1 flex items-center gap-2">
                    <button className={`btn-ghost ${insight(r.conceptId)?.status === "useful" ? "bg-green-100" : ""}`} onClick={() => post("insight", { conceptId: r.conceptId, status: "useful" })}>Useful</button>
                    <button className={`btn-ghost ${insight(r.conceptId)?.status === "dismissed" ? "bg-slate-200" : ""}`} onClick={() => post("insight", { conceptId: r.conceptId, status: "dismissed" })}>Dismiss</button>
                    <input className="input max-w-xs" placeholder="Teaching note" defaultValue={insight(r.conceptId)?.note ?? ""}
                      onBlur={(e) => post("insight", { conceptId: r.conceptId, status: insight(r.conceptId)?.status ?? "open", note: e.target.value })} />
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      </section>

      <section className="space-y-3">
        <div className="flex items-end justify-between">
          <h2 className="text-xl font-bold">Students</h2>
          <p className="text-xs text-stone-500">Based only on the questions each student was asked. “Inferred” is a hint from related answers, not something they answered.</p>
        </div>
        {d.students.length === 0 && (
          <div className="rounded-xl border border-dashed border-stone-300 bg-white p-8 text-center text-stone-500">
            <p className="font-semibold text-stone-700">Waiting for students to join</p>
            <p className="text-sm">Share the code above. Results appear here live as students answer.</p>
          </div>
        )}
        <div className="grid gap-4 md:grid-cols-2">
          {d.students.map((s) => {
            const name = (id: string) => d.room.concepts.find((c) => c.id === id)?.name ?? id;
            const unknown = s.concepts.filter((c) => c.label === "unknown").length;
            return (
              <div key={s.id} className="card space-y-4">
                <div className="flex items-center justify-between gap-3">
                  <div className="flex items-center gap-3">
                    <span className="flex h-9 w-9 items-center justify-center rounded-full bg-stone-100 font-bold text-stone-600">{s.name.charAt(0).toUpperCase()}</span>
                    <p className="font-semibold">{s.name}</p>
                  </div>
                  <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${s.done ? "bg-green-100 text-green-800" : "bg-stone-100 text-stone-600"}`}>{s.done ? "Finished" : `${s.answered} of 3 answered`}</span>
                </div>

                {s.path.length > 0 && (
                  <div className="flex flex-wrap gap-1.5">
                    {s.path.map((p, i) => (
                      <span key={p.questionId} title={`${qText(p.questionId)}${p.invalidated ? " (withdrawn, not counted)" : p.revised ? " (revised)" : ""}`}
                        className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-semibold ${p.invalidated ? "bg-stone-100 text-stone-400 line-through" : p.correct ? "bg-green-100 text-green-800" : "bg-red-100 text-red-800"}`}>
                        Answer {i + 1} {p.invalidated ? "" : p.correct ? "✓" : "✗"}
                      </span>
                    ))}
                  </div>
                )}

                {GROUPS.map((g) => {
                  const items = s.concepts.filter((c) => c.label === g.label);
                  if (!items.length) return null;
                  return (
                    <div key={g.label}>
                      <p className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-stone-500">{g.title}</p>
                      <div className="flex flex-wrap gap-1.5">
                        {items.map((c) => (
                          <span key={c.conceptId} title={c.directCount > 0 ? `${c.correctCount} of ${c.directCount} answered correctly` : `Inferred only (${c.inferred.toFixed(2)})`} className={`rounded-full px-2.5 py-1 text-xs font-medium ${g.chip}`}>{name(c.conceptId)}</span>
                        ))}
                      </div>
                    </div>
                  );
                })}
                {unknown > 0 && <p className="text-xs text-stone-400">{unknown} concept{unknown === 1 ? "" : "s"} not assessed yet</p>}
              </div>
            );
          })}
        </div>
      </section>
    </div>
  );
}
