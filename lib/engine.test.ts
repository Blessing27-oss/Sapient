import { test } from "node:test";
import assert from "node:assert/strict";
import { reviseQuestion } from "./moderate.ts";
import type { Room } from "./types.ts";
import { SAMPLE } from "./sample.ts";
import { classify, computeState, selectNextQuestion, updateKnowledge, emptyState, validResponses, QUESTION_BUDGET } from "./engine.ts";

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
    selectNextQuestion(room.questions, room.concepts, computeState(room, [{ questionId: first.id, choice: correct ? first.correctAnswer : (first.correctAnswer + 1) % first.options.length, correct, at: 0 }]), [first.id])!.id;
  assert.notEqual(second(true), second(false));
});

function demoRoom(): Room {
  return structuredClone({ ...SAMPLE, code: "TEST", students: [], challenges: [], insights: [] });
}

test("each neighbor receives only the strongest signal once, regardless of edge orientation or duplicate tags", () => {
  const concepts = ["a", "b", "c", "d"].map((id) => ({ id, name: id, importance: 1, verified: true }));
  const q = { ...SAMPLE.questions[0], conceptIds: ["a", "a", "b"] };
  const edges = [
    { source: "a", target: "c", weight: 0.2, type: "related" as const },
    { source: "c", target: "b", weight: 0.4, type: "related" as const },
    { source: "c", target: "a", weight: 0.2, type: "related" as const },
    { source: "a", target: "b", weight: 0.5, type: "related" as const },
    { source: "c", target: "d", weight: 0.5, type: "related" as const },
  ];
  for (const correct of [true, false]) {
    const state = updateKnowledge(q, correct, emptyState(concepts), edges);
    assert.equal(state.a.directCount, 1);
    assert.equal(state.b.directCount, 1);
    assert.equal(state.a.inferred, 0);
    assert.equal(state.b.inferred, 0);
    assert.equal(state.c.inferred, correct ? 0.4 : -0.4);
    assert.equal(state.c.directCount, 0);
    assert.equal(state.d.inferred, 0);
  }
});

test("both students start together, diverge, never repeat, and stop at the valid-answer budget", () => {
  const room = demoRoom();
  const paths = [true, false].map((firstCorrect) => {
    const responses: Room["students"][number]["responses"] = [];
    while (responses.length < QUESTION_BUDGET) {
      const q = selectNextQuestion(room.questions, room.concepts, computeState(room, responses), responses.map((r) => r.questionId))!;
      const choice = (responses.length === 0 && !firstCorrect) ? (q.correctAnswer + 1) % q.options.length : q.correctAnswer;
      responses.push({ questionId: q.id, choice, correct: choice === q.correctAnswer, at: responses.length });
    }
    assert.equal(responses.length, QUESTION_BUDGET);
    assert.equal(new Set(responses.map((r) => r.questionId)).size, QUESTION_BUDGET);
    return responses;
  });
  assert.equal(paths[0][0].questionId, paths[1][0].questionId);
  assert.notEqual(paths[0][1].questionId, paths[1][1].questionId);
});

test("strong indirect evidence stays tentative, and net-positive conflicting answers stay mixed", () => {
  assert.equal(classify({ direct: 0, directCount: 0, correctCount: 0, wrongCount: 0, inferred: 20 }), "tentative-up");
  assert.equal(classify({ direct: 0, directCount: 0, correctCount: 0, wrongCount: 0, inferred: -20 }), "tentative-down");
  assert.equal(classify({ direct: 1, directCount: 3, correctCount: 2, wrongCount: 1, inferred: 0 }), "mixed");
  assert.equal(classify(emptyState(room.concepts)[room.concepts[0].id]), "unknown");
});

test("regrade keeps choices and timestamps, updates evidence and preserves the answered budget", () => {
  const room = demoRoom();
  const q = room.questions[0];
  room.students.push({ id: "s1", name: "A", responses: [{ questionId: q.id, choice: q.correctAnswer, correct: true, at: 123 }] });
  const before = computeState(room, room.students[0].responses);
  assert.equal(reviseQuestion(room, q, { correctAnswer: (q.correctAnswer + 1) % q.options.length }, "regrade"), undefined);
  const responses = room.students[0].responses;
  assert.equal(responses.length, 1);
  assert.equal(responses[0].at, 123);
  assert.equal(responses[0].choice, 0);
  assert.equal(responses[0].correct, false);
  assert.equal(validResponses(room, room.students[0]).length, 1);
  const after = computeState(room, responses);
  for (const id of q.conceptIds) {
    assert.equal(before[id].correctCount, 1);
    assert.equal(after[id].wrongCount, 1);
  }
  // Replay trusts the choice even if an old persisted correctness value is stale.
  responses[0].correct = true;
  assert.equal(computeState(room, responses)[q.conceptIds[0]].wrongCount, 1);
});

test("reset clears only the revised question, and invalidation frees the budget while retaining history", () => {
  const room = demoRoom();
  const [q, other] = room.questions;
  room.students.push({ id: "s1", name: "A", responses: [q, other].map((q) => ({ questionId: q.id, choice: q.correctAnswer, correct: true, at: 0 })) });
  q.invalidated = true;
  assert.equal(validResponses(room, room.students[0]).length, 1);
  assert.equal(room.students[0].responses.length, 2);
  assert.equal(reviseQuestion(room, other, { text: "Replacement question" }, "reset"), undefined);
  assert.deepEqual(room.students[0].responses.map((r) => r.questionId), [q.id]);
  assert.equal(validResponses(room, room.students[0]).length, 0);
  assert.ok(Object.values(computeState(room, room.students[0].responses)).every((s) => s.directCount === 0 && s.inferred === 0));
});

test("invalid regrade is atomic and cannot change option count or use fractional answer keys", () => {
  const room = demoRoom();
  const q = room.questions[0];
  const before = structuredClone(room);
  assert.ok(reviseQuestion(room, q, { options: ["A", "B"] }, "regrade"));
  assert.ok(reviseQuestion(room, q, { correctAnswer: 0.5 }, "regrade"));
  assert.ok(reviseQuestion(room, q, { conceptIds: ["missing"] }, "regrade"));
  assert.deepEqual(room, before);
});
