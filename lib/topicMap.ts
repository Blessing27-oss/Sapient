import type { Concept, Edge, MapEdge, MapNode, MapSection, TopicMap } from "./types.ts";

type RawEdge = { source: string; target: string; style: string; label: string };
export type RawTopicMap = {
  sourceNote: string;
  studyRoute: string;
  links: RawEdge[];
  sections: {
    title: string;
    direction: string;
    sources: string;
    note: string;
    nodes: { id: string; label: string; details: string[]; conceptId: string }[];
    edges: RawEdge[];
  }[];
};

const MAX_DETAILS = 5;
const clean = (s: unknown) => String(s ?? "").replace(/\s+/g, " ").trim();
const toEdge = (e: RawEdge): MapEdge => {
  const label = clean(e.label);
  return { source: clean(e.source), target: clean(e.target), style: e.style === "dotted" ? "dotted" : "solid", ...(label ? { label } : {}) };
};

// Drop anything that would render as a dangling or ambiguous element rather than trusting the model.
export function sanitizeTopicMap(raw: RawTopicMap | undefined, conceptIds: Set<string>, minNodes = 2): TopicMap | undefined {
  if (!raw?.sections?.length) return undefined;
  const sections: MapSection[] = raw.sections.flatMap((s, i) => {
    const seen = new Set<string>();
    const nodes: MapNode[] = (s.nodes ?? []).flatMap((n) => {
      const id = clean(n.id), label = clean(n.label);
      if (!id || !label || seen.has(id)) return [];
      seen.add(id);
      const details = (n.details ?? []).map(clean).filter(Boolean).slice(0, MAX_DETAILS);
      return [{ id, label, details, ...(conceptIds.has(clean(n.conceptId)) ? { conceptId: clean(n.conceptId) } : {}) }];
    });
    const pairs = new Set<string>();
    const edges = (s.edges ?? []).map(toEdge).filter((e) => {
      const key = `${e.source}>${e.target}`;
      if (!seen.has(e.source) || !seen.has(e.target) || e.source === e.target || pairs.has(key)) return false;
      return pairs.add(key), true;
    });
    if (nodes.length < minNodes) return [];
    return [{ id: "", title: clean(s.title) || `Graph ${i + 1}`, direction: s.direction === "LR" ? ("LR" as const) : ("TD" as const), nodes, edges, sources: clean(s.sources), note: clean(s.note) }];
  }).map((s, i) => ({ ...s, id: `s${i + 1}` }));
  if (!sections.length) return undefined;

  // A cross-section link must join nodes that never share a section; otherwise it belongs in that section's edges.
  const homes = sectionsByNode(sections);
  const pairs = new Set<string>();
  const links = (raw.links ?? []).map(toEdge).filter((e) => {
    const a = homes.get(e.source), b = homes.get(e.target), key = `${e.source}>${e.target}`;
    if (!a || !b || e.source === e.target || pairs.has(key) || [...a].some((s) => b.has(s))) return false;
    return pairs.add(key), true;
  });
  return { sourceNote: clean(raw.sourceNote), sections, links, studyRoute: clean(raw.studyRoute) };
}

export function sectionsByNode(sections: MapSection[]): Map<string, Set<string>> {
  const homes = new Map<string, Set<string>>();
  for (const s of sections) for (const n of s.nodes) homes.set(n.id, (homes.get(n.id) ?? new Set()).add(s.id));
  return homes;
}

export type CrossRef = { sectionId: string; nodeId: string; kind: "same" | "link"; edge?: MapEdge };

// Every place outside `sectionId` that a node connects to: the same node shown elsewhere, or a cross-section link.
export function crossRefs(map: TopicMap, sectionId: string, nodeId: string): CrossRef[] {
  const homes = sectionsByNode(map.sections);
  const refs: CrossRef[] = [...(homes.get(nodeId) ?? [])].filter((s) => s !== sectionId).map((s) => ({ sectionId: s, nodeId, kind: "same" }));
  for (const e of map.links) {
    const other = e.source === nodeId ? e.target : e.target === nodeId ? e.source : null;
    if (!other) continue;
    for (const s of homes.get(other) ?? []) if (s !== sectionId) refs.push({ sectionId: s, nodeId: other, kind: "link", edge: e });
  }
  return refs;
}

