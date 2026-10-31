import Anthropic from "@anthropic-ai/sdk";
import type { CourseMaterial } from "./types";

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
- Propose 8–12 concepts the material actually teaches, ids "c1", "c2", .... Mark a concept foundational only if other concepts in this material clearly build on it. sourcePage is the page where it is introduced.
- Propose a few relationships (roughly 1–2 per concept) between concepts that are pedagogically related. Treat them as undirected suggestions, not proven prerequisites. weight is a heuristic strength from 0.1 to 0.5.
- Write about 8 multiple-choice questions, ids "q1", "q2", ..., each with exactly 4 options and one unambiguous correct answer (0-based correctAnswer index; vary its position). Tag each question with the 1–3 concept ids it directly tests. Prefer questions that check understanding over recall. Ground each in the given pages and cite sourcePage. The explanation says briefly why the answer is right.
- Together the questions should cover most concepts, including the foundational ones.
Use only the provided material; if notation is ambiguous, follow the material's own convention.`;

export async function generateMaterial(pages: string[]): Promise<CourseMaterial> {
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
function sanitize(raw: Raw, pageCount: number): CourseMaterial {
  const page = (p: number) => (Number.isInteger(p) && p >= 1 && p <= pageCount ? p : null);
  const concepts = raw.concepts.map((c) => ({
    id: c.id,
    name: c.name,
    description: c.description,
    foundational: c.foundational,
    verified: false,
    sourcePage: page(c.sourcePage),
  }));
  const ids = new Set(concepts.map((c) => c.id));
  const seen = new Set<string>();
  const edges = raw.relationships
    .filter((e) => ids.has(e.source) && ids.has(e.target) && e.source !== e.target)
    .filter((e) => {
      const key = [e.source, e.target].sort().join("|");
      return seen.has(key) ? false : (seen.add(key), true);
    })
    .map((e) => ({ ...e, weight: Math.min(0.5, Math.max(0.1, Math.round(e.weight * 10) / 10)) }));
  const questions = raw.questions
    .map((q) => ({ ...q, conceptIds: q.conceptIds.filter((id) => ids.has(id)) }))
    .filter((q) => q.options.length >= 2 && q.correctAnswer >= 0 && q.correctAnswer < q.options.length && q.conceptIds.length > 0)
    .map((q) => ({ ...q, sourcePage: page(q.sourcePage), approved: false, status: "active" as const, revision: 0 }));
  return { title: raw.title, concepts, edges, questions };
}
