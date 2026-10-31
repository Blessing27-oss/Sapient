import { test, mock } from "node:test";
import assert from "node:assert/strict";
import { extract, prepareSource, sanitize } from "./extract.ts";

const draft = () => ({
  title: "Lecture",
  concepts: [
    { id: "c1", name: "First", description: "First concept", foundational: true, sourcePage: 1 },
    { id: "c2", name: "Third", description: "Third-page concept", foundational: false, sourcePage: 3 },
  ],
  relationships: [{ source: "c1", target: "c2", weight: 0.3, rationale: "Related" }],
  questions: [{ id: "q1", text: "Question?", options: ["A", "B", "C", "D"], correctAnswer: 2, conceptIds: ["c2"], explanation: "C", sourcePage: 3 }],
});

// The Messages API streaming wire format for a single text block.
const sse = (text: string) => {
  const events: [string, object][] = [
    ["message_start", { type: "message_start", message: { id: "msg_test", type: "message", role: "assistant", model: "test", content: [], stop_reason: null, stop_sequence: null, usage: { input_tokens: 1, output_tokens: 0 } } }],
    ["content_block_start", { type: "content_block_start", index: 0, content_block: { type: "text", text: "" } }],
    ["content_block_delta", { type: "content_block_delta", index: 0, delta: { type: "text_delta", text } }],
    ["content_block_stop", { type: "content_block_stop", index: 0 }],
    ["message_delta", { type: "message_delta", delta: { stop_reason: "end_turn", stop_sequence: null }, usage: { output_tokens: 1 } }],
    ["message_stop", { type: "message_stop" }],
  ];
  return new Response(events.map(([e, d]) => `event: ${e}\ndata: ${JSON.stringify(d)}\n\n`).join(""), { headers: { "content-type": "text/event-stream" } });
};

test("structured generation receives original page boundaries and returns an unapproved root-app draft", async () => {
  const oldKey = process.env.ANTHROPIC_API_KEY;
  process.env.ANTHROPIC_API_KEY = "test-key";
  let body: Record<string, unknown> = {};
  const fetchMock = mock.method(globalThis, "fetch", async (_input: unknown, init?: RequestInit) => {
    body = JSON.parse(String(init?.body));
    return sse(JSON.stringify(draft()));
  });
  try {
    const result = await extract(["First page", "", "Third page"]);
    const repeated = await extract(["First page   ", "", "Third page"]);
    assert.equal(fetchMock.mock.callCount(), 1, "repeat upload should avoid a second AI call");
    repeated.concepts[0].name = "Edited draft";
    assert.equal(result.concepts[0].name, "First", "cached drafts must not share mutable state");
    assert.equal(result.source, "llm");
    assert.equal(result.questions[0].sourcePage, 3);
    assert.equal(result.questions[0].approved, false);
    assert.equal(result.concepts[0].verified, false);
    assert.equal(result.concepts[0].importance, 1);
    assert.equal(result.edges[0].type, "related");
    assert.match(JSON.stringify(body.messages), /\[Page 1\][\s\S]*\[Page 2\][\s\S]*\[Page 3\]/);
    assert.equal((body.output_config as { format: { type: string } }).format.type, "json_schema");
    const format = body.output_config as { format: { schema: { properties: { concepts: { minItems: number }; questions: { minItems: number } } } } };
    assert.equal(format.format.schema.properties.concepts.minItems, 1, "an empty concepts array must not satisfy the API schema");
    assert.equal(format.format.schema.properties.questions.minItems, 1, "an empty question array must not satisfy the API schema");
    assert.equal(body.stream, true);
    assert.match(String(body.system), /several slides per PDF page/);
    assert.match(String(body.system), /physical \[Page N\] marker/);
    assert.equal(result.topicMap, undefined, "a missing topic map falls back in the UI instead of failing generation");
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


test("source cleanup reduces formatting noise without changing math or page indices", () => {
  const original = ["  x  +  y = z   \r\n\r\n\r\nDefinition: α ≠ β  ", "", "Last page"];
  const source = prepareSource(original);
  assert.match(source, /x  \+  y = z/);
  assert.match(source, /Definition: α ≠ β/);
  assert.match(source, /\[Page 2\]\n\n\n\[Page 3\]\nLast page/);
  assert.ok(source.length < original.join("\n").length + 30);
});

test("questions tagged by concept name or different casing still resolve; unusable drafts explain why", () => {
  const raw = draft();
  raw.questions[0].conceptIds = ["THIRD", "C1"];
  assert.deepEqual(sanitize(raw, 3).questions[0].conceptIds, ["c2", "c1"]);

  const bad = draft();
  bad.questions = [
    { ...bad.questions[0], id: "a", conceptIds: ["nope"] },
    { ...bad.questions[0], id: "b", options: ["True", "False"] },
  ];
  assert.throws(() => sanitize(bad, 3), /returned 2 concept\(s\) and 2 question\(s\); questions dropped: 1 not tagged with a known concept, 1 without exactly 4 options/);
});


test("empty AI output is reported as a generation failure rather than blaming the lecture", () => {
  assert.throws(() => sanitize({ title: "Strepsirrhini", concepts: [], relationships: [], questions: [] }, 8), /AI returned an empty draft/);
});


test("an empty provider response is rejected and retry makes a fresh request", async () => {
  const oldKey = process.env.ANTHROPIC_API_KEY;
  process.env.ANTHROPIC_API_KEY = "test-empty-retry-key";
  let calls = 0;
  const fetchMock = mock.method(globalThis, "fetch", async () => {
    calls++;
    return sse(JSON.stringify(calls === 1 ? { title: "Lecture", concepts: [], relationships: [], questions: [] } : draft()));
  });
  try {
    await assert.rejects(extract(["Lecture retry test: strepsirrhines have a tooth comb and grooming claw."]), /AI returned an empty draft/);
    const result = await extract(["Lecture retry test: strepsirrhines have a tooth comb and grooming claw."]);
    assert.equal(result.concepts.length, 2);
    assert.equal(calls, 2);
  } finally {
    fetchMock.mock.restore();
    if (oldKey === undefined) delete process.env.ANTHROPIC_API_KEY;
    else process.env.ANTHROPIC_API_KEY = oldKey;
  }
});
