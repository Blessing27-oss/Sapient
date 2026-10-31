import type { Question } from "./types.ts";

// A question can only go live when students can actually answer it. Used by the editor (to block approval) and the server (to enforce it).
export function questionProblems(q: Question, conceptIds: string[]): string[] {
  const out: string[] = [];
  if (!q.text.trim()) out.push("Write the question.");
  if (q.options.some((o) => !o.trim())) out.push("Fill in all four answer choices.");
  if (new Set(q.options.map((o) => o.trim().toLowerCase())).size < q.options.length && !q.options.some((o) => !o.trim())) out.push("Two answer choices are identical.");
  if (!(Number.isInteger(q.correctAnswer) && q.correctAnswer >= 0 && q.correctAnswer < q.options.length)) out.push("Mark the correct answer.");
  if (!q.conceptIds.some((id) => conceptIds.includes(id))) out.push("Pick at least one concept this question tests.");
  return out;
}

// A question students can actually receive: approved (rooms made before approval existed have no flag) and not withdrawn.
export const isLive = (q: Question) => q.approved !== false && !q.invalidated;

export function blankQuestion(): Question {
  return { id: `q${Date.now().toString(36)}`, text: "", options: ["", "", "", ""], correctAnswer: 0, conceptIds: [], explanation: "", approved: false, invalidated: false, revision: 0 };
}
