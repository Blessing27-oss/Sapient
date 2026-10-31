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
// Topic map: the lecture's own structure, shown to people. Separate from the concept/edge graph
// the engine uses for evidence. A node links to an assessable concept via conceptId.
export type MapNode = { id: string; label: string; details: string[]; conceptId?: string };
// solid = classification or a relationship the material states; dotted = related concepts.
export type MapEdge = { source: string; target: string; style: "solid" | "dotted"; label?: string };
export type MapSection = { id: string; title: string; direction: "TD" | "LR"; nodes: MapNode[]; edges: MapEdge[]; sources: string; note: string };
// Sections form one knowledge graph: a node id reused in several sections is the same idea,
// and links connect nodes that live in different sections.
export type TopicMap = { sourceNote: string; sections: MapSection[]; links: MapEdge[]; studyRoute: string };

export type Response = { questionId: string; choice: number; correct: boolean; at: number };
export type Student = { id: string; name: string; responses: Response[] };
export type Challenge = {
  id: string;
  questionId: string;
  studentId: string;
  reason: string;
  status: "open" | "resolved";
  at: number;
};
export type Insight = { conceptId: string; status: "open" | "useful" | "dismissed"; note?: string };
export type Room = {
  code: string;
  title: string;
  concepts: Concept[];
  edges: Edge[];
  topicMap?: TopicMap;
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
