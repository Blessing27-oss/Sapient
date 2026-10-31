import { test } from "node:test";
import assert from "node:assert/strict";
import { createGenerationCache } from "./generationCache.ts";

test("simultaneous requests share work, cached drafts remain independent", async () => {
  const cached = createGenerationCache<{ names: string[] }>();
  let calls = 0;
  const generate = async () => { calls++; return { names: ["original"] }; };
  const [a, b] = await Promise.all([cached("pdf", generate), cached("pdf", generate)]);
  a.names.push("edited");
  assert.deepEqual(b.names, ["original"]);
  assert.deepEqual(await cached("pdf", generate), { names: ["original"] });
  assert.equal(calls, 1);
});

test("failed requests can be retried instead of caching an error", async () => {
  const cached = createGenerationCache<number>();
  await assert.rejects(cached("pdf", async () => { throw new Error("network"); }), /network/);
  assert.equal(await cached("pdf", async () => 42), 42);
});

test("cache expires entries and evicts least recently used documents", async () => {
  let time = 0;
  const cached = createGenerationCache<number>(2, 100, () => time);
  await cached("a", async () => 1);
  await cached("b", async () => 2);
  assert.equal(await cached("a", async () => 99), 1);
  await cached("c", async () => 3);
  assert.equal(await cached("b", async () => 22), 22);
  time = 101;
  assert.equal(await cached("b", async () => 222), 222);
});
