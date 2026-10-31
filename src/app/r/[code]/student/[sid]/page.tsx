"use client";

import { use, useCallback, useEffect, useState } from "react";
import { Button, Card, ErrorNote, Header, LabelBadge } from "@backend/components/ui";
import type { DiagnosticLabel, PublicQuestion } from "@backend/lib/types";

type Answered = {
  question: PublicQuestion;
  choice: number;
  correct: boolean;
  correctAnswer: number;
  explanation: string;
  invalidated: boolean;
  revised: boolean;
  challenge: "open" | "dismissed" | "revised" | "invalidated" | null;
};
type StudentState = {
  title: string;
  student: { id: string; name: string };
  budget: number;
  next: PublicQuestion | null;
  answered: Answered[];
  concepts: { id: string; name: string }[];
  diagnostics: { conceptId: string; name: string; label: DiagnosticLabel; directCount: number; directCorrect: number; inferredEvidence: number }[];
};

// Labels backed by a question the student actually answered, kept apart from inferred ones.
const DIRECT_LABELS: DiagnosticLabel[] = ["Needs review", "Mixed evidence", "Demonstrated strength"];
const LABEL_HELP: Record<DiagnosticLabel, string> = {
  "Needs review": "You answered a question on this incorrectly.",
  "Mixed evidence": "Your answers on this conflict.",
  "Demonstrated strength": "You answered a question on this correctly. One answer is a weak signal, not proof.",
  "Tentative inference": "Not asked directly; guessed from a related concept. Treat with caution.",
  Unknown: "No evidence yet.",
};

// Stable per-student option order, so the keyed answer isn't always in the same slot.
function shuffledOrder(n: number, seed: string): number[] {
  let h = 2166136261;
  for (const ch of seed) h = Math.imul(h ^ ch.charCodeAt(0), 16777619);
  const order = Array.from({ length: n }, (_, i) => i);
  for (let i = n - 1; i > 0; i--) {
    h = Math.imul(h ^ (h >>> 15), 2246822507) >>> 0;
    const j = h % (i + 1);
    [order[i], order[j]] = [order[j], order[i]];
  }
  return order;
}

