import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { openDatabase } from "./db.ts";
import { importJsonData } from "./importJson.ts";
import { createRoomStore } from "./store.ts";
import { SAMPLE } from "./sample.ts";

test("legacy JSON data imports exactly once and reads back unchanged", async () => {
  const dir = await mkdtemp(path.join(tmpdir(), "sapient-import-"));
  const db = await openDatabase();
  try {
    const room = { ...SAMPLE, code: "ABCD", ownerId: "p1", students: [{ id: "s", name: "Sam", userId: "u2", responses: [] }], challenges: [], insights: [] };
    const sourceId = "a".repeat(64);
    await writeFile(path.join(dir, "users.json"), JSON.stringify({ p1: { id: "p1", name: "Prof", username: "prof", role: "professor", salt: "s", hash: "h" } }));
    await writeFile(path.join(dir, "db.json"), JSON.stringify({ ABCD: room }));
    await mkdir(path.join(dir, "sources"));
    await writeFile(path.join(dir, "sources", `${sourceId}.json`), JSON.stringify({ id: sourceId, ownerId: "p1", filename: "l.pdf", createdAt: 1, pages: ["x"], chunks: [] }));

    const first = await importJsonData(db, dir);
    assert.deepEqual(first.imported, { users: 1, sources: 1, rooms: 1, members: 1 });
    assert.deepEqual((await importJsonData(db, dir)).imported, { users: 0, sources: 0, rooms: 0, members: 0 });

    const rooms = createRoomStore(async () => db);
    assert.deepEqual(await rooms.getRoom("ABCD"), room);
    assert.deepEqual((await rooms.listJoinedRooms("u2")).map((r) => r.code), ["ABCD"]);
  } finally {
    await db.close();
    await rm(dir, { recursive: true, force: true });
  }
});

test("a missing data directory imports nothing", async () => {
  const db = await openDatabase();
  try {
    assert.deepEqual((await importJsonData(db, "/nonexistent/sapient")).found, { users: 0, sources: 0, rooms: 0 });
  } finally { await db.close(); }
});
