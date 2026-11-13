import { getDatabase, type Database, type Sql } from "./db.ts";
import type { Room } from "./types.ts";

const CODE_LETTERS = "ABCDEFGHJKLMNPQRSTUVWXYZ";
const randomCode = () => Array.from({ length: 4 }, () => CODE_LETTERS[Math.floor(Math.random() * CODE_LETTERS.length)]).join("");
const norm = (code: string) => code.trim().toUpperCase();

// Keep the lookup columns and the membership index in step with the room document.
async function writeRoom(tx: Sql, room: Room) {
  await tx.query(
    "UPDATE rooms SET data = $2::jsonb, title = $3, owner_id = $4, updated_at = now() WHERE code = $1",
    [room.code, JSON.stringify(room), room.title ?? "", room.ownerId ?? null],
  );
  await syncMembers(tx, room);
}
async function syncMembers(tx: Sql, room: Room) {
  const members = [...new Set(room.students.flatMap((s) => (s.userId ? [s.userId] : [])))];
  if (!members.length) return;
  await tx.query(
    "INSERT INTO room_members (room_code, user_id) SELECT $1, jsonb_array_elements_text($2::jsonb) ON CONFLICT DO NOTHING",
    [room.code, JSON.stringify(members)],
  );
}

export function createRoomStore(db: () => Promise<Database>) {
  return {
    async getRoom(code: string): Promise<Room | undefined> {
      const [row] = await (await db()).query<{ data: Room }>("SELECT data FROM rooms WHERE code = $1", [norm(code)]);
      return row?.data;
    },

    // Read-modify-write one room under a row lock (SELECT ... FOR UPDATE), so concurrent requests,
    // even on different server instances, apply their changes one after another instead of
    // overwriting each other. fn receives undefined when the room does not exist.
    // Keep fn fast and free of network calls: the row stays locked until it returns.
    async withRoom<T>(code: string, fn: (room: Room | undefined) => T | Promise<T>): Promise<T> {
      return (await db()).transaction(async (tx) => {
        const [row] = await tx.query<{ data: Room }>("SELECT data FROM rooms WHERE code = $1 FOR UPDATE", [norm(code)]);
        if (!row) return fn(undefined);
        const room = row.data;
        const before = JSON.stringify(room);
        const out = await fn(room);
        if (JSON.stringify(room) !== before) await writeRoom(tx, room);
        return out;
      });
    },

    // Picks an unused four-letter code; the primary key settles collisions between concurrent creates.
    async createRoom(build: (code: string) => Room): Promise<string> {
      const database = await db();
      for (let attempt = 0; attempt < 50; attempt++) {
        const room = build(randomCode());
        const created = await database.transaction(async (tx) => {
          const rows = await tx.query(
            "INSERT INTO rooms (code, owner_id, title, data) VALUES ($1, $2, $3, $4::jsonb) ON CONFLICT (code) DO NOTHING RETURNING code",
            [room.code, room.ownerId ?? null, room.title ?? "", JSON.stringify(room)],
          );
          if (rows.length) await syncMembers(tx, room);
          return rows.length > 0;
        });
        if (created) return room.code;
      }
      throw new Error("Could not allocate a room code.");
    },

    // Insert a room with a fixed code if that code is free; returns whether it was inserted.
    async putRoom(room: Room): Promise<boolean> {
      return (await db()).transaction(async (tx) => {
        const rows = await tx.query(
          "INSERT INTO rooms (code, owner_id, title, data) VALUES ($1, $2, $3, $4::jsonb) ON CONFLICT (code) DO NOTHING RETURNING code",
          [room.code, room.ownerId ?? null, room.title ?? "", JSON.stringify(room)],
        );
        if (rows.length) await syncMembers(tx, room);
        return rows.length > 0;
      });
    },

    async listOwnedRooms(ownerId: string): Promise<Room[]> {
      const rows = await (await db()).query<{ data: Room }>("SELECT data FROM rooms WHERE owner_id = $1 ORDER BY created_at DESC", [ownerId]);
      return rows.map((r) => r.data);
    },

    async listJoinedRooms(userId: string): Promise<Room[]> {
      const rows = await (await db()).query<{ data: Room }>(
        "SELECT r.data FROM rooms r JOIN room_members m ON m.room_code = r.code WHERE m.user_id = $1 ORDER BY r.created_at DESC", [userId]);
      return rows.map((r) => r.data);
    },
  };
}

const rooms = createRoomStore(getDatabase);
export const { getRoom, withRoom, createRoom, putRoom, listOwnedRooms, listJoinedRooms } = rooms;
export const uid = () => Math.random().toString(36).slice(2, 10);
