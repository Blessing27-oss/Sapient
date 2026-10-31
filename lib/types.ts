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
// layout holds boxes the professor dragged, in the coordinates of the direction the graph was drawn in.
export type SectionLayout = { direction: "TD" | "LR"; positions: Record<string, { x: number; y: number }> };
export type MapSection = { id: string; title: string; direction: "TD" | "LR"; nodes: MapNode[]; edges: MapEdge[]; sources: string; note: string; layout?: SectionLayout };
// Sections form one knowledge graph: a node id reused in several sections is the same idea,
// and links connect nodes that live in different sections.
export type TopicMap = { sourceNote: string; sections: MapSection[]; links: MapEdge[]; studyRoute: string };

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
export type MapLayout = { w: number; h: number; pos: Record<string, { x: number; y: number }> };
export type Room = {
  code: string;
  ownerId?: string;
  sourceIds?: string[];
  title: string;
  concepts: Concept[];
  edges: Edge[];
  topicMap?: TopicMap;
  layout?: MapLayout;
  questions: Question[];
  students: Student[];
  challenges: Challenge[];
  insights: Insight[];
  // Anonymous record of what students ask the study helper: a paraphrased topic, never their wording or name.
  asked?: AskedTopic[];
  askSalt?: string;
};
// asker: a salted per-room hash, used only to count distinct students; never shown or reversible to a name.
export type AskedTopic = { asker: string; conceptIds: string[]; topic: string };

export type ConceptState = {
  direct: number; // net direct evidence
  inferred: number; // net inferred evidence
  directCount: number;
  correctCount: number;
  wrongCount: number;
};
export type KnowledgeState = Record<string, ConceptState>;
export type Label = "strength" | "review" | "mixed" | "tentative-up" | "tentative-down" | "unknown";