export default function StudentPage({ params }: { params: Promise<{ code: string; sid: string }> }) {
  const { code, sid } = use(params);
  const [state, setState] = useState<StudentState | null>(null);
  const [selected, setSelected] = useState<number | null>(null);
  const [feedback, setFeedback] = useState<{ q: PublicQuestion; choice: number; correct: boolean; correctAnswer: number; explanation: string } | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    const res = await fetch(`/api/rooms/${code}/students/${sid}`, { cache: "no-store" });
    if (res.ok) setState(await res.json());
    else setError((await res.json()).error);
  }, [code, sid]);

  useEffect(() => {
    load();
  }, [load]);

  const done = state && !state.next && !feedback;
  // Keep the diagnostic live so a professor's invalidation shows up without a refresh.
  useEffect(() => {
    if (!done) return;
    const t = setInterval(load, 3000);
    return () => clearInterval(t);
  }, [done, load]);

  async function submit() {
    if (!state?.next || selected === null) return;
    const res = await fetch(`/api/rooms/${code}/answer`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ studentId: sid, questionId: state.next.id, choice: selected }),
    });
    const data = await res.json();
    if (!res.ok) {
      setError(data.error);
      return load();
    }
    setFeedback({ q: state.next, choice: selected, ...data });
    setSelected(null);
    load();
  }

  if (!state) return <Shell>{error ? <ErrorNote message={error} /> : <p className="text-slate-500">Loading…</p>}</Shell>;

  const progress = state.answered.length;
  return (
    <Shell name={state.student.name} title={state.title}>
      <ErrorNote message={error} />

      {feedback ? (
        <Card>
          <p className="text-xs text-slate-500">
            Question {progress} of {state.budget}
          </p>
          <h2 className="mt-1 font-medium">{feedback.q.text}</h2>
          <div className={`mt-3 rounded-lg px-3 py-2 text-sm ${feedback.correct ? "bg-emerald-50 text-emerald-800" : "bg-rose-50 text-rose-800"}`}>
            {feedback.correct ? "Correct." : `Not quite. The keyed answer is: ${feedback.q.options[feedback.correctAnswer]}`}
            {feedback.explanation && <p className="mt-1 text-slate-700">{feedback.explanation}</p>}
          </div>
          <ChallengeBox code={code} sid={sid} questionId={feedback.q.id} status={state.answered.find((a) => a.question.id === feedback.q.id)?.challenge ?? null} onDone={load} />
          <div className="mt-4 flex justify-end">
            <Button onClick={() => setFeedback(null)}>{state.next ? "Next question →" : "See my diagnostic →"}</Button>
          </div>
        </Card>
      ) : state.next ? (
        <Card>
          <p className="text-xs text-slate-500">
            Question {progress + 1} of {state.budget} · chosen for you based on your previous answers
          </p>
          <h2 className="mt-1 text-lg font-medium">{state.next.text}</h2>
          <div className="mt-4 space-y-2">
            {shuffledOrder(state.next.options.length, sid + state.next.id).map((i, slot) => (
              <button
                key={i}
                onClick={() => setSelected(i)}
                className={`block w-full rounded-lg border px-3 py-2 text-left text-sm ${selected === i ? "border-indigo-500 bg-indigo-50" : "border-slate-200 hover:border-slate-400"}`}
              >
                <span className="mr-2 font-mono text-slate-400">{String.fromCharCode(65 + slot)}</span>
                {state.next!.options[i]}
              </button>
            ))}
          </div>
          <p className="mt-3 text-xs text-slate-400">
            Tests: {state.next.conceptIds.map((id) => state.concepts.find((c) => c.id === id)?.name).join(", ")}
          </p>
          <div className="mt-4 flex justify-end">
            <Button onClick={submit} disabled={selected === null}>
              Submit
            </Button>
          </div>
        </Card>
      ) : (
        <Diagnostic state={state} code={code} sid={sid} reload={load} />
      )}
    </Shell>
  );
}

function Shell({ children, name, title }: { children: React.ReactNode; name?: string; title?: string }) {
  return (
    <>
      <Header subtitle={title} right={name && <span className="text-sm text-slate-600">{name}</span>} />
      <main className="mx-auto max-w-2xl space-y-4 px-4 py-8">{children}</main>
    </>
  );
}

