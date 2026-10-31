"use client";
import { useEffect, useId, useMemo, useRef, useState } from "react";
import { bfsTree } from "@/lib/graph";

// `flag` draws a small coloured dot on the node (e.g. "not yet verified").
export type GNode = { id: string; name: string; fill: string; accent?: string; text?: string; flag?: string; editName?: string };
export type GEdge = { source: string; target: string; weight: number };
type Pt = { x: number; y: number };
type Drag = { kind: "node"; id: string; dx: number; dy: number; moved: boolean } | { kind: "link"; from: string };

const ROW = 100, MARGIN = 60, HALF_H = 18, MIN_W = 640;
const nodeW = (name: string) => Math.max(84, name.length * 7.6 + 30);

// Top-down tidy tree: the first node is the main concept at the top; each concept sits under the one it was reached from.
function treeLayout(nodes: { id: string; name: string }[], edges: GEdge[]) {
  const ids = nodes.map((n) => n.id);
  const width = new Map(nodes.map((n) => [n.id, nodeW(n.name) + 28]));
  const { level, children, roots } = bfsTree(ids, edges);
  const span = new Map<string, number>();
  const measure = (id: string): number => {
    const kids = children.get(id) ?? [];
    const w = Math.max(width.get(id)!, kids.reduce((t, k) => t + measure(k), 0));
    span.set(id, w);
    return w;
  };
  const pos: Record<string, Pt> = {};
  let cursor = MARGIN;
  const place = (id: string, left: number) => {
    const w = span.get(id)!;
    pos[id] = { x: left + w / 2, y: MARGIN + (level.get(id) ?? 0) * ROW };
    let x = left;
    for (const k of children.get(id) ?? []) { place(k, x); x += span.get(k)!; }
  };
  for (const r of roots) { measure(r); place(r, cursor); cursor += span.get(r)!; }
  const maxLevel = Math.max(0, ...[...level.values()]);
  return { pos, w: Math.max(MIN_W, cursor + MARGIN), h: MARGIN * 2 + maxLevel * ROW };
}

// Curved connector: vertical between rows (bottom of the upper node to the top of the lower one), sideways within a row.
function route(p: Pt, q: Pt, hwp: number, hwq: number) {
  const dy = q.y - p.y;
  let a: Pt, z: Pt, c1: Pt, c2: Pt;
  if (Math.abs(dy) > 26) {
    const down = dy > 0;
    a = { x: p.x, y: p.y + (down ? HALF_H : -HALF_H) };
    z = { x: q.x, y: q.y + (down ? -HALF_H : HALF_H) };
    const m = (z.y - a.y) / 2;
    c1 = { x: a.x, y: a.y + m }; c2 = { x: z.x, y: z.y - m };
  } else {
    const right = q.x >= p.x;
    a = { x: p.x + (right ? hwp : -hwp), y: p.y };
    z = { x: q.x + (right ? -hwq : hwq), y: q.y };
    c1 = { x: a.x + (z.x - a.x) * 0.25, y: a.y - 34 }; c2 = { x: a.x + (z.x - a.x) * 0.75, y: z.y - 34 };
  }
  let tx = z.x - c2.x, ty = z.y - c2.y;
  const tl = Math.hypot(tx, ty) || 1;
  tx /= tl; ty /= tl;
  return { a, z, c1, c2, tx, ty };
}

