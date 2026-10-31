"use client";
import dagre, { type Graph } from "@dagrejs/dagre";
import { useEffect, useId, useMemo, useRef, useState } from "react";
import { type CrossRef, crossRefs, sectionConnections } from "@/lib/topicMap";
import type { MapEdge, MapNode, MapSection, TopicMap } from "@/lib/types";

export type NodeStyle = { fill?: string; stroke?: string; dashed?: boolean; badge?: string };
type Spot = { sectionId: string; nodeId: string };

const LABEL_PX = 7.3, DETAIL_PX = 6.2, LABEL_LH = 17, DETAIL_LH = 15, PAD_X = 14, PAD_Y = 10;
const MAX_LABEL = 30, MAX_DETAIL = 40, MAX_DETAIL_TD = 30, CHIP_H = 16;
const FIT_WIDTH = 1080; // roughly the card's inner width on a laptop screen
const CROSS = "#00693e";

function wrap(text: string, max: number): string[] {
  const lines: string[] = [];
  let line = "";
  for (const word of text.split(" ")) {
    if (line && (line + " " + word).length > max) { lines.push(line); line = word; }
    else line = line ? `${line} ${word}` : word;
  }
  if (line) lines.push(line);
  return lines;
}

// A chip under a node points at another section: the same idea there, or a link into it.
type Chip = { sectionId: string; nodeId: string; tip: string };
type Box = { node: MapNode; label: string[]; details: string[]; chips: Chip[]; w: number; h: number; x: number; y: number };
// mx/my: a point on the middle of the arrow (where its delete button sits).
type Line = { source: string; target: string; style: "solid" | "dotted"; label?: string; d: string; lx: number; ly: number; lw: number; mx: number; my: number };
type Laid = { boxes: Box[]; lines: Line[]; width: number; height: number; direction: "TD" | "LR" };

function measure(node: MapNode, maxDetail: number, chips: Chip[]): Box {
  const label = wrap(node.label, MAX_LABEL), details = node.details.flatMap((d) => wrap(d, maxDetail));
  const w = Math.max(90, ...label.map((l) => l.length * LABEL_PX), ...details.map((l) => l.length * DETAIL_PX)) + PAD_X * 2;
  const h = PAD_Y * 2 + label.length * LABEL_LH + (details.length ? 4 + details.length * DETAIL_LH : 0);
  return { node, label, details, chips, w, h, x: 0, y: 0 };
}

function newGraph(rankdir: "TB" | "LR"): Graph {
  const g = new dagre.graphlib.Graph();
  g.setGraph({ rankdir, nodesep: 26, ranksep: rankdir === "LR" ? 60 : 46, edgesep: 14, marginx: 12, marginy: 12 });
  g.setDefaultEdgeLabel(() => ({}));
  return g;
}

function layoutSection(s: MapSection, chipsFor: (nodeId: string) => Chip[], direction = s.direction): Laid {
  const g = newGraph(direction === "LR" ? "LR" : "TB");
  const maxDetail = direction === "TD" ? MAX_DETAIL_TD : MAX_DETAIL;
  const boxes = s.nodes.map((n) => measure(n, maxDetail, chipsFor(n.id)));
  // Reserve room under each box for its chips.
  for (const b of boxes) g.setNode(b.node.id, { width: b.w, height: b.h + (b.chips.length ? CHIP_H + 4 : 0) });
  for (const e of s.edges) g.setEdge(e.source, e.target, e.label ? { width: e.label.length * 6 + 12, height: 18, labelpos: "c" } : {});
  dagre.layout(g);

  for (const b of boxes) {
    const n = g.node(b.node.id);
    b.x = n.x;
    b.y = n.y - (b.chips.length ? (CHIP_H + 4) / 2 : 0);
  }
  const lines: Line[] = s.edges.map((e: MapEdge) => {
    const ge = g.edge(e.source, e.target);
    const p = ge.points ?? [];
    let d = `M${p[0].x},${p[0].y}`;
    for (let i = 1; i < p.length - 1; i++) d += ` Q${p[i].x},${p[i].y} ${(p[i].x + p[i + 1].x) / 2},${(p[i].y + p[i + 1].y) / 2}`;
    d += ` L${p[p.length - 1].x},${p[p.length - 1].y}`;
    const mid = p[Math.floor(p.length / 2)];
    return { source: e.source, target: e.target, style: e.style, label: e.label, d, lx: ge.x ?? mid.x, ly: ge.y ?? mid.y, lw: e.label ? e.label.length * 6 + 12 : 0, mx: mid.x, my: mid.y };
  });
  const { width = 0, height = 0 } = g.graph();
  return { boxes, lines, width, height, direction: direction === "LR" ? "LR" : "TD" };
}

