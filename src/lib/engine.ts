import type {
  Concept,
  DiagnosticLabel,
  Edge,
  EvidenceState,
  Question,
  Room,
  StudentResponse,
} from "./types";

export const FOUNDATIONAL_IMPORTANCE = 1.5;

export function importanceOf(concept: Concept | undefined): number {
  return concept?.foundational ? FOUNDATIONAL_IMPORTANCE : 1;
}

export function emptyState(concepts: Concept[]): EvidenceState {
  const state: EvidenceState = {};
  for (const c of concepts) state[c.id] = { directEvidence: 0, inferredEvidence: 0, directCount: 0 };
  return state;
}

/**
 * Apply one graded response. Directly tagged concepts get ±1. Each untagged neighbor
 * gets a one-hop inferred signal using the strongest edge to any tagged concept, so a
 * question tagging two linked concepts does not double-count the shared neighbor.
 */
export function applyResponse(state: EvidenceState, question: Question, correct: boolean, edges: Edge[]) {
  const signal = correct ? 1 : -1;
  const tagged = new Set(question.conceptIds.filter((id) => state[id]));
  const neighborWeight = new Map<string, number>();

  for (const id of tagged) {
    state[id].directEvidence += signal;
    state[id].directCount += 1;
  }
  for (const edge of edges) {
    for (const [from, to] of [
      [edge.source, edge.target],
      [edge.target, edge.source],
    ]) {
      if (tagged.has(from) && !tagged.has(to) && state[to]) {
        neighborWeight.set(to, Math.max(neighborWeight.get(to) ?? 0, edge.weight));
      }
    }
  }
  for (const [id, weight] of neighborWeight) state[id].inferredEvidence += signal * weight;
}

export function isCorrect(question: Question, choice: number) {
  return question.correctAnswer === choice;
}

/** Full replay from the immutable response log. Invalidated questions contribute nothing. */
export function replayStudent(room: Room, studentId: string): EvidenceState {
  const state = emptyState(room.concepts);
  const byId = new Map(room.questions.map((q) => [q.id, q]));
  for (const r of room.responses) {
    if (r.studentId !== studentId) continue;
    const q = byId.get(r.questionId);
    if (!q || q.status === "invalidated") continue;
    applyResponse(state, q, isCorrect(q, r.choice), room.edges);
  }
  return state;
}

/**
 * Greedy selection: Σ importance(c) / (1 + directCount(c)), as in the spec, scaled by
 * the concept's inferred evidence. A wrong answer pushes neighbors' inferred evidence
 * negative, making related (often foundational) concepts more attractive to probe; a
 * correct answer makes them less attractive, so the student moves to unexplored areas.
 * A heuristic, not an information-gain policy.
 */
export function scoreQuestion(q: Question, state: EvidenceState, concepts: Map<string, Concept>) {
  return q.conceptIds.reduce((total, id) => {
    const ev = state[id];
    if (!ev) return total;
    const curiosity = Math.min(3, Math.max(0.25, 1 - 3 * ev.inferredEvidence));
    return total + (importanceOf(concepts.get(id)) / (1 + ev.directCount)) * curiosity;
  }, 0);
}

export function selectNextQuestion(room: Room, studentId: string): Question | null {
  const mine = room.responses.filter((r) => r.studentId === studentId);
  if (mine.length >= room.budget) return null;
  const answered = new Set(mine.map((r) => r.questionId));
  const state = replayStudent(room, studentId);
  const concepts = new Map(room.concepts.map((c) => [c.id, c]));

  let best: Question | null = null;
  let bestScore = -Infinity;
  for (const q of room.questions) {
    if (!q.approved || q.status !== "active" || answered.has(q.id)) continue;
    const s = scoreQuestion(q, state, concepts);
    if (s > bestScore) {
      best = q;
      bestScore = s;
    }
  }
  return best;
}

