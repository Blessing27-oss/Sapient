import Anthropic from "@anthropic-ai/sdk";
import { orientEdges } from "./graph.ts";
import type { Concept, Edge, Question } from "./types.ts";

export type Extracted = { title: string; concepts: Concept[]; edges: Edge[]; questions: Question[]; source: "llm" | "sample"; note?: string };

const MAX_SOURCE_CHARS = 400_000;

const schema = {
  type: "object",
  additionalProperties: false,
  required: ["title", "concepts", "relationships", "questions"],
  properties: {
    title: { type: "string" },
    concepts: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["id", "name", "description", "foundational", "sourcePage"],
        properties: {
          id: { type: "string" },
          name: { type: "string" },
          description: { type: "string" },
          foundational: { type: "boolean" },
          sourcePage: { type: "integer" },
        },
      },
    },
    relationships: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["source", "target", "weight", "rationale"],
        properties: {
          source: { type: "string" },
          target: { type: "string" },
          weight: { type: "number" },
          rationale: { type: "string" },
        },
      },
    },
    questions: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["id", "text", "options", "correctAnswer", "conceptIds", "explanation", "sourcePage"],
        properties: {
          id: { type: "string" },
          text: { type: "string" },
          options: { type: "array", items: { type: "string" } },
          correctAnswer: { type: "integer" },
          conceptIds: { type: "array", items: { type: "string" } },
          explanation: { type: "string" },
          sourcePage: { type: "integer" },
        },
      },
    },
  },
} as const;

const SYSTEM = `You help a professor build a short classroom diagnostic from their own course material. Your output is a draft the professor will review, edit, and approve before any student sees it.

From the lecture text (pages are marked "[Page N]"):
- Propose 8–12 concepts: the subject topics and ideas the material teaches, ids "c1", "c2", .... If the document contains a schedule, syllabus or calendar table (columns or rows such as Week, Date, Topic, Readings, Assignments), take the concepts from its Topic / Topics / Subject column (or row) and ignore every other column: weeks, dates, readings, assignments, exams, holidays, office hours and grading. Table cells may arrive flattened into running text, so use the header words to work out which text is the topic. Turn each topic into a short, clear concept name. With more than 12 topics, keep the most central or merge related ones; with fewer than 8, add closely related subtopics the material mentions. Never create a concept from logistics.
- "c1" must be the single central topic of the material (the main subject everything else belongs to). Every other concept must connect to c1, directly or through other concepts, so the concepts form one tree-like map with c1 at its root. Mark a concept foundational only if other concepts in this material clearly build on it. sourcePage is the page where it is introduced.
- Propose relationships (roughly one per concept, so every concept is reachable from c1). Orient each relationship from the broader or earlier idea (source) to the more specific idea that builds on it (target). Treat them as suggestions, not proven prerequisites. weight is a heuristic strength from 0.1 to 0.5.
- Write about 8 multiple-choice questions, ids "q1", "q2", ..., each with exactly 4 options and one unambiguous correct answer (0-based correctAnswer index; vary its position). Tag each question with the 1–3 concept ids it directly tests. Prefer questions that check understanding over recall. Ground each in the given pages and cite sourcePage. The explanation says briefly why the answer is right.
- Together the questions should cover most concepts, including the foundational ones.
- Never ask about the schedule itself (dates, deadlines, readings, grading). If the material only names its topics without explaining them (for example a syllabus), write the questions about those topics from standard, well-established knowledge of the subject, at an introductory level suited to the course, and prefer clear definitions and unambiguous facts. The professor reviews every question before students see it.
Otherwise rely on the provided material; if notation is ambiguous, follow the material's own convention.`;

export async function extract(pages: string[]): Promise<Extracted> {
  const source = pages.map((t, i) => `[Page ${i + 1}]\n${t.trim()}`).join("\n\n");
  if (!source.replace(/\[Page \d+\]/g, "").trim()) {
    throw new Error("No extractable text in this PDF (it may be scanned images).");
  }
  if (source.length > MAX_SOURCE_CHARS) {
    throw new Error(`This PDF has ${source.length.toLocaleString()} characters of text; the demo accepts up to ${MAX_SOURCE_CHARS.toLocaleString()}. Try a single lecture's notes.`);
  }

  const client = new Anthropic();
  const response = await client.beta.messages.create({
    model: "claude-opus-5-5",
    max_tokens: 16000,
    betas: ["server-side-fallback-2026-07-01"],
    fallbacks: "default",
    system: SYSTEM,
    output_config: { effort: "medium", format: { type: "json_schema", schema } },
    messages: [{ role: "user", content: `Lecture material:\n\n${source}` }],
  });

  if (response.stop_reason === "refusal") throw new Error("The model declined to process this document.");
  if (response.stop_reason === "max_tokens") throw new Error("The model's response was cut off; try a shorter PDF.");
  const text = response.content.flatMap((b) => (b.type === "text" ? [b.text] : [])).join("");
  return sanitize(JSON.parse(text), pages.length);
}

type Raw = {
  title: string;
  concepts: { id: string; name: string; description: string; foundational: boolean; sourcePage: number }[];
  relationships: { source: string; target: string; weight: number; rationale: string }[];
  questions: { id: string; text: string; options: string[]; correctAnswer: number; conceptIds: string[]; explanation: string; sourcePage: number }[];
};

// Drop anything malformed rather than trusting the model's ids and indices.
export function sanitize(raw: Raw, pageCount: number): Extracted {
  const page = (p: number) => (Number.isInteger(p) && p >= 1 && p <= pageCount ? p : undefined);
  const conceptSeen = new Set<string>();
  const concepts = raw.concepts.filter((c) => c.id && !conceptSeen.has(c.id) && (conceptSeen.add(c.id), true)).map((c) => ({
    id: c.id,
    name: c.name,
    description: c.description,
    foundational: c.foundational,
    importance: c.foundational ? 1 : 0.6,
    verified: false,
    sourcePage: page(c.sourcePage),
  }));
  const ids = new Set(concepts.map((c) => c.id));
  const seen = new Set<string>();
  const edges = raw.relationships
    .filter((e) => Number.isFinite(e.weight) && ids.has(e.source) && ids.has(e.target) && e.source !== e.target)
    .filter((e) => {
      const key = [e.source, e.target].sort().join("|");
      return seen.has(key) ? false : (seen.add(key), true);
    })
    .map((e) => ({ ...e, type: "related" as const, weight: Math.min(0.5, Math.max(0.1, Math.round(e.weight * 10) / 10)) }));
  const questionSeen = new Set<string>();
  const questions = raw.questions
    .filter((q) => q.id && !questionSeen.has(q.id) && (questionSeen.add(q.id), true))
    .map((q) => ({ ...q, conceptIds: [...new Set(q.conceptIds.filter((id) => ids.has(id)))] }))
    .filter((q) => q.options.length === 4 && Number.isInteger(q.correctAnswer) && q.correctAnswer >= 0 && q.correctAnswer < q.options.length && q.conceptIds.length > 0)
    .map((q) => ({ ...q, sourcePage: page(q.sourcePage), approved: false, invalidated: false, revision: 0 }));
  if (!concepts.length || !questions.length) throw new Error("No usable concepts or questions were generated.");
  return { title: raw.title, concepts, edges: orientEdges(concepts.map((c) => c.id), edges), questions, source: "llm" };
}