// Section-level overview: which sections share nodes or are linked, and through what.
export function sectionConnections(map: TopicMap) {
  const homes = sectionsByNode(map.sections);
  const label = new Map(map.sections.flatMap((s) => s.nodes.map((n) => [n.id, n.label] as const)));
  const out = new Map<string, { a: string; b: string; via: string[] }>();
  const add = (a: string, b: string, via: string) => {
    if (a === b) return;
    const [x, y] = [a, b].sort(), key = `${x}|${y}`;
    const cur = out.get(key) ?? { a: x, b: y, via: [] };
    if (!cur.via.includes(via)) cur.via.push(via);
    out.set(key, cur);
  };
  for (const [id, secs] of homes) { const list = [...secs]; for (const a of list) for (const b of list) if (a < b) add(a, b, label.get(id) ?? id); }
  for (const e of map.links) for (const a of homes.get(e.source) ?? []) for (const b of homes.get(e.target) ?? []) add(a, b, e.label || `${label.get(e.source)} → ${label.get(e.target)}`);
  return [...out.values()];
}

// For drafts and rooms created before topic maps existed: one graph built from the concept links.
export function fallbackTopicMap(concepts: Concept[], edges: Edge[]): TopicMap {
  return {
    sourceNote: "",
    studyRoute: "",
    links: [],
    sections: [{
      id: "s1",
      title: "Concepts and relationships",
      direction: "LR",
      nodes: concepts.map((c) => ({ id: c.id, label: c.name, details: c.description ? [c.description] : [], conceptId: c.id })),
      edges: edges.map((e) => ({ source: e.source, target: e.target, style: "dotted" as const })),
      sources: "",
      note: "Generated from the assessment links; dotted lines mean the concepts are related.",
    }],
  };
}

// ---------- Editing (professor review). Node ids are global: the same id in several sections is one idea. ----------

const mapSections = (map: TopicMap, sectionId: string, fn: (s: MapSection) => MapSection): TopicMap =>
  ({ ...map, sections: map.sections.map((s) => (s.id === sectionId ? fn(s) : s)) });

export function addMapNode(map: TopicMap, sectionId: string, node: MapNode): TopicMap {
  return mapSections(map, sectionId, (s) => ({ ...s, nodes: [...s.nodes, node] }));
}

export function updateMapNode(map: TopicMap, nodeId: string, patch: Partial<Omit<MapNode, "id">>): TopicMap {
  return { ...map, sections: map.sections.map((s) => ({ ...s, nodes: s.nodes.map((n) => (n.id === nodeId ? { ...n, ...patch } : n)) })) };
}

// Removes the idea everywhere: every copy, every arrow touching it, and its cross-graph links.
export function removeMapNode(map: TopicMap, nodeId: string): TopicMap {
  const touches = (e: MapEdge) => e.source === nodeId || e.target === nodeId;
  return {
    ...map,
    sections: map.sections.map((s) => ({ ...s, nodes: s.nodes.filter((n) => n.id !== nodeId), edges: s.edges.filter((e) => !touches(e)) })),
    links: map.links.filter((e) => !touches(e)),
  };
}

// Returns the map unchanged when the arrow would duplicate one (either direction) or loop.
export function connectMapNodes(map: TopicMap, sectionId: string, source: string, target: string, style: MapEdge["style"] = "solid"): TopicMap {
  const s = map.sections.find((x) => x.id === sectionId);
  if (!s || source === target || s.edges.some((e) => (e.source === source && e.target === target) || (e.source === target && e.target === source))) return map;
  return mapSections(map, sectionId, (x) => ({ ...x, edges: [...x.edges, { source, target, style }] }));
}