// A curve between two boxes, leaving and entering on the sides that face each other.
function routeBetween(a: Box, b: Box) {
  const dx = b.x - a.x, dy = b.y - a.y, horizontal = Math.abs(dx) * 0.7 > Math.abs(dy);
  const s = Math.sign(horizontal ? dx : dy) || 1;
  const p0 = horizontal ? { x: a.x + (s * a.w) / 2, y: a.y } : { x: a.x, y: a.y + (s * a.h) / 2 };
  const p3 = horizontal ? { x: b.x - (s * b.w) / 2, y: b.y } : { x: b.x, y: b.y - (s * b.h) / 2 };
  const pull = Math.max(24, (horizontal ? Math.abs(p3.x - p0.x) : Math.abs(p3.y - p0.y)) * 0.45);
  const p1 = horizontal ? { x: p0.x + s * pull, y: p0.y } : { x: p0.x, y: p0.y + s * pull };
  const p2 = horizontal ? { x: p3.x - s * pull, y: p3.y } : { x: p3.x, y: p3.y - s * pull };
  return {
    d: `M${p0.x},${p0.y} C${p1.x},${p1.y} ${p2.x},${p2.y} ${p3.x},${p3.y}`,
    mx: (p0.x + 3 * p1.x + 3 * p2.x + p3.x) / 8, my: (p0.y + 3 * p1.y + 3 * p2.y + p3.y) / 8,
  };
}

// Put dragged boxes where the professor left them and redraw the arrows that touch them.
function applyPositions(laid: Laid, positions: Record<string, { x: number; y: number }>): Laid {
  const moved = new Set(Object.keys(positions).filter((id) => laid.boxes.some((b) => b.node.id === id)));
  if (!moved.size) return laid;
  // Hand-placed boxes are drawn after the others, so they sit on top of anything they overlap.
  const boxes = [
    ...laid.boxes.filter((b) => !moved.has(b.node.id)),
    ...laid.boxes.filter((b) => moved.has(b.node.id)).map((b) => ({ ...b, ...positions[b.node.id] })),
  ];
  const byId = new Map(boxes.map((b) => [b.node.id, b]));
  const lines = laid.lines.map((l) => {
    if (!moved.has(l.source) && !moved.has(l.target)) return l;
    const r = routeBetween(byId.get(l.source)!, byId.get(l.target)!);
    return { ...l, d: r.d, lx: r.mx, ly: r.my, mx: r.mx, my: r.my };
  });
  const width = Math.max(laid.width, ...boxes.map((b) => b.x + b.w / 2 + 16));
  const height = Math.max(laid.height, ...boxes.map((b) => b.y + b.h / 2 + (b.chips.length ? CHIP_H + 8 : 0) + 16));
  return { ...laid, boxes, lines, width, height };
}

// A top-down tree widens with every sibling; when it would not fit, draw it left-to-right so
// siblings stack vertically like an outline.
function layoutFitted(s: MapSection, chipsFor: (nodeId: string) => Chip[]): Laid {
  let laid = layoutSection(s, chipsFor);
  if (s.direction === "TD" && laid.width > FIT_WIDTH) {
    const sideways = layoutSection(s, chipsFor, "LR");
    if (sideways.width < laid.width) laid = sideways;
  }
  // The professor's arrangement only applies to the direction it was made in.
  return s.layout?.direction === laid.direction ? applyPositions(laid, s.layout.positions) : laid;
}

type GraphProps = {
  laid: Laid;
  title: string;
  arrows?: boolean;
  styleFor?: (n: MapNode) => NodeStyle;
  isSelected?: (n: MapNode) => boolean;
  isLit?: (n: MapNode) => boolean;
  onNodeClick?: (n: MapNode) => void;
  onHover?: (n: MapNode | null) => void;
  onChip?: (c: Chip) => void;
  chipLabel?: (c: Chip) => string;
  // Editing hooks (professor review only).
  allClickable?: boolean;
  selectedEdge?: number | null;
  onEdgeClick?: (index: number) => void;
  onNodeDoubleClick?: (n: MapNode) => void;
  hideLabel?: (n: MapNode) => boolean;
  nodeExtra?: (b: Box) => React.ReactNode;
  edgeExtra?: (l: Line, index: number) => React.ReactNode;
  onEdgeHover?: (index: number | null) => void;
  onNodePointerDown?: (e: React.PointerEvent, b: Box) => void;
};

// What the professor has selected on the map: a box, or an arrow inside one graph.
export type MapSelection = { kind: "node"; sectionId: string; nodeId: string } | { kind: "edge"; sectionId: string; index: number } | null;
export type MapEditor = {
  selection: MapSelection;
  onSelect: (s: MapSelection) => void;
  onAddNode: (sectionId: string) => string; // returns the new node's id so it can be renamed straight away
  onRename: (nodeId: string, label: string) => void;
  onConnect: (sectionId: string, source: string, target: string) => void;
  onDeleteNode: (nodeId: string) => void;
  onDeleteEdge: (sectionId: string, index: number) => void;
  onMove: (sectionId: string, nodeId: string, pos: { x: number; y: number }, direction: "TD" | "LR") => void;
  onResetLayout: (sectionId: string) => void;
};

// Shrink wide graphs to the card, but never below ~55% (text stays legible); past that, scroll.
function GraphSvg(props: GraphProps) {
  const { width, height } = props.laid;
  return (
    <div className="overflow-x-auto">
      <svg viewBox={`0 0 ${width} ${height}`} className="mx-auto block h-auto w-full" style={{ maxWidth: width, minWidth: width * 0.55 }} role="img" aria-label={props.title}>
        <GraphContent {...props} />
      </svg>
    </div>
  );
}

