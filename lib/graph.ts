type E = { source: string; target: string };

// Breadth-first tree over the undirected concept graph. The first id is the main concept (the root);
// concepts not reachable from it start their own tree, so nothing is dropped.
export function bfsTree(ids: string[], edges: E[]) {
  const adj = new Map<string, string[]>(ids.map((i) => [i, []]));
  for (const e of edges) { adj.get(e.source)?.push(e.target); adj.get(e.target)?.push(e.source); }
  const level = new Map<string, number>();
  const parent = new Map<string, string | null>();
  const roots: string[] = [];
  for (const start of ids) {
    if (level.has(start)) continue;
    roots.push(start); level.set(start, 0); parent.set(start, null);
    const queue = [start];
    for (let i = 0; i < queue.length; i++) {
      for (const n of adj.get(queue[i]) ?? []) {
        if (level.has(n)) continue;
        level.set(n, level.get(queue[i])! + 1); parent.set(n, queue[i]); queue.push(n);
      }
    }
  }
  const children = new Map<string, string[]>(ids.map((i) => [i, []]));
  for (const id of ids) { const p = parent.get(id); if (p) children.get(p)!.push(id); }
  return { level, parent, children, roots };
}

// Point every relationship away from the main concept (shallower -> deeper) so arrows read top-down.
export function orientEdges<T extends E>(ids: string[], edges: T[]): T[] {
  const { level } = bfsTree(ids, edges);
  return edges.map((e) => ((level.get(e.source) ?? 0) > (level.get(e.target) ?? 0) ? { ...e, source: e.target, target: e.source } : e));
}
