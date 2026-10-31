// Run with: npm run test:engine
//
// Guards the live demo on the sample Fourier lesson: Student A (right on Q1) and
// Student B (wrong on Q1) must receive different second questions, and the
// diagnostic must keep direct and inferred evidence separate.

import assert from "node:assert/strict";
import {
  applyResponse,
  diagnose,
  emptyState,
  labelFor,
  replayStudent,
  selectNextQuestion,
} from "../src/lib/engine.ts";
import { sampleMaterial } from "../src/lib/sample.ts";
import { createRoom, newId } from "../src/lib/store.ts";
import type { Question, Room } from "../src/lib/types.ts";

let passed = 0;
function test(label: string, fn: () => void) {
  fn();
  passed++;
  console.log(`  ✓ ${label}`);
}

function demoRoom(): Room {
  const material = sampleMaterial();
  material.questions = material.questions.map((q) => ({ ...q, approved: true }));
  return createRoom(material);
}

const wrongChoice = (q: Question) => (q.correctAnswer + 1) % q.options.length;

/** Plays a student through the room. `correctAt(step)` decides each answer. */
function play(room: Room, name: string, correctAt: (step: number) => boolean) {
  const studentId = newId("s");
  room.students.push({ id: studentId, name, joinedAt: Date.now() });
  const path: { id: string; correct: boolean }[] = [];
  const conceptName = (id: string) => room.concepts.find((c) => c.id === id)?.name ?? id;

  console.log(`\n${name}`);
  for (let step = 0; ; step++) {
    const q = selectNextQuestion(room, studentId);
    if (!q) break;
    const correct = correctAt(step);
    room.responses.push({
      id: newId("r"),
      studentId,
      questionId: q.id,
      choice: correct ? q.correctAnswer : wrongChoice(q),
      at: Date.now(),
    });
    path.push({ id: q.id, correct });
    console.log(`  Q${step + 1}: ${q.id} [${q.conceptIds.map(conceptName).join(", ")}] → ${correct ? "correct" : "incorrect"}`);
  }
  for (const d of diagnose(room, studentId)) {
    console.log(`    ${d.name.padEnd(40)} ${d.label.padEnd(22)} direct ${d.directCorrect}/${d.directCount}  inferred ${d.inferredEvidence}`);
  }
  return { studentId, path };
}

console.log("KnowGap engine tests");

const room = demoRoom();
const A = play(room, "Student A (right on Q1)", (step) => step !== 1);
const B = play(room, "Student B (wrong on Q1)", (step) => step !== 0);

console.log("\nAssertions");

test("both students stop at the question budget", () => {
  assert.equal(A.path.length, room.budget);
  assert.equal(B.path.length, room.budget);
});

test("both students receive the same first question", () => {
  assert.equal(A.path[0].id, B.path[0].id);
});

test("Student A and Student B receive different second questions", () => {
  assert.notEqual(A.path[1].id, B.path[1].id);
});

test("no question is asked twice", () => {
  for (const s of [A, B]) assert.equal(new Set(s.path.map((p) => p.id)).size, s.path.length);
});

test("one-hop propagation: direct ±1 on tagged concepts, ±weight on neighbours only", () => {
  const { concepts, edges, questions } = sampleMaterial();
  const state = emptyState(concepts);
  const q = { ...questions[0], conceptIds: ["c6"] }; // Convolution only
  applyResponse(state, q, false, edges);
  assert.equal(state.c6.directEvidence, -1);
  assert.equal(state.c6.directCount, 1);
  assert.equal(state.c6.inferredEvidence, 0);
  assert.equal(state.c7.inferredEvidence, -0.4); // Convolution Theorem, one hop
  assert.equal(state.c7.directCount, 0);
  assert.equal(state.c4.inferredEvidence, 0); // two hops away: untouched
});

test("labels: demonstrated / needs review / mixed / tentative / unknown", () => {
  assert.equal(labelFor({ directEvidence: 1, directCount: 1, inferredEvidence: 0 }), "Demonstrated strength");
  assert.equal(labelFor({ directEvidence: -1, directCount: 1, inferredEvidence: 0 }), "Needs review");
  assert.equal(labelFor({ directEvidence: 0, directCount: 2, inferredEvidence: 0 }), "Mixed evidence");
  // Net-positive but conflicting answers must still read as mixed, not mastery.
  assert.equal(labelFor({ directEvidence: 1, directCount: 3, inferredEvidence: 0 }), "Mixed evidence");
  assert.equal(labelFor({ directEvidence: 0, directCount: 0, inferredEvidence: -0.3 }), "Tentative inference");
  assert.equal(labelFor({ directEvidence: 0, directCount: 0, inferredEvidence: 0 }), "Unknown");
});

test("inferred evidence is never promoted to demonstrated, however large", () => {
  const { concepts, edges, questions } = sampleMaterial();
  const state = emptyState(concepts);
  const q = { ...questions[0], conceptIds: ["c6"] };
  for (let i = 0; i < 10; i++) applyResponse(state, q, true, edges);
  assert.ok(state.c7.inferredEvidence > 1);
  assert.equal(labelFor(state.c7), "Tentative inference");
});

test("invalidating a question removes its evidence on replay", () => {
  const before = replayStudent(room, A.studentId);
  const first = room.questions.find((q) => q.id === A.path[0].id)!;
  first.status = "invalidated";
  const after = replayStudent(room, A.studentId);
  for (const id of first.conceptIds) assert.ok(after[id].directCount < before[id].directCount);
  first.status = "active";
});

console.log(`\n${passed} passed`);
