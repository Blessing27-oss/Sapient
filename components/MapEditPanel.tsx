"use client";
import type { MapSelection } from "@/components/TopicMapView";
import { removeMapEdge, removeMapNode, sectionsByNode, updateMapEdge, updateMapNode } from "@/lib/topicMap";
import type { MapNode, TopicMap } from "@/lib/types";

// Floating editor for the selected box or arrow of a lecture map (the live-room dashboard).
// Map-only: assessed concepts and their evidence are never changed from here.
export default function MapEditPanel({ map, selection, onChange, onClose }: {
  map: TopicMap;
  selection: MapSelection;
  onChange: (map: TopicMap) => void;
  onClose: () => void;
}) {
  const findNode = (id: string): MapNode | undefined => map.sections.flatMap((s) => s.nodes).find((n) => n.id === id);
  const graphNo = (sectionId: string) => map.sections.findIndex((s) => s.id === sectionId) + 1;
  const node = selection?.kind === "node" ? findNode(selection.nodeId) : undefined;
  const edge = selection?.kind === "edge" ? map.sections.find((s) => s.id === selection.sectionId)?.edges[selection.index] : undefined;
  if (!node && !edge) return null;

  return (
    <div className="card fixed bottom-6 right-4 z-40 max-h-[calc(100vh-6rem)] w-80 space-y-3 overflow-y-auto shadow-2xl sm:right-6" role="dialog" aria-label="Edit map selection">
      <button className="absolute right-3 top-2 text-lg text-stone-400 hover:text-stone-700" onClick={onClose} aria-label="Close editor">✕</button>
      {edge && selection?.kind === "edge" ? (
        <>
          <p className="text-sm font-semibold">Arrow · graph {graphNo(selection.sectionId)}</p>
          <p className="text-sm font-medium">{findNode(edge.source)?.label} <span className="text-stone-400">→</span> {findNode(edge.target)?.label}</p>
          <div className="flex gap-1 rounded-lg bg-stone-100 p-1 text-sm">
            {([["solid", "Stated / classification"], ["dotted", "Related"]] as const).map(([style, text]) => (
              <button key={style} className={`flex-1 rounded-md px-2 py-1 ${edge.style === style ? "bg-white font-semibold shadow-sm" : "text-stone-500"}`}
                onClick={() => onChange(updateMapEdge(map, selection.sectionId, selection.index, { style }))}>{text}</button>
            ))}
          </div>
          <input className="input" placeholder="Label (optional)" value={edge.label ?? ""}
            onChange={(e) => onChange(updateMapEdge(map, selection.sectionId, selection.index, { label: e.target.value || undefined }))} />
          <button className="btn-ghost w-full" onClick={() => onChange(updateMapEdge(map, selection.sectionId, selection.index, { source: edge.target, target: edge.source }))}>⇄ Flip direction</button>
          <button className="btn-ghost w-full !text-red-600" onClick={() => { onChange(removeMapEdge(map, selection.sectionId, selection.index)); onClose(); }}>Remove arrow</button>
        </>
      ) : node ? (
        <>
          <p className="text-xs text-stone-500">In graph {[...(sectionsByNode(map.sections).get(node.id) ?? [])].map(graphNo).join(", ")}</p>
          <input className="input font-semibold" value={node.label} onChange={(e) => onChange(updateMapNode(map, node.id, { label: e.target.value }))} />
          <textarea className="input text-sm" rows={3} placeholder="Details, one per line" value={node.details.join("\n")}
            onChange={(e) => onChange(updateMapNode(map, node.id, { details: e.target.value.split("\n") }))} />
          {node.conceptId && <p className="text-xs text-stone-500">This box is an assessed concept. Editing the map never changes its questions or the class’s evidence.</p>}
          <button className="text-sm text-red-600 hover:underline" onClick={() => { onChange(removeMapNode(map, node.id)); onClose(); }}>
            {node.conceptId ? "Remove box from the map (concept stays assessed)" : "Delete box"}
          </button>
        </>
      ) : null}
    </div>
  );
}
