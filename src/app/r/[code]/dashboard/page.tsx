"use client";

import { use, useCallback, useEffect, useState } from "react";
import { Button, Card, ErrorNote, Header, LABEL_STYLES, LabelBadge } from "@backend/components/ui";
import type { ConceptSummary } from "@backend/lib/engine";
import type { Challenge, Concept, DiagnosticLabel, Question } from "@backend/lib/types";

type Dashboard = {
  code: string;
  title: string;
  budget: number;
  concepts: Concept[];
  questions: Question[];
  challenges: (Challenge & { studentName: string })[];
  summary: {
    concepts: ConceptSummary[];
    questions: { id: string; text: string; status: Question["status"]; conceptIds: string[]; answered: number; incorrect: number; openChallenges: number }[];
    priorities: { conceptId: string; message: string; neighbors: string[] }[];
    students: {
      id: string;
      name: string;
      done: boolean;
      path: { questionId: string; correct: boolean; invalidated: boolean }[];
      diagnostics: { conceptId: string; label: DiagnosticLabel }[];
    }[];
  };
};

const SHORT: Record<DiagnosticLabel, string> = {
  "Demonstrated strength": "✓",
  "Needs review": "✗",
  "Mixed evidence": "±",
  "Tentative inference": "~",
  Unknown: "",
};

