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
export function sanitizeTopicMap(raw: RawTopicMap | undefined, conceptIds: Set<string>): TopicMap | undefined {
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
    if (nodes.length < 2) return [];
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
