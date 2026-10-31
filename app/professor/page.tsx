"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import Graph from "@/components/Graph";
import ProfessorGate from "@/components/ProfessorGate";
import ShareCard from "@/components/ShareCard";
import type { Concept, Edge, Question } from "@/lib/types";

type Draft = { title: string; concepts: Concept[]; edges: Edge[]; questions: Question[]; note?: string };

export default function ProfessorPage() {
  return <ProfessorGate><Workspace /></ProfessorGate>;
}

function Workspace() {
  const [draft, setDraft] = useState<Draft | null>(null);
  const [busy, setBusy] = useState(false);
  const [tab, setTab] = useState<"map" | "questions">("map");
  const [sel, setSel] = useState<string | null>(null);
  const [selEdge, setSelEdge] = useState<number | null>(null);
  const [err, setErr] = useState("");
  const [code, setCode] = useState("");

  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement;
      if (selEdge === null || (e.key !== "Delete" && e.key !== "Backspace") || /INPUT|TEXTAREA|SELECT/.test(t.tagName)) return;
      setDraft((d) => d && { ...d, edges: d.edges.filter((_, i) => i !== selEdge) });
      setSelEdge(null);
    };
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, [selEdge]);

  async function generate(file?: File | null) {
    setBusy(true); setErr("");
    const fd = new FormData();
    if (file) fd.append("pdf", file);
    try {
      const r = await fetch("/api/generate", { method: "POST", body: fd });
      if (r.status === 401) { location.reload(); return; }
      const d = await r.json();
      if (!r.ok) throw new Error(d.error ?? "Could not generate material.");
      setDraft(d); setSel(d.concepts[0]?.id ?? null);
    } catch (error) {
      setErr(error instanceof Error ? error.message : "Could not generate material.");
    } finally {
      setBusy(false);
    }
  }

  if (code && draft)
    return (
      <div className="mx-auto max-w-2xl space-y-6">
        <h1 className="text-3xl font-bold">Your room is live</h1>
        <p className="text-stone-600">Send students this code or link. They’ll answer three adaptive questions each.</p>
        <ShareCard code={code} />
        <Link href={`/dashboard/${code}`} className="btn">Open class dashboard →</Link>
      </div>
    );

  if (!draft)
    return (
      <div className="mx-auto max-w-2xl space-y-6">
        <div>
          <p className="text-sm font-semibold text-[#00693e]">Step 1 of 3</p>
          <h1 className="text-3xl font-bold">Upload your lecture</h1>
          <p className="mt-1 text-stone-600">We’ll extract the key concepts and how they connect. You review and correct everything before students see it.</p>
        </div>
        <label className={`flex cursor-pointer flex-col items-center justify-center rounded-2xl border-2 border-dashed border-stone-300 bg-white p-12 text-center transition hover:border-[#00693e] hover:bg-green-50/40 ${busy ? "pointer-events-none opacity-60" : ""}`}>
          <span className="text-4xl">📄</span>
          <span className="mt-3 font-semibold">{busy ? "Reading your lecture and building the concept map…" : "Click to choose a PDF"}</span>
          <span className="text-sm text-stone-500">Lecture notes or slides</span>
          <input type="file" accept="application/pdf" className="hidden" onChange={(e) => e.target.files?.[0] && generate(e.target.files[0])} />
        </label>
        {err && <p role="alert" className="rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700">{err}</p>}
      </div>
    );

  const patch = (p: Partial<Draft>) => setDraft({ ...draft, ...p });
  const setConcept = (id: string, p: Partial<Concept>) => patch({ concepts: draft.concepts.map((c) => (c.id === id ? { ...c, ...p } : c)) });
  const setQ = (id: string, p: Partial<Question>) => patch({ questions: draft.questions.map((q) => (q.id === id ? { ...q, ...p } : q)) });
  const nameOf = (id: string) => draft.concepts.find((c) => c.id === id)?.name ?? id;
  const sc = draft.concepts.find((c) => c.id === sel);
  const removeConcept = (id: string) => {
    patch({
      concepts: draft.concepts.filter((c) => c.id !== id),
      edges: draft.edges.filter((e) => e.source !== id && e.target !== id),
      questions: draft.questions.map((q) => ({ ...q, conceptIds: q.conceptIds.filter((x) => x !== id) })).filter((q) => q.conceptIds.length),
    });
    setSel(null);
  };
  const addConcept = (): string => {
    const id = `c${Date.now().toString(36)}`;
    patch({ concepts: [...draft.concepts, { id, name: "New concept", importance: 1, verified: true }] });
    setSel(id); setSelEdge(null);
    return id;
  };
  const connect = (a: string, b: string) => {
    if (!b || a === b || draft.edges.some((e) => (e.source === a && e.target === b) || (e.source === b && e.target === a))) return;
    patch({ edges: [...draft.edges, { source: a, target: b, weight: 0.3, type: "related" }] });
    setSelEdge(draft.edges.length);
  };
  const se = selEdge !== null ? draft.edges[selEdge] : undefined;
  const approved = draft.questions.filter((q) => q.approved).length;

  async function publish() {
    setErr("");
    const r = await fetch("/api/rooms", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(draft) });
    const j = await r.json();
    if (!r.ok) return setErr(j.error);
    setCode(j.code);
  }

  return (
    <div className="space-y-6 pb-24">
      <div>
        <p className="text-sm font-semibold text-[#00693e]">Step 2 of 3 · Review</p>
        <input className="w-full bg-transparent font-serif text-3xl font-bold outline-none focus:underline" value={draft.title} onChange={(e) => patch({ title: e.target.value })} />
        {draft.note && <p className="mt-1 text-sm text-amber-700">{draft.note}</p>}
      </div>

      <div className="flex gap-1 border-b border-stone-200">
        {([["map", `Concept map (${draft.concepts.length})`], ["questions", `Questions (${approved}/${draft.questions.length} approved)`]] as const).map(([k, label]) => (
          <button key={k} onClick={() => setTab(k)} className={`-mb-px border-b-2 px-4 py-2 text-sm font-semibold ${tab === k ? "border-[#00693e] text-[#00693e]" : "border-transparent text-stone-500"}`}>{label}</button>
        ))}
      </div>

      <div className={tab === "map" ? "" : "hidden"}>
        <div className="grid gap-6 lg:grid-cols-[1fr_320px]">
          <div className="space-y-2">
            <Graph
              nodes={draft.concepts.map((c) => ({ id: c.id, name: c.name, fill: c.foundational ? "#bbf7d0" : "#fff", ring: !c.verified }))}
              edges={draft.edges}
              selected={sel}
              onSelect={(id) => { setSel(id); if (id) setSelEdge(null); }}
              selectedEdge={selEdge}
              onSelectEdge={(i) => { setSelEdge(i); if (i !== null) setSel(null); }}
              onConnect={connect}
              onAddNode={() => addConcept()}
            />
            <p className="text-xs text-stone-500">
              <b>Drag</b> a concept to move it · drag its green <b>+</b> onto another concept to connect · click a line to select, then press Delete · <b>double-click</b> empty space to add a concept. Dashed outline = not yet verified. Lines mean “possibly relevant for assessment”, not “mastery of one proves the other”.
            </p>
          </div>
          <div className="card space-y-3 self-start">
            {se && selEdge !== null ? (
              <>
                <p className="text-sm font-semibold">Relationship</p>
                <p className="text-sm">{nameOf(se.source)} <span className="text-stone-400">↔</span> {nameOf(se.target)}</p>
                <label className="block text-sm">Strength: {se.weight.toFixed(1)}
                  <input type="range" min={0.1} max={0.5} step={0.1} className="w-full accent-[#00693e]" value={se.weight}
                    onChange={(e) => patch({ edges: draft.edges.map((x, i) => (i === selEdge ? { ...x, weight: Number(e.target.value) } : x)) })} />
                </label>
                <p className="text-xs text-stone-500">How much a direct answer on one concept counts as a hint about the other. It never counts as mastery.</p>
                <button className="btn-ghost w-full !text-red-600" onClick={() => { patch({ edges: draft.edges.filter((_, i) => i !== selEdge) }); setSelEdge(null); }}>Remove relationship</button>
              </>
            ) : sc ? (
              <>
                {sc.sourcePage && <p className="text-xs text-stone-500">Source: page {sc.sourcePage}</p>}
                <input className="input font-semibold" value={sc.name} onChange={(e) => setConcept(sc.id, { name: e.target.value })} />
                <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={sc.verified} onChange={(e) => setConcept(sc.id, { verified: e.target.checked })} /> I’ve verified this concept</label>
                <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={!!sc.foundational} onChange={(e) => setConcept(sc.id, { foundational: e.target.checked, importance: e.target.checked ? 1 : sc.importance })} /> Foundational</label>
                <label className="block text-sm">Importance: {sc.importance.toFixed(1)}
                  <input type="range" min={0.1} max={1} step={0.1} className="w-full accent-[#00693e]" value={sc.importance} onChange={(e) => setConcept(sc.id, { importance: Number(e.target.value) })} />
                </label>
                <div>
                  <p className="mb-1 text-sm font-medium">Connected to</p>
                  <div className="flex flex-wrap gap-1.5">
                    {draft.edges.filter((e) => e.source === sc.id || e.target === sc.id).map((e, i) => (
                      <span key={i} className="chip">{nameOf(e.source === sc.id ? e.target : e.source)} <button className="ml-1 text-stone-400 hover:text-red-600" onClick={() => { patch({ edges: draft.edges.filter((x) => x !== e) }); setSelEdge(null); }}>✕</button></span>
                    ))}
                  </div>
                  <select className="input mt-2" value="" onChange={(e) => connect(sc.id, e.target.value)}>
                    <option value="">+ Connect to…</option>
                    {draft.concepts.filter((o) => o.id !== sc.id).map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}
                  </select>
                </div>
                <button className="text-sm text-red-600 hover:underline" onClick={() => removeConcept(sc.id)}>Delete concept</button>
              </>
            ) : <p className="text-sm text-stone-500">Select a concept on the map.</p>}
            <button className="btn-ghost w-full" onClick={() => addConcept()}>+ Add concept</button>
          </div>
        </div>
      </div>

      {tab === "questions" && (
        <div className="space-y-4">
          <div className="flex justify-end"><button className="btn-ghost" onClick={() => patch({ questions: draft.questions.map((q) => ({ ...q, approved: true })) })}>Approve all</button></div>
          {draft.questions.map((q, n) => (
            <div key={q.id} className={`card space-y-3 ${q.approved ? "!border-[#00693e]" : ""}`}>
              <div className="flex items-start justify-between gap-3">
                <span className="text-xs font-semibold text-stone-400">Q{n + 1}{q.sourcePage ? ` · p.${q.sourcePage}` : ""}</span>
                <label className="flex items-center gap-2 text-sm font-medium"><input type="checkbox" checked={!!q.approved} onChange={(e) => setQ(q.id, { approved: e.target.checked })} /> Approved</label>
              </div>
              <textarea className="input" rows={2} value={q.text} onChange={(e) => setQ(q.id, { text: e.target.value })} />
              {q.options.map((o, i) => (
                <div key={i} className="flex items-center gap-2">
                  <input type="radio" className="accent-[#00693e]" checked={q.correctAnswer === i} onChange={() => setQ(q.id, { correctAnswer: i })} title="Mark correct" />
                  <input className={`input ${q.correctAnswer === i ? "!border-green-500 bg-green-50" : ""}`} value={o} onChange={(e) => setQ(q.id, { options: q.options.map((x, j) => (j === i ? e.target.value : x)) })} />
                </div>
              ))}
              <input className="input" placeholder="Explanation shown to students" value={q.explanation ?? ""} onChange={(e) => setQ(q.id, { explanation: e.target.value })} />
              <div className="flex flex-wrap gap-1.5">
                {draft.concepts.map((c) => {
                  const on = q.conceptIds.includes(c.id);
                  return <button key={c.id} onClick={() => setQ(q.id, { conceptIds: on ? q.conceptIds.filter((x) => x !== c.id) : [...q.conceptIds, c.id] })} className={`chip ${on ? "!bg-[#00693e] !text-white" : ""}`}>{c.name}</button>;
                })}
              </div>
              <button className="text-sm text-red-600 hover:underline" onClick={() => patch({ questions: draft.questions.filter((x) => x.id !== q.id) })}>Remove question</button>
            </div>
          ))}
        </div>
      )}

      <div className="fixed inset-x-0 bottom-0 border-t border-stone-200 bg-white/95 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-6 py-3">
          <p className="text-sm text-stone-600">{approved === 0 ? "Approve at least one question to publish." : `${approved} approved question${approved > 1 ? "s" : ""} will be used.`}{err && <span className="ml-2 text-red-600">{err}</span>}</p>
          <button className="btn" disabled={!approved} onClick={publish}>Publish &amp; get student link →</button>
        </div>
      </div>
    </div>
  );
}
