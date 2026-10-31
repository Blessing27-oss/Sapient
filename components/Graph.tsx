"use client";
import { useMemo, useRef, useState } from "react";

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

type Pt = { x: number; y: number };
type Drag = { kind: "node"; id: string; dx: number; dy: number; moved: boolean } | { kind: "link"; from: string };

export default function Graph({
  nodes, edges, selected, onSelect, selectedEdge, onSelectEdge, onConnect, onAddNode,
}: {
  nodes: GNode[]; edges: GEdge[]; selected?: string | null; onSelect?: (id: string | null) => void;
  selectedEdge?: number | null; onSelectEdge?: (i: number | null) => void;
  onConnect?: (a: string, b: string) => void;
  onAddNode?: (x: number, y: number) => string; // returns the new node's id so we can place it
}) {
  const svg = useRef<SVGSVGElement>(null);
  const key = nodes.map((n) => n.id).join() + "|" + edges.map((e) => e.source + e.target).join();
  const [pos, setPos] = useState<Record<string, Pt>>({});
  const [drag, setDrag] = useState<Drag | null>(null);
  const [cursor, setCursor] = useState<Pt>({ x: 0, y: 0 });
  const [hover, setHover] = useState<string | null>(null);
  const editable = !!onConnect;

  // Initial force layout; later additions keep every existing position.
  const base = useMemo(() => Object.fromEntries(layout(nodes.map((n) => n.id), edges)), []); // eslint-disable-line react-hooks/exhaustive-deps
  const at = (id: string): Pt => {
    if (pos[id]) return pos[id];
    if (base[id]) return base[id];
    const i = nodes.findIndex((n) => n.id === id); // concept added via a button: fan out near the centre
    return { x: W / 2 + 60 * Math.cos(i * 2.4), y: H / 2 + 50 * Math.sin(i * 2.4) };
  };

  const toSvg = (e: React.PointerEvent | React.MouseEvent): Pt => {
    const el = svg.current!;
    const m = el.getScreenCTM()!.inverse();
    const p = new DOMPoint(e.clientX, e.clientY).matrixTransform(m);
    return { x: p.x, y: p.y };
  };
  const nodeAt = (p: Pt, except?: string) =>
    nodes.find((n) => n.id !== except && Math.abs(at(n.id).x - p.x) < Math.max(70, n.name.length * 7.2 + 24) / 2 && Math.abs(at(n.id).y - p.y) < 18)?.id;

  function move(e: React.PointerEvent) {
    const p = toSvg(e);
    setCursor(p);
    if (drag?.kind === "node") {
      const x = Math.min(W - 40, Math.max(40, p.x - drag.dx)), y = Math.min(H - 20, Math.max(20, p.y - drag.dy));
      setPos((o) => ({ ...o, [drag.id]: { x, y } }));
      if (!drag.moved) setDrag({ ...drag, moved: true });
    }
  }
  function up(e: React.PointerEvent) {
    if (drag?.kind === "link") {
      const to = nodeAt(toSvg(e), drag.from);
      if (to) onConnect?.(drag.from, to);
    } else if (drag?.kind === "node" && !drag.moved) onSelect?.(drag.id);
    setDrag(null);
  }

  return (
    <svg
      ref={svg}
      viewBox={`0 0 ${W} ${H}`}
      className="w-full touch-none select-none rounded-xl border border-stone-200 bg-[radial-gradient(circle_at_center,#fff,#f5f5f0)]"
      onPointerMove={move}
      onPointerUp={up}
      onPointerLeave={() => setDrag(null)}
      onPointerDown={(e) => { if (e.target === svg.current) { onSelect?.(null); onSelectEdge?.(null); } }}
      onDoubleClick={(e) => {
        if (!onAddNode || e.target !== svg.current) return;
        const p = toSvg(e);
        const id = onAddNode(p.x, p.y);
        setPos((o) => ({ ...o, [id]: p }));
      }}
    >
      {edges.map((e, i) => {
        const p = at(e.source), q = at(e.target);
        const sel = selectedEdge === i;
        const dim = hover && hover !== e.source && hover !== e.target;
        return (
          <g key={i} onPointerDown={(ev) => { ev.stopPropagation(); onSelectEdge?.(i); }} className={onSelectEdge ? "cursor-pointer" : ""}>
            <line x1={p.x} y1={p.y} x2={q.x} y2={q.y} stroke="transparent" strokeWidth={16} />
            <line x1={p.x} y1={p.y} x2={q.x} y2={q.y} stroke={sel ? "#dc2626" : "#78716c"} strokeWidth={sel ? 4 : 1 + e.weight * 4} strokeOpacity={dim ? 0.15 : sel ? 1 : 0.6} />
          </g>
        );
      })}
      {drag?.kind === "link" && (
        <line x1={at(drag.from).x} y1={at(drag.from).y} x2={cursor.x} y2={cursor.y} stroke="#00693e" strokeWidth={3} strokeDasharray="6 4" pointerEvents="none" />
      )}
      {nodes.map((n) => {
        const p = at(n.id);
        const w = Math.max(70, n.name.length * 7.2 + 24);
        const sel = selected === n.id;
        const target = drag?.kind === "link" && nodeAt(cursor, drag.from) === n.id;
        return (
          <g
            key={n.id}
            transform={`translate(${p.x},${p.y})`}
            className={drag?.kind === "node" && drag.id === n.id ? "cursor-grabbing" : "cursor-grab"}
            onPointerEnter={() => setHover(n.id)}
            onPointerLeave={() => setHover(null)}
            onPointerDown={(e) => { e.stopPropagation(); const c = toSvg(e); setDrag({ kind: "node", id: n.id, dx: c.x - p.x, dy: c.y - p.y, moved: false }); }}
          >
            <rect x={-w / 2} y={-16} width={w} height={32} rx={16} fill={n.fill}
              stroke={target ? "#00693e" : sel ? "#00693e" : n.ring ? "#57534e" : "#d6d3d1"} strokeWidth={sel || target ? 3 : 1.5} strokeDasharray={n.ring ? "4 3" : undefined} />
            <text textAnchor="middle" dy={4} fontSize={12} fontWeight={600} fill={n.text ?? "#1c1917"} pointerEvents="none">{n.name}</text>
            {editable && (sel || hover === n.id) && (
              <g
                transform={`translate(${w / 2 + 2},0)`}
                className="cursor-crosshair"
                onPointerDown={(e) => { e.stopPropagation(); onSelect?.(n.id); setCursor(toSvg(e)); setDrag({ kind: "link", from: n.id }); }}
              >
                <circle r={9} fill="#00693e" stroke="#fff" strokeWidth={2} />
                <text textAnchor="middle" dy={4} fontSize={12} fill="#fff" fontWeight={700} pointerEvents="none">+</text>
                <title>Drag to another concept to connect</title>
              </g>
            )}
          </g>
        );
      })}
    </svg>
  );
}