export default function DashboardPage({ params }: { params: Promise<{ code: string }> }) {
  const { code } = use(params);
  const [data, setData] = useState<Dashboard | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState<string | null>(null);
  const [origin, setOrigin] = useState("");

  const load = useCallback(async () => {
    const res = await fetch(`/api/rooms/${code}/dashboard`, { cache: "no-store" });
    if (res.ok) setData(await res.json());
    else setError((await res.json()).error);
  }, [code]);

  useEffect(() => {
    setOrigin(window.location.origin);
    load();
    const t = setInterval(load, 2000);
    return () => clearInterval(t);
  }, [load]);

  async function moderate(body: object) {
    setError(null);
    const res = await fetch(`/api/rooms/${code}/moderate`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    if (!res.ok) setError((await res.json()).error);
    await load();
  }

  if (!data) return <main className="p-8">{error ? <ErrorNote message={error} /> : "Loading…"}</main>;

  const qNum = new Map(data.questions.map((q, i) => [q.id, i + 1]));
  const conceptName = (id: string) => data.concepts.find((c) => c.id === id)?.name ?? id;
  const openChallenges = data.challenges.filter((c) => c.status === "open");
  const s = data.summary;
  const finished = s.students.filter((x) => x.done).length;

  return (
    <>
      <Header subtitle={`${data.title} · Professor dashboard`} />
      <main className="mx-auto max-w-6xl space-y-6 px-4 py-8">
        <div className="grid gap-4 md:grid-cols-[1fr_2fr]">
          <Card className="text-center">
            <p className="text-xs uppercase tracking-wide text-slate-500">Room code</p>
            <p className="font-mono text-5xl font-bold tracking-[0.3em] text-indigo-700">{data.code}</p>
            <p className="mt-2 break-all text-xs text-slate-500">
              {origin}/join?code={data.code}
            </p>
            <p className="mt-3 text-sm">
              <b>{s.students.length}</b> joined · <b>{finished}</b> finished {data.budget} questions
            </p>
          </Card>

          <Card>
            <h2 className="font-semibold">Potential review priorities</h2>
            <p className="text-xs text-slate-500">From direct responses only. You decide whether and how to act.</p>
            {s.priorities.length === 0 ? (
              <p className="mt-3 text-sm text-slate-500">No incorrect responses yet.</p>
            ) : (
              <ul className="mt-3 space-y-2">
                {s.priorities.map((p) => (
                  <li key={p.conceptId} className="rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-900">
                    {p.message}
                    {p.neighbors.length > 0 && <span className="block text-xs text-rose-700">Consider revisiting how it connects to {p.neighbors.join(", ")}.</span>}
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </div>

        <ErrorNote message={error} />

        {openChallenges.length > 0 && (
          <Card className="border-amber-300 bg-amber-50/50">
            <h2 className="font-semibold text-amber-900">Student challenges ({openChallenges.length})</h2>
            <div className="mt-3 space-y-3">
              {openChallenges.map((c) => (
                <div key={c.id} className="rounded-lg border border-amber-200 bg-white p-3">
                  <p className="text-xs text-slate-500">
                    {c.studentName} on Q{qNum.get(c.questionId)}: “{data.questions.find((q) => q.id === c.questionId)?.text}”
                  </p>
                  <p className="mt-1 text-sm">“{c.reason}”</p>
                  <div className="mt-2 flex gap-2">
                    <Button variant="secondary" onClick={() => moderate({ action: "dismiss", challengeId: c.id })}>
                      Dismiss
                    </Button>
                    <Button variant="secondary" onClick={() => setEditing(c.questionId)}>
                      Revise question
                    </Button>
                    <Button variant="danger" onClick={() => moderate({ action: "invalidate", questionId: c.questionId })}>
                      Invalidate question
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          </Card>
        )}

        {editing && (
          <ReviseEditor
            question={data.questions.find((q) => q.id === editing)!}
            concepts={data.concepts}
            onCancel={() => setEditing(null)}
            onSave={async (patch) => {
              await moderate({ action: "revise", questionId: editing, patch });
              setEditing(null);
            }}
          />
        )}

        <Card>
          <h2 className="font-semibold">Concepts across the class</h2>
          <p className="text-xs text-slate-500">
            Bars show every joined student. Only red and green come from direct answers; dashed blue is tentative inference from related concepts; grey is unknown.
          </p>
          <div className="mt-4 space-y-2">
            {s.concepts.map((c) => (
              <div key={c.conceptId} className="grid grid-cols-[minmax(0,14rem)_1fr_8rem] items-center gap-3 text-sm">
                <span className="truncate" title={c.name}>
                  {c.name}
                  {c.foundational && <span className="ml-1 text-xs text-indigo-600">★</span>}
                </span>
                <StackBar c={c} total={s.students.length} />
                <span className="text-right text-xs text-slate-600">
                  {c.assessedStudents ? (
                    <>
                      <b className="text-rose-700">{c.missedStudents}</b> of {c.assessedStudents} missed
                    </>
                  ) : (
                    <span className="text-slate-400">not yet assessed</span>
                  )}
                </span>
              </div>
            ))}
          </div>
        </Card>

        <Card>
          <h2 className="font-semibold">Students</h2>
          <p className="text-xs text-slate-500">Each student&apos;s adaptive path and per-concept evidence. Paths diverge based on earlier answers.</p>
          {s.students.length === 0 ? (
            <p className="mt-3 text-sm text-slate-500">Waiting for students to join…</p>
          ) : (
            <div className="mt-3 overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-xs text-slate-500">
                    <th className="py-1 pr-3">Student</th>
                    <th className="py-1 pr-3">Path</th>
                    {data.concepts.map((c) => (
                      <th key={c.id} className="px-0.5 py-1 align-bottom">
                        <span className="block max-w-[4.5rem] truncate text-[10px] font-normal" title={c.name}>
                          {c.name}
                        </span>
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {s.students.map((st) => (
                    <tr key={st.id} className="border-t border-slate-100">
                      <td className="py-2 pr-3 font-medium whitespace-nowrap">
                        {st.name}
                        {!st.done && <span className="ml-1 text-xs text-slate-400">(in progress)</span>}
                      </td>
                      <td className="py-2 pr-3 whitespace-nowrap">
                        {st.path.map((p) => (
                          <span
                            key={p.questionId}
                            className={`mr-1 inline-block rounded px-1.5 text-xs font-medium ${
                              p.invalidated ? "bg-slate-100 text-slate-400 line-through" : p.correct ? "bg-emerald-100 text-emerald-800" : "bg-rose-100 text-rose-800"
                            }`}
                          >
                            Q{qNum.get(p.questionId)}
                            {p.invalidated ? "" : p.correct ? " ✓" : " ✗"}
                          </span>
                        ))}
                      </td>
                      {st.diagnostics.map((d) => (
                        <td key={d.conceptId} className="px-0.5 py-1">
                          <div title={`${conceptName(d.conceptId)}: ${d.label}`} className={`h-6 rounded border text-center text-xs leading-6 ${LABEL_STYLES[d.label]}`}>
                            {SHORT[d.label]}
                          </div>
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
              <div className="mt-3 flex flex-wrap gap-2">
                {(Object.keys(SHORT) as DiagnosticLabel[]).map((l) => (
                  <LabelBadge key={l} label={l} />
                ))}
              </div>
            </div>
          )}
        </Card>

        <Card>
          <h2 className="font-semibold">Questions</h2>
          <table className="mt-3 w-full text-sm">
            <thead>
              <tr className="text-left text-xs text-slate-500">
                <th className="py-1">#</th>
                <th className="py-1">Question</th>
                <th className="py-1">Concepts</th>
                <th className="py-1 text-right">Incorrect / answered</th>
                <th className="py-1"></th>
              </tr>
            </thead>
            <tbody>
              {s.questions.map((q) => (
                <tr key={q.id} className={`border-t border-slate-100 ${q.status === "invalidated" ? "opacity-50" : ""}`}>
                  <td className="py-2 pr-2 text-slate-400">Q{qNum.get(q.id)}</td>
                  <td className="py-2 pr-2">
                    {q.status === "invalidated" && <span className="mr-1 rounded bg-slate-200 px-1 text-xs">invalidated</span>}
                    {q.text}
                    {q.openChallenges > 0 && <span className="ml-1 rounded bg-amber-100 px-1 text-xs text-amber-800">{q.openChallenges} challenge(s)</span>}
                  </td>
                  <td className="py-2 pr-2 text-xs text-slate-500">{q.conceptIds.map(conceptName).join(", ")}</td>
                  <td className="py-2 pr-2 text-right whitespace-nowrap">
                    {q.answered ? `${q.incorrect} / ${q.answered}` : <span className="text-slate-400">—</span>}
                  </td>
                  <td className="py-2 text-right whitespace-nowrap">
                    <button onClick={() => setEditing(q.id)} className="mr-2 text-xs text-indigo-700 hover:underline">
                      Revise
                    </button>
                    {q.status === "active" ? (
                      <button onClick={() => moderate({ action: "invalidate", questionId: q.id })} className="text-xs text-rose-700 hover:underline">
                        Invalidate
                      </button>
                    ) : (
                      <button onClick={() => moderate({ action: "restore", questionId: q.id })} className="text-xs text-slate-700 hover:underline">
                        Restore
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      </main>
    </>
  );
}

function StackBar({ c, total }: { c: ConceptSummary; total: number }) {
  if (total === 0) return <div className="h-4 rounded bg-slate-100" />;
  const seg = (n: number, cls: string, label: string) =>
    n > 0 && <div key={label} className={`h-full ${cls}`} style={{ width: `${(n / total) * 100}%` }} title={`${n} ${label}`} />;
  return (
    <div className="flex h-4 overflow-hidden rounded bg-slate-100">
      {seg(c.missedStudents, "bg-rose-400", "missed (direct)")}
      {seg(c.strengthStudents, "bg-emerald-400", "correct (direct)")}
      {seg(c.tentativeStudents, "bg-sky-100 border border-dashed border-sky-400", "tentative inference")}
      {seg(c.unknownStudents, "bg-slate-100", "unknown")}
    </div>
  );
}

function ReviseEditor({
  question,
  concepts,
  onCancel,
  onSave,
}: {
  question: Question;
  concepts: Concept[];
  onCancel: () => void;
  onSave: (patch: Partial<Question>) => void;
}) {
  const [q, setQ] = useState(question);
  return (
    <Card className="border-indigo-300">
      <h2 className="font-semibold">Revise question</h2>
      <p className="text-xs text-slate-500">Saving re-grades every student&apos;s stored answer against the new key and recomputes all diagnostics.</p>
      <textarea value={q.text} onChange={(e) => setQ({ ...q, text: e.target.value })} rows={2} className="mt-3 w-full rounded border border-slate-300 p-2 text-sm" />
      <div className="mt-2 grid gap-2 sm:grid-cols-2">
        {q.options.map((opt, i) => (
          <label key={i} className={`flex items-center gap-2 rounded border px-2 py-1 text-sm ${q.correctAnswer === i ? "border-emerald-400 bg-emerald-50" : "border-slate-200"}`}>
            <input type="radio" checked={q.correctAnswer === i} onChange={() => setQ({ ...q, correctAnswer: i })} />
            <input value={opt} onChange={(e) => setQ({ ...q, options: q.options.map((o, j) => (j === i ? e.target.value : o)) })} className="flex-1 outline-none" />
          </label>
        ))}
      </div>
      <div className="mt-2 flex flex-wrap gap-1">
        {concepts.map((c) => {
          const on = q.conceptIds.includes(c.id);
          return (
            <button
              key={c.id}
              onClick={() => setQ({ ...q, conceptIds: on ? q.conceptIds.filter((x) => x !== c.id) : [...q.conceptIds, c.id] })}
              className={`rounded-full border px-2 py-0.5 text-xs ${on ? "border-indigo-400 bg-indigo-100 text-indigo-800" : "border-slate-200 text-slate-500"}`}
            >
              {c.name}
            </button>
          );
        })}
      </div>
      <input value={q.explanation} onChange={(e) => setQ({ ...q, explanation: e.target.value })} className="mt-2 w-full rounded border border-slate-300 px-2 py-1 text-xs" />
      <div className="mt-3 flex gap-2">
        <Button onClick={() => onSave({ text: q.text, options: q.options, correctAnswer: q.correctAnswer, conceptIds: q.conceptIds, explanation: q.explanation })} disabled={q.conceptIds.length === 0}>
          Save revision
        </Button>
        <Button variant="ghost" onClick={onCancel}>
          Cancel
        </Button>
      </div>
    </Card>
  );
}
