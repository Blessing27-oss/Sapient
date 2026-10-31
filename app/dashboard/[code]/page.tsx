"use client";
import { use, useCallback, useEffect, useState } from "react";
import ProfessorGate from "@/components/ProfessorGate";
import ShareCard from "@/components/ShareCard";
import TopicMapView from "@/components/TopicMapView";
import { LABEL_TEXT } from "@/lib/engine";
import { fallbackTopicMap } from "@/lib/topicMap";
import type { Concept, Edge, Insight, Label, Question, TopicMap } from "@/lib/types";

type Dash = {
  room: { code: string; title: string; concepts: Concept[]; edges: Edge[]; topicMap?: TopicMap; questions: Question[] };
  students: { id: string; name: string; answered: number; done: boolean; path: { questionId: string; correct: boolean; invalidated: boolean; revised: boolean }[]; concepts: { conceptId: string; label: Label; directCount: number; correctCount: number; inferred: number }[] }[];
  classRows: { conceptId: string; name: string; asked: number; missed: number; flag: boolean }[];
  challengeGroups: { question: Question; reasons: { student: string; reason: string }[] }[];
  insights: Insight[];
};
const DOT: Record<Label, string> = {
  strength: "bg-green-500", review: "bg-red-500", mixed: "bg-amber-500",
  "tentative-up": "bg-sky-200", "tentative-down": "bg-orange-200", unknown: "bg-slate-200",
};

export default function Page({ params }: { params: Promise<{ code: string }> }) {
  return <ProfessorGate><Dashboard code={use(params).code} /></ProfessorGate>;
}

function Dashboard({ code }: { code: string }) {
  const [d, setD] = useState<Dash | null>(null);
  const [editing, setEditing] = useState<Question | null>(null);

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

      <section className="space-y-2">
        <h2 className="text-xl font-bold">Class concept map</h2>
        <TopicMapView
          title={d.room.title}
          map={d.room.topicMap ?? fallbackTopicMap(d.room.concepts, d.room.edges as Edge[])}
          styleFor={(n) => {
            const r = d.classRows.find((x) => x.conceptId === n.conceptId);
            if (!r) return { fill: "#fafaf9", stroke: "#d6d3d1" };
            return { fill: r.asked === 0 ? "#f5f5f4" : r.flag ? "#fca5a5" : r.missed > 0 ? "#fde68a" : "#86efac", stroke: "#78716c" };
          }}
        />
        <p className="text-xs text-stone-500">Assessed concepts are coloured from direct answers only. Red: at least half of students who directly answered missed it · Amber: some missed · Green: none missed · Grey: no direct answers yet · Pale with light border: lecture context, not assessed.</p>
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
        <h2 className="text-xl font-bold">Students</h2>
        <div className="flex flex-wrap gap-3 text-xs">
          {(Object.keys(DOT) as Label[]).map((l) => <span key={l} className="flex items-center gap-1"><i className={`inline-block h-3 w-3 rounded-full ${DOT[l]}`} />{LABEL_TEXT[l]}</span>)}
        </div>
        <p className="text-xs text-stone-500">Cells show correct / direct answers. Dashed ~ cells are inferred only; — means unknown. Crossed-out path entries are invalidated and excluded from the question budget.</p>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead><tr><th className="p-1">Student</th><th className="p-1">Path</th>{d.room.concepts.map((c) => <th key={c.id} className="p-1 text-xs font-normal [writing-mode:vertical-rl]">{c.name}</th>)}</tr></thead>
            <tbody>
              {d.students.map((s) => (
                <tr key={s.id} className="border-t">
                  <td className="p-1 whitespace-nowrap">{s.name}<span className="ml-1 text-xs text-stone-400">{s.done ? "(complete)" : `(${s.answered}/3)`}</span></td>
                  <td className="p-1 text-xs">{s.path.map((p) => <span key={p.questionId} title={`${qText(p.questionId)}${p.invalidated ? " (invalidated, excluded)" : p.revised ? " (revised)" : ""}`} className={`mr-1 inline-block rounded px-1.5 py-0.5 ${p.invalidated ? "bg-stone-100 text-stone-400 line-through" : p.correct ? "bg-green-100 text-green-800" : "bg-red-100 text-red-800"}`}>Q{d.room.questions.findIndex((q) => q.id === p.questionId) + 1}{p.invalidated ? "" : p.correct ? " ✓" : " ✗"} </span>)}</td>
                  {s.concepts.map((c) => <td key={c.conceptId} className="p-1"><div title={`${LABEL_TEXT[c.label]} · direct ${c.correctCount}/${c.directCount} · inferred ${c.inferred.toFixed(2)}`} className={`min-w-12 rounded border px-1 py-2 text-center text-xs ${DOT[c.label]} ${c.directCount === 0 && c.label !== "unknown" ? "border-dashed border-stone-500" : "border-transparent"}`}>{c.directCount > 0 ? `${c.correctCount}/${c.directCount}` : c.label === "unknown" ? "—" : "~"}</div></td>)}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
