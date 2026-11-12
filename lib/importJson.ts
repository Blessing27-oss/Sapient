import { promises as fs } from "node:fs";
import path from "node:path";
import type { Database } from "./db.ts";
import type { SavedSource } from "./sources.ts";
import type { Room } from "./types.ts";
import type { User } from "./users.ts";

async function readJson<T>(file: string): Promise<T | undefined> {
  try { return JSON.parse(await fs.readFile(file, "utf8")) as T; }
  catch (error) { if ((error as NodeJS.ErrnoException).code === "ENOENT") return undefined; throw error; }
}

// One-time import of the legacy JSON store (.data/users.json, db.json, sources/*.json).
// Runs in one transaction and skips rows that already exist, so it is safe to re-run.
export async function importJsonData(db: Database, dataDir: string) {
  const users = Object.values((await readJson<Record<string, User>>(path.join(dataDir, "users.json"))) ?? {});
  const rooms = Object.values((await readJson<Record<string, Room>>(path.join(dataDir, "db.json"))) ?? {});
  let sourceFiles: string[] = [];
  try { sourceFiles = (await fs.readdir(path.join(dataDir, "sources"))).filter((f) => /^[a-f0-9]{64}\.json$/.test(f)); }
  catch (error) { if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error; }

  const counts = { users: 0, sources: 0, rooms: 0, members: 0 };
  await db.transaction(async (tx) => {
    for (const u of users) {
      counts.users += (await tx.query(
        "INSERT INTO users (id, name, username, role, salt, hash) VALUES ($1, $2, $3, $4, $5, $6) ON CONFLICT DO NOTHING RETURNING id",
        [u.id, u.name, u.username, u.role, u.salt, u.hash],
      )).length;
    }
    for (const f of sourceFiles) {
      const s = (await readJson<SavedSource>(path.join(dataDir, "sources", f)))!;
      counts.sources += (await tx.query(
        "INSERT INTO sources (id, owner_id, filename, pages, chunks, created_at) VALUES ($1, $2, $3, $4::jsonb, $5::jsonb, $6) ON CONFLICT DO NOTHING RETURNING id",
        [s.id, s.ownerId, s.filename, JSON.stringify(s.pages), JSON.stringify(s.chunks), s.createdAt],
      )).length;
    }
    for (const r of rooms) {
      counts.rooms += (await tx.query(
        "INSERT INTO rooms (code, owner_id, title, data) VALUES ($1, $2, $3, $4::jsonb) ON CONFLICT DO NOTHING RETURNING code",
        [r.code, r.ownerId ?? null, r.title ?? "", JSON.stringify(r)],
      )).length;
      const members = [...new Set((r.students ?? []).flatMap((s) => (s.userId ? [s.userId] : [])))];
      if (members.length) counts.members += (await tx.query(
        "INSERT INTO room_members (room_code, user_id) SELECT $1, jsonb_array_elements_text($2::jsonb) ON CONFLICT DO NOTHING RETURNING user_id",
        [r.code, JSON.stringify(members)],
      )).length;
    }
  });
  return { found: { users: users.length, sources: sourceFiles.length, rooms: rooms.length }, imported: counts };
}
