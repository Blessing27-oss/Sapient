import { test } from "node:test";
import assert from "node:assert/strict";
import { openDatabase } from "./db.ts";
import { createRoomStore } from "./store.ts";
import { SAMPLE } from "./sample.ts";
import type { Room } from "./types.ts";

const blank = (code: string, ownerId = "prof"): Room => ({ ...SAMPLE, code, ownerId, students: [], challenges: [], insights: [] });

test("rooms: create, read case-insensitively, update, and list by owner", async () => {
  const db = await openDatabase();
  try {
    const rooms = createRoomStore(async () => db);
    const code = await rooms.createRoom((c) => blank(c));
    assert.match(code, /^[A-HJ-NP-Z]{4}$/);
    assert.equal((await rooms.getRoom(code.toLowerCase()))?.code, code);
    assert.equal(await rooms.getRoom("ZZZZ"), undefined);

    await rooms.withRoom(code, (room) => { room!.title = "Renamed"; });
    assert.equal((await rooms.getRoom(code))?.title, "Renamed");
    assert.equal(await rooms.withRoom("NOPE", (room) => room), undefined);

    await rooms.createRoom((c) => blank(c, "other"));
    assert.deepEqual((await rooms.listOwnedRooms("prof")).map((r) => r.code), [code]);
  } finally { await db.close(); }
});

test("joined rooms are found through the membership index", async () => {
  const db = await openDatabase();
  try {
    const rooms = createRoomStore(async () => db);
    const a = await rooms.createRoom((c) => blank(c));
    await rooms.createRoom((c) => blank(c));
    await rooms.withRoom(a, (room) => { room!.students.push({ id: "s1", name: "Sam", userId: "sam", responses: [] }); });
    assert.deepEqual((await rooms.listJoinedRooms("sam")).map((r) => r.code), [a]);
    assert.deepEqual(await rooms.listJoinedRooms("nobody"), []);
  } finally { await db.close(); }
});

test("concurrent updates to one room are serialized, not lost", async () => {
  const db = await openDatabase();
  try {
    const rooms = createRoomStore(async () => db);
    const code = await rooms.createRoom((c) => ({ ...blank(c), students: [{ id: "s1", name: "Sam", userId: "sam", responses: [] }] }));
    await Promise.all(Array.from({ length: 20 }, (_, i) => rooms.withRoom(code, async (room) => {
      await new Promise((r) => setTimeout(r, Math.random() * 5)); // widen the race window
      room!.students[0].responses.push({ questionId: `q${i}`, choice: 0, correct: true, at: i });
    })));
    assert.equal((await rooms.getRoom(code))!.students[0].responses.length, 20);
  } finally { await db.close(); }
});

test("a failing update leaves the room unchanged", async () => {
  const db = await openDatabase();
  try {
    const rooms = createRoomStore(async () => db);
    const code = await rooms.createRoom((c) => blank(c));
    await assert.rejects(rooms.withRoom(code, (room) => { room!.title = "half-done"; throw new Error("boom"); }), /boom/);
    assert.equal((await rooms.getRoom(code))?.title, SAMPLE.title);
  } finally { await db.close(); }
});
