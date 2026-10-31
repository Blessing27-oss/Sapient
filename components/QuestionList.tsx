"use client";
import { useState } from "react";
import { blankQuestion, questionProblems } from "@/lib/questions";
import { PALETTE } from "@/lib/ui";
import type { Concept, Question } from "@/lib/types";

export default function QuestionList({ questions, concepts, onChange }: { questions: Question[]; concepts: Concept[]; onChange: (q: Question[]) => void }) {
  const [open, setOpen] = useState<Set<string>>(new Set());
  const conceptIds = concepts.map((c) => c.id);
  const set = (id: string, p: Partial<Question>) => onChange(questions.map((q) => (q.id === id ? { ...q, ...p } : q)));
  const toggleOpen = (id: string) => setOpen((o) => { const n = new Set(o); n.has(id) ? n.delete(id) : n.add(id); return n; });
  const valid = (q: Question) => questionProblems(q, conceptIds).length === 0;
  const approvedCount = questions.filter((q) => q.approved && valid(q)).length;

  function add() {
    const q = blankQuestion();
    onChange([...questions, q]);
    setOpen((o) => new Set(o).add(q.id));
    setTimeout(() => document.getElementById(`card-${q.id}`)?.scrollIntoView({ behavior: "smooth", block: "center" }), 50);
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-stone-600">
          <b className="text-stone-900">{approvedCount}</b> of {questions.length} ready for students. Only approved questions are used.
        </p>
        <div className="flex gap-2">
          <button className="btn-ghost" onClick={() => onChange(questions.map((q) => (valid(q) ? { ...q, approved: true } : q)))}>Approve all complete</button>
          <button className="btn !py-1.5" onClick={add}>+ Add your own question</button>
        </div>
      </div>

      {questions.length === 0 && (
        <div className="rounded-2xl border border-dashed border-stone-300 bg-white p-10 text-center text-stone-500">
          <p className="font-semibold text-stone-700">No questions yet</p>
          <p className="mb-4 text-sm">Write your own, or publish without any and add them later.</p>
          <button className="btn" onClick={add}>+ Add your own question</button>
        </div>
      )}

      {questions.map((q, n) => {
        const problems = questionProblems(q, conceptIds);
        const isOpen = open.has(q.id);
        const ready = q.approved && problems.length === 0;
        return (
          <div id={`card-${q.id}`} key={q.id} className={`overflow-hidden rounded-2xl border bg-white shadow-sm ${ready ? "border-green-300" : "border-stone-200"}`}>
            <div className="flex items-start gap-3 p-4">
              <span className={`mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-sm font-bold ${ready ? "bg-[#00693e] text-white" : "bg-stone-100 text-stone-600"}`}>{ready ? "✓" : n + 1}</span>
              <button className="min-w-0 flex-1 text-left" onClick={() => toggleOpen(q.id)}>
                <p className={`font-semibold leading-snug ${isOpen ? "" : "line-clamp-2"} ${q.text.trim() ? "" : "text-stone-400"}`}>{q.text.trim() || "New question — click to write it"}</p>
                {!isOpen && (
                  <div className="mt-2 flex flex-wrap items-center gap-1.5">
                    {q.conceptIds.map((id) => concepts.findIndex((c) => c.id === id)).filter((i) => i >= 0).map((i) => (
                      <span key={i} className="rounded-full px-2 py-0.5 text-xs font-medium" style={{ background: PALETTE[i % PALETTE.length].fill, color: PALETTE[i % PALETTE.length].accent }}>{concepts[i].name}</span>
                    ))}
                    {q.sourcePage && <span className="text-xs text-stone-400">p.{q.sourcePage}</span>}
                  </div>
                )}
              </button>
              <div className="flex shrink-0 items-center gap-2">
                <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${ready ? "bg-green-100 text-green-800" : problems.length ? "bg-amber-100 text-amber-800" : "bg-stone-100 text-stone-600"}`}>
                  {ready ? "Approved" : problems.length ? "Needs work" : "Draft"}
                </span>
                <button onClick={() => toggleOpen(q.id)} aria-label={isOpen ? "Collapse" : "Edit"} className="rounded-full p-1.5 text-stone-500 hover:bg-stone-100">{isOpen ? "▴" : "▾"}</button>
              </div>
            </div>

            {isOpen && (
              <div className="space-y-5 border-t border-stone-100 bg-stone-50/60 p-5">
                <label className="block text-sm font-medium">Question
                  <textarea className="input mt-1 bg-white text-base" rows={2} value={q.text} placeholder="What do you want to ask?" onChange={(e) => set(q.id, { text: e.target.value })} />
                </label>

                <div>
                  <p className="mb-2 text-sm font-medium">Answer choices <span className="font-normal text-stone-500">· click a letter to mark the correct one</span></p>
                  <div className="space-y-2">
                    {q.options.map((o, i) => {
                      const correct = q.correctAnswer === i;
                      return (
                        <div key={i} className={`flex items-center gap-3 rounded-xl border bg-white p-2 pr-3 ${correct ? "border-green-400 ring-1 ring-green-200" : "border-stone-200"}`}>
                          <button type="button" onClick={() => set(q.id, { correctAnswer: i })} title="Mark as correct"
                            className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-sm font-bold transition ${correct ? "bg-green-600 text-white" : "bg-stone-100 text-stone-500 hover:bg-green-100"}`}>
                            {correct ? "✓" : "ABCD"[i]}
                          </button>
                          <input className="w-full bg-transparent text-sm outline-none" value={o} placeholder={`Choice ${"ABCD"[i]}`} onChange={(e) => set(q.id, { options: q.options.map((x, j) => (j === i ? e.target.value : x)) })} />
                          {correct && <span className="shrink-0 text-xs font-semibold text-green-700">Correct</span>}
                        </div>
                      );
                    })}
                  </div>
                </div>

                <label className="block text-sm font-medium">Why that answer is right <span className="font-normal text-stone-500">· shown to students afterwards</span>
                  <input className="input mt-1 bg-white" value={q.explanation ?? ""} onChange={(e) => set(q.id, { explanation: e.target.value })} />
                </label>

                <div>
                  <p className="mb-2 text-sm font-medium">Concepts this tests</p>
                  <div className="flex flex-wrap gap-1.5">
                    {concepts.map((c, i) => {
                      const on = q.conceptIds.includes(c.id);
                      const col = PALETTE[i % PALETTE.length];
                      return (
                        <button key={c.id} onClick={() => set(q.id, { conceptIds: on ? q.conceptIds.filter((x) => x !== c.id) : [...q.conceptIds, c.id] })}
                          className="rounded-full border px-3 py-1 text-xs font-medium transition"
                          style={on ? { background: col.accent, borderColor: col.accent, color: "#fff" } : { background: "#fff", borderColor: col.accent + "66", color: col.accent }}>
                          {c.name}
                        </button>
                      );
                    })}
                  </div>
                </div>

                {problems.length > 0 && (
                  <ul role="alert" className="list-disc rounded-lg bg-amber-50 py-2 pl-8 pr-3 text-sm text-amber-800">{problems.map((p) => <li key={p}>{p}</li>)}</ul>
                )}

                <div className="flex items-center justify-between border-t border-stone-200 pt-4">
                  <button className="text-sm text-red-600 hover:underline" onClick={() => onChange(questions.filter((x) => x.id !== q.id))}>Delete question</button>
                  <button
                    disabled={problems.length > 0}
                    onClick={() => set(q.id, { approved: !q.approved })}
                    className={`rounded-lg px-4 py-2 text-sm font-semibold transition disabled:cursor-not-allowed disabled:opacity-40 ${q.approved ? "bg-green-100 text-green-800 hover:bg-green-200" : "bg-[#00693e] text-white hover:bg-[#014d2e]"}`}>
                    {q.approved ? "✓ Approved (click to undo)" : "Approve question"}
                  </button>
                </div>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
