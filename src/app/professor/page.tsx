"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { Button, Card, ErrorNote, Header } from "@backend/components/ui";
import type { Concept, CourseMaterial, Edge, Question } from "@backend/lib/types";

const DRAFT_KEY = "sapient:draft";
const WEIGHTS = [0.1, 0.2, 0.3, 0.4, 0.5];

function nextId(prefix: string, existing: { id: string }[]) {
  const n = existing.reduce((m, x) => Math.max(m, Number(x.id.replace(/\D/g, "")) || 0), 0);
  return `${prefix}${n + 1}`;
}

export default function ProfessorWorkspace() {
  const router = useRouter();
  const [material, setMaterial] = useState<CourseMaterial | null>(null);
  const [source, setSource] = useState<string | null>(null);
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState<"concepts" | "questions">("concepts");

  useEffect(() => {
    try {
      const saved = localStorage.getItem(DRAFT_KEY);
      if (saved) setMaterial(JSON.parse(saved));
    } catch {}
  }, []);
  useEffect(() => {
    try {
      if (material) localStorage.setItem(DRAFT_KEY, JSON.stringify(material));
    } catch {}
  }, [material]);

  async function generate(useSample: boolean) {
    setError(null);
    setBusy(useSample ? "Loading sample…" : "Reading PDF and drafting concepts & questions… (this can take a minute)");
    const form = new FormData();
    if (useSample) form.set("sample", "1");
    else if (file) form.set("file", file);
    const res = await fetch("/api/generate", { method: "POST", body: form });
    const data = await res.json();
    setBusy(null);
    if (!res.ok) return setError(data.error);
    setMaterial(data.material);
    setSource(data.source === "ai" ? `AI draft from ${file?.name} (${data.pageCount} pages)` : "Pre-generated sample (Fourier analysis notes)");
    setTab("concepts");
  }

  async function publish() {
    if (!material) return;
    setError(null);
    setBusy("Opening room…");
    const res = await fetch("/api/rooms", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ material }),
    });
    const data = await res.json();
    setBusy(null);
    if (!res.ok) return setError(data.error);
    router.push(`/r/${data.code}/dashboard`);
  }

  const update = (fn: (m: CourseMaterial) => CourseMaterial) => setMaterial((m) => (m ? fn(structuredClone(m)) : m));

  return (
    <>
      <Header subtitle="Professor workspace" />
      <main className="mx-auto max-w-6xl space-y-6 px-4 py-8">
        <Card>
          <h2 className="font-semibold">1. Upload lecture material</h2>
          <p className="mt-1 text-sm text-slate-600">
            Claude reads the PDF and proposes 8–12 concepts, a few relationships, and about 8 questions. Everything is a draft until you verify it.
          </p>
          <div className="mt-4 flex flex-wrap items-center gap-3">
            <input type="file" accept="application/pdf" onChange={(e) => setFile(e.target.files?.[0] ?? null)} className="text-sm" />
            <Button onClick={() => generate(false)} disabled={!file || !!busy}>
              Generate draft
            </Button>
            <span className="text-sm text-slate-400">or</span>
            <Button variant="secondary" onClick={() => generate(true)} disabled={!!busy}>
              Use sample Fourier notes
            </Button>
          </div>
          {busy && <p className="mt-3 animate-pulse text-sm text-indigo-700">{busy}</p>}
          <div className="mt-3">
            <ErrorNote message={error} />
          </div>
        </Card>

        {material && (
          <>
            <div className="flex flex-wrap items-end justify-between gap-4">
              <div className="flex-1">
                {source && <p className="text-xs text-slate-500">{source}</p>}
                <input
                  value={material.title}
                  onChange={(e) => update((m) => ({ ...m, title: e.target.value }))}
                  className="w-full bg-transparent text-2xl font-bold outline-none"
                />
              </div>
              <div className="flex gap-1 rounded-lg bg-slate-100 p-1">
                {(["concepts", "questions"] as const).map((t) => (
                  <button
                    key={t}
                    onClick={() => setTab(t)}
                    className={`rounded-md px-3 py-1.5 text-sm font-medium ${tab === t ? "bg-white shadow-sm" : "text-slate-600"}`}
                  >
                    {t === "concepts" ? "2. Concept map" : "3. Questions"}
                  </button>
                ))}
              </div>
            </div>

            {tab === "concepts" ? <ConceptEditor material={material} update={update} /> : <QuestionEditor material={material} update={update} />}

            <PublishBar material={material} onPublish={publish} busy={!!busy} />
          </>
        )}
      </main>
    </>
  );
}

type Updater = (fn: (m: CourseMaterial) => CourseMaterial) => void;

