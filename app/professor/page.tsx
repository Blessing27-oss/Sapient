"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import TopicMapView, { type MapEditor, type MapSelection } from "@/components/TopicMapView";
import ProfessorGate from "@/components/ProfessorGate";
import QuestionList from "@/components/QuestionList";
import ShareCard from "@/components/ShareCard";
import { questionProblems } from "@/lib/questions";
import { addMapLink, addMapNode, connectMapNodes, fallbackTopicMap, removeMapEdge, removeMapLink, removeMapNode, sectionsByNode, updateMapEdge, updateMapNode } from "@/lib/topicMap";
import type { Concept, Edge, MapNode, Question, TopicMap } from "@/lib/types";

type Draft = { title: string; concepts: Concept[]; edges: Edge[]; questions: Question[]; sourceId?: string; topicMap?: TopicMap; note?: string };

// The lecture map being edited; drafts from before topic maps get one built from their concepts.
const mapOf = (d: Draft): TopicMap => d.topicMap ?? fallbackTopicMap(d.concepts, d.edges);
const findNode = (m: TopicMap, id: string): MapNode | undefined => m.sections.flatMap((s) => s.nodes).find((n) => n.id === id);
const sameEdge = (e: Edge, a: string, b: string) => (e.source === a && e.target === b) || (e.source === b && e.target === a);
const newId = (prefix: string) => `${prefix}${Date.now().toString(36)}${Math.random().toString(36).slice(2, 5)}`;

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
  const [sources, setSources] = useState<{ id: string; filename: string; pageCount: number }[]>([]);
  const loadSources = () => fetch("/api/sources").then((r) => r.json()).then((data) => setSources(data.sources ?? [])).catch(() => {});
  useEffect(() => { loadSources(); }, []);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [busy, setBusy] = useState(false);
  const [tab, setTab] = useState<"map" | "questions">("map");
  const [mapSel, setMapSel] = useState<MapSelection>(null);
  const [err, setErr] = useState("");
  const [code, setCode] = useState("");
  const [rooms, setRooms] = useState<{ code: string; title: string; students: number }[]>([]);
  useEffect(() => { fetch("/api/me/rooms").then((r) => r.json()).then((j) => setRooms(j.rooms ?? [])); }, []);

  // Map edits. Each one reads the latest draft, so a rename committed on blur can't undo another change.
  const edit = (fn: (d: Draft) => Draft) => setDraft((d) => (d ? fn(d) : d));
  const deleteNode = (nodeId: string) => {
    edit((d) => {
      const n = findNode(mapOf(d), nodeId);
      const next = { ...d, topicMap: removeMapNode(mapOf(d), nodeId) };
      return n?.conceptId ? dropConcept(next, n.conceptId) : next;
    });
    setMapSel(null);
  };
  // An arrow between two assessed concepts is also an assessment connection; keep the two in step.
  const deleteArrow = (sectionId: string, index: number) => {
    edit((d) => {
      const m = mapOf(d), e = m.sections.find((s) => s.id === sectionId)?.edges[index];
      const a = e && findNode(m, e.source)?.conceptId, b = e && findNode(m, e.target)?.conceptId;
      return { ...d, topicMap: removeMapEdge(m, sectionId, index), edges: a && b ? d.edges.filter((x) => !sameEdge(x, a, b)) : d.edges };
    });
    setMapSel(null);
  };
  const editor: MapEditor = {
    selection: mapSel,
    onSelect: setMapSel,
    onAddNode: (sectionId) => {
      const id = newId("n"), conceptId = newId("c");
      edit((d) => ({
        ...d,
        concepts: [...d.concepts, { id: conceptId, name: "New concept", importance: 1, verified: true }],
        topicMap: addMapNode(mapOf(d), sectionId, { id, label: "New concept", details: [], conceptId }),
      }));
      setMapSel({ kind: "node", sectionId, nodeId: id });
      return id;
    },
    onRename: (nodeId, label) => edit((d) => {
      const n = findNode(mapOf(d), nodeId);
      return {
        ...d,
        topicMap: updateMapNode(mapOf(d), nodeId, { label }),
        concepts: n?.conceptId ? d.concepts.map((c) => (c.id === n.conceptId ? { ...c, name: label } : c)) : d.concepts,
      };
    }),
    onConnect: (sectionId, source, target) => edit((d) => {
      const m = mapOf(d), a = findNode(m, source)?.conceptId, b = findNode(m, target)?.conceptId;
      const linkConcepts = a && b && !d.edges.some((e) => sameEdge(e, a, b));
      return {
        ...d,
        topicMap: connectMapNodes(m, sectionId, source, target),
        edges: linkConcepts ? [...d.edges, { source: a, target: b, weight: 0.3, type: "related" as const }] : d.edges,
      };
    }),
  };

  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement;
      if ((e.key !== "Delete" && e.key !== "Backspace") || /INPUT|TEXTAREA|SELECT/.test(t.tagName) || !mapSel) return;
      if (mapSel.kind === "edge") deleteArrow(mapSel.sectionId, mapSel.index);
      else deleteNode(mapSel.nodeId);
    };
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  });

  async function generate(file?: File | null, sourceId?: string) {
    setBusy(true); setErr("");
    const fd = new FormData();
    if (file) fd.append("pdf", file);
    if (sourceId) fd.append("sourceId", sourceId);
    try {
      const r = await fetch("/api/generate", { method: "POST", body: fd });
      if (r.status === 401) { location.reload(); return; }
      const d = await r.json();
      if (!r.ok) throw new Error(d.error ?? "Could not generate material.");
      setDraft(d); setMapSel(null);
    } catch (error) {
      setErr(error instanceof Error ? error.message : "Could not generate material.");
    } finally {
      setBusy(false);
      loadSources();
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
            <p className="text-sm font-semibold text-[#00693e]">Step 1 of 3</p>
            <h1 className="text-4xl font-bold">Upload your lecture</h1>
            <p className="mt-2 text-stone-600">We read your PDF and propose the key concepts, how they connect, and quiz questions. You review and correct everything before any student sees it.</p>
          </div>
          <label className={`flex cursor-pointer flex-col items-center justify-center rounded-2xl border-2 border-dashed border-stone-300 bg-white px-8 py-16 text-center transition hover:border-[#00693e] hover:bg-green-50/40 ${busy ? "pointer-events-none opacity-60" : ""}`}>
            <span className="flex h-16 w-16 items-center justify-center rounded-2xl bg-green-50 text-3xl">📄</span>
            <span className="mt-4 text-lg font-semibold">{busy ? "Reading your lecture and building the concept map…" : "Click to choose a PDF"}</span>
            <span className="mt-1 text-sm text-stone-500">Lecture notes or slides · text-based PDFs work best</span>
            <input type="file" accept="application/pdf" className="hidden" onChange={(e) => e.target.files?.[0] && generate(e.target.files[0])} />
          </label>
          {err && <p role="alert" className="rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700">{err}</p>}
          {sources.length > 0 && (
            <div className="card space-y-2">
              <h2 className="text-lg font-bold">Saved lecture sources</h2>
              <p className="text-xs text-stone-500">Reuse extracted lecture text without uploading or parsing the PDF again.</p>
              {sources.map((source) => <button key={source.id} disabled={busy} className="btn-ghost w-full justify-between text-left" onClick={() => generate(null, source.id)}>
                <span>{source.filename}</span><span>{source.pageCount} pages · Generate draft</span>
              </button>)}
            </div>
          )}
          {rooms.length > 0 && (
            <div className="card space-y-2">
              <h2 className="text-lg font-bold">Your rooms</h2>
              {rooms.map((r) => (
                <Link key={r.code} href={`/dashboard/${r.code}`} className="flex items-center justify-between rounded-lg border border-stone-200 px-3 py-2 text-sm hover:border-[#00693e] hover:bg-green-50">
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
            ["Share a code", "Students sign in and join with a 4-letter code or link."],
            ["See the gaps", "Each student answers 3 adaptive questions. Your dashboard shows where the class is stuck."],
          ].map(([t, d], i) => (
            <div key={t} className="flex gap-4">
              <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[#00693e] text-sm font-bold text-white">{i + 1}</span>
              <div><p className="font-semibold">{t}</p><p className="text-sm text-stone-500">{d}</p></div>
            </div>
          ))}
          <p className="border-t pt-4 text-xs text-stone-500">Nothing is used in a live room until you approve it. You stay in control of what counts as knowledge worth assessing.</p>
        </div>
      </div>
    );

  const patch = (p: Partial<Draft>) => setDraft({ ...draft, ...p });
  const setConcept = (id: string, p: Partial<Concept>) => patch({ concepts: draft.concepts.map((c) => (c.id === id ? { ...c, ...p } : c)) });
  const nameOf = (id: string) => draft.concepts.find((c) => c.id === id)?.name ?? id;
  const map = mapOf(draft);
  const label = (nodeId: string) => findNode(map, nodeId)?.label ?? nodeId;
  const homes = sectionsByNode(map.sections);
  const graphNo = (sectionId: string) => map.sections.findIndex((s) => s.id === sectionId) + 1;
  const connect = (a: string, b: string) => {
    if (!b || a === b || draft.edges.some((e) => sameEdge(e, a, b))) return;
    patch({ edges: [...draft.edges, { source: a, target: b, weight: 0.3, type: "related" }] });
  };
  const selNode = mapSel?.kind === "node" ? findNode(map, mapSel.nodeId) : undefined;
  const selEdge = mapSel?.kind === "edge" ? map.sections.find((s) => s.id === mapSel.sectionId)?.edges[mapSel.index] : undefined;
  const sc = selNode?.conceptId ? draft.concepts.find((c) => c.id === selNode.conceptId) : undefined;
  const onMap = new Set(map.sections.flatMap((s) => s.nodes.map((n) => n.conceptId)));
  const offMap = draft.concepts.filter((c) => !onMap.has(c.id));
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
        <p className="text-sm font-semibold text-[#00693e]">Step 2 of 3 · Review</p>
        <input className="w-full bg-transparent font-serif text-3xl font-bold outline-none focus:underline" value={draft.title} onChange={(e) => patch({ title: e.target.value })} />
        {draft.note && <p className="mt-1 text-sm text-amber-700">{draft.note}</p>}
      </div>

      <div className="flex gap-1 border-b border-stone-200">
        {([["map", `Concept map (${draft.concepts.length})`], ["questions", `Questions (${approved}/${draft.questions.length} approved)`]] as const).map(([k, label]) => (
          <button key={k} onClick={() => setTab(k)} className={`-mb-px border-b-2 px-4 py-2 text-sm font-semibold ${tab === k ? "border-[#00693e] text-[#00693e]" : "border-transparent text-stone-500"}`}>{label}</button>
        ))}
      </div>

      {/* The map keeps the full width; the edit panel floats beside it only while something is selected. */}
      <div className={tab === "map" ? "space-y-4" : "hidden"}>
        <div className="min-w-0 space-y-2">
          <TopicMapView title={draft.title} map={map} editor={editor}
            styleFor={(n) => {
              const c = draft.concepts.find((x) => x.id === n.conceptId);
              if (!c) return { fill: "#fafaf9", stroke: "#d6d3d1" };
              return { fill: c.foundational ? "#dcfce7" : "#ffffff", stroke: "#78716c", dashed: !c.verified };
            }}
            legend={<span>Bordered boxes are assessed concepts (dashed = not yet verified) · grey boxes are lecture context</span>} />
          <p className="text-xs text-stone-500">
            <b>Click</b> a box or arrow to edit it in the panel · <b>double-click</b> a box to rename it · <b>double-click</b> empty space (or use + Add node) to add one · drag a box’s green <b>+</b> onto another box to draw an arrow · <b>Delete</b> removes the selection.
          </p>
        </div>

        {offMap.length > 0 && (
          <div className="card space-y-1.5">
            <p className="text-sm font-medium text-stone-700">Assessed concepts not on the map — click to place one in graph 1:</p>
            <div className="flex flex-wrap gap-1.5">
              {offMap.map((c) => (
                <button key={c.id} className="chip hover:bg-green-50" onClick={() => {
                  const id = newId("n"), sectionId = map.sections[0].id;
                  edit((d) => ({ ...d, topicMap: addMapNode(mapOf(d), sectionId, { id, label: c.name, details: c.description ? [c.description] : [], conceptId: c.id }) }));
                  setMapSel({ kind: "node", sectionId, nodeId: id });
                }}>+ {c.name}</button>
              ))}
            </div>
          </div>
        )}

        {(selNode || selEdge) && (
        <div className="card fixed bottom-20 right-4 z-40 max-h-[calc(100vh-7rem)] w-80 space-y-3 overflow-y-auto shadow-2xl sm:right-6" role="dialog" aria-label="Edit selection">
          <button className="absolute right-3 top-2 text-lg text-stone-400 hover:text-stone-700" onClick={() => setMapSel(null)} aria-label="Close editor">✕</button>
          {selEdge && mapSel?.kind === "edge" ? (
            <>
              <p className="text-sm font-semibold">Arrow · graph {graphNo(mapSel.sectionId)}</p>
              <p className="text-sm font-medium">{label(selEdge.source)} <span className="text-stone-400">→</span> {label(selEdge.target)}</p>
              <div className="flex gap-1 rounded-lg bg-stone-100 p-1 text-sm">
                {([["solid", "Stated / classification"], ["dotted", "Related"]] as const).map(([style, text]) => (
                  <button key={style} className={`flex-1 rounded-md px-2 py-1 ${selEdge.style === style ? "bg-white font-semibold shadow-sm" : "text-stone-500"}`}
                    onClick={() => edit((d) => ({ ...d, topicMap: updateMapEdge(mapOf(d), mapSel.sectionId, mapSel.index, { style }) }))}>{text}</button>
                ))}
              </div>
              <input className="input" placeholder="Label (optional), e.g. predicts" value={selEdge.label ?? ""}
                onChange={(e) => edit((d) => ({ ...d, topicMap: updateMapEdge(mapOf(d), mapSel.sectionId, mapSel.index, { label: e.target.value || undefined }) }))} />
              <button className="btn-ghost w-full" onClick={() => edit((d) => ({ ...d, topicMap: updateMapEdge(mapOf(d), mapSel.sectionId, mapSel.index, { source: selEdge.target, target: selEdge.source }) }))}>⇄ Flip direction</button>
              <button className="btn-ghost w-full !text-red-600" onClick={() => deleteArrow(mapSel.sectionId, mapSel.index)}>Remove arrow</button>
            </>
          ) : selNode ? (
            <>
              <p className="text-xs text-stone-500">
                In graph {[...(homes.get(selNode.id) ?? [])].map(graphNo).join(", ")}{sc?.sourcePage ? ` · source page ${sc.sourcePage}` : ""}
              </p>
              <input className="input font-semibold" value={selNode.label} onChange={(e) => editor.onRename(selNode.id, e.target.value)} />
              <textarea className="input text-sm" rows={3} placeholder="Details, one per line"
                value={selNode.details.join("\n")} onChange={(e) => edit((d) => ({ ...d, topicMap: updateMapNode(mapOf(d), selNode.id, { details: e.target.value.split("\n") }) }))}
                onBlur={() => edit((d) => ({ ...d, topicMap: updateMapNode(mapOf(d), selNode.id, { details: (findNode(mapOf(d), selNode.id)?.details ?? []).map((x) => x.trim()).filter(Boolean) }) }))} />
              {sc ? (
                <div className="space-y-3 border-t pt-3">
                  <p className="text-xs font-semibold uppercase tracking-wide text-stone-500">Assessed concept</p>
                  <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={sc.verified} onChange={(e) => setConcept(sc.id, { verified: e.target.checked })} /> I’ve verified this concept</label>
                  <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={!!sc.foundational} onChange={(e) => setConcept(sc.id, { foundational: e.target.checked, importance: e.target.checked ? 1 : sc.importance })} /> Foundational</label>
                  <label className="block text-sm">Importance: {sc.importance.toFixed(1)}
                    <input type="range" min={0.1} max={1} step={0.1} className="w-full accent-[#00693e]" value={sc.importance} onChange={(e) => setConcept(sc.id, { importance: Number(e.target.value) })} />
                  </label>
                  <div>
                    <p className="mb-1 text-sm font-medium">Evidence connects to</p>
                    <div className="flex flex-wrap gap-1.5">
                      {draft.edges.filter((e) => e.source === sc.id || e.target === sc.id).map((e, i) => (
                        <span key={i} className="chip">{nameOf(e.source === sc.id ? e.target : e.source)} <button className="ml-1 text-stone-400 hover:text-red-600" onClick={() => patch({ edges: draft.edges.filter((x) => x !== e) })}>✕</button></span>
                      ))}
                    </div>
                    <select className="input mt-2" value="" onChange={(e) => connect(sc.id, e.target.value)}>
                      <option value="">+ Connect to…</option>
                      {draft.concepts.filter((o) => o.id !== sc.id).map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}
                    </select>
                    <p className="mt-1 text-xs text-stone-500">A direct answer on one counts as a small hint about the other, never as mastery.</p>
                  </div>
                </div>
              ) : (
                <button className="btn-ghost w-full" onClick={() => {
                  const conceptId = newId("c");
                  edit((d) => ({
                    ...d,
                    concepts: [...d.concepts, { id: conceptId, name: selNode.label, description: selNode.details.join("; "), importance: 0.6, verified: true }],
                    topicMap: updateMapNode(mapOf(d), selNode.id, { conceptId }),
                  }));
                }}>Assess this idea (make it a concept)</button>
              )}
              {map.sections.length > 1 && (
                <div className="space-y-2 border-t pt-3">
                  <p className="text-sm font-medium">Links to other graphs</p>
                  <div className="flex flex-wrap gap-1.5">
                    {map.links.map((e, i) => (e.source === selNode.id || e.target === selNode.id) && (
                      <span key={i} className="chip">{label(e.source === selNode.id ? e.target : e.source)}{e.label ? ` · ${e.label}` : ""}
                        <button className="ml-1 text-stone-400 hover:text-red-600" onClick={() => edit((d) => ({ ...d, topicMap: removeMapLink(mapOf(d), i) }))}>✕</button></span>
                    ))}
                  </div>
                  <select className="input" value="" onChange={(e) => e.target.value && edit((d) => ({ ...d, topicMap: addMapLink(mapOf(d), selNode.id, e.target.value) }))}>
                    <option value="">+ Link to an idea in another graph…</option>
                    {map.sections.filter((s) => !homes.get(selNode.id)?.has(s.id)).map((s) => (
                      <optgroup key={s.id} label={`${graphNo(s.id)}. ${s.title}`}>
                        {s.nodes.filter((n) => !homes.get(n.id)?.has(mapSel?.kind === "node" ? mapSel.sectionId : "")).map((n) => <option key={n.id} value={n.id}>{n.label}</option>)}
                      </optgroup>
                    ))}
                  </select>
                </div>
              )}
              <button className="text-sm text-red-600 hover:underline" onClick={() => deleteNode(selNode.id)}>{sc ? "Delete box and concept" : "Delete box"}</button>
            </>
          ) : null}
        </div>
        )}
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