function GraphContent({ laid, arrows = true, styleFor, isSelected, isLit, onNodeClick, onHover, onChip, chipLabel, allClickable, selectedEdge, onEdgeClick, onNodeDoubleClick, hideLabel, nodeExtra, edgeExtra, onEdgeHover, onNodePointerDown }: GraphProps) {
  const marker = useId().replace(/:/g, "");
  return (
    <>
      <defs>
        <marker id={marker} viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
          <path d="M0,0 L10,5 L0,10 z" fill="#57534e" />
        </marker>
        <marker id={`${marker}s`} viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
          <path d="M0,0 L10,5 L0,10 z" fill={CROSS} />
        </marker>
      </defs>
      {laid.lines.map((l, i) => (
        <g key={i} className={onEdgeClick ? "cursor-pointer" : undefined} onClick={onEdgeClick && ((e) => { e.stopPropagation(); onEdgeClick(i); })}
          onPointerEnter={onEdgeHover && (() => onEdgeHover(i))} onPointerLeave={onEdgeHover && (() => onEdgeHover(null))}>
          {onEdgeClick && <path d={l.d} fill="none" stroke="transparent" strokeWidth={16} />}
          <path d={l.d} fill="none" stroke={selectedEdge === i ? CROSS : "#57534e"} strokeWidth={selectedEdge === i ? 3 : 1.4}
            strokeDasharray={l.style === "dotted" ? "4 4" : undefined} markerEnd={arrows ? `url(#${marker}${selectedEdge === i ? "s" : ""})` : undefined} />
          {l.label && (
            <g transform={`translate(${l.lx},${l.ly})`}>
              <rect x={-l.lw / 2} y={-9} width={l.lw} height={18} rx={4} fill="#fafaf9" stroke="#e7e5e4" />
              <text textAnchor="middle" dy={4} fontSize={11} fontStyle="italic" fill="#57534e">{l.label}</text>
            </g>
          )}
          {edgeExtra?.(l, i)}
        </g>
      ))}
      {laid.boxes.map((b) => {
        const st = styleFor?.(b.node) ?? {};
        const selected = isSelected?.(b.node) ?? false;
        const lit = isLit?.(b.node) ?? false;
        const clickable = !!onNodeClick && (allClickable || !!b.node.conceptId);
        const top = b.y - b.h / 2;
        const hidden = hideLabel?.(b.node);
        return (
          <g key={b.node.id} onPointerEnter={onHover && (() => onHover(b.node))} onPointerLeave={onHover && (() => onHover(null))}>
            <g className={onNodePointerDown ? "cursor-grab" : clickable ? "cursor-pointer" : undefined} onClick={clickable ? (e) => { e.stopPropagation(); onNodeClick!(b.node); } : undefined}
              onPointerDown={onNodePointerDown && ((e) => onNodePointerDown(e, b))}
              onDoubleClick={onNodeDoubleClick && ((e) => { e.stopPropagation(); onNodeDoubleClick(b.node); })} opacity={hidden ? 0.35 : 1}>
              <rect x={b.x - b.w / 2} y={top} width={b.w} height={b.h} rx={8}
                fill={st.fill ?? "#ffffff"} stroke={lit ? "#d97706" : selected ? CROSS : st.stroke ?? "#a8a29e"}
                strokeWidth={lit || selected ? 3 : 1.3} strokeDasharray={st.dashed && !lit ? "5 3" : undefined} />
              {b.label.map((l, i) => (
                <text key={`l${i}`} x={b.x} y={top + PAD_Y + 12 + i * LABEL_LH} textAnchor="middle" fontSize={13} fontWeight={650} fill="#1c1917">{l}</text>
              ))}
              {b.details.map((l, i) => (
                <text key={`d${i}`} x={b.x} y={top + PAD_Y + 12 + b.label.length * LABEL_LH + 4 + i * DETAIL_LH} textAnchor="middle" fontSize={11.5} fill="#44403c">{l}</text>
              ))}
              {st.badge && <circle cx={b.x + b.w / 2 - 7} cy={top + 7} r={4} fill={st.badge} />}
            </g>
            {nodeExtra?.(b)}
            {b.chips.map((c, i) => {
              const cw = 34, x = b.x - (b.chips.length * (cw + 4) - 4) / 2 + i * (cw + 4);
              return (
                <g key={c.sectionId} className="cursor-pointer" onClick={() => onChip?.(c)}>
                  <title>{c.tip}</title>
                  <rect x={x} y={top + b.h + 4} width={cw} height={CHIP_H} rx={8} fill="#ecfdf5" stroke={CROSS} strokeWidth={1} />
                  <text x={x + cw / 2} y={top + b.h + 16} textAnchor="middle" fontSize={10.5} fontWeight={600} fill={CROSS}>{chipLabel?.(c)}</text>
                </g>
              );
            })}
          </g>
        );
      })}
    </>
  );
}

