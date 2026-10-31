"use client";
import { useMemo } from "react";

export type GNode = { id: string; name: string; fill: string; text?: string; ring?: boolean };
export type GEdge = { source: string; target: string; weight: number };
const W = 760, H = 460;

// Small deterministic force layout: repulsion between nodes, springs along edges, gravity to centre.
function layout(ids: string[], edges: GEdge[]) {
  const n = ids.length;
  const pos = new Map(ids.map((id, i) => [id, { x: W / 2 + 180 * Math.cos((2 * Math.PI * i) / n), y: H / 2 + 150 * Math.sin((2 * Math.PI * i) / n), vx: 0, vy: 0 }]));
  for (let it = 0; it < 400; it++) {
    const cool = 1 - it / 400;
    for (const a of ids) for (const b of ids) {
      if (a >= b) continue;
      const p = pos.get(a)!, q = pos.get(b)!;
      let dx = p.x - q.x, dy = p.y - q.y;
      const d2 = Math.max(dx * dx + dy * dy, 25), d = Math.sqrt(d2);
      const f = 22000 / d2;
      dx /= d; dy /= d;
      p.vx += dx * f; p.vy += dy * f; q.vx -= dx * f; q.vy -= dy * f;
    }
    for (const e of edges) {
      const p = pos.get(e.source), q = pos.get(e.target);
      if (!p || !q) continue;
      const dx = q.x - p.x, dy = q.y - p.y, d = Math.sqrt(dx * dx + dy * dy) || 1;
      const f = (d - 130) * 0.04;
      p.vx += (dx / d) * f; p.vy += (dy / d) * f; q.vx -= (dx / d) * f; q.vy -= (dy / d) * f;
    }
    for (const p of pos.values()) {
      p.vx += (W / 2 - p.x) * 0.012; p.vy += (H / 2 - p.y) * 0.012;
      p.x = Math.min(W - 70, Math.max(70, p.x + p.vx * 0.5 * cool)); p.y = Math.min(H - 30, Math.max(30, p.y + p.vy * 0.5 * cool));
      p.vx *= 0.6; p.vy *= 0.6;
    }
  }
  return pos;
}

export default function Graph({ nodes, edges, selected, onSelect }: { nodes: GNode[]; edges: GEdge[]; selected?: string | null; onSelect?: (id: string) => void }) {
  const key = nodes.map((n) => n.id).join() + "|" + edges.map((e) => e.source + e.target).join();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const pos = useMemo(() => layout(nodes.map((n) => n.id), edges), [key]);
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full rounded-xl border border-stone-200 bg-[radial-gradient(circle_at_center,#fff,#f5f5f0)]">
      {edges.map((e, i) => {
        const p = pos.get(e.source), q = pos.get(e.target);
        if (!p || !q) return null;
        return <line key={i} x1={p.x} y1={p.y} x2={q.x} y2={q.y} stroke="#a8a29e" strokeWidth={1 + e.weight * 4} strokeOpacity={0.55} />;
      })}
      {nodes.map((n) => {
        const p = pos.get(n.id);
        if (!p) return null;
        const w = Math.max(70, n.name.length * 7.2 + 24);
        const sel = selected === n.id;
        return (
          <g key={n.id} transform={`translate(${p.x},${p.y})`} onClick={() => onSelect?.(n.id)} className={onSelect ? "cursor-pointer" : ""}>
            <rect x={-w / 2} y={-16} width={w} height={32} rx={16} fill={n.fill} stroke={sel ? "#00693e" : n.ring ? "#57534e" : "#d6d3d1"} strokeWidth={sel ? 3 : 1.5} strokeDasharray={n.ring ? "4 3" : undefined} />
            <text textAnchor="middle" dy={4} fontSize={12} fontWeight={600} fill={n.text ?? "#1c1917"}>{n.name}</text>
          </g>
        );
      })}
    </svg>
  );
}
