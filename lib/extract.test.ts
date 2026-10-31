import { test, mock } from "node:test";
import assert from "node:assert/strict";
import { extract, sanitize } from "./extract.ts";

const draft = () => ({
  title: "Lecture",
  concepts: [
    { id: "c1", name: "First", description: "First concept", foundational: true, sourcePage: 1 },
    { id: "c2", name: "Third", description: "Third-page concept", foundational: false, sourcePage: 3 },
  ],
  relationships: [{ source: "c1", target: "c2", weight: 0.3, rationale: "Related" }],
  questions: [{ id: "q1", text: "Question?", options: ["A", "B", "C", "D"], correctAnswer: 2, conceptIds: ["c2"], explanation: "C", sourcePage: 3 }],
});

test("structured generation receives original page boundaries and returns an unapproved root-app draft", async () => {
  const oldKey = process.env.ANTHROPIC_API_KEY;
  process.env.ANTHROPIC_API_KEY = "test-key";
  let body: Record<string, unknown> = {};
  const fetchMock = mock.method(globalThis, "fetch", async (_input: unknown, init?: RequestInit) => {
    body = JSON.parse(String(init?.body));
    return Response.json({ id: "msg_test", type: "message", role: "assistant", model: "test", content: [{ type: "text", text: JSON.stringify(draft()) }], stop_reason: "end_turn", stop_sequence: null, usage: { input_tokens: 1, output_tokens: 1 } });
  });
  try {
    const result = await extract(["First page", "", "Third page"]);
    assert.equal(result.source, "llm");
    assert.equal(result.questions[0].sourcePage, 3);
    assert.equal(result.questions[0].approved, false);
    assert.equal(result.concepts[0].verified, false);
    assert.equal(result.concepts[0].importance, 1);
    assert.equal(result.edges[0].type, "related");
    assert.match(JSON.stringify(body.messages), /\[Page 1\][\s\S]*\[Page 2\][\s\S]*\[Page 3\]/);
    assert.equal((body.output_config as { format: { type: string } }).format.type, "json_schema");
  } finally {
    fetchMock.mock.restore();
    if (oldKey === undefined) delete process.env.ANTHROPIC_API_KEY;
    else process.env.ANTHROPIC_API_KEY = oldKey;
  }
});

test("generation rejects blank/scanned and oversized documents before an API call", async () => {
  await assert.rejects(extract(["", "  "]), /No extractable text/);
  await assert.rejects(extract(["a".repeat(400_001)]), /accepts up to/);
});

test("sanitization drops bad references, duplicate edges and invalid keys without inventing page numbers", () => {
  const raw = draft();
  raw.concepts[1].sourcePage = 99;
  raw.relationships.push({ ...raw.relationships[0], source: "c2", target: "c1" }, { ...raw.relationships[0], target: "missing" });
  raw.questions.push({ ...raw.questions[0], id: "fraction", correctAnswer: 1.5 });
  raw.questions[0].sourcePage = 99;
  raw.questions[0].conceptIds.push("missing", "c2");
  const result = sanitize(raw, 3);
  assert.equal(result.edges.length, 1);
  assert.equal(result.questions.length, 1);
  assert.equal(result.questions[0].sourcePage, undefined);
  assert.equal(result.concepts[1].sourcePage, undefined);
  assert.deepEqual(result.questions[0].conceptIds, ["c2"]);
});
