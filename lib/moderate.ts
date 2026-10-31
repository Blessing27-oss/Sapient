import { gradeResponse } from "./engine.ts";
import type { Question, Room } from "./types.ts";

export type RevisionMode = "regrade" | "reset";
export type QuestionPatch = Partial<Pick<Question, "text" | "options" | "correctAnswer" | "conceptIds" | "explanation">>;

// Validate before mutating the persisted room, so a rejected revision leaves all evidence intact.
export function reviseQuestion(room: Room, question: Question, patch: QuestionPatch, mode: RevisionMode): string | undefined {
  if (!patch || typeof patch !== "object" || !["regrade", "reset"].includes(mode)) return "Choose regrade or reset.";
  const options = patch.options ?? question.options;
  const key = patch.correctAnswer ?? question.correctAnswer;
  const concepts = patch.conceptIds ?? question.conceptIds;
  if (!Array.isArray(options) || options.length < 2 || options.some((o) => typeof o !== "string" || !o.trim())) return "Provide at least two non-empty options.";
  if (!Number.isInteger(key) || key < 0 || key >= options.length) return "Answer key must point to an option.";
  if (mode === "regrade" && options.length !== question.options.length) return "Regrading must keep the same option positions and number of options. Use reset for a new question.";
  if (!Array.isArray(concepts) || !concepts.length || concepts.some((id) => !room.concepts.some((c) => c.id === id))) return "Choose valid concepts.";
  if (patch.text !== undefined && (typeof patch.text !== "string" || !patch.text.trim())) return "Question text cannot be empty.";
  if (patch.explanation !== undefined && typeof patch.explanation !== "string") return "Explanation must be text.";
  Object.assign(question, {
    text: patch.text ?? question.text, options: [...options], correctAnswer: key,
    conceptIds: [...new Set(concepts)], explanation: patch.explanation ?? question.explanation,
    invalidated: false, revision: (question.revision ?? 0) + 1,
  });
  for (const student of room.students) {
    if (mode === "reset") student.responses = student.responses.filter((r) => r.questionId !== question.id);
    else for (const response of student.responses) if (response.questionId === question.id) response.correct = gradeResponse(question, response);
  }
}