export function updateMapEdge(map: TopicMap, sectionId: string, index: number, patch: Partial<MapEdge>): TopicMap {
  return mapSections(map, sectionId, (s) => ({ ...s, edges: s.edges.map((e, i) => (i === index ? { ...e, ...patch } : e)) }));
}

export function removeMapEdge(map: TopicMap, sectionId: string, index: number): TopicMap {
  return mapSections(map, sectionId, (s) => ({ ...s, edges: s.edges.filter((_, i) => i !== index) }));
}

// A link between ideas in different graphs; refused when the two already share a graph (that is an ordinary arrow).
export function addMapLink(map: TopicMap, source: string, target: string, style: MapEdge["style"] = "dotted"): TopicMap {
  const homes = sectionsByNode(map.sections);
  const a = homes.get(source), b = homes.get(target);
  if (!a || !b || source === target || [...a].some((x) => b.has(x)) || map.links.some((e) => (e.source === source && e.target === target) || (e.source === target && e.target === source))) return map;
  return { ...map, links: [...map.links, { source, target, style }] };
}

export function removeMapLink(map: TopicMap, index: number): TopicMap {
  return { ...map, links: map.links.filter((_, i) => i !== index) };
}

// A dragged box keeps its place. Positions only make sense for the direction they were drawn in,
// so moving a box in a graph now drawn the other way starts a fresh set.
export function moveMapNode(map: TopicMap, sectionId: string, nodeId: string, pos: { x: number; y: number }, direction: "TD" | "LR"): TopicMap {
  return mapSections(map, sectionId, (s) => {
    const positions = s.layout?.direction === direction ? s.layout.positions : {};
    return { ...s, layout: { direction, positions: { ...positions, [nodeId]: { x: Math.round(pos.x), y: Math.round(pos.y) } } } };
  });
}

export function resetMapLayout(map: TopicMap, sectionId: string): TopicMap {
  return mapSections(map, sectionId, ({ layout: _drop, ...s }) => s); // eslint-disable-line @typescript-eslint/no-unused-vars
}

// A map the professor saved from the editor: same checks as AI output, except a graph may shrink to a
// single box, and hand-placed positions are kept when they are finite numbers for boxes still present.
export function cleanSavedTopicMap(input: unknown, conceptIds: Set<string>): TopicMap | undefined {
  const m = input as TopicMap | undefined;
  if (!m || !Array.isArray(m.sections)) return undefined;
  const sections = m.sections.filter((s) => Array.isArray(s?.nodes) && s.nodes.length > 0);
  const edge = (e: MapEdge) => ({ source: e?.source, target: e?.target, style: e?.style, label: e?.label ?? "" });
  const cleaned = sanitizeTopicMap({
    sourceNote: m.sourceNote, studyRoute: m.studyRoute, links: (m.links ?? []).map(edge),
    sections: sections.map((s) => ({
      title: s.title, direction: s.direction, sources: s.sources, note: s.note,
      nodes: s.nodes.map((n) => ({ id: n?.id, label: n?.label, details: Array.isArray(n?.details) ? n.details : [], conceptId: n?.conceptId ?? "" })),
      edges: (s.edges ?? []).map(edge),
    })),
  } as RawTopicMap, conceptIds, 1);
  if (!cleaned || cleaned.sections.length !== sections.length) return cleaned;
  cleaned.sections.forEach((s, i) => {
    const layout = sections[i].layout;
    if (!layout || (layout.direction !== "TD" && layout.direction !== "LR") || typeof layout.positions !== "object") return;
    const ids = new Set(s.nodes.map((n) => n.id));
    const positions = Object.fromEntries(Object.entries(layout.positions)
      .filter(([id, p]) => ids.has(id) && Number.isFinite(p?.x) && Number.isFinite(p?.y))
      .map(([id, p]) => [id, { x: p.x, y: p.y }]));
    if (Object.keys(positions).length) s.layout = { direction: layout.direction, positions };
  });
  return cleaned;
}
