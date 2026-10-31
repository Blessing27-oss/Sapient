import { test } from "node:test";
import assert from "node:assert/strict";
import { bfsTree, orientEdges } from "./graph.ts";

const ids = ["main", "a", "b", "c", "lonely"];
const edges = [
  { source: "a", target: "main" }, // wrong way round: should be flipped
  { source: "main", target: "b" },
  { source: "c", target: "a" },    // wrong way round
];

test("levels count outward from the first (main) concept", () => {
  const { level, parent, roots } = bfsTree(ids, edges);
  assert.equal(level.get("main"), 0);
  assert.equal(level.get("a"), 1);
  assert.equal(level.get("b"), 1);
  assert.equal(level.get("c"), 2);
  assert.equal(parent.get("c"), "a");
  assert.deepEqual(roots, ["main", "lonely"]); // disconnected concepts form their own tree, not dropped
});

test("orientEdges points every relationship away from the main concept", () => {
  const out = orientEdges(ids, edges);
  assert.deepEqual(out.map((e) => `${e.source}>${e.target}`), ["main>a", "main>b", "a>c"]);
});

test("orientEdges keeps same-level edges and extra fields as they are", () => {
  const e = [{ source: "x", target: "y", weight: 0.3 }, { source: "r", target: "x", weight: 0.2 }, { source: "r", target: "y", weight: 0.2 }];
  const out = orientEdges(["r", "x", "y"], e);
  assert.deepEqual(out[0], { source: "x", target: "y", weight: 0.3 });
});