function ConceptEditor({ material, update }: { material: CourseMaterial; update: Updater }) {
  const setConcept = (id: string, patch: Partial<Concept>) =>
    update((m) => ({ ...m, concepts: m.concepts.map((c) => (c.id === id ? { ...c, ...patch } : c)) }));
  const removeConcept = (id: string) =>
    update((m) => ({
      ...m,
      concepts: m.concepts.filter((c) => c.id !== id),
      edges: m.edges.filter((e) => e.source !== id && e.target !== id),
      questions: m.questions.map((q) => ({ ...q, conceptIds: q.conceptIds.filter((c) => c !== id) })),
    }));
  const setEdge = (i: number, patch: Partial<Edge>) => update((m) => ({ ...m, edges: m.edges.map((e, j) => (j === i ? { ...e, ...patch } : e)) }));
  const name = (id: string) => material.concepts.find((c) => c.id === id)?.name ?? id;

  return (
    <div className="grid gap-6 lg:grid-cols-[3fr_2fr]">
      <section>
        <div className="mb-2 flex items-center justify-between">
          <h3 className="font-semibold">Concepts</h3>
          <Button
            variant="secondary"
            onClick={() =>
              update((m) => ({
                ...m,
                concepts: [...m.concepts, { id: nextId("c", m.concepts), name: "New concept", description: "", foundational: false, verified: true, sourcePage: null }],
              }))
            }
          >
            + Add concept
          </Button>
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          {material.concepts.map((c) => (
            <Card key={c.id} className={c.verified ? "border-emerald-300" : ""}>
              <div className="flex items-start justify-between gap-2">
                <input value={c.name} onChange={(e) => setConcept(c.id, { name: e.target.value })} className="w-full font-medium outline-none" />
                <button onClick={() => removeConcept(c.id)} className="text-slate-400 hover:text-rose-600" title="Remove concept">
                  ✕
                </button>
              </div>
              <textarea
                value={c.description}
                onChange={(e) => setConcept(c.id, { description: e.target.value })}
                rows={2}
                className="mt-1 w-full resize-none text-xs text-slate-600 outline-none"
              />
              <div className="mt-2 flex flex-wrap items-center gap-3 text-xs">
                <label className="flex items-center gap-1">
                  <input type="checkbox" checked={c.foundational} onChange={(e) => setConcept(c.id, { foundational: e.target.checked })} />
                  Foundational
                </label>
                <label className="flex items-center gap-1">
                  <input type="checkbox" checked={c.verified} onChange={(e) => setConcept(c.id, { verified: e.target.checked })} />
                  Verified
                </label>
                <span className="ml-auto text-slate-400">{c.sourcePage ? `p. ${c.sourcePage}` : "no page ref"}</span>
              </div>
            </Card>
          ))}
        </div>
      </section>

      <section>
        <div className="mb-2 flex items-center justify-between">
          <h3 className="font-semibold">Relationships</h3>
          <Button
            variant="secondary"
            disabled={material.concepts.length < 2}
            onClick={() =>
              update((m) => ({
                ...m,
                edges: [...m.edges, { source: m.concepts[0].id, target: m.concepts[1].id, weight: 0.2, rationale: "" }],
              }))
            }
          >
            + Connect
          </Button>
        </div>
        <p className="mb-3 text-xs text-slate-500">
          Suggestions, not validated prerequisites. A correct or incorrect answer passes a small, tentative signal (the weight) one hop to connected concepts.
        </p>
        <div className="space-y-2">
          {material.edges.map((e, i) => (
            <Card key={i} className="p-3">
              <div className="flex items-center gap-2 text-sm">
                <ConceptSelect concepts={material.concepts} value={e.source} onChange={(v) => setEdge(i, { source: v })} />
                <span className="text-slate-400">↔</span>
                <ConceptSelect concepts={material.concepts} value={e.target} onChange={(v) => setEdge(i, { target: v })} />
                <select value={e.weight} onChange={(ev) => setEdge(i, { weight: Number(ev.target.value) })} className="rounded border border-slate-200 px-1 text-xs">
                  {WEIGHTS.map((w) => (
                    <option key={w} value={w}>
                      {w}
                    </option>
                  ))}
                </select>
                <button onClick={() => update((m) => ({ ...m, edges: m.edges.filter((_, j) => j !== i) }))} className="text-slate-400 hover:text-rose-600">
                  ✕
                </button>
              </div>
              <input
                value={e.rationale}
                onChange={(ev) => setEdge(i, { rationale: ev.target.value })}
                placeholder={`Why ${name(e.source)} relates to ${name(e.target)}`}
                className="mt-1 w-full text-xs text-slate-500 outline-none"
              />
            </Card>
          ))}
        </div>
      </section>
    </div>
  );
}

function ConceptSelect({ concepts, value, onChange }: { concepts: Concept[]; value: string; onChange: (v: string) => void }) {
  return (
    <select value={value} onChange={(e) => onChange(e.target.value)} className="min-w-0 flex-1 rounded border border-slate-200 px-1 py-0.5 text-xs">
      {concepts.map((c) => (
        <option key={c.id} value={c.id}>
          {c.name}
        </option>
      ))}
    </select>
  );
}