export function labelFor(ev: { directEvidence: number; directCount: number; inferredEvidence: number }): DiagnosticLabel {
  if (ev.directCount > 0) {
    if (ev.directEvidence === ev.directCount) return "Demonstrated strength";
    if (ev.directEvidence === -ev.directCount) return "Needs review";
    return "Mixed evidence";
  }
  if (Math.abs(ev.inferredEvidence) > 1e-9) return "Tentative inference";
  return "Unknown";
}

export function diagnose(room: Room, studentId: string) {
  const state = replayStudent(room, studentId);
  return room.concepts.map((c) => {
    const ev = state[c.id];
    return {
      conceptId: c.id,
      name: c.name,
      label: labelFor(ev),
      directCount: ev.directCount,
      directCorrect: (ev.directCount + ev.directEvidence) / 2,
      inferredEvidence: Math.round(ev.inferredEvidence * 100) / 100,
    };
  });
}

export type ConceptSummary = {
  conceptId: string;
  name: string;
  foundational: boolean;
  assessedStudents: number; // denominator: students with direct evidence
  missedStudents: number; // of those, students with at least one incorrect direct response
  strengthStudents: number;
  tentativeStudents: number;
  unknownStudents: number;
};

export function classSummary(room: Room) {
  const students = room.students;
  const diagnostics = new Map(students.map((s) => [s.id, diagnose(room, s.id)]));

  const concepts: ConceptSummary[] = room.concepts.map((c, i) => {
    const row: ConceptSummary = {
      conceptId: c.id,
      name: c.name,
      foundational: c.foundational,
      assessedStudents: 0,
      missedStudents: 0,
      strengthStudents: 0,
      tentativeStudents: 0,
      unknownStudents: 0,
    };
    for (const s of students) {
      const d = diagnostics.get(s.id)![i];
      if (d.directCount > 0) {
        row.assessedStudents++;
        if (d.directCorrect < d.directCount) row.missedStudents++;
        else row.strengthStudents++;
      } else if (d.label === "Tentative inference") row.tentativeStudents++;
      else row.unknownStudents++;
    }
    return row;
  });

  const questions = room.questions
    .filter((q) => q.approved)
    .map((q) => {
      const rs = room.responses.filter((r) => r.questionId === q.id);
      return {
        id: q.id,
        text: q.text,
        status: q.status,
        conceptIds: q.conceptIds,
        answered: rs.length,
        incorrect: rs.filter((r) => !isCorrect(q, r.choice)).length,
        openChallenges: room.challenges.filter((c) => c.questionId === q.id && c.status === "open").length,
      };
    });

  const priorities = concepts
    .filter((c) => c.assessedStudents > 0 && c.missedStudents > 0)
    .sort((a, b) => b.missedStudents / b.assessedStudents - a.missedStudents / a.assessedStudents || b.missedStudents - a.missedStudents)
    .slice(0, 3)
    .map((c) => ({
      conceptId: c.conceptId,
      message: `${c.missedStudents} of ${c.assessedStudents} student${c.assessedStudents === 1 ? "" : "s"} who answered a question on “${c.name}” missed it.`,
      neighbors: neighborsOf(room.edges, c.conceptId)
        .map((id) => room.concepts.find((x) => x.id === id)?.name)
        .filter(Boolean) as string[],
    }));

  const studentRows = students.map((s) => {
    const rs: StudentResponse[] = room.responses.filter((r) => r.studentId === s.id);
    return {
      id: s.id,
      name: s.name,
      path: rs.map((r) => {
        const q = room.questions.find((x) => x.id === r.questionId)!;
        return { questionId: q.id, correct: isCorrect(q, r.choice), invalidated: q.status === "invalidated" };
      }),
      done: rs.length >= room.budget || !selectNextQuestion(room, s.id),
      diagnostics: diagnostics.get(s.id)!,
    };
  });

  return { concepts, questions, priorities, students: studentRows };
}

export function neighborsOf(edges: Edge[], id: string) {
  return edges.flatMap((e) => (e.source === id ? [e.target] : e.target === id ? [e.source] : []));
}