// One graph with editing: click to select, drag a box to move it, double-click a box to rename it,
// double-click empty space to add a box, drag a box's + handle onto another box to draw an arrow,
// and the red ✕ on a hovered box or arrow deletes it.
function EditableGraph({ sectionId, editor, ...props }: GraphProps & { sectionId: string; editor: MapEditor }) {
  const { laid } = props;
  const svg = useRef<SVGSVGElement>(null);
  const [hover, setHover] = useState<string | null>(null);
  const [hoverEdge, setHoverEdge] = useState<number | null>(null);
  const [renaming, setRenaming] = useState<{ id: string; value: string } | null>(null);
  const [link, setLink] = useState<{ from: string; x: number; y: number } | null>(null);
  const [drag, setDrag] = useState<{ id: string; dx: number; dy: number; x: number; y: number; moved: boolean } | null>(null);
  const sel = editor.selection;
  const busy = !!link || !!drag?.moved;
  // While dragging, draw the box at the pointer and re-route its arrows; it is saved on release.
  const placed = drag?.moved ? applyPositions(laid, { [drag.id]: { x: drag.x, y: drag.y } }) : laid;
  // Draw the box being dragged (or the selected one) last, so it sits on top of anything it overlaps.
  const front = drag?.id ?? (sel?.kind === "node" ? sel.nodeId : null);
  const shown = front ? { ...placed, boxes: [...placed.boxes.filter((b) => b.node.id !== front), ...placed.boxes.filter((b) => b.node.id === front)] } : placed;

  const toSvg = (e: React.PointerEvent | React.MouseEvent) => {
    const p = new DOMPoint(e.clientX, e.clientY).matrixTransform(svg.current!.getScreenCTM()!.inverse());
    return { x: p.x, y: p.y };
  };
  const boxAt = (p: { x: number; y: number }) => shown.boxes.find((b) => Math.abs(p.x - b.x) <= b.w / 2 && Math.abs(p.y - b.y) <= b.h / 2);
  const commit = (save: boolean) => {
    if (save && renaming?.value.trim()) editor.onRename(renaming.id, renaming.value.trim());
    setRenaming(null);
  };
  const endDrag = () => {
    if (drag?.moved) editor.onMove(sectionId, drag.id, { x: drag.x, y: drag.y }, laid.direction);
    setDrag(null);
  };
  const deleteButton = (x: number, y: number, title: string, onClick: () => void) => (
    <g className="cursor-pointer" onPointerDown={(e) => e.stopPropagation()} onClick={(e) => { e.stopPropagation(); onClick(); }}>
      <title>{title}</title>
      <circle cx={x} cy={y} r={9} fill="#dc2626" stroke="#fff" strokeWidth={2} />
      <text x={x} y={y + 3.5} textAnchor="middle" fontSize={10} fontWeight={700} fill="#fff" pointerEvents="none">✕</text>
    </g>
  );

  return (
    <div className="overflow-x-auto">
      <svg ref={svg} viewBox={`0 0 ${laid.width} ${laid.height}`} className="mx-auto block h-auto w-full touch-none select-none"
        style={{ maxWidth: laid.width, minWidth: laid.width * 0.55 }} role="img" aria-label={props.title}
        onPointerDown={(e) => { if (e.target === svg.current) editor.onSelect(null); }}
        onDoubleClick={(e) => {
          if (e.target !== svg.current) return;
          const id = editor.onAddNode(sectionId);
          setRenaming({ id, value: "New concept" });
        }}
        onPointerMove={(e) => {
          const p = toSvg(e);
          if (link) setLink({ ...link, ...p });
          if (drag) {
            const b = laid.boxes.find((x) => x.node.id === drag.id)!;
            // Keep the box inside the graph's frame.
            const x = Math.min(laid.width - b.w / 2 - 4, Math.max(b.w / 2 + 4, p.x - drag.dx));
            const y = Math.min(laid.height - b.h / 2 - 4, Math.max(b.h / 2 + 4, p.y - drag.dy));
            setDrag({ ...drag, x, y, moved: drag.moved || Math.hypot(x - b.x, y - b.y) > 4 });
          }
        }}
        onPointerUp={(e) => {
          endDrag();
          if (!link) return;
          const to = boxAt(toSvg(e));
          if (to && to.node.id !== link.from) editor.onConnect(sectionId, link.from, to.node.id);
          setLink(null);
        }}
        onPointerLeave={endDrag}>
        <GraphContent {...props} laid={shown} allClickable
          isSelected={(n) => sel?.kind === "node" && sel.nodeId === n.id}
          isLit={(n) => (!!link && hover === n.id && n.id !== link.from) || (props.isLit?.(n) ?? false)}
          selectedEdge={sel?.kind === "edge" && sel.sectionId === sectionId ? sel.index : null}
          onEdgeClick={(index) => editor.onSelect({ kind: "edge", sectionId, index })}
          onEdgeHover={setHoverEdge}
          onNodeClick={(n) => editor.onSelect({ kind: "node", sectionId, nodeId: n.id })}
          onNodeDoubleClick={(n) => setRenaming({ id: n.id, value: n.label })}
          onNodePointerDown={(e, b) => {
            if (e.button !== 0 || renaming?.id === b.node.id) return;
            e.stopPropagation();
            const p = toSvg(e);
            setDrag({ id: b.node.id, dx: p.x - b.x, dy: p.y - b.y, x: b.x, y: b.y, moved: false });
          }}
          onHover={(n) => setHover(n?.id ?? null)}
          hideLabel={(n) => renaming?.id === n.id}
          edgeExtra={(l, i) => {
            const selected = sel?.kind === "edge" && sel.sectionId === sectionId && sel.index === i;
            if (busy || (hoverEdge !== i && !selected)) return null;
            const [x, y] = l.label ? [l.lx + l.lw / 2 + 12, l.ly] : [l.mx, l.my];
            return deleteButton(x, y, "Delete this arrow", () => { setHoverEdge(null); editor.onDeleteEdge(sectionId, i); });
          }}
          nodeExtra={(b) => {
            const top = b.y - b.h / 2;
            if (renaming?.id === b.node.id) {
              return (
                <foreignObject x={b.x - Math.max(b.w, 200) / 2} y={top + 4} width={Math.max(b.w, 200)} height={30}>
                  <input autoFocus value={renaming.value} className="h-[28px] w-full rounded-md border-2 border-[#00693e] bg-white px-2 text-center text-[13px] font-semibold outline-none"
                    onFocus={(e) => e.target.select()} onChange={(e) => setRenaming({ ...renaming, value: e.target.value })}
                    onKeyDown={(e) => { if (e.key === "Enter") commit(true); if (e.key === "Escape") commit(false); e.stopPropagation(); }}
                    onBlur={() => commit(true)} onPointerDown={(e) => e.stopPropagation()} onDoubleClick={(e) => e.stopPropagation()} />
                </foreignObject>
              );
            }
            const show = !busy && (hover === b.node.id || (sel?.kind === "node" && sel.nodeId === b.node.id));
            if (!show) return null;
            return (
              <>
                {deleteButton(b.x + b.w / 2 - 2, top + 2, b.node.conceptId ? "Delete this box and its concept" : "Delete this box", () => { setHover(null); editor.onDeleteNode(b.node.id); })}
                <g className="cursor-crosshair" onPointerDown={(e) => {
                  e.stopPropagation();
                  svg.current?.setPointerCapture(e.pointerId);
                  setLink({ from: b.node.id, ...toSvg(e) });
                }}>
                  <title>Drag onto another box to draw an arrow</title>
                  <circle cx={b.x + b.w / 2} cy={b.y} r={10} fill={CROSS} stroke="#fff" strokeWidth={2} />
                  <text x={b.x + b.w / 2} y={b.y + 4.5} textAnchor="middle" fontSize={14} fontWeight={700} fill="#fff" pointerEvents="none">+</text>
                </g>
              </>
            );
          }}
        />
        {link && (() => {
          const from = shown.boxes.find((b) => b.node.id === link.from);
          return from && <line x1={from.x + from.w / 2} y1={from.y} x2={link.x} y2={link.y} stroke={CROSS} strokeWidth={2.5} strokeDasharray="6 4" pointerEvents="none" />;
        })()}
      </svg>
    </div>
  );
}

