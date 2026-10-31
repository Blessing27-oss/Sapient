export type Concept = {
  id: string;
  name: string;
  description: string;
  foundational: boolean;
  verified: boolean;
  sourcePage: number | null;
};

// Undirected for the MVP. Weight is an illustrative heuristic, not a probability of mastery.
export type Edge = {
  source: string;
  target: string;
  weight: number;
  rationale: string;
};

export type Question = {
  id: string;
  text: string;
  options: string[];
  correctAnswer: number;
  conceptIds: string[];
  explanation: string;
  sourcePage: number | null;
  approved: boolean;
  status: "active" | "invalidated";
  revision: number;
};

export type CourseMaterial = {
  title: string;
  concepts: Concept[];
  edges: Edge[];
  questions: Question[];
};

export type Student = { id: string; name: string; joinedAt: number };

// Stores the choice, not correctness, so a revised answer key re-grades on replay.
export type StudentResponse = {
  id: string;
  studentId: string;
  questionId: string;
  choice: number;
  at: number;
};

export type Challenge = {
  id: string;
  studentId: string;
  questionId: string;
  reason: string;
  status: "open" | "dismissed" | "revised" | "invalidated";
  at: number;
};

export type Room = CourseMaterial & {
  code: string;
  createdAt: number;
  budget: number;
  students: Student[];
  responses: StudentResponse[];
  challenges: Challenge[];
};

export type ConceptEvidence = {
  directEvidence: number;
  inferredEvidence: number;
  directCount: number;
};

export type EvidenceState = Record<string, ConceptEvidence>;

export type DiagnosticLabel =
  | "Demonstrated strength"
  | "Needs review"
  | "Mixed evidence"
  | "Tentative inference"
  | "Unknown";

// What a student may see before answering: no key, no explanation.
export type PublicQuestion = Pick<Question, "id" | "text" | "options" | "conceptIds" | "sourcePage">;
