import { createHash, randomUUID } from "node:crypto";
import { promises as fs } from "node:fs";
import path from "node:path";
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

// Atomic file replacement prevents readers from seeing a partially written document.
// Files live on the server, never under public/; each lookup enforces the source owner.
export function createSourceStore(directory: string) {
  const read = async (id: string, ownerId: string): Promise<SavedSource | undefined> => {
    if (!/^[a-f0-9]{64}$/.test(id)) return undefined;
    try {
      const source: SavedSource = JSON.parse(await fs.readFile(path.join(directory, `${id}.json`), "utf8"));
      return source.ownerId === ownerId ? source : undefined;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") return undefined;
      throw error;
    }
  };
  return {
    read,
    async save(ownerId: string, filename: string, pages: string[]): Promise<SavedSource> {
      if (!ownerId || !pages.some((page) => page.trim()) || pages.join("").length > 400_000) throw new Error("Source text must be readable and under 400,000 characters.");
      const id = createHash("sha256").update(JSON.stringify({ ownerId, pages })).digest("hex");
      const existing = await read(id, ownerId);
      if (existing) return existing;
      const source: SavedSource = { id, ownerId, filename: filename.slice(0, 200), pages: [...pages], chunks: chunkPages(pages), createdAt: Date.now() };
      await fs.mkdir(directory, { recursive: true });
      const temporary = path.join(directory, `${id}.${randomUUID()}.tmp`);
      try {
        await fs.writeFile(temporary, JSON.stringify(source), { mode: 0o600 });
        await fs.rename(temporary, path.join(directory, `${id}.json`));
      } finally { await fs.rm(temporary, { force: true }); }
      return source;
    },
    async list(ownerId: string): Promise<SourceSummary[]> {
      let files: string[];
      try { files = await fs.readdir(directory); }
      catch (error) { if ((error as NodeJS.ErrnoException).code === "ENOENT") return []; throw error; }
      const sources = await Promise.all(files.filter((f) => /^[a-f0-9]{64}\.json$/.test(f)).map((f) => read(f.slice(0, -5), ownerId)));
      return sources.filter((s): s is SavedSource => !!s).map((s) => ({ id: s.id, filename: s.filename, createdAt: s.createdAt, pageCount: s.pages.length })).sort((a, b) => b.createdAt - a.createdAt);
    },
  };
}

export const sourceStore = createSourceStore(path.join(process.cwd(), ".data", "sources"));

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