function QuestionEditor({ material, update }: { material: CourseMaterial; update: Updater }) {
  const setQ = (id: string, patch: Partial<Question>) =>
    update((m) => ({ ...m, questions: m.questions.map((q) => (q.id === id ? { ...q, ...patch } : q)) }));

  return (
    <section className="space-y-3">
      <div className="flex items-center justify-between">
        <p className="text-sm text-slate-600">Check wording, the answer key, concept tags, and explanation. Only approved questions are published.</p>
        <Button
          variant="secondary"
          onClick={() =>
            update((m) => ({
              ...m,
              questions: [
                ...m.questions,
                { id: nextId("q", m.questions), text: "", options: ["", "", "", ""], correctAnswer: 0, conceptIds: [], explanation: "", sourcePage: null, approved: false, status: "active", revision: 0 },
              ],
            }))
          }
        >
          + Add question
        </Button>
      </div>
      {material.questions.map((q, n) => (
        <Card key={q.id} className={q.approved ? "border-emerald-400 bg-emerald-50/30" : ""}>
          <div className="flex items-start gap-3">
            <span className="mt-1 text-xs font-semibold text-slate-400">Q{n + 1}</span>
            <textarea value={q.text} onChange={(e) => setQ(q.id, { text: e.target.value })} rows={2} className="flex-1 resize-none rounded border border-slate-200 p-2 text-sm" />
            <div className="flex flex-col items-end gap-2">
              <Button variant={q.approved ? "secondary" : "primary"} onClick={() => setQ(q.id, { approved: !q.approved })} disabled={!q.text || q.conceptIds.length === 0}>
                {q.approved ? "✓ Approved" : "Approve"}
              </Button>
              <button onClick={() => update((m) => ({ ...m, questions: m.questions.filter((x) => x.id !== q.id) }))} className="text-xs text-slate-400 hover:text-rose-600">
                Delete
              </button>
            </div>
          </div>
          <div className="mt-3 grid gap-2 pl-8 sm:grid-cols-2">
            {q.options.map((opt, i) => (
              <label key={i} className={`flex items-center gap-2 rounded border px-2 py-1 text-sm ${q.correctAnswer === i ? "border-emerald-400 bg-emerald-50" : "border-slate-200"}`}>
                <input type="radio" name={`key-${q.id}`} checked={q.correctAnswer === i} onChange={() => setQ(q.id, { correctAnswer: i })} title="Mark as correct answer" />
                <input value={opt} onChange={(e) => setQ(q.id, { options: q.options.map((o, j) => (j === i ? e.target.value : o)) })} className="flex-1 bg-transparent outline-none" />
              </label>
            ))}
          </div>
          <div className="mt-3 space-y-2 pl-8">
            <div className="flex flex-wrap gap-1">
              {material.concepts.map((c) => {
                const on = q.conceptIds.includes(c.id);
                return (
                  <button
                    key={c.id}
                    onClick={() => setQ(q.id, { conceptIds: on ? q.conceptIds.filter((x) => x !== c.id) : [...q.conceptIds, c.id] })}
                    className={`rounded-full border px-2 py-0.5 text-xs ${on ? "border-indigo-400 bg-indigo-100 text-indigo-800" : "border-slate-200 text-slate-500"}`}
                  >
                    {c.name}
                  </button>
                );
              })}
            </div>
            <input
              value={q.explanation}
              onChange={(e) => setQ(q.id, { explanation: e.target.value })}
              placeholder="Explanation shown after answering"
              className="w-full rounded border border-slate-200 px-2 py-1 text-xs"
            />
            <p className="text-xs text-slate-400">{q.sourcePage ? `Source: page ${q.sourcePage}` : "No source page"}</p>
          </div>
        </Card>
      ))}
    </section>
  );
}

function PublishBar({ material, onPublish, busy }: { material: CourseMaterial; onPublish: () => void; busy: boolean }) {
  const verified = material.concepts.filter((c) => c.verified).length;
  const approved = material.questions.filter((q) => q.approved).length;
  return (
    <div className="sticky bottom-4 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-slate-300 bg-white/95 px-4 py-3 shadow-lg backdrop-blur">
      <div className="text-sm">
        <span className={verified === material.concepts.length ? "text-emerald-700" : "text-amber-700"}>
          {verified}/{material.concepts.length} concepts verified
        </span>
        <span className="mx-2 text-slate-300">·</span>
        <span className={approved >= 3 ? "text-emerald-700" : "text-amber-700"}>{approved} questions approved</span>
        {approved < 3 && <span className="ml-2 text-xs text-slate-500">(approve at least 3)</span>}
      </div>
      <Button onClick={onPublish} disabled={busy || approved < 3} className="px-5 py-2">
        Open room for students →
      </Button>
    </div>
  );
}
