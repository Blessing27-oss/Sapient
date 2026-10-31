"use client";
import { Suspense, useCallback, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import TopicMapView from "@/components/TopicMapView";
import { fallbackTopicMap } from "@/lib/topicMap";
import Practice from "@/components/Practice";
import { StudentGate } from "@/components/ProfessorGate";
import StudyChat from "@/components/StudyChat";
import { LABEL_TEXT } from "@/lib/engine";
import { LABEL_ACCENT, LABEL_FILL } from "@/lib/ui";
import type { Edge, Label, MapLayout, TopicMap } from "@/lib/types";

type Q = { id: string; text: string; options: string[] };
type Progress = { answered: number; total: number };
type Diag = { conceptId: string; name: string; foundational?: boolean; description?: string; label: Label; evidence: { correct: number; wrong: number } };
type Answered = { questionId: string; text: string; correct: boolean; choice: number; options: string[]; correctAnswer: number; explanation?: string };
type Next =
  | { question: Q; progress: Progress }
  | { noQuestions: true; title: string }
  | { done: true; progress: Progress; title: string; topicMap?: TopicMap; edges: Edge[]; layout?: MapLayout; diagnostic: Diag[]; answered: Answered[] };
type MyRoom = { code: string; title: string; answered: number; total: number };

const LABEL_NOTE: Record<Label, string> = {
  strength: "You answered a question on this correctly. One answer is a good sign, not proof.",
  review: "You missed a question on this. A good place to start.",
  mixed: "Your answers on this disagreed with each other.",
  "tentative-up": "Not asked directly. Your answers on related concepts suggest you may be fine here.",
  "tentative-down": "Not asked directly. Your answers on related concepts suggest a possible gap.",
  unknown: "Not enough evidence either way yet.",
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

function StudentInner() {
  const sp = useSearchParams();
  const [code, setCode] = useState((sp.get("code") ?? "").toUpperCase());
  const [name, setName] = useState("");
  const [rooms, setRooms] = useState<MyRoom[]>([]);
  const [sid, setSid] = useState("");
  const [title, setTitle] = useState("");
  const [started, setStarted] = useState(false);
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);
  const [next, setNext] = useState<Next | null>(null);

  // The student's name and rooms come from their account (StudentGate guarantees a session).
  useEffect(() => {
    fetch("/api/auth/me").then((r) => r.json()).then((j) => setName(j.user?.name ?? ""));
    fetch("/api/me/rooms").then((r) => r.json()).then((j) => setRooms(j.rooms ?? []));
  }, []);

  const load = useCallback(async (c: string, s: string): Promise<Next | null> => {
    const r = await fetch(`/api/rooms/${c}/next?student=${s}`);
    if (!r.ok) return null;
    const j: Next = await r.json();
    setNext(j);
    return j;
  }, []);

  // Keep results live so a professor's invalidation shows up without a refresh.
  useEffect(() => {
    if (!sid || !next || !("done" in next)) return;
    const timer = setInterval(() => load(code, sid), 3000);
    return () => clearInterval(timer);
  }, [code, sid, next, load]);

  async function join(c = code) {
    setBusy(true); setErr("");
    try {
      const r = await fetch(`/api/rooms/${c}/join`, { method: "POST" });
      const j = await r.json();
      if (!r.ok) return setErr(j.error === "Room not found" ? "No class with that code. Check it with your professor." : j.error);
      const n = await load(c, j.studentId);
      setCode(c); setSid(j.studentId); setTitle(j.title ?? "");
      // Returning students resume where they left off; only a fresh start gets the ready screen.
      setStarted(!(n && "question" in n && n.progress.answered === 0));
    } finally { setBusy(false); }
  }

  if (!sid) return <JoinScreen code={code} setCode={setCode} rooms={rooms} err={err} busy={busy} onJoin={join} />;
  if (!started) return <ReadyScreen title={title} name={name} code={code} onStart={() => setStarted(true)} />;
  if (!next) return <p className="text-stone-500">Loading…</p>;
  if ("noQuestions" in next) return <EmptyRoom title={next.title} onRetry={() => load(code, sid)} />;
  if ("question" in next) return <QuizScreen key={next.question.id} q={next.question} progress={next.progress} sid={sid} code={code} onAnswered={() => load(code, sid)} />;
  if (!("done" in next)) return <p className="text-stone-500">Loading…</p>;
  return <Results data={next} name={name} title={title} code={code} sid={sid} />;
}

function JoinScreen({ code, setCode, rooms, err, busy, onJoin }: {
  code: string; setCode: (s: string) => void; rooms: MyRoom[]; err: string; busy: boolean; onJoin: (c?: string) => void;
}) {
  const ready = code.length === 4;
  return (
    <div className="mx-auto grid max-w-5xl items-center gap-12 py-6 md:grid-cols-[1.1fr_1fr]">
      <div className="rise space-y-5">
        <span className="stamp text-[var(--green)]">For students</span>
        <h1 className="text-5xl leading-[1.05] font-semibold md:text-6xl">
          Three questions.<br /><em className="text-[var(--green)]">A map of what you know.</em>
        </h1>
        <p className="max-w-md text-lg text-stone-600">
          Each question is picked based on your last answer. At the end you&apos;ll see what you&apos;ve shown you know, what to review, and what&apos;s still a guess.
        </p>
      </div>
      <div className="rise space-y-4 [animation-delay:120ms]">
        <form className="paper rounded-2xl py-7 pr-7 pl-[4.25rem]" onSubmit={(e) => { e.preventDefault(); if (ready) onJoin(); }}>
          <h2 className="text-2xl font-semibold">Join your class</h2>
          <label className="mt-5 block text-sm font-medium text-stone-600">Room code
            <input className="input serif mt-1 !bg-white/80 text-center !text-4xl tracking-[0.4em] uppercase" maxLength={4} placeholder="ABCD" autoFocus
              value={code} onChange={(e) => setCode(e.target.value.replace(/[^a-z]/gi, "").toUpperCase())} />
          </label>
          {err && <p className="mt-3 text-sm text-red-700">{err}</p>}
          <button className="btn mt-5 w-full !py-3 text-base" disabled={!ready || busy}>{busy ? "Joining…" : "Join class →"}</button>
        </form>
        {rooms.length > 0 && (
          <div className="card space-y-2">
            <h2 className="text-lg font-semibold">Your rooms</h2>
            {rooms.map((r) => (
              <button key={r.code} disabled={busy} onClick={() => onJoin(r.code)} className="flex w-full items-center justify-between gap-3 rounded-xl border border-stone-200 px-3 py-2.5 text-left text-sm transition hover:border-[var(--green)] hover:bg-green-50">
                <span className="font-medium">{r.title}</span>
                <span className="shrink-0 text-stone-500"><span className="font-mono">{r.code}</span> · {r.answered >= r.total ? "view results" : r.answered ? `resume ${r.answered}/${r.total}` : "start"}</span>
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function EmptyRoom({ title, onRetry }: { title: string; onRetry: () => void }) {
  return (
    <div className="paper rise mx-auto max-w-xl rounded-2xl py-10 pr-10 pl-[5rem]">
      <span className="stamp text-amber-700">Not open yet</span>
      <h1 className="mt-4 text-3xl font-semibold">{title}</h1>
      <p className="mt-2 text-stone-600">Your professor hasn&apos;t added any questions to this room yet. Check back soon.</p>
      <button className="btn-ghost mt-6" onClick={onRetry}>Check again</button>
    </div>
  );
}

function ReadyScreen({ title, name, code, onStart }: { title: string; name: string; code: string; onStart: () => void }) {
  return (
    <div className="mx-auto max-w-2xl py-4">
      <div className="paper rise rounded-2xl py-10 pr-10 pl-[5rem]">
        <div className="flex items-center justify-between text-sm text-stone-500">
          <span className="stamp text-[var(--green)]">Diagnostic</span>
          <span className="font-mono tracking-widest">ROOM {code}</span>
        </div>
        <p className="serif mt-8 text-lg text-stone-500 italic">Ready when you are{name ? `, ${name.split(" ")[0]}` : ""}.</p>
        <h1 className="ink mt-1 text-4xl leading-tight font-semibold md:text-5xl">{title || "Today's lesson"}</h1>
        <ul className="mt-8 grid gap-4 sm:grid-cols-3">
          {[
            ["3", "questions, one at a time"],
            ["~2", "minutes, no time limit"],
            ["0", "grades. This only guides what to review"],
          ].map(([n, t], i) => (
            <li key={t} className="rise" style={{ animationDelay: `${200 + i * 90}ms` }}>
              <span className="serif block text-5xl font-semibold text-[var(--green)]">{n}</span>
              <span className="text-sm text-stone-600">{t}</span>
            </li>
          ))}
        </ul>
        <p className="mt-8 text-sm text-stone-500">Your second and third questions depend on how you answer, so a classmate may get different ones.</p>
        <button className="btn mt-6 !px-8 !py-3.5 text-base" onClick={onStart} autoFocus>Take the quiz →</button>
      </div>
    </div>
  );
}

function QuizScreen({ q, progress, sid, code, onAnswered }: { q: Q; progress: Progress; sid: string; code: string; onAnswered: () => Promise<unknown> }) {
  const [pick, setPick] = useState<number | null>(null);
  const [sending, setSending] = useState(false);
  const order = useMemo(() => shuffledOrder(q.options.length, sid + q.id), [q, sid]);
  const n = progress.answered + 1;

  async function submit() {
    if (pick === null || sending) return;
    setSending(true);
    await fetch(`/api/rooms/${code}/answer`, { method: "POST", body: JSON.stringify({ studentId: sid, questionId: q.id, choice: pick }) });
    await onAnswered();
  }

  // Keyboard: A–D or 1–4 to choose, Enter to submit.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
      const slot = "abcd".indexOf(e.key.toLowerCase()) >= 0 ? "abcd".indexOf(e.key.toLowerCase()) : "1234".indexOf(e.key);
      if (slot >= 0 && slot < order.length) setPick(order[slot]);
      if (e.key === "Enter") submit();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }); // re-bind each render so submit sees the current pick

  return (
    <div className="mx-auto max-w-3xl">
      <div className="mb-6 flex items-center gap-3">
        {Array.from({ length: progress.total }, (_, i) => (
          <div key={i} className={`h-1.5 flex-1 rounded-full transition-colors duration-500 ${i < progress.answered ? "bg-[var(--green)]" : i === progress.answered ? "bg-[var(--green)]/40" : "bg-stone-200"}`} />
        ))}
        <span className="shrink-0 font-mono text-xs text-stone-500">{n}/{progress.total}</span>
      </div>
      <div className="paper rise relative rounded-2xl py-8 pr-8 pl-[5rem]">
        <span className="serif absolute top-6 left-0 w-[3.25rem] text-center text-4xl font-semibold text-[var(--margin)]">{n}</span>
        {n > 1 && <p className="serif mb-2 text-sm text-stone-500 italic">Chosen for you, based on your last answer</p>}
        <h1 className="text-2xl leading-snug font-semibold md:text-3xl">{q.text}</h1>
        <div className="mt-7 space-y-2.5" role="radiogroup" aria-label="Answer options">
          {order.map((i, slot) => (
            <button key={i} role="radio" aria-checked={pick === i} onClick={() => setPick(i)} disabled={sending}
              className={`option flex w-full items-center gap-4 rounded-xl border bg-white/85 p-4 text-left ${pick === i ? "border-[var(--green)] bg-green-50/80" : "border-stone-300 hover:border-stone-400"}`}>
              <span className={`serif flex h-8 w-8 shrink-0 items-center justify-center rounded-full border text-sm font-semibold transition ${pick === i ? "border-[var(--green)] bg-[var(--green)] text-white" : "border-stone-300 text-stone-600"}`}>{"ABCD"[slot]}</span>
              <span className="flex-1">{q.options[i]}</span>
            </button>
          ))}
        </div>
        <div className="mt-7 flex items-center justify-between gap-4">
          <p className="hidden text-xs text-stone-400 sm:block">Tip: press A–D, then Enter</p>
          <button className="btn !px-7 !py-3 text-base" disabled={pick === null || sending} onClick={submit}>
            {sending ? "Saving…" : n < progress.total ? "Submit answer →" : "Submit & see results →"}
          </button>
        </div>
      </div>
    </div>
  );
}

const SUMMARY: { labels: Label[]; title: string; tone: string }[] = [
  { labels: ["strength"], title: "Shown you know", tone: "border-green-300 bg-green-50 text-green-900" },
  { labels: ["review", "mixed"], title: "To review", tone: "border-red-300 bg-red-50 text-red-900" },
  { labels: ["tentative-up", "tentative-down"], title: "Educated guesses", tone: "border-dashed border-stone-400 bg-white text-stone-800" },
  { labels: ["unknown"], title: "No evidence yet", tone: "border-stone-200 bg-stone-50 text-stone-600" },
];

function Results({ data, name, title, code, sid }: { data: Extract<Next, { done: true }>; name: string; title: string; code: string; sid: string }) {
  const [selected, setSelected] = useState<string | null>(null);
  const [practice, setPractice] = useState<{ id: string; name: string } | null>(null);
  const [ask, setAsk] = useState<{ text: string; n: number } | null>(null);
  const toReview = data.diagnostic.filter((d) => d.label === "review" || d.label === "mixed");
  const practiceFirst = toReview[0] ?? data.diagnostic.find((d) => d.label === "tentative-down") ?? data.diagnostic.find((d) => d.label === "unknown");
  const sel = data.diagnostic.find((d) => d.conceptId === selected);
  const right = data.answered.filter((a) => a.correct).length;
  const askHelper = (text: string) => setAsk((a) => ({ text, n: (a?.n ?? 0) + 1 }));

  return (
    <div className="space-y-8">
      <header className="rise flex flex-wrap items-end justify-between gap-6">
        <div>
          <p className="serif text-lg text-stone-500 italic">{title}</p>
          <h1 className="text-4xl font-semibold md:text-5xl">{name ? `Your map, ${name.split(" ")[0]}` : "Your map"}</h1>
          <p className="mt-2 max-w-2xl text-stone-600">
            You got <strong>{right} of {data.answered.length}</strong> right. That&apos;s only {data.answered.length} questions, so treat this as a starting point, not a verdict.
          </p>
        </div>
        {practiceFirst && (
          <button className="btn !px-6 !py-3" onClick={() => { setPractice({ id: practiceFirst.conceptId, name: practiceFirst.name }); setSelected(practiceFirst.conceptId); }}>
            Practice {practiceFirst.name} →
          </button>
        )}
      </header>

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        {SUMMARY.map((s, i) => {
          const items = data.diagnostic.filter((d) => s.labels.includes(d.label));
          return (
            <div key={s.title} className={`rise rounded-2xl border p-4 ${s.tone}`} style={{ animationDelay: `${80 + i * 70}ms` }}>
              <p className="serif text-4xl font-semibold">{items.length}</p>
              <p className="text-sm font-semibold">{s.title}</p>
              <p className="mt-1 line-clamp-2 text-xs opacity-75">{items.map((d) => d.name).join(", ") || "None"}</p>
            </div>
          );
        })}
      </div>

      <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_380px]">
        <div className="min-w-0 space-y-6">
          <section className="card rise space-y-4 [animation-delay:200ms]">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <h2 className="text-2xl font-semibold">Concept map</h2>
              <p className="text-sm text-stone-500">Click a concept to explore it. Pale blue and orange concepts are guesses, not tested.</p>
            </div>
            <TopicMapView title={data.title || title}
              map={data.topicMap ?? fallbackTopicMap(data.diagnostic.map((d) => ({ id: d.conceptId, name: d.name, importance: 1, verified: true })), data.edges)}
              selectedConceptId={selected} onSelectConcept={setSelected}
              styleFor={(node) => {
                const diagnostic = data.diagnostic.find((d) => d.conceptId === node.conceptId);
                return diagnostic ? { fill: LABEL_FILL[diagnostic.label], stroke: LABEL_ACCENT[diagnostic.label], dashed: diagnostic.label.startsWith("tentative") } : { fill: "#fafaf9", stroke: "#d6d3d1" };
              }} />
            <div className="flex flex-wrap gap-2 text-xs">
              {(Object.keys(LABEL_FILL) as Label[]).map((l) => (
                <span key={l} className="flex items-center gap-1.5 rounded-full border bg-white px-2.5 py-1">
                  <i className="h-3 w-3 rounded-full border-2" style={{ background: LABEL_FILL[l], borderColor: LABEL_ACCENT[l] }} />{LABEL_TEXT[l]}
                </span>
              ))}
            </div>
            {sel ? (
              <div key={sel.conceptId} className="rise rounded-xl border border-stone-200 bg-stone-50 p-4">
                <div className="flex flex-wrap items-center gap-3">
                  <h3 className="text-xl font-semibold">{sel.name}</h3>
                  <span className="rounded-full border px-2.5 py-0.5 text-xs font-semibold" style={{ background: LABEL_FILL[sel.label] }}>{LABEL_TEXT[sel.label]}</span>
                </div>
                {sel.description && <p className="mt-1 text-sm text-stone-700">{sel.description}</p>}
                <p className="mt-2 text-sm text-stone-500">{LABEL_NOTE[sel.label]}</p>
                <div className="mt-3 flex flex-wrap gap-2">
                  <button className="btn" onClick={() => askHelper(`Explain ${sel.name} to me, starting from what I got wrong if anything.`)}>Explain this</button>
                  <button className="btn-ghost" onClick={() => setPractice({ id: sel.conceptId, name: sel.name })}>Practice this</button>
                </div>
              </div>
            ) : (
              <p className="serif rounded-xl border border-dashed border-stone-300 p-4 text-center text-stone-500 italic">Pick a concept on the map to see what it means for you.</p>
            )}
          </section>

          {practice && <Practice key={practice.id} code={code} studentId={sid} concept={practice} onClose={() => setPractice(null)} />}

          <section className="space-y-3">
            <h2 className="text-2xl font-semibold">Your answers</h2>
            {data.answered.map((a, i) => <AnswerCard key={a.questionId} a={a} n={i + 1} code={code} sid={sid} onAsk={askHelper} />)}
          </section>
        </div>

        <div className="lg:sticky lg:top-6">
          <StudyChat code={code} studentId={sid} reviewConcepts={toReview.map((d) => d.name)} ask={ask} />
        </div>
      </div>
    </div>
  );
}

function AnswerCard({ a, n, code, sid, onAsk }: { a: Answered; n: number; code: string; sid: string; onAsk: (t: string) => void }) {
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("");
  const [sent, setSent] = useState(false);

  async function challenge() {
    const r = await fetch(`/api/rooms/${code}/challenge`, { method: "POST", body: JSON.stringify({ studentId: sid, questionId: a.questionId, reason }) });
    if (r.ok) { setSent(true); setOpen(false); }
  }

  return (
    <div className={`card relative overflow-hidden border-l-4 !pl-6 ${a.correct ? "border-l-green-500" : "border-l-red-400"}`}>
      <div className="flex items-start gap-3">
        <span className="serif text-2xl font-semibold text-stone-300">{n}</span>
        <div className="flex-1 space-y-1.5 text-sm">
          <p className="text-base font-semibold">{a.text}</p>
          <p className={a.correct ? "text-green-800" : "text-red-800"}>
            {a.correct ? "✓ " : "✗ "}You answered: {a.options[a.choice]}
          </p>
          {!a.correct && <p className="text-stone-700">Correct answer: <strong>{a.options[a.correctAnswer]}</strong></p>}
          {a.explanation && <p className="text-stone-500">{a.explanation}</p>}
          <div className="flex flex-wrap gap-4 pt-1">
            {!a.correct && <button className="font-medium text-[var(--green)] hover:underline" onClick={() => onAsk(`Why is "${a.options[a.correctAnswer]}" the answer to "${a.text}", and why was "${a.options[a.choice]}" wrong?`)}>Ask the helper why</button>}
            {sent ? (
              <span className="text-amber-700">Sent to your professor for review</span>
            ) : (
              <button className="text-stone-500 hover:text-stone-800 hover:underline" onClick={() => setOpen((o) => !o)}>I disagree with this assessment</button>
            )}
          </div>
          {open && (
            <div className="rise space-y-2 pt-2">
              <textarea className="input" rows={2} maxLength={500} autoFocus placeholder="What was unclear or unfair about this question?" value={reason} onChange={(e) => setReason(e.target.value)} />
              <div className="flex gap-2">
                <button className="btn" disabled={!reason.trim()} onClick={challenge}>Send to professor</button>
                <button className="btn-ghost" onClick={() => setOpen(false)}>Cancel</button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default function Student() {
  return <StudentGate><Suspense><StudentInner /></Suspense></StudentGate>;
}
