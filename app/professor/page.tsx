"use client";
import { useRouter } from "next/navigation";
import { useState } from "react";
import type { Concept, Edge, Question } from "@/lib/types";

type Draft = { title: string; concepts: Concept[]; edges: Edge[]; questions: Question[]; note?: string };

export default function Professor() {
  const router = useRouter();
  const [draft, setDraft] = useState<Draft | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  async function generate(file?: File | null) {
    setBusy(true); setErr("");
    const fd = new FormData();
    if (file) fd.append("pdf", file);
    const r = await fetch("/api/generate", { method: "POST", body: fd });
    setDraft(await r.json());
    setBusy(false);
  }

  if (!draft)
    return (
      <div className="card max-w-xl space-y-3">
        <h1 className="text-xl font-semibold">Professor workspace</h1>
        <p className="text-sm text-slate-600">Upload a lecture PDF. The AI proposes concepts and questions; nothing is used until you approve it.</p>
        <input type="file" accept="application/pdf" onChange={(e) => e.target.files?.[0] && generate(e.target.files[0])} />
        <div><button className="btn-ghost" disabled={busy} onClick={() => generate(null)}>Use sample Fourier lesson</button></div>
        {busy && <p className="text-sm text-slate-500">Generating…</p>}
      </div>
    );

  const setConcept = (id: string, p: Partial<Concept>) => setDraft({ ...draft, concepts: draft.concepts.map((c) => (c.id === id ? { ...c, ...p } : c)) });
  const setQ = (id: string, p: Partial<Question>) => setDraft({ ...draft, questions: draft.questions.map((q) => (q.id === id ? { ...q, ...p } : q)) });
  const name = (id: string) => draft.concepts.find((c) => c.id === id)?.name ?? id;
  const neighbors = (id: string) => draft.edges.filter((e) => e.source === id || e.target === id);
  const removeConcept = (id: string) => setDraft({
    ...draft,
    concepts: draft.concepts.filter((c) => c.id !== id),
    edges: draft.edges.filter((e) => e.source !== id && e.target !== id),
    questions: draft.questions.map((q) => ({ ...q, conceptIds: q.conceptIds.filter((x) => x !== id) })).filter((q) => q.conceptIds.length),
  });
  const addConcept = () => {
    const id = `c${Date.now().toString(36)}`;
    setDraft({ ...draft, concepts: [...draft.concepts, { id, name: "New concept", importance: 1, verified: true }] });
  };
  const connect = (a: string, b: string) => {
    if (!b || a === b || draft.edges.some((e) => (e.source === a && e.target === b) || (e.source === b && e.target === a))) return;
    setDraft({ ...draft, edges: [...draft.edges, { source: a, target: b, weight: 0.3, type: "related" }] });
  };
  const disconnect = (e: Edge) => setDraft({ ...draft, edges: draft.edges.filter((x) => x !== e) });
  const approved = draft.questions.filter((q) => q.approved).length;

  async function create() {
    const r = await fetch("/api/rooms", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(draft) });
    const j = await r.json();
    if (!r.ok) return setErr(j.error);
    router.push(`/dashboard/${j.code}`);
  }

  return (
    <div className="space-y-8">
      <div>
        <input className="input text-xl font-semibold" value={draft.title} onChange={(e) => setDraft({ ...draft, title: e.target.value })} />
        {draft.note && <p className="mt-1 text-sm text-amber-700">{draft.note}</p>}
      </div>

      <section className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold">Concepts ({draft.concepts.length})</h2>
          <button className="btn-ghost" onClick={addConcept}>+ Add concept</button>
        </div>
        <p className="text-sm text-slate-500">Relationships mean “possibly relevant for assessment”, not “mastery of one proves the other”.</p>
        <div className="grid gap-3 md:grid-cols-2">
          {draft.concepts.map((c) => (
            <div key={c.id} className="card space-y-2">
              <div className="flex gap-2">
                <input className="input" value={c.name} onChange={(e) => setConcept(c.id, { name: e.target.value })} />
                <button className="btn-ghost" onClick={() => removeConcept(c.id)}>✕</button>
              </div>
              <div className="flex flex-wrap items-center gap-3 text-xs">
                <label><input type="checkbox" checked={c.verified} onChange={(e) => setConcept(c.id, { verified: e.target.checked })} /> verified</label>
                <label><input type="checkbox" checked={!!c.foundational} onChange={(e) => setConcept(c.id, { foundational: e.target.checked, importance: e.target.checked ? 1 : c.importance })} /> foundational</label>
                <label>importance <input className="w-14 rounded border px-1" type="number" min={0} max={1} step={0.1} value={c.importance} onChange={(e) => setConcept(c.id, { importance: Number(e.target.value) })} /></label>
              </div>
              <div className="flex flex-wrap gap-1 text-xs">
                {neighbors(c.id).map((e, i) => (
                  <span key={i} className="rounded bg-slate-100 px-2 py-0.5">
                    {name(e.source === c.id ? e.target : e.source)}{" "}
                    <button onClick={() => disconnect(e)} title="Disconnect">✕</button>
                  </span>
                ))}
                <select className="rounded border text-xs" value="" onChange={(e) => connect(c.id, e.target.value)}>
                  <option value="">+ connect…</option>
                  {draft.concepts.filter((o) => o.id !== c.id).map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}
                </select>
              </div>
            </div>
          ))}
        </div>
      </section>

      <section className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold">Questions ({approved}/{draft.questions.length} approved)</h2>
          <button className="btn-ghost" onClick={() => setDraft({ ...draft, questions: draft.questions.map((q) => ({ ...q, approved: true })) })}>Approve all</button>
        </div>
        {draft.questions.map((q) => (
          <div key={q.id} className={`card space-y-2 ${q.approved ? "border-green-400" : ""}`}>
            <textarea className="input" rows={2} value={q.text} onChange={(e) => setQ(q.id, { text: e.target.value })} />
            {q.options.map((o, i) => (
              <div key={i} className="flex items-center gap-2">
                <input type="radio" checked={q.correctAnswer === i} onChange={() => setQ(q.id, { correctAnswer: i })} title="Correct answer" />
                <input className="input" value={o} onChange={(e) => setQ(q.id, { options: q.options.map((x, j) => (j === i ? e.target.value : x)) })} />
              </div>
            ))}
            <input className="input" placeholder="Explanation" value={q.explanation ?? ""} onChange={(e) => setQ(q.id, { explanation: e.target.value })} />
            <div className="flex flex-wrap items-center gap-1 text-xs">
              {draft.concepts.map((c) => {
                const on = q.conceptIds.includes(c.id);
                return (
                  <button key={c.id} onClick={() => setQ(q.id, { conceptIds: on ? q.conceptIds.filter((x) => x !== c.id) : [...q.conceptIds, c.id] })}
                    className={`rounded px-2 py-0.5 ${on ? "bg-indigo-600 text-white" : "bg-slate-100"}`}>{c.name}</button>
                );
              })}
              {q.sourcePage && <span className="ml-2 text-slate-500">p.{q.sourcePage}</span>}
            </div>
            <div className="flex gap-3 text-sm">
              <label><input type="checkbox" checked={!!q.approved} onChange={(e) => setQ(q.id, { approved: e.target.checked })} /> approve</label>
              <button className="text-red-600" onClick={() => setDraft({ ...draft, questions: draft.questions.filter((x) => x.id !== q.id) })}>remove</button>
            </div>
          </div>
        ))}
      </section>

      {err && <p className="text-red-600">{err}</p>}
      <button className="btn" disabled={!approved} onClick={create}>Create room with {approved} approved questions</button>
    </div>
  );
}