export default function Graph({
  nodes, edges, selected, onSelect, selectedEdge, onSelectEdge, onConnect, onDeleteNode, onDeleteEdge, onRename, onAddNode, solidRoot,
}: {
  nodes: GNode[]; edges: GEdge[]; selected?: string | null; onSelect?: (id: string | null) => void;
  selectedEdge?: number | null; onSelectEdge?: (i: number | null) => void;
  onConnect?: (a: string, b: string) => void;
  onDeleteNode?: (id: string) => void;
  onDeleteEdge?: (i: number) => void;
  onRename?: (id: string, name: string) => void;
  onAddNode?: (x: number, y: number) => string; // returns the new node's id so we can place it
  solidRoot?: boolean;
}) {
  const svg = useRef<SVGSVGElement>(null);
  const foldId = `fold${useId().replace(/[^a-zA-Z0-9]/g, "")}`; // the S's two greens as a hard-edged gradient, for the solid root node
  const [pos, setPos] = useState<Record<string, Pt>>({});
  const [drag, setDrag] = useState<Drag | null>(null);
  const [cursor, setCursor] = useState<Pt>({ x: 0, y: 0 });
  const [hover, setHover] = useState<string | null>(null);
  const [hoverEdge, setHoverEdge] = useState<number | null>(null);
  const [editing, setEditing] = useState<{ id: string; value: string } | null>(null);
  const editRef = useRef<typeof editing>(null);
  useEffect(() => { editRef.current = editing; }, [editing]);
  // Commit once: Enter and the blur it triggers would otherwise both fire.
  const finishEdit = (save: boolean) => {
    const cur = editRef.current;
    editRef.current = null; setEditing(null);
    if (save && cur && cur.value.trim()) onRename?.(cur.id, cur.value.trim());
  };
  const editable = !!onConnect;

  // Laid out once, so dragged positions survive edits; concepts added later keep every existing position.
  const base = useMemo(() => treeLayout(nodes, edges), []); // eslint-disable-line react-hooks/exhaustive-deps
  const W = base.w, H = base.h;
  const rootId = nodes[0]?.id;
  const treeEdge = useMemo(() => {
    const { parent } = bfsTree(nodes.map((n) => n.id), edges);
    return (e: GEdge) => parent.get(e.target) === e.source || parent.get(e.source) === e.target;
  }, [nodes, edges]);

  const at = (id: string): Pt => {
    if (pos[id]) return pos[id];
    if (base.pos[id]) return base.pos[id];
    const i = nodes.findIndex((n) => n.id === id); // concept added via a button: fan out near the middle
    return { x: W / 2 + 80 * Math.cos(i * 2.4), y: H / 2 + 40 * Math.sin(i * 2.4) };
  };
  const toSvg = (e: React.PointerEvent | React.MouseEvent): Pt => {
    const m = svg.current!.getScreenCTM()!.inverse();
    const p = new DOMPoint(e.clientX, e.clientY).matrixTransform(m);
    return { x: p.x, y: p.y };
  };
  const nodeAt = (p: Pt, except?: string) =>
    nodes.find((n) => n.id !== except && Math.abs(at(n.id).x - p.x) < nodeW(n.name) / 2 && Math.abs(at(n.id).y - p.y) < HALF_H + 2)?.id;

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
      className="w-full touch-none select-none rounded-2xl border border-stone-200 bg-gradient-to-b from-white to-stone-50"
      onPointerMove={move}
      onPointerUp={up}
      onPointerLeave={() => setDrag(null)}
      onPointerDown={(e) => { if (e.target === svg.current) { onSelect?.(null); onSelectEdge?.(null); } }}
      onDoubleClick={(e) => {
        if (!onAddNode || e.target !== svg.current) return;
        const raw = toSvg(e);
        const p = { x: Math.min(W - 70, Math.max(70, raw.x)), y: Math.min(H - 30, Math.max(30, raw.y)) }; // keep the new pill fully inside
        const id = onAddNode(p.x, p.y);
        setPos((o) => ({ ...o, [id]: p }));
        if (onRename) setEditing({ id, value: "New concept" });
      }}
    >
      <defs>
        <linearGradient id={foldId} gradientUnits="userSpaceOnUse" x1="0" y1="0" x2="20" y2="9" spreadMethod="reflect">
          <stop offset="0" stopColor="#00693e" /><stop offset="0.4" stopColor="#00693e" /><stop offset="0.6" stopColor="#16895c" /><stop offset="1" stopColor="#16895c" />
        </linearGradient>
      </defs>
      {edges.map((e, i) => {
        const sn = nodes.find((n) => n.id === e.source), tn = nodes.find((n) => n.id === e.target);
        if (!sn || !tn) return null;
        const { a, z, c1, c2, tx, ty } = route(at(e.source), at(e.target), nodeW(sn.name) / 2, nodeW(tn.name) / 2);
        const sel = selectedEdge === i;
        const dim = hover && hover !== e.source && hover !== e.target;
        const color = sel ? "#dc2626" : sn.accent ?? "#78716c";
        const d = `M${a.x},${a.y} C${c1.x},${c1.y} ${c2.x},${c2.y} ${z.x - tx * 8},${z.y - ty * 8}`;
        const head = `${z.x},${z.y} ${z.x - tx * 13 - ty * 6},${z.y - ty * 13 + tx * 6} ${z.x - tx * 13 + ty * 6},${z.y - ty * 13 - tx * 6}`;
        const strong = sel || treeEdge(e);
        return (
          <g key={i} onPointerDown={(ev) => { ev.stopPropagation(); onSelectEdge?.(i); }} onPointerEnter={() => setHoverEdge(i)} onPointerLeave={() => setHoverEdge(null)}
            className={onSelectEdge ? "cursor-pointer" : ""} opacity={dim ? 0.15 : strong || hoverEdge === i ? 1 : 0.5}>
            <path d={d} fill="none" stroke="transparent" strokeWidth={22} />
            <path d={d} fill="none" stroke={color} strokeWidth={sel ? 3.5 : strong ? 2.5 : 1.5} strokeLinecap="round" />
            <polygon points={head} fill={color} />
            {onDeleteEdge && (sel || hoverEdge === i) && (
              <g transform={`translate(${(a.x + 3 * c1.x + 3 * c2.x + z.x) / 8},${(a.y + 3 * c1.y + 3 * c2.y + z.y) / 8})`} onPointerDown={(ev) => { ev.stopPropagation(); setHoverEdge(null); onDeleteEdge(i); }}>
                <circle r={10} fill="#dc2626" stroke="#fff" strokeWidth={2} />
                <text textAnchor="middle" dy={4} fontSize={11} fill="#fff" fontWeight={700} pointerEvents="none">✕</text>
                <title>Delete this arrow</title>
              </g>
            )}
          </g>
        );
      })}
      {drag?.kind === "link" && (
        <line x1={at(drag.from).x} y1={at(drag.from).y} x2={cursor.x} y2={cursor.y} stroke="#00693e" strokeWidth={3} strokeLinecap="round" pointerEvents="none" />
      )}
      {nodes.map((n) => {
        const p = at(n.id);
        const w = nodeW(n.name);
        const isRoot = n.id === rootId;
        const solid = solidRoot && isRoot;
        const sel = selected === n.id;
        const target = drag?.kind === "link" && nodeAt(cursor, drag.from) === n.id;
        const h = isRoot ? HALF_H + 4 : HALF_H;
        return (
          <g
            key={n.id}
            transform={`translate(${p.x},${p.y})`}
            className={drag?.kind === "node" && drag.id === n.id ? "cursor-grabbing" : "cursor-grab"}
            style={{ filter: "drop-shadow(0 2px 3px rgba(28,25,23,.18))" }}
            onPointerEnter={() => setHover(n.id)}
            onPointerLeave={() => setHover(null)}
            onDoubleClick={(e) => { if (!onRename) return; e.stopPropagation(); setEditing({ id: n.id, value: n.editName ?? n.name }); }}
            onPointerDown={(e) => { e.stopPropagation(); const c = toSvg(e); setDrag({ kind: "node", id: n.id, dx: c.x - p.x, dy: c.y - p.y, moved: false }); }}
          >
            <rect x={-w / 2} y={-h} width={w} height={h * 2} rx={h} fill={solid ? (n.accent && n.accent !== "#00693e" ? n.accent : `url(#${foldId})`) : n.fill}
              stroke={target ? "#00693e" : sel ? "#1c1917" : n.accent ?? "#d6d3d1"} strokeWidth={sel || target ? 3 : isRoot ? 2.5 : 1.75} />
            <text textAnchor="middle" dy={4.5} fontSize={isRoot ? 14 : 13} fontWeight={isRoot ? 700 : 600} fill={solid ? "#fff" : n.text ?? "#1c1917"} pointerEvents="none" opacity={editing?.id === n.id ? 0 : 1}>{n.name}</text>
            {editing?.id === n.id && (
              <foreignObject x={-w / 2 - 30} y={-16} width={w + 60} height={32} onPointerDown={(e) => e.stopPropagation()}>
                <input
                  autoFocus
                  onFocus={(e) => e.currentTarget.select()}
                  value={editing.value}
                  onChange={(e) => setEditing({ id: n.id, value: e.target.value })}
                  onBlur={() => finishEdit(true)}
                  onKeyDown={(e) => { if (e.key === "Enter") finishEdit(true); if (e.key === "Escape") finishEdit(false); e.stopPropagation(); }}
                  className="h-8 w-full rounded-full border-2 border-[#00693e] bg-white px-3 text-center text-[13px] font-semibold outline-none"
                />
              </foreignObject>
            )}
            {n.flag && (
              <circle cx={w / 2 - 8} cy={-h + 3} r={5} fill={n.flag} stroke="#fff" strokeWidth={1.5}><title>Not yet verified</title></circle>
            )}
            {onDeleteNode && sel && (
              <g transform={`translate(${-w / 2 + 4},${-h})`} className="cursor-pointer" onPointerDown={(e) => { e.stopPropagation(); onDeleteNode(n.id); }}>
                <circle r={9} fill="#dc2626" stroke="#fff" strokeWidth={2} />
                <text textAnchor="middle" dy={4} fontSize={11} fill="#fff" fontWeight={700} pointerEvents="none">✕</text>
                <title>Delete this concept</title>
              </g>
            )}
            {editable && (sel || hover === n.id) && (
              <g
                transform={`translate(${w / 2 + 4},0)`}
                className="cursor-crosshair"
                onPointerDown={(e) => { e.stopPropagation(); onSelect?.(n.id); setCursor(toSvg(e)); setDrag({ kind: "link", from: n.id }); }}
              >
                <circle r={9} fill={`url(#${foldId})`} stroke="#fff" strokeWidth={2} />
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
