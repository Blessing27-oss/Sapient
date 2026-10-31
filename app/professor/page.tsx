"use client";
import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import Graph from "@/components/Graph";
import ProfessorGate from "@/components/ProfessorGate";
import QuestionList from "@/components/QuestionList";
import ShareCard from "@/components/ShareCard";
import { questionProblems } from "@/lib/questions";
import { PALETTE } from "@/lib/ui";
import type { Concept, Edge, Question } from "@/lib/types";

type Draft = { title: string; concepts: Concept[]; edges: Edge[]; questions: Question[]; note?: string };

// Removing a concept also removes its connections and detaches it from questions (a question left with no concept is dropped).
const dropConcept = (d: Draft, id: string): Draft => ({
  ...d,
  concepts: d.concepts.filter((c) => c.id !== id),
  edges: d.edges.filter((e) => e.source !== id && e.target !== id),
  questions: d.questions.map((q) => ({ ...q, conceptIds: q.conceptIds.filter((x) => x !== id) })).filter((q) => q.conceptIds.length),
});

export default function ProfessorPage() {
  return <ProfessorGate><Workspace /></ProfessorGate>;
}

function Workspace() {
  const [draft, setDraft] = useState<Draft | null>(null);
  const [busy, setBusy] = useState(false);
  const [tab, setTab] = useState<"map" | "questions">("map");
  const [sel, setSel] = useState<string | null>(null);
  const [selEdge, setSelEdge] = useState<number | null>(null);
  const nameRef = useRef<HTMLInputElement>(null);
  const [focusName, setFocusName] = useState(0); // bumped when a concept is added from the button, to jump straight to renaming it
  useEffect(() => { if (focusName) { nameRef.current?.focus(); nameRef.current?.select(); } }, [focusName]);
  const [err, setErr] = useState("");
  const [code, setCode] = useState("");
  const [rooms, setRooms] = useState<{ code: string; title: string; students: number }[]>([]);
  useEffect(() => { fetch("/api/me/rooms").then((r) => r.json()).then((j) => setRooms(j.rooms ?? [])); }, []);

  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement;
      if ((e.key !== "Delete" && e.key !== "Backspace") || /INPUT|TEXTAREA|SELECT/.test(t.tagName)) return;
      if (selEdge !== null) {
        setDraft((d) => d && { ...d, edges: d.edges.filter((_, i) => i !== selEdge) });
        setSelEdge(null);
      } else if (sel) {
        setDraft((d) => d && dropConcept(d, sel));
        setSel(null);
      }
    };
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, [selEdge, sel]);

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
      <div className="grid items-start gap-10 lg:grid-cols-[1.2fr_1fr]">
        <div className="space-y-6">
          <div>
            <p className="text-sm font-semibold fold-text">Step 1 of 3</p>
            <h1 className="text-4xl font-bold">Upload your lecture</h1>
            <p className="mt-2 text-stone-600">We read your PDF and propose the key concepts, how they connect, and quiz questions. You review and correct everything before any student sees it.</p>
          </div>
          <label className={`flex cursor-pointer flex-col items-center justify-center rounded-2xl border-2 border-dashed border-stone-300 bg-white px-8 py-16 text-center transition hover:border-[#00693e] hover:bg-[#f1f8f5]/40 ${busy ? "pointer-events-none opacity-60" : ""}`}>
            <span className="flex h-16 w-16 items-center justify-center rounded-2xl bg-[#f1f8f5] text-3xl">📄</span>
            <span className="mt-4 text-lg font-semibold">{busy ? "Reading your lecture and building the concept map…" : "Click to choose a PDF"}</span>
            <span className="mt-1 text-sm text-stone-500">Lecture notes or slides · text-based PDFs work best</span>
            <input type="file" accept="application/pdf" className="hidden" onChange={(e) => e.target.files?.[0] && generate(e.target.files[0])} />
          </label>
          {err && <p role="alert" className="rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700">{err}</p>}
          {rooms.length > 0 && (
            <div className="card space-y-2">
              <h2 className="text-lg font-bold">Your rooms</h2>
              {rooms.map((r) => (
                <Link key={r.code} href={`/dashboard/${r.code}`} className="flex items-center justify-between rounded-lg border border-stone-200 px-3 py-2 text-sm hover:border-[#00693e] hover:bg-[#f1f8f5]">
                  <span className="font-medium">{r.title}</span>
                  <span className="text-stone-500"><span className="font-mono">{r.code}</span> · {r.students} student{r.students === 1 ? "" : "s"}</span>
                </Link>
              ))}
            </div>
          )}
        </div>

        <div className="card space-y-5">
          <h2 className="text-xl font-bold">How it works</h2>
          {[
            ["Upload", "Add a lecture PDF."],
            ["Review the map", "Edit concepts, drag to connect them, and approve each question."],
            ["Share a code", "Students join with a 4-letter code or link, no accounts needed."],
            ["See the gaps", "Each student answers 3 adaptive questions. Your dashboard shows where the class is stuck."],
          ].map(([t, d], i) => (
            <div key={t} className="flex gap-4">
              <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full fold text-sm font-bold text-white">{i + 1}</span>
              <div><p className="font-semibold">{t}</p><p className="text-sm text-stone-500">{d}</p></div>
            </div>
          ))}
          <p className="border-t pt-4 text-xs text-stone-500">Nothing is used in a live room until you approve it. You stay in control of what counts as knowledge worth assessing.</p>
        </div>
      </div>
    );

  const patch = (p: Partial<Draft>) => setDraft({ ...draft, ...p });
  const setConcept = (id: string, p: Partial<Concept>) => patch({ concepts: draft.concepts.map((c) => (c.id === id ? { ...c, ...p } : c)) });
  const setQ = (id: string, p: Partial<Question>) => patch({ questions: draft.questions.map((q) => (q.id === id ? { ...q, ...p } : q)) });
  const nameOf = (id: string) => draft.concepts.find((c) => c.id === id)?.name ?? id;
  const sc = draft.concepts.find((c) => c.id === sel);
  const removeConcept = (id: string) => { setDraft(dropConcept(draft, id)); setSel(null); };
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
  const conceptIds = draft.concepts.map((c) => c.id);
  const approved = draft.questions.filter((q) => q.approved && !questionProblems(q, conceptIds).length).length;

  async function publish() {
    if (approved === 0 && !confirm("No questions are approved yet, so students will have nothing to answer until you approve or add some from the dashboard. Publish anyway?")) return;
    setErr("");
    const r = await fetch("/api/rooms", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(draft) });
    const j = await r.json();
    if (!r.ok) return setErr(j.error);
    setCode(j.code);
  }

  return (
    <div className="space-y-6 pb-24">
      <div>
        <p className="text-sm font-semibold fold-text">Step 2 of 3 · Review</p>
        <input className="w-full bg-transparent font-serif text-3xl font-bold outline-none focus:underline" value={draft.title} onChange={(e) => patch({ title: e.target.value })} />
        {draft.note && <p className="mt-1 text-sm text-amber-700">{draft.note}</p>}
      </div>

      <div className="flex gap-1 border-b border-stone-200">
        {([["map", `Concept map (${draft.concepts.length})`], ["questions", `Questions (${approved}/${draft.questions.length} approved)`]] as const).map(([k, label]) => (
          <button key={k} onClick={() => setTab(k)} className={`-mb-px border-b-2 px-4 py-2 text-sm font-semibold ${tab === k ? "fold-tab fold-text" : "border-transparent text-stone-500"}`}>{label}</button>
        ))}
      </div>

      <div className={tab === "map" ? "" : "hidden"}>
        <div className="grid gap-6 lg:grid-cols-[1fr_320px]">
          <div className="space-y-2">
            <Graph
              nodes={draft.concepts.map((c, i) => ({ id: c.id, name: (c.foundational ? "★ " : "") + c.name, editName: c.name, fill: PALETTE[i % PALETTE.length].fill, accent: PALETTE[i % PALETTE.length].accent, flag: c.verified ? undefined : "#f59e0b" }))}
              solidRoot
              edges={draft.edges}
              selected={sel}
              onSelect={(id) => { setSel(id); if (id) setSelEdge(null); }}
              selectedEdge={selEdge}
              onSelectEdge={(i) => { setSelEdge(i); if (i !== null) setSel(null); }}
              onConnect={connect}
              onDeleteNode={removeConcept}
              onDeleteEdge={(i) => { setDraft({ ...draft, edges: draft.edges.filter((_, j) => j !== i) }); setSelEdge(null); }}
              onRename={(id, name) => setConcept(id, { name })}
              onAddNode={() => addConcept()}
            />
            <p className="text-xs text-stone-500">
              <b>Drag</b> a concept to move it · drag its green <b>+</b> onto another concept to draw an arrow · hover an arrow and click its red ✕ to delete it (or select it and press <b>Delete</b>) · <b>double-click</b> a concept to rename it · <b>double-click</b> empty space to add one. The top concept is the main topic; arrows lead to what builds on it. ★ = foundational, amber dot = not yet verified. Arrows show teaching order only and don’t change how scores are inferred.
            </p>
          </div>
          <div className="card space-y-3 self-start">
            {se && selEdge !== null ? (
              <>
                <p className="text-sm font-semibold">Relationship</p>
                <p className="text-sm font-medium">{nameOf(se.source)} <span className="text-stone-400">→</span> {nameOf(se.target)}</p>
                <button className="btn-ghost w-full" onClick={() => patch({ edges: draft.edges.map((x, i) => (i === selEdge ? { ...x, source: x.target, target: x.source } : x)) })}>⇄ Flip direction</button>
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
                <input ref={nameRef} className="input font-semibold" value={sc.name} onChange={(e) => setConcept(sc.id, { name: e.target.value })} />
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
            <button className="btn-ghost w-full" onClick={() => { addConcept(); setFocusName((n) => n + 1); }}>+ Add concept</button>
          </div>
        </div>
      </div>

      {tab === "questions" && <QuestionList questions={draft.questions} concepts={draft.concepts} onChange={(questions) => patch({ questions })} />}

      <div className="fixed inset-x-0 bottom-0 border-t border-stone-200 bg-white/95 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-6 py-3">
          <p className="text-sm text-stone-600">{approved === 0 ? "No questions approved yet — you can still publish." : `${approved} approved question${approved > 1 ? "s" : ""} will be used.`}{err && <span className="ml-2 text-red-600">{err}</span>}</p>
          <button className="btn" onClick={publish}>Publish &amp; get student link →</button>
        </div>
      </div>
    </div>
  );
}