function Diagnostic({ state, code, sid, reload }: { state: StudentState; code: string; sid: string; reload: () => void }) {
  const direct = DIRECT_LABELS.map((label) => ({ label, items: state.diagnostics.filter((d) => d.label === label) })).filter((g) => g.items.length);
  const inferred = state.diagnostics.filter((d) => d.label === "Tentative inference");
  const unknown = state.diagnostics.filter((d) => d.label === "Unknown");
  return (
    <>
      <Card>
        <h2 className="text-lg font-semibold">Your diagnostic</h2>
        <p className="mt-1 text-sm text-slate-600">
          Based on {state.answered.filter((a) => !a.invalidated).length} question(s). This is a rough signal to guide review, not a grade.
        </p>

        <h3 className="mt-5 text-xs font-semibold tracking-wide text-slate-500 uppercase">From your answers</h3>
        <p className="text-xs text-slate-500">A question you answered tested these concepts directly.</p>
        <div className="mt-2 space-y-4">
          {direct.map((g) => (
            <div key={g.label}>
              <div className="flex items-center gap-2">
                <LabelBadge label={g.label} />
                <span className="text-xs text-slate-500">{LABEL_HELP[g.label]}</span>
              </div>
              <ul className="mt-1 ml-1 flex flex-wrap gap-x-4 gap-y-1 text-sm">
                {g.items.map((d) => (
                  <li key={d.conceptId}>
                    {d.name}
                    <span className="ml-1 text-xs text-slate-400">
                      ({d.directCorrect}/{d.directCount})
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>

        {inferred.length > 0 && (
          <div className="mt-5 rounded-lg border border-dashed border-slate-300 p-3">
            <div className="flex items-center gap-2">
              <h3 className="text-xs font-semibold tracking-wide text-slate-500 uppercase">Inferred from related concepts</h3>
              <LabelBadge label="Tentative inference" />
            </div>
            <p className="text-xs text-slate-500">{LABEL_HELP["Tentative inference"]}</p>
            <ul className="mt-2 space-y-1 text-sm">
              {inferred.map((d) => (
                <li key={d.conceptId} className="flex justify-between gap-3">
                  <span>{d.name}</span>
                  <span className="text-xs text-slate-500">
                    {d.inferredEvidence > 0 ? "related answers lean toward understanding" : "related answers suggest a possible gap"}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        )}

        {unknown.length > 0 && (
          <div className="mt-5">
            <div className="flex items-center gap-2">
              <h3 className="text-xs font-semibold tracking-wide text-slate-500 uppercase">Not enough evidence yet</h3>
            </div>
            <p className="mt-1 text-sm text-slate-600">{unknown.map((d) => d.name).join(", ")}</p>
          </div>
        )}
      </Card>

      <Card>
        <h3 className="font-semibold">Your answers</h3>
        <div className="mt-3 space-y-4">
          {state.answered.map((a) => (
            <div key={a.question.id} className={`border-l-4 pl-3 ${a.invalidated ? "border-slate-300 opacity-60" : a.correct ? "border-emerald-400" : "border-rose-400"}`}>
              <p className="text-sm font-medium">{a.question.text}</p>
              <p className="text-xs text-slate-600">
                You chose: {a.question.options[a.choice]} — {a.correct ? "correct" : `keyed answer: ${a.question.options[a.correctAnswer]}`}
              </p>
              {a.invalidated && <p className="text-xs font-medium text-slate-700">Your professor removed this question; it no longer counts as evidence.</p>}
              {a.revised && !a.invalidated && <p className="text-xs text-indigo-700">Your professor revised this question; it has been re-graded.</p>}
              {!a.invalidated && <ChallengeBox code={code} sid={sid} questionId={a.question.id} status={a.challenge} onDone={reload} />}
            </div>
          ))}
        </div>
      </Card>
    </>
  );
}

function ChallengeBox({ code, sid, questionId, status, onDone }: { code: string; sid: string; questionId: string; status: Answered["challenge"]; onDone: () => void }) {
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);

  if (status === "open" || sent) return <p className="mt-2 text-xs text-amber-700">Challenge sent; waiting for your professor.</p>;
  if (status === "dismissed") return <p className="mt-2 text-xs text-slate-500">Your professor reviewed your challenge and kept the question.</p>;
  if (!open)
    return (
      <button onClick={() => setOpen(true)} className="mt-2 text-xs font-medium text-indigo-700 hover:underline">
        I disagree with this assessment
      </button>
    );

  async function send() {
    const res = await fetch(`/api/rooms/${code}/challenge`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ studentId: sid, questionId, reason }),
    });
    if (!res.ok) return setError((await res.json()).error);
    setSent(true);
    onDone();
  }

  return (
    <div className="mt-2 space-y-2">
      <textarea
        value={reason}
        onChange={(e) => setReason(e.target.value)}
        rows={2}
        placeholder="What was ambiguous or unfair about this question?"
        className="w-full rounded border border-slate-300 p-2 text-sm"
      />
      <ErrorNote message={error} />
      <div className="flex gap-2">
        <Button variant="secondary" onClick={send} disabled={!reason.trim()}>
          Send to professor
        </Button>
        <Button variant="ghost" onClick={() => setOpen(false)}>
          Cancel
        </Button>
      </div>
    </div>
  );
}