// ---------- Full screen: every graph in full detail on one canvas, joined by cross-graph lines ----------

const FRAME_PAD = 28, FRAME_HEAD = 52, NOTE_PX = 6.4, NOTE_LH = 16;
type Frame = { section: MapSection; num: number; laid: Laid; x: number; y: number; w: number; h: number; gx: number; gy: number; note: string[] };
type Bridge = { a: string; b: string; kind: "same" | "link"; style: "solid" | "dotted"; label?: string; d: string; lx: number; ly: number };

function layoutCanvas(map: TopicMap) {
  const frames: Frame[] = map.sections.map((s, i) => {
    const laid = layoutFitted(s, () => []);
    const w = Math.max(laid.width + FRAME_PAD * 2, `${i + 1}. ${s.title}`.length * 10 + FRAME_PAD * 2, 380);
    const noteText = [s.sources && `Source: ${s.sources}.`, s.note].filter(Boolean).join(" ");
    const note = noteText ? wrap(noteText, Math.floor((w - FRAME_PAD * 2) / NOTE_PX)) : [];
    const h = FRAME_HEAD + laid.height + (note.length ? 12 + note.length * NOTE_LH : 0) + FRAME_PAD;
    return { section: s, num: i + 1, laid, x: 0, y: 0, w, h, gx: 0, gy: 0, note };
  });

  // Place the frames so connected graphs sit next to each other, in reading order.
  const g = new dagre.graphlib.Graph();
  g.setGraph({ rankdir: "LR", nodesep: 140, ranksep: 220, marginx: 40, marginy: 40 });
  g.setDefaultEdgeLabel(() => ({}));
  for (const f of frames) g.setNode(f.section.id, { width: f.w, height: f.h });
  const order = new Map(frames.map((f) => [f.section.id, f.num]));
  for (const c of sectionConnections(map)) {
    const [a, b] = (order.get(c.a)! < order.get(c.b)!) ? [c.a, c.b] : [c.b, c.a];
    g.setEdge(a, b);
  }
  dagre.layout(g);
  for (const f of frames) {
    const n = g.node(f.section.id);
    f.x = n.x - f.w / 2; f.y = n.y - f.h / 2;
    f.gx = f.x + (f.w - f.laid.width) / 2; f.gy = f.y + FRAME_HEAD;
  }

  // Every placed copy of a node, in canvas coordinates.
  type Spot2 = { key: string; sectionId: string; x: number; y: number; w: number; h: number };
  const spots = new Map<string, Spot2[]>();
  for (const f of frames) for (const b of f.laid.boxes) {
    const list = spots.get(b.node.id) ?? [];
    list.push({ key: `${f.section.id}:${b.node.id}`, sectionId: f.section.id, x: f.gx + b.x, y: f.gy + b.y, w: b.w, h: b.h });
    spots.set(b.node.id, list);
  }
  const allSpots = [...spots.values()].flat();
  // Curve leaving each box from the side that faces the other one.
  const curve = (p: Spot2, q: Spot2) => {
    const dx = q.x - p.x, dy = q.y - p.y, horizontal = Math.abs(dx) * 0.6 > Math.abs(dy);
    const s = Math.sign(horizontal ? dx : dy) || 1;
    const p0 = horizontal ? { x: p.x + (s * p.w) / 2, y: p.y } : { x: p.x, y: p.y + (s * p.h) / 2 };
    const p3 = horizontal ? { x: q.x - (s * q.w) / 2, y: q.y } : { x: q.x, y: q.y - (s * q.h) / 2 };
    const pull = Math.max(80, (horizontal ? Math.abs(p3.x - p0.x) : Math.abs(p3.y - p0.y)) * 0.45);
    const p1 = horizontal ? { x: p0.x + s * pull, y: p0.y } : { x: p0.x, y: p0.y + s * pull };
    const p2 = horizontal ? { x: p3.x - s * pull, y: p3.y } : { x: p3.x, y: p3.y - s * pull };
    // Put the label at the first point along the curve (middle first) that isn't over a box.
    const at = (t: number) => {
      const u = 1 - t, a = u * u * u, b = 3 * u * u * t, c = 3 * u * t * t, e = t * t * t;
      return { x: a * p0.x + b * p1.x + c * p2.x + e * p3.x, y: a * p0.y + b * p1.y + c * p2.y + e * p3.y };
    };
    const clear = (pt: { x: number; y: number }) => !allSpots.some((r) => Math.abs(pt.x - r.x) < r.w / 2 + 30 && Math.abs(pt.y - r.y) < r.h / 2 + 12);
    const spot = [0.5, 0.42, 0.58, 0.34, 0.66, 0.26, 0.74].map(at).find(clear) ?? at(0.5);
    return { d: `M${p0.x},${p0.y} C${p1.x},${p1.y} ${p2.x},${p2.y} ${p3.x},${p3.y}`, lx: spot.x, ly: spot.y };
  };
  const nearest = (from: Spot2[], to: Spot2[]) => {
    let best: [Spot2, Spot2] | null = null, dist = Infinity;
    for (const p of from) for (const q of to) {
      if (p.sectionId === q.sectionId) continue;
      const d = Math.hypot(p.x - q.x, p.y - q.y);
      if (d < dist) { dist = d; best = [p, q]; }
    }
    return best;
  };

  const bridges: Bridge[] = [];
  // The same idea drawn in several graphs: join consecutive copies.
  for (const list of spots.values()) for (let i = 1; i < list.length; i++) {
    bridges.push({ a: list[i - 1].key, b: list[i].key, kind: "same", style: "dotted", label: "same idea", ...curve(list[i - 1], list[i]) });
  }
  for (const e of map.links) {
    const pair = nearest(spots.get(e.source) ?? [], spots.get(e.target) ?? []);
    if (pair) bridges.push({ a: pair[0].key, b: pair[1].key, kind: "link", style: e.style, label: e.label, ...curve(pair[0], pair[1]) });
  }
  const { width = 0, height = 0 } = g.graph();
  return { frames, bridges, width, height };
}

