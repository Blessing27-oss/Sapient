"use client";
import { use, useCallback, useEffect, useState } from "react";
import { LABEL_TEXT } from "@/lib/engine";
import type { Concept, Insight, Label, Question } from "@/lib/types";

type Dash = {
  room: { code: string; title: string; concepts: Concept[]; questions: Question[] };
  students: { id: string; name: string; answered: number; path: { questionId: string; correct: boolean }[]; concepts: { conceptId: string; label: Label }[] }[];
  classRows: { conceptId: string; name: string; asked: number; missed: number; flag: boolean }[];
  challengeGroups: { question: Question; reasons: { student: string; reason: string }[] }[];
  insights: Insight[];
};
const DOT: Record<Label, string> = {
  strength: "bg-green-500", review: "bg-red-500", mixed: "bg-amber-500",
  "tentative-up": "bg-sky-200", "tentative-down": "bg-orange-200", unknown: "bg-slate-200",
};

export default function Dashboard({ params }: { params: Promise<{ code: string }> }) {
  const { code } = use(params);
  const [d, setD] = useState<Dash | null>(null);
  const [editing, setEditing] = useState<Question | null>(null);

  const load = useCallback(async () => setD(await (await fetch(`/api/rooms/${code}/dashboard`)).json()), [code]);
  useEffect(() => { load(); const t = setInterval(load, 3000); return () => clearInterval(t); }, [load]);

  const post = async (path: string, body: unknown) => { await fetch(`/api/rooms/${code}/${path}`, { method: "POST", body: JSON.stringify(body) }); load(); };
  if (!d) return <p>Loading…</p>;
  const qText = (id: string) => d.room.questions.find((q) => q.id === id)?.text ?? id;
  const insight = (id: string) => d.insights.find((i) => i.conceptId === id);

  return (
    <div className="space-y-8">
      <div className="flex items-end justify-between">
        <div>
          <h1 className="text-xl font-semibold">{d.room.title}</h1>
          <p className="text-sm text-slate-500">{d.students.length} students joined</p>
        </div>
        <div className="card text-center">
          <p className="text-xs text-slate-500">Room code</p>
          <p className="text-3xl font-bold tracking-widest">{d.room.code}</p>
        </div>
      </div>

      {d.challengeGroups.length > 0 && (
        <section className="space-y-3">
          <h2 className="text-lg font-semibold">Challenged questions</h2>
          {d.challengeGroups.map((g) => (
            <div key={g.question.id} className="card space-y-2 border-amber-400">
              <p className="font-medium">{g.reasons.length} student{g.reasons.length > 1 ? "s" : ""} challenged: “{g.question.text}” — review recommended.</p>
              <ul className="list-disc pl-5 text-sm text-slate-600">{g.reasons.map((r, i) => <li key={i}><b>{r.student}:</b> {r.reason}</li>)}</ul>
              <div className="flex gap-2">
                <button className="btn-ghost" onClick={() => setEditing(g.question)}>Edit &amp; reset responses</button>
                <button className="btn-ghost" onClick={() => post("resolve", { questionId: g.question.id, action: "invalidate" })}>Invalidate for everyone</button>
                <button className="btn-ghost" onClick={() => post("resolve", { questionId: g.question.id, action: "dismiss" })}>Dismiss</button>
              </div>
            </div>
          ))}
        </section>
      )}

      {editing && (
        <div className="card space-y-2 border-indigo-400">
          <h3 className="font-semibold">Revise question (previous responses to it will be cleared)</h3>
          <textarea className="input" value={editing.text} onChange={(e) => setEditing({ ...editing, text: e.target.value })} />
          {editing.options.map((o, i) => (
            <div key={i} className="flex gap-2">
              <input type="radio" checked={editing.correctAnswer === i} onChange={() => setEditing({ ...editing, correctAnswer: i })} />
              <input className="input" value={o} onChange={(e) => setEditing({ ...editing, options: editing.options.map((x, j) => (j === i ? e.target.value : x)) })} />
            </div>
          ))}
          <div className="flex gap-2">
            <button className="btn" onClick={() => { post("resolve", { questionId: editing.id, action: "revise", patch: editing }); setEditing(null); }}>Save revision</button>
            <button className="btn-ghost" onClick={() => setEditing(null)}>Cancel</button>
          </div>
        </div>
      )}

      <section className="space-y-3">
        <h2 className="text-lg font-semibold">Class diagnostic</h2>
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
        <h2 className="text-lg font-semibold">Students</h2>
        <div className="flex flex-wrap gap-3 text-xs">
          {(Object.keys(DOT) as Label[]).map((l) => <span key={l} className="flex items-center gap-1"><i className={`inline-block h-3 w-3 rounded-full ${DOT[l]}`} />{LABEL_TEXT[l]}</span>)}
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead><tr><th className="p-1">Student</th><th className="p-1">Path</th>{d.room.concepts.map((c) => <th key={c.id} className="p-1 text-xs font-normal [writing-mode:vertical-rl]">{c.name}</th>)}</tr></thead>
            <tbody>
              {d.students.map((s) => (
                <tr key={s.id} className="border-t">
                  <td className="p-1">{s.name}</td>
                  <td className="p-1 text-xs">{s.path.map((p) => <span key={p.questionId} title={qText(p.questionId)} className={p.correct ? "text-green-700" : "text-red-700"}>{p.questionId.toUpperCase()}{p.correct ? "✓" : "✗"} </span>)}</td>
                  {s.concepts.map((c) => <td key={c.conceptId} className="p-1"><i title={LABEL_TEXT[c.label]} className={`inline-block h-4 w-4 rounded-full ${DOT[c.label]}`} /></td>)}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
