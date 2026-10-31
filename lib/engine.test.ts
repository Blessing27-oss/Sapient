import { test } from "node:test";
import assert from "node:assert/strict";
import { SAMPLE } from "./sample.ts";
import { classify, computeState, selectNextQuestion, updateKnowledge, emptyState } from "./engine.ts";

const room = { concepts: SAMPLE.concepts, edges: SAMPLE.edges, questions: SAMPLE.questions };

test("propagation is one-hop and never touches direct evidence of neighbours", () => {
  const q = room.questions.find((x) => x.conceptIds.length === 1)!;
  const st = updateKnowledge(q, true, emptyState(room.concepts), room.edges);
  const nbrs = Object.entries(st).filter(([id, s]) => s.inferred !== 0 && !q.conceptIds.includes(id));
  assert.ok(nbrs.length > 0);
  for (const [, s] of nbrs) assert.equal(s.directCount, 0);
});

test("inferred state is never promoted to strength", () => {
  const q = room.questions[0];
  const st = updateKnowledge(q, true, emptyState(room.concepts), room.edges);
  for (const [id, s] of Object.entries(st)) if (!q.conceptIds.includes(id)) assert.notEqual(classify(s), "strength");
});

test("conflicting direct answers show mixed", () => {
  const c = room.concepts[0].id;
  assert.equal(classify({ direct: 0, inferred: 0, directCount: 2, correctCount: 1, wrongCount: 1 }), "mixed");
  assert.ok(c);
});

test("different first answers lead to different next questions", () => {
  const first = selectNextQuestion(room.questions, room.concepts, computeState(room, []), [])!;
  const a = computeState(room, [{ questionId: first.id, choice: first.correctAnswer, correct: true, at: 0 }]);
  const next = selectNextQuestion(room.questions, room.concepts, a, [first.id])!;
  assert.notEqual(next.id, first.id);
});

test("invalidating a question removes its evidence", () => {
  const q = room.questions[0];
  const resp = [{ questionId: q.id, choice: 0, correct: false, at: 0 }];
  const before = computeState(room, resp);
  const after = computeState({ ...room, questions: room.questions.map((x) => (x.id === q.id ? { ...x, invalidated: true } : x)) }, resp);
  assert.ok(Object.values(before).some((s) => s.directCount > 0));
  assert.ok(Object.values(after).every((s) => s.directCount === 0 && s.inferred === 0));
});

test("a correct vs incorrect first answer personalises the second question", () => {
  const first = selectNextQuestion(room.questions, room.concepts, computeState(room, []), [])!;
  const second = (correct: boolean) =>
    selectNextQuestion(room.questions, room.concepts, computeState(room, [{ questionId: first.id, choice: 0, correct, at: 0 }]), [first.id])!.id;
  assert.notEqual(second(true), second(false));
});