function FullScreenMap({ title, map, styleFor, onSelectConcept, onClose, legend }: {
  title: string;
  map: TopicMap;
  styleFor?: (n: MapNode) => NodeStyle;
  onSelectConcept?: (conceptId: string) => void;
  onClose: () => void;
  legend: React.ReactNode;
}) {
  const marker = useId().replace(/:/g, "");
  const canvas = useMemo(() => layoutCanvas(map), [map]);
  const [hover, setHover] = useState<string | null>(null);
  // Start with the tallest graph fully in view; scroll sideways to move between graphs.
  const [k, setK] = useState(() => Math.min(1, Math.max(0.45, (window.innerHeight - 90) / canvas.height)));

  useEffect(() => {
    const key = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", key);
    return () => { document.body.style.overflow = overflow; window.removeEventListener("keydown", key); };
  }, [onClose]);

  const touching = (key: string) => canvas.bridges.some((b) => b.a === key || b.b === key);
  const partners = new Set(hover ? canvas.bridges.flatMap((b) => (b.a === hover ? [b.b] : b.b === hover ? [b.a] : [])) : []);
  const zoom = (f: number) => setK((v) => Math.min(1.6, Math.max(0.3, +(v * f).toFixed(2))));

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-[#f7f7f3]" role="dialog" aria-modal="true" aria-label={`${title}: all graphs`}>
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-stone-200 bg-white px-5 py-3">
        <div className="min-w-0">
          <h2 className="truncate text-lg font-bold">{title}</h2>
          <p className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-stone-500">{legend}
            <span className="inline-flex items-center gap-1.5"><svg width="26" height="6"><line x1="0" y1="3" x2="26" y2="3" stroke={CROSS} strokeWidth="2.2" /></svg>connection between graphs</span>
            <span>Hover a box to trace its connections · scroll to move around</span>
          </p>
        </div>
        <div className="flex items-center gap-2">
          <div className="flex items-center gap-1 rounded-lg border border-stone-200 p-1">
            <button className="h-7 w-7 rounded text-lg leading-none hover:bg-stone-100" onClick={() => zoom(0.85)} title="Zoom out">−</button>
            <span className="w-12 text-center text-xs tabular-nums text-stone-600">{Math.round(k * 100)}%</span>
            <button className="h-7 w-7 rounded text-lg leading-none hover:bg-stone-100" onClick={() => zoom(1.18)} title="Zoom in">+</button>
          </div>
          <button className="btn-ghost" onClick={onClose}>Close ✕</button>
        </div>
      </div>
      <div className="flex-1 overflow-auto">
        <svg width={canvas.width * k} height={canvas.height * k} viewBox={`0 0 ${canvas.width} ${canvas.height}`} className="block">
          <defs>
            <marker id={marker} viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
              <path d="M0,0 L10,5 L0,10 z" fill={CROSS} />
            </marker>
          </defs>
          {/* Layering: frame backgrounds, then cross-graph lines, then the graphs (boxes hide the
              lines passing behind them, so text is never covered), then the line labels. */}
          {canvas.frames.map((f) => (
            <g key={f.section.id}>
              <rect x={f.x} y={f.y} width={f.w} height={f.h} rx={18} fill="#ffffff" stroke="#e7e5e4" strokeWidth={1.5} />
              <text x={f.x + FRAME_PAD} y={f.y + 34} fontSize={19} fontWeight={700} fill="#1c1917">{f.num}. {f.section.title}</text>
              {f.note.map((line, i) => (
                <text key={i} x={f.x + FRAME_PAD} y={f.gy + f.laid.height + 12 + (i + 1) * NOTE_LH - 4} fontSize={12} fill="#78716c">{line}</text>
              ))}
            </g>
          ))}
          <g pointerEvents="none">
            {canvas.bridges.map((b, i) => {
              const on = hover ? b.a === hover || b.b === hover : null;
              return (
                <path key={i} d={b.d} fill="none" stroke={CROSS} strokeWidth={on ? 3.2 : 2.2} opacity={on === false ? 0.15 : 1}
                  strokeDasharray={b.style === "dotted" ? "6 5" : undefined} markerEnd={b.kind === "link" ? `url(#${marker})` : undefined} />
              );
            })}
          </g>
          {canvas.frames.map((f) => (
            <g key={f.section.id} transform={`translate(${f.gx},${f.gy})`}>
              <GraphContent
                laid={f.laid} title={f.section.title} styleFor={styleFor}
                isLit={(n) => partners.has(`${f.section.id}:${n.id}`) || hover === `${f.section.id}:${n.id}`}
                onHover={(n) => setHover(n && touching(`${f.section.id}:${n.id}`) ? `${f.section.id}:${n.id}` : null)}
                onNodeClick={onSelectConcept ? (n) => { if (n.conceptId) { onSelectConcept(n.conceptId); onClose(); } } : undefined}
              />
            </g>
          ))}
          <g pointerEvents="none">
            {canvas.bridges.map((b, i) => {
              const on = hover ? b.a === hover || b.b === hover : null;
              if (!b.label) return null;
              const w = b.label.length * 6.4 + 14;
              return (
                <g key={i} transform={`translate(${b.lx},${b.ly})`} opacity={on === false ? 0.15 : 1}>
                  <rect x={-w / 2} y={-11} width={w} height={22} rx={11} fill="#ecfdf5" stroke={CROSS} strokeWidth={1} />
                  <text textAnchor="middle" dy={4} fontSize={11.5} fontWeight={600} fill={CROSS}>{b.label}</text>
                </g>
              );
            })}
          </g>
        </svg>
      </div>
    </div>
  );
}

