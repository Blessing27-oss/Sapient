export type Concept = { id: string; name: string; importance: number; verified: boolean; foundational?: boolean; description?: string; sourcePage?: number };
export type Edge = { source: string; target: string; weight: number; type: "related"; rationale?: string };
export type Question = {
  id: string;
  text: string;
  options: string[];
  correctAnswer: number;
  conceptIds: string[];
  sourcePage?: number;
  explanation?: string;
  approved?: boolean;
  invalidated?: boolean;
  revision?: number;
};
export type Response = { questionId: string; choice: number; correct: boolean; at: number };
export type Student = { id: string; name: string; userId?: string; responses: Response[] };
export type Challenge = {
  id: string;
  questionId: string;
  studentId: string;
  reason: string;
  status: "open" | "resolved";
  at: number;
};
export type Insight = { conceptId: string; status: "open" | "useful" | "dismissed"; note?: string };
// Where the professor placed each concept, so every map of this room looks the same.
export type MapLayout = { w: number; h: number; pos: Record<string, { x: number; y: number }> };
export type Room = {
  code: string;
  ownerId?: string;
  title: string;
  concepts: Concept[];
  edges: Edge[];
  layout?: MapLayout;
  questions: Question[];
  students: Student[];
  challenges: Challenge[];
  insights: Insight[];
};

export type ConceptState = {
  direct: number; // net direct evidence
  inferred: number; // net inferred evidence
  directCount: number;
  correctCount: number;
  wrongCount: number;
};
export type KnowledgeState = Record<string, ConceptState>;
export type Label = "strength" | "review" | "mixed" | "tentative-up" | "tentative-down" | "unknown";
