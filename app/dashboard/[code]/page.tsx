"use client";
import { use, useCallback, useEffect, useState } from "react";
import Graph from "@/components/Graph";
import ProfessorGate from "@/components/ProfessorGate";
import QuestionList from "@/components/QuestionList";
import { BarRows, Panel, StatTile, type BarRow } from "@/components/charts";
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
  const [tab, setTab] = useState<"overview" | "students" | "questions">("overview");
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

  const live = d.room.questions.filter(isLive);
  const insight = (id: string) => d.insights.find((i) => i.conceptId === id);
  const short = (t: string, n = 38) => (t.length > n ? t.slice(0, n - 1) + "…" : t);
  const pct = (x: number) => `${Math.round(x * 100)}%`;

  // ---- numbers behind the charts (withdrawn answers never count) ----
  const scored = d.students.map((s) => {
    const valid = s.path.filter((p) => !p.invalidated);
    return { ...s, correct: valid.filter((p) => p.correct).length, total: valid.length };
  });
  const totalCorrect = scored.reduce((t, s) => t + s.correct, 0);
  const totalAnswered = scored.reduce((t, s) => t + s.total, 0);
  const classAvg = totalAnswered ? totalCorrect / totalAnswered : null;
  const finished = d.students.filter((s) => s.done).length;
  const flagged = d.classRows.filter((r) => r.flag);

  const conceptRows: BarRow[] = [...d.classRows]
    .map((r) => ({ r, share: r.asked ? (r.asked - r.missed) / r.asked : null }))
    .sort((a, b) => (a.share === null ? 2 : a.share) - (b.share === null ? 2 : b.share))
    .map(({ r, share }) => ({
      id: r.conceptId, label: r.name, value: share ?? 0, muted: share === null,
      display: share === null ? "not asked" : pct(share),
      detail: share === null ? "No student has answered a question on this yet" : `${r.asked - r.missed} of ${r.asked} students who were asked got it right`,
      color: r.flag ? "#d97706" : "#00693e", tag: r.flag ? "review" : undefined,
    }));

  const studentRows: BarRow[] = [...scored]
    .sort((a, b) => (b.total ? b.correct / b.total : -1) - (a.total ? a.correct / a.total : -1) || a.name.localeCompare(b.name))
    .map((s) => ({
      id: s.id, label: s.name, value: s.total ? s.correct / s.total : 0, muted: s.total === 0,
      display: s.total ? `${s.correct}/${s.total}` : "waiting",
      detail: s.done ? `Finished · ${s.correct} of ${s.total} correct` : `${s.answered} of 3 answered so far`,
      color: s.done ? "#00693e" : "#6aa88a",
    }));

  const questionRows: BarRow[] = live.map((q) => {
    let n = 0, ok = 0;
    for (const s of d.students) for (const p of s.path) if (p.questionId === q.id && !p.invalidated) { n++; ok += p.correct ? 1 : 0; }
    return { q, n, ok };
  }).filter((x) => x.n > 0).sort((a, b) => a.ok / a.n - b.ok / b.n).map(({ q, n, ok }) => ({
    id: q.id, label: short(q.text), value: ok / n, display: pct(ok / n),
    detail: `${ok} of ${n} answered correctly · ${q.text}`, color: ok / n < 0.5 ? "#d97706" : "#00693e", tag: ok / n < 0.5 ? "hard" : undefined,
  }));

  const tabs = [["overview", "Overview"], ["students", `Students (${d.students.length})`], ["questions", `Questions (${live.length})`]] as const;

  return (
    <div className="space-y-6">
      {error && <p role="alert" className="rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700">{error}</p>}

      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="flex items-center gap-2 text-xs font-semibold uppercase tracking-widest text-[#00693e]">
            <span className="relative flex h-2 w-2"><span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-green-500 opacity-60" /><span className="relative inline-flex h-2 w-2 rounded-full bg-green-600" /></span>
            Live dashboard
          </p>
          <h1 className="text-3xl font-bold">{d.room.title}</h1>
        </div>
        {d.students.length > 0 && <ShareCard code={d.room.code} compact />}
      </div>

      {d.students.length === 0 && <ShareCard code={d.room.code} />}

      {live.length === 0 && (
        <div role="alert" className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-amber-300 bg-amber-50 p-4 text-sm text-amber-900">
          <span><b>No questions are live.</b> Students who join will see nothing to answer.</span>
          <button className="btn-ghost" onClick={() => setTab("questions")}>Add or approve questions</button>
        </div>
      )}

      {d.challengeGroups.length > 0 && (
        <div className="space-y-3">
          {d.challengeGroups.map((g) => (
            <div key={g.question.id} className="space-y-2 rounded-2xl border border-amber-400 bg-amber-50/60 p-4">
              <p className="font-medium">⚠ {g.reasons.length} student{g.reasons.length > 1 ? "s" : ""} challenged “{g.question.text}”</p>
              <ul className="list-disc pl-5 text-sm text-stone-600">{g.reasons.map((r, i) => <li key={i}><b>{r.student}:</b> {r.reason}</li>)}</ul>
              <div className="flex flex-wrap gap-2">
                <button className="btn-ghost" onClick={() => { setEditing(g.question); setTab("questions"); }}>Revise question</button>
                <button className="btn-ghost" onClick={() => post("resolve", { questionId: g.question.id, action: "invalidate" })}>Invalidate for everyone</button>
                <button className="btn-ghost" onClick={() => post("resolve", { questionId: g.question.id, action: "dismiss" })}>Dismiss</button>
              </div>
            </div>
          ))}
        </div>
      )}

      <div className="flex gap-1 border-b border-stone-200">
        {tabs.map(([k, label]) => (
          <button key={k} onClick={() => setTab(k)} className={`-mb-px border-b-2 px-4 py-2 text-sm font-semibold ${tab === k ? "border-[#00693e] text-[#00693e]" : "border-transparent text-stone-500 hover:text-stone-700"}`}>{label}</button>
        ))}
      </div>

      {tab === "overview" && (
        <div className="space-y-6">
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <StatTile hero label="Class average" value={classAvg === null ? "—" : pct(classAvg)} sub={totalAnswered ? `${totalCorrect} of ${totalAnswered} answers correct` : "Waiting for the first answers"} />
            <StatTile label="Students joined" value={String(d.students.length)} sub={d.students.length ? `${finished} finished · ${d.students.length - finished} in progress` : "Share the room code"} />
            <StatTile label="Finished the quiz" value={d.students.length ? `${Math.round((finished / d.students.length) * 100)}%` : "—"} sub={`${finished} of ${d.students.length} students`} />
            <StatTile label="Concepts to review" value={String(flagged.length)} tone={flagged.length ? "warn" : undefined} sub={flagged.length ? "At least half the class missed these" : totalAnswered ? "No concept stands out" : "Not enough answers yet"} />
          </div>

          <div className="grid gap-6 lg:grid-cols-2">
            <Panel title="How the class did, by concept" subtitle="Share of students who answered it correctly, among those who were asked. Lowest first.">
              <BarRows label="Correct answers by concept" rows={conceptRows} empty="Appears once students start answering." />
            </Panel>
            <Panel title="Student scores" subtitle="Correct answers out of the questions each student has answered.">
              <BarRows label="Score per student" rows={studentRows} empty="No students yet." />
            </Panel>
          </div>

          <Panel title="Concept map" subtitle="Red: at least half of those asked missed it · amber: some missed · green: nobody missed · grey: not asked yet.">
            <Graph
              nodes={d.classRows.map((r) => ({ id: r.conceptId, name: (d.room.concepts.find((c) => c.id === r.conceptId)?.foundational ? "★ " : "") + r.name, fill: r.asked === 0 ? "#f5f5f4" : r.flag ? "#fca5a5" : r.missed > 0 ? "#fde68a" : "#86efac", accent: r.asked === 0 ? "#a8a29e" : r.flag ? "#dc2626" : r.missed > 0 ? "#d97706" : "#16a34a" }))}
              edges={d.room.edges}
              layout={d.room.layout}
            />
          </Panel>

          <div className="grid gap-6 lg:grid-cols-2">
            <Panel title="Hardest questions" subtitle="Share answered correctly. A very low score can mean the question is unclear.">
              <BarRows label="Correct answers by question" rows={questionRows} empty="Appears once students start answering." />
            </Panel>
            <Panel title="Suggested review" subtitle="Concepts where at least half of the students who were asked got it wrong. You decide what to do.">
              {flagged.length === 0 ? <p className="py-6 text-center text-sm text-stone-400">{totalAnswered ? "Nothing stands out right now." : "Appears once students start answering."}</p> : (
                <div className="space-y-4">
                  {flagged.map((r) => (
                    <div key={r.conceptId} className="space-y-2 border-b border-stone-100 pb-4 last:border-0 last:pb-0">
                      <p className="text-sm"><b>{r.name}</b> — {r.missed} of {r.asked} students missed it. Consider revisiting it.</p>
                      <div className="flex flex-wrap items-center gap-2">
                        <button className={`btn-ghost ${insight(r.conceptId)?.status === "useful" ? "!bg-green-100" : ""}`} onClick={() => post("insight", { conceptId: r.conceptId, status: "useful" })}>Useful</button>
                        <button className={`btn-ghost ${insight(r.conceptId)?.status === "dismissed" ? "!bg-stone-200" : ""}`} onClick={() => post("insight", { conceptId: r.conceptId, status: "dismissed" })}>Dismiss</button>
                        <input className="input max-w-xs" placeholder="Teaching note" defaultValue={insight(r.conceptId)?.note ?? ""}
                          onBlur={(e) => post("insight", { conceptId: r.conceptId, status: insight(r.conceptId)?.status ?? "open", note: e.target.value })} />
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </Panel>
          </div>
        </div>
      )}

      {tab === "students" && (
        <div className="space-y-3">
          <p className="text-xs text-stone-500">Based only on the questions each student was asked. “Inferred” is a hint from related answers, not something they answered.</p>
          {d.students.length === 0 && (
            <div className="rounded-xl border border-dashed border-stone-300 bg-white p-8 text-center text-stone-500">
              <p className="font-semibold text-stone-700">Waiting for students to join</p>
              <p className="text-sm">Share the room code. Results appear here live as students answer.</p>
            </div>
          )}
          <div className="grid gap-4 md:grid-cols-2">
            {scored.map((s) => {
              const name = (id: string) => d.room.concepts.find((c) => c.id === id)?.name ?? id;
              const unknown = s.concepts.filter((c) => c.label === "unknown").length;
              return (
                <div key={s.id} className="card space-y-4">
                  <div className="flex items-center justify-between gap-3">
                    <div className="flex items-center gap-3">
                      <span className="flex h-9 w-9 items-center justify-center rounded-full bg-stone-100 font-bold text-stone-600">{s.name.charAt(0).toUpperCase()}</span>
                      <div><p className="font-semibold leading-tight">{s.name}</p><p className="text-xs text-stone-500">{s.total ? `${s.correct} of ${s.total} correct` : "No answers yet"}</p></div>
                    </div>
                    <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${s.done ? "bg-green-100 text-green-800" : "bg-stone-100 text-stone-600"}`}>{s.done ? "Finished" : `${s.answered} of 3 answered`}</span>
                  </div>
                  {s.path.length > 0 && (
                    <div className="flex flex-wrap gap-1.5">
                      {s.path.map((p, i) => (
                        <span key={p.questionId} title={`${d.room.questions.find((q) => q.id === p.questionId)?.text ?? ""}${p.invalidated ? " (withdrawn, not counted)" : p.revised ? " (revised)" : ""}`}
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
        </div>
      )}

      {tab === "questions" && (
        <div className="space-y-6">
          {editing && (
            <div className="card space-y-3 !border-[#00693e]">
              <h3 className="font-semibold">Revise question</h3>
              <label className="block text-sm">Existing answers
                <select className="input mt-1" value={revisionMode} onChange={(e) => setRevisionMode(e.target.value as "regrade" | "reset")}>
                  <option value="regrade">Keep choices and re-grade</option>
                  <option value="reset">Clear answers so students can answer again</option>
                </select>
              </label>
              <p className="text-xs text-stone-500">{revisionMode === "regrade" ? "Use for answer-key corrections. Keep each option in its original position; saved choices are re-graded everywhere." : "Use when changing the meaning of a question or its options. Students will answer it again."}</p>
              <textarea className="input" value={editing.text} onChange={(e) => setEditing({ ...editing, text: e.target.value })} />
              {editing.options.map((o, i) => (
                <div key={i} className="flex items-center gap-2">
                  <input type="radio" className="accent-[#00693e]" checked={editing.correctAnswer === i} onChange={() => setEditing({ ...editing, correctAnswer: i })} />
                  <input className="input" value={o} onChange={(e) => setEditing({ ...editing, options: editing.options.map((x, j) => (j === i ? e.target.value : x)) })} />
                </div>
              ))}
              <div className="flex gap-2">
                <button className="btn" onClick={async () => { if (await post("resolve", { questionId: editing.id, action: "revise", patch: editing, mode: revisionMode })) setEditing(null); }}>Save revision</button>
                <button className="btn-ghost" onClick={() => setEditing(null)}>Cancel</button>
              </div>
            </div>
          )}

          <div className="space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <h2 className="font-serif text-xl font-bold">Edit questions <span className="font-sans text-sm font-normal text-stone-500">· {live.length} live</span></h2>
              {qDirty && <button className="btn" onClick={async () => {
                const r = await fetch(`/api/rooms/${code}/questions`, { method: "POST", body: JSON.stringify({ questions: qDraft }) });
                if (r.ok) { setQDirty(false); setQSaved(true); setTimeout(() => setQSaved(false), 2000); load(); } else setError("Could not save the questions.");
              }}>Save question changes</button>}
              {!qDirty && qSaved && <span className="text-sm font-semibold text-green-700">Saved ✓</span>}
            </div>
            <QuestionList questions={qDraft} concepts={d.room.concepts} onChange={(q) => { setQDraft(q); setQDirty(true); }} />
          </div>

          {d.answeredQuestionIds.length > 0 && (
            <div className="space-y-3">
              <h2 className="font-serif text-xl font-bold">Already answered</h2>
              <p className="text-xs text-stone-500">Students have answered these, so they’re locked. Use Revise to correct one.</p>
              {d.room.questions.filter((q) => d.answeredQuestionIds.includes(q.id)).map((q) => (
                <div key={q.id} className="card flex items-center justify-between gap-3 text-sm">
                  <span className={q.invalidated ? "text-stone-400 line-through" : ""}>{q.text}{q.sourcePage ? ` · p.${q.sourcePage}` : ""}{q.invalidated ? " (invalidated)" : ""}</span>
                  <button className="btn-ghost shrink-0" onClick={() => setEditing(q)}>Revise</button>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
