import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { createSourceStore, chunkPages, retrieveSourceChunks, canReadRoomSources } from "./sources.ts";
import { SAMPLE } from "./sample.ts";

test("sources survive new store instances, deduplicate within an owner, and stay private", async () => {
  const dir = await mkdtemp(path.join(tmpdir(), "sapient-sources-"));
  try {
    const store = createSourceStore(dir);
    const saved = await store.save("owner", "lecture.pdf", ["Tooth comb", "", "Grooming claw"]);
    assert.equal((await store.save("owner", "same.pdf", saved.pages)).id, saved.id);
    const reopened = createSourceStore(dir);
    assert.deepEqual((await reopened.read(saved.id, "owner"))?.pages, saved.pages);
    assert.equal(await reopened.read(saved.id, "other"), undefined);
    assert.equal(await reopened.read("../../users", "owner"), undefined);
    assert.equal((await reopened.list("owner")).length, 1);
    assert.deepEqual(await reopened.list("other"), []);
    const other = await reopened.save("other", "lecture.pdf", saved.pages);
    assert.notEqual(other.id, saved.id);
    const hits = retrieveSourceChunks([saved], "grooming claw");
    assert.equal(hits[0].page, 3);
    assert.equal(hits[0].filename, "lecture.pdf");
    assert.deepEqual(retrieveSourceChunks([saved], "unrelated"), []);
  } finally { await rm(dir, { recursive: true, force: true }); }
});

test("chunks preserve every page's text and retrieval respects the context budget", () => {
  const text = "abc ".repeat(1000);
  const chunks = chunkPages(["", text]);
  assert.ok(chunks.every((c) => c.page === 2 && c.text.length <= 1500));
  const reconstructed = chunks.map((c, i) => i === 0 ? c.text : c.text.slice(150)).join("");
  assert.equal(reconstructed, text);
  const source = { id: "id", ownerId: "owner", filename: "lecture", createdAt: 0, pages: [text], chunks };
  assert.equal(retrieveSourceChunks([source], "abc", 100).reduce((n, c) => n + c.text.length, 0), 100);
});

test("only the room owner and enrolled students can retrieve its sources", () => {
  const room = { ...SAMPLE, code: "TEST", ownerId: "owner", students: [{ id: "s", name: "Student", userId: "enrolled", responses: [] }], challenges: [], insights: [] };
  assert.equal(canReadRoomSources(room, { id: "owner", role: "professor" }), true);
  assert.equal(canReadRoomSources(room, { id: "other", role: "professor" }), false);
  assert.equal(canReadRoomSources(room, { id: "enrolled", role: "student" }), true);
  assert.equal(canReadRoomSources(room, { id: "stranger", role: "student" }), false);
});
