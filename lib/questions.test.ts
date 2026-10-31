import { test } from "node:test";
import assert from "node:assert/strict";
import { blankQuestion, questionProblems } from "./questions.ts";

test("a blank question is not publishable", () => {
  assert.ok(questionProblems(blankQuestion(), ["c1"]).length >= 3);
});

test("a complete question has no problems", () => {
  const q = { ...blankQuestion(), text: "What is 2+2?", options: ["3", "4", "5", "6"], correctAnswer: 1, conceptIds: ["c1"] };
  assert.deepEqual(questionProblems(q, ["c1"]), []);
});

test("a question tagged only with a deleted concept is flagged", () => {
  const q = { ...blankQuestion(), text: "x?", options: ["a", "b", "c", "d"], conceptIds: ["gone"] };
  assert.deepEqual(questionProblems(q, ["c1"]), ["Pick at least one concept this question tests."]);
});

test("duplicate answer choices are flagged", () => {
  const q = { ...blankQuestion(), text: "x?", options: ["a", "a", "c", "d"], conceptIds: ["c1"] };
  assert.deepEqual(questionProblems(q, ["c1"]), ["Two answer choices are identical."]);
});
