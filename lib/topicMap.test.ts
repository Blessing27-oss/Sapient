import { test } from "node:test";
import assert from "node:assert/strict";
import { addMapLink, addMapNode, connectMapNodes, crossRefs, fallbackTopicMap, type RawTopicMap, removeMapEdge, removeMapLink, removeMapNode, sanitizeTopicMap, sectionConnections, updateMapEdge, updateMapNode } from "./topicMap.ts";

const node = (id: string, label: string, conceptId = "", details: string[] = []) => ({ id, label, details, conceptId });
const edge = (source: string, target: string, style = "solid", label = "") => ({ source, target, style, label });

// Two themed sections that share the "strep" node and are joined by a cross-section link.
const raw = (): RawTopicMap => ({
  sourceNote: "Slide numbers are the handout's.",
  studyRoute: "Start with taxonomy.",
  links: [edge("comb", "ayeaye", "dotted", "specialized dentition")],
  sections: [
    {
      title: "Taxonomy", direction: "TD", sources: "slides 3–5", note: "",
      nodes: [node("primates", "Order: Primates"), node("strep", "Suborder: Strepsirrhini", "c1"), node("ayeaye", "Daubentoniidae", "", ["Aye-aye", "placement questioned"])],
      edges: [edge("primates", "strep"), edge("strep", "ayeaye")],
    },
    {
      title: "Shared traits", direction: "LR", sources: "slides 5–11", note: "Tapetum ancestry left open.",
      nodes: [node("strep", "Suborder: Strepsirrhini", "c1"), node("comb", "Tooth comb", "c2")],
      edges: [edge("strep", "comb")],
    },
  ],
});

test("sanitizing keeps shared nodes and valid cross-section links, and drops broken references", () => {
  const r = raw();
  r.sections[0].nodes.push(node("strep", "duplicate in same section"), node("", "no id"));
  r.sections[0].edges.push(edge("strep", "missing"), edge("strep", "strep"), edge("primates", "strep"));
  r.sections[1].nodes.push(node("x", "Unknown concept", "c99"));
  // strep is in both sections, so a link from it to comb belongs inside section 2, not across sections.
  r.links.push(edge("strep", "comb"), edge("comb", "nowhere"), edge("comb", "ayeaye", "dotted", "dupe"));
  r.sections.push({ title: "Too small", direction: "LR", sources: "", note: "", nodes: [node("solo", "Alone")], edges: [] });

  const map = sanitizeTopicMap(r, new Set(["c1", "c2"]))!;
  assert.equal(map.sections.length, 2);
  assert.deepEqual(map.sections.map((s) => s.id), ["s1", "s2"]);
  assert.equal(map.sections[0].nodes.length, 3);
  assert.equal(map.sections[0].edges.length, 2);
  assert.equal(map.sections[1].nodes.find((n) => n.id === "x")!.conceptId, undefined);
  assert.deepEqual(map.links, [{ source: "comb", target: "ayeaye", style: "dotted", label: "specialized dentition" }]);
});

test("cross references cover the same node in another section and links into other sections", () => {
  const map = sanitizeTopicMap(raw(), new Set(["c1", "c2"]))!;
  assert.deepEqual(crossRefs(map, "s1", "strep").map((r) => [r.sectionId, r.nodeId, r.kind]), [["s2", "strep", "same"]]);
  assert.deepEqual(crossRefs(map, "s2", "comb").map((r) => [r.sectionId, r.nodeId, r.kind]), [["s1", "ayeaye", "link"]]);
  assert.deepEqual(crossRefs(map, "s1", "primates"), []);
  const [c] = sectionConnections(map);
  assert.deepEqual([c.a, c.b], ["s1", "s2"]);
  assert.deepEqual(c.via, ["Suborder: Strepsirrhini", "specialized dentition"]);
});

test("older rooms without a topic map get a single graph from the concept links", () => {
  const map = fallbackTopicMap([{ id: "c1", name: "A", importance: 1, verified: true }, { id: "c2", name: "B", importance: 1, verified: true }], [{ source: "c1", target: "c2", weight: 0.3, type: "related" }]);
  assert.equal(map.sections.length, 1);
  assert.deepEqual(map.links, []);
  assert.equal(map.sections[0].edges[0].style, "dotted");
  assert.equal(map.sections[0].nodes[1].conceptId, "c2");
});

test("editing keeps the map one graph: renames reach every copy, deletes clean up arrows and links", () => {
  let map = sanitizeTopicMap(raw(), new Set(["c1", "c2"]))!;
  map = addMapNode(map, "s2", { id: "new", label: "New concept", details: [], conceptId: "c9" });
  map = connectMapNodes(map, "s2", "comb", "new");
  assert.equal(connectMapNodes(map, "s2", "new", "comb"), map, "no duplicate arrow in the other direction");
  assert.equal(connectMapNodes(map, "s2", "new", "new"), map, "no self loop");
  map = updateMapNode(map, "strep", { label: "Strepsirrhines" });
  assert.deepEqual(map.sections.map((s) => s.nodes.find((n) => n.id === "strep")!.label), ["Strepsirrhines", "Strepsirrhines"]);
  map = updateMapEdge(map, "s2", 1, { style: "dotted", label: "builds on" });
  assert.deepEqual(map.sections[1].edges[1], { source: "comb", target: "new", style: "dotted", label: "builds on" });

  assert.equal(addMapLink(map, "strep", "comb"), map, "ideas sharing a graph get an arrow, not a cross-graph link");
  map = addMapLink(map, "primates", "new");
  assert.equal(map.links.length, 2);

  map = removeMapNode(map, "comb");
  assert.ok(!map.sections[1].nodes.some((n) => n.id === "comb"));
  assert.ok(!map.sections[1].edges.some((e) => e.source === "comb" || e.target === "comb"));
  assert.deepEqual(map.links.map((e) => [e.source, e.target]), [["primates", "new"]]);
  map = removeMapLink(removeMapEdge(map, "s1", 0), 0);
  assert.equal(map.sections[0].edges.length, 1);
  assert.equal(map.links.length, 0);
});
