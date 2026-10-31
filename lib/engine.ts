import type { Concept, Edge, KnowledgeState, Label, Question, Response, Room, Student } from "./types.ts";

export const QUESTION_BUDGET = 3;

export function emptyState(concepts: Concept[]): KnowledgeState {
  const s: KnowledgeState = {};
  for (const c of concepts) s[c.id] = { direct: 0, inferred: 0, directCount: 0, correctCount: 0, wrongCount: 0 };
  return s;
}

// One-hop, undirected propagation. Edges mean "possibly relevant", not "mastery implies mastery".
export function updateKnowledge(question: Question, correct: boolean, state: KnowledgeState, edges: Edge[]): KnowledgeState {
  const signal = correct ? 1 : -1;
  for (const id of question.conceptIds) {
    const st = state[id];
    if (!st) continue;
    st.direct += signal;
    st.directCount += 1;
    if (correct) st.correctCount += 1;
    else st.wrongCount += 1;
    for (const e of edges) {
      const n = e.source === id ? e.target : e.target === id ? e.source : null;
      if (n && state[n] && !question.conceptIds.includes(n)) state[n].inferred += signal * e.weight;
    }
  }
  return state;
}

// Evidence is always recomputed from the valid responses, so invalidating a question is exact.
export function computeState(room: Pick<Room, "concepts" | "edges" | "questions">, responses: Response[]): KnowledgeState {
  const state = emptyState(room.concepts);
  for (const r of responses) {
    const q = room.questions.find((x) => x.id === r.questionId);
    if (!q || q.invalidated) continue;
    updateKnowledge(q, r.correct, state, room.edges);
  }
  return state;
}

export function validResponses(room: Pick<Room, "questions">, student: Student): Response[] {
  return student.responses.filter((r) => room.questions.find((q) => q.id === r.questionId && !q.invalidated));
}

// Importance / (1 + directObservations) alone ignores correctness, so every student would get the same
// sequence. Adjust by evidence: probe suspected gaps and conflicts, deprioritise concepts that
// neighbouring correct answers already make look plausible. Illustrative weights, not validated.
function evidenceFactor(s?: KnowledgeState[string]): number {
  if (!s) return 1;
  let f = 1;
  if (s.inferred < 0) f += 0.5 * Math.min(1, -s.inferred);
  if (s.inferred > 0) f -= 0.5 * Math.min(1, s.inferred);
  if (s.correctCount > 0 && s.wrongCount > 0) f += 0.5;
  return f;
}

export function selectNextQuestion(
  questions: Question[],
  concepts: Concept[],
  state: KnowledgeState,
  answeredIds: string[],
): Question | undefined {
  const imp = new Map(concepts.map((c) => [c.id, c.importance]));
  let best: { q: Question; score: number } | undefined;
  for (const q of questions) {
    if (q.invalidated || q.approved === false || answeredIds.includes(q.id)) continue;
    const score = q.conceptIds.reduce((t, id) => t + (imp.get(id) ?? 1) * evidenceFactor(state[id]) / (1 + (state[id]?.directCount ?? 0)), 0);
    if (!best || score > best.score) best = { q, score };
  }
  return best?.q;
}

export function classify(s: ConceptStateLike): Label {
  if (s.correctCount > 0 && s.wrongCount > 0) return "mixed";
  if (s.directCount > 0) return s.correctCount > 0 ? "strength" : "review";
  if (s.inferred > 0) return "tentative-up";
  if (s.inferred < 0) return "tentative-down";
  return "unknown";
}
type ConceptStateLike = KnowledgeState[string];

export const LABEL_TEXT: Record<Label, string> = {
  strength: "Demonstrated strength",
  review: "Needs review",
  mixed: "Mixed evidence",
  "tentative-up": "Tentative inference (+)",
  "tentative-down": "Tentative inference (−)",
  unknown: "Unknown",
};

export type ClassRow = { conceptId: string; name: string; asked: number; missed: number; flag: boolean };

// Denominators count only students with a DIRECT answer on the concept; inference never counts.
export function classDiagnostic(room: Room): ClassRow[] {
  return room.concepts.map((c) => {
    let asked = 0;
    let missed = 0;
    for (const s of room.students) {
      const st = computeState(room, s.responses)[c.id];
      if (st.directCount > 0) {
        asked++;
        if (st.wrongCount >= st.correctCount) missed++;
      }
    }
    return { conceptId: c.id, name: c.name, asked, missed, flag: asked >= 2 && missed / asked >= 0.5 };
  });
}