export default function TopicMapView({ title, map, styleFor, selectedConceptId, onSelectConcept, legend, editor }: {
  title: string;
  editor?: MapEditor;
  map: TopicMap;
  styleFor?: (n: MapNode) => NodeStyle;
  selectedConceptId?: string | null;
  onSelectConcept?: (conceptId: string) => void;
  legend?: React.ReactNode;
}) {
  const anchor = useId().replace(/:/g, "");
  const multi = map.sections.length > 1;
  const [spot, setSpot] = useState<Spot | null>(null);
  const [fullScreen, setFullScreen] = useState(false);

  // Scroll to and briefly highlight a node in another graph.
  useEffect(() => {
    if (!spot) return;
    document.getElementById(`${anchor}-${spot.sectionId}`)?.scrollIntoView({ behavior: "smooth", block: "center" });
    const t = setTimeout(() => setSpot(null), 2500);
    return () => clearTimeout(t);
  }, [spot, anchor]);

  const number = useMemo(() => new Map(map.sections.map((s, i) => [s.id, i + 1])), [map]);
  const sectionNumber = (id: string) => number.get(id) ?? 0;

  const sectionLayouts = useMemo(() => map.sections.map((s) => layoutFitted(s, (nodeId) => {
    const refs = crossRefs(map, s.id, nodeId);
    return [...new Set(refs.map((r) => r.sectionId))].map((sid) => {
      const here = refs.filter((r) => r.sectionId === sid);
      const tip = here.map((r: CrossRef) => (r.kind === "same" ? "Same idea" : `Linked${r.edge?.label ? ` (${r.edge.label})` : ""}`) + ` in graph ${number.get(sid)}`).join("\n");
      return { sectionId: sid, nodeId: here[0].nodeId, tip };
    });
  })), [map, number]);

  const overview = useMemo<Laid | null>(() => {
    const links = sectionConnections(map);
    if (!multi || !links.length) return null;
    return layoutSection({
      id: "overview", title: "How the graphs connect", direction: "LR", sources: "", note: "",
      nodes: map.sections.map((s, i) => ({ id: s.id, label: `${i + 1}. ${s.title}`, details: [] })),
      edges: links.map((c) => ({ source: c.a, target: c.b, style: "dotted" as const, label: c.via.length > 2 ? `${c.via.slice(0, 2).join(" · ")} +${c.via.length - 2}` : c.via.join(" · ") })),
    }, () => []);
  }, [map, multi]);

  const nodeClick = onSelectConcept ? (n: MapNode) => n.conceptId && onSelectConcept(n.conceptId) : undefined;
  const isSelected = (n: MapNode) => !!n.conceptId && n.conceptId === selectedConceptId;
  const legendItems = (
    <>
      <span className="inline-flex items-center gap-1.5"><svg width="26" height="6"><line x1="0" y1="3" x2="26" y2="3" stroke="#57534e" strokeWidth="1.5" /></svg>classification or stated relationship</span>
      <span className="inline-flex items-center gap-1.5"><svg width="26" height="6"><line x1="0" y1="3" x2="26" y2="3" stroke="#57534e" strokeWidth="1.5" strokeDasharray="4 4" /></svg>related concepts</span>
    </>
  );

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="space-y-1 text-sm text-stone-600">
          {map.sourceNote && <p>{map.sourceNote}</p>}
          <p className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-stone-500">
            {legendItems}
            {multi && <span><b className="text-[#00693e]">↗ 2</b> same idea or a link in graph 2</span>}
            {legend}
          </p>
        </div>
        <button className="btn-ghost shrink-0" onClick={() => setFullScreen(true)}>⤢ {multi ? "See all graphs connected" : "Full screen"}</button>
      </div>

      {overview && (
        <section className="card space-y-2">
          <h3 className="text-sm font-bold uppercase tracking-wide text-stone-500">How the graphs connect</h3>
          <GraphSvg laid={overview} title="How the graphs connect" arrows={false} allClickable
            onNodeClick={(n) => document.getElementById(`${anchor}-${n.id}`)?.scrollIntoView({ behavior: "smooth", block: "start" })} />
        </section>
      )}
      {map.sections.map((s, i) => (
        <section key={s.id} id={`${anchor}-${s.id}`} className="card scroll-mt-4 space-y-3">
          <div className="flex items-center justify-between gap-3">
            <h3 className="text-lg font-bold">{i + 1}. {s.title}</h3>
            {editor && (
              <div className="flex gap-2">
                {s.layout && Object.keys(s.layout.positions).length > 0 && (
                  <button className="btn-ghost" title="Put every box back where the automatic layout places it" onClick={() => editor.onResetLayout(s.id)}>Reset layout</button>
                )}
                <button className="btn-ghost" onClick={() => editor.onSelect({ kind: "node", sectionId: s.id, nodeId: editor.onAddNode(s.id) })}>+ Add node</button>
              </div>
            )}
          </div>
          {editor ? (
            <EditableGraph sectionId={s.id} editor={editor} laid={sectionLayouts[i]} title={s.title} styleFor={styleFor}
              isLit={(n) => spot?.sectionId === s.id && spot.nodeId === n.id}
              onChip={(c) => setSpot({ sectionId: c.sectionId, nodeId: c.nodeId })} chipLabel={(c) => `↗ ${sectionNumber(c.sectionId)}`} />
          ) : (
            <GraphSvg laid={sectionLayouts[i]} title={s.title} styleFor={styleFor} isSelected={isSelected}
              isLit={(n) => spot?.sectionId === s.id && spot.nodeId === n.id} onNodeClick={nodeClick}
              onChip={(c) => setSpot({ sectionId: c.sectionId, nodeId: c.nodeId })} chipLabel={(c) => `↗ ${sectionNumber(c.sectionId)}`} />
          )}
          {(s.sources || s.note) && (
            <p className="text-xs leading-relaxed text-stone-500">
              {s.sources && <><b className="text-stone-700">Source:</b> {s.sources}. </>}
              {s.note}
            </p>
          )}
        </section>
      ))}
      {map.studyRoute && (
        <div className="rounded-xl border border-[#00693e]/30 bg-green-50/50 px-4 py-3 text-sm">
          <b className="text-[#00693e]">Study route.</b> {map.studyRoute}
        </div>
      )}
      {fullScreen && (
        <FullScreenMap title={title} map={map} styleFor={styleFor} onSelectConcept={onSelectConcept}
          onClose={() => setFullScreen(false)} legend={<>{legendItems}{legend}</>} />
      )}
    </div>
  );
}
