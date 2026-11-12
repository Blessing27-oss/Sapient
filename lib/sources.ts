import { createHash } from "node:crypto";
import { getDatabase, type Database } from "./db.ts";
import type { Room } from "./types.ts";

export type SourceChunk = { id: string; page: number; text: string };
export type SavedSource = {
  id: string; ownerId: string; filename: string; createdAt: number;
  pages: string[]; chunks: SourceChunk[];
};
export type SourceSummary = Pick<SavedSource, "id" | "filename" | "createdAt"> & { pageCount: number };

export function chunkPages(pages: string[]): SourceChunk[] {
  return pages.flatMap((text, page) => {
    const chunks: SourceChunk[] = [];
    for (let start = 0; start < text.length; start += 1350) {
      const value = text.slice(start, start + 1500);
      if (value.trim()) chunks.push({ id: `p${page + 1}-${start}`, page: page + 1, text: value });
      if (start + 1500 >= text.length) break;
    }
    return chunks;
  });
}

type SourceRow = { id: string; owner_id: string; filename: string; pages: string[]; chunks: SourceChunk[]; created_at: string | number };
const fromRow = (r: SourceRow): SavedSource => ({ id: r.id, ownerId: r.owner_id, filename: r.filename, pages: r.pages, chunks: r.chunks, createdAt: Number(r.created_at) });

// Every lookup is scoped to the owner, so one professor can never read another's lecture text.
export function createSourceStore(db: () => Promise<Database>) {
  const read = async (id: string, ownerId: string): Promise<SavedSource | undefined> => {
    if (!/^[a-f0-9]{64}$/.test(id)) return undefined;
    const [row] = await (await db()).query<SourceRow>(
      "SELECT id, owner_id, filename, pages, chunks, created_at FROM sources WHERE id = $1 AND owner_id = $2", [id, ownerId]);
    return row && fromRow(row);
  };
  return {
    read,
    async save(ownerId: string, filename: string, pages: string[]): Promise<SavedSource> {
      if (!ownerId || !pages.some((page) => page.trim()) || pages.join("").length > 400_000) throw new Error("Source text must be readable and under 400,000 characters.");
      const id = createHash("sha256").update(JSON.stringify({ ownerId, pages })).digest("hex");
      // Same owner + same text hashes to the same id: keep the first upload.
      await (await db()).query(
        "INSERT INTO sources (id, owner_id, filename, pages, chunks, created_at) VALUES ($1, $2, $3, $4::jsonb, $5::jsonb, $6) ON CONFLICT (id) DO NOTHING",
        [id, ownerId, filename.slice(0, 200), JSON.stringify(pages), JSON.stringify(chunkPages(pages)), Date.now()],
      );
      return (await read(id, ownerId))!;
    },
    async list(ownerId: string): Promise<SourceSummary[]> {
      const rows = await (await db()).query<{ id: string; filename: string; created_at: string | number; page_count: number }>(
        "SELECT id, filename, created_at, jsonb_array_length(pages) AS page_count FROM sources WHERE owner_id = $1 ORDER BY created_at DESC", [ownerId]);
      return rows.map((r) => ({ id: r.id, filename: r.filename, createdAt: Number(r.created_at), pageCount: r.page_count }));
    },
  };
}

export const sourceStore = createSourceStore(getDatabase);

type Reader = { id: string; role: "professor" | "student" };
export function canReadRoomSources(room: Room, user: Reader): boolean {
  return user.role === "professor" ? room.ownerId === user.id : room.students.some((s) => s.userId === user.id);
}

// Bot-facing access: resolve sources through a room and authenticated user, never arbitrary ids.
export async function getRoomSources(room: Room, user: Reader): Promise<SavedSource[]> {
  if (!room.ownerId || !canReadRoomSources(room, user)) return [];
  const sources = await Promise.all((room.sourceIds ?? []).map((id) => sourceStore.read(id, room.ownerId!)));
  return sources.filter((s): s is SavedSource => !!s);
}

export function retrieveSourceChunks(sources: SavedSource[], query: string, maxCharacters = 12_000) {
  const terms = new Set(query.toLowerCase().match(/[\p{L}\p{N}]{3,}/gu) ?? []);
  const hits = sources.flatMap((source) => source.chunks.map((chunk) => {
    const words = new Set(chunk.text.toLowerCase().match(/[\p{L}\p{N}]{3,}/gu) ?? []);
    const score = [...terms].filter((term) => words.has(term)).length;
    return { sourceId: source.id, filename: source.filename, ...chunk, score };
  })).filter((hit) => hit.score > 0).sort((a, b) => b.score - a.score);
  let remaining = Math.max(0, Math.min(12_000, maxCharacters));
  return hits.flatMap((hit) => {
    if (remaining <= 0) return [];
    const text = hit.text.slice(0, remaining);
    remaining -= text.length;
    return [{ ...hit, text }];
  });
}
