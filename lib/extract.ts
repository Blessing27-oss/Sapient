import { orientEdges } from "./graph.ts";
import { createHash } from "node:crypto";
import { createGenerationCache } from "./generationCache.ts";
import Anthropic from "@anthropic-ai/sdk";
import { type RawTopicMap, sanitizeTopicMap } from "./topicMap.ts";
import type { Concept, Edge, Question, TopicMap } from "./types.ts";

export type Extracted = { title: string; concepts: Concept[]; edges: Edge[]; topicMap?: TopicMap; questions: Question[]; source: "llm" | "sample"; note?: string };

const MAX_SOURCE_CHARS = 400_000;

const topicMapSchema = {
  type: "object",
  additionalProperties: false,
  required: ["sourceNote", "sections", "links", "studyRoute"],
  properties: {
    sourceNote: { type: "string" },
    studyRoute: { type: "string" },
    links: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["source", "target", "style", "label"],
        properties: {
          source: { type: "string" },
          target: { type: "string" },
          style: { type: "string", enum: ["solid", "dotted"] },
          label: { type: "string" },
        },
      },
    },
    sections: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["title", "direction", "nodes", "edges", "sources", "note"],
        properties: {
          title: { type: "string" },
          direction: { type: "string", enum: ["TD", "LR"] },
          sources: { type: "string" },
          note: { type: "string" },
          nodes: {
            type: "array",
            items: {
              type: "object",
              additionalProperties: false,
              required: ["id", "label", "details", "conceptId"],
              properties: {
                id: { type: "string" },
                label: { type: "string" },
                details: { type: "array", items: { type: "string" } },
                conceptId: { type: "string" },
              },
            },
          },
          edges: {
            type: "array",
            items: {
              type: "object",
              additionalProperties: false,
              required: ["source", "target", "style", "label"],
              properties: {
                source: { type: "string" },
                target: { type: "string" },
                style: { type: "string", enum: ["solid", "dotted"] },
                label: { type: "string" },
              },
            },
          },
        },
      },
    },
  },
} as const;

const schema = {
  type: "object",
  additionalProperties: false,
  required: ["title", "concepts", "relationships", "topicMap", "questions"],
  properties: {
    topicMap: topicMapSchema,
    title: { type: "string" },
    concepts: {
      type: "array",
      minItems: 1,
      description: "Assessable concepts explicitly taught by the supplied lecture; must not be empty.",
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
      minItems: 1,
      description: "Grounded multiple-choice questions linked to the supplied concept ids; must not be empty.",
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

The input may be a print handout with several slides per PDF page, bullet fragments, image captions, repeated dates, and slide numbers mixed into the text. These are valid lecture materials. Use the readable teaching content even when some diagrams cannot be reconstructed. Do not interpret sparse slide text as evidence that the document is not educational. Do not invent facts from images you cannot see. SourcePage always refers to the physical [Page N] marker, not an embedded slide number.

From the lecture text (pages are marked "[Page N]"):
- Propose 8–12 concepts the material actually teaches, ids "c1", "c2", .... Mark a concept foundational only if other concepts in this material clearly build on it. sourcePage is the page where it is introduced.
- Propose a few relationships (roughly 1–2 per concept) between concepts that are pedagogically related. Treat them as undirected suggestions, not proven prerequisites. weight is a heuristic strength from 0.1 to 0.5.
- Write about 8 multiple-choice questions, ids "q1", "q2", ..., each with exactly 4 options and one unambiguous correct answer (0-based correctAnswer index; vary its position). Tag each question with the 1–3 concept ids it directly tests. Prefer questions that check understanding over recall. Ground each in the given pages and cite sourcePage. The explanation says briefly why the answer is right.
- Together the questions should cover most concepts, including the foundational ones.
- Build a topicMap: a study-guide view of how the lecture itself is organized. Use a single section unless the material clearly has distinct themes (e.g. a taxonomy, shared properties and how they vary, mechanisms or processes, competing explanations); then use 2–4 sections, one per theme. The sections together form one knowledge graph:
  - Node ids are global across the whole topicMap (e.g. "strepsirrhini", "tooth_comb"). When the same idea appears in more than one section, reuse the exact same id there, so it is recognized as one node; keep its label consistent.
  - links connects nodes in different sections when an idea in one section bears on an idea in another (e.g. a trait in a traits section explains an adaptation in an ecology section). Use the same style and label rules as edges. Leave links empty for a single section.
  Within each section:
  - Nodes: label is a short title (e.g. "Suborder: Strepsirrhini", "Convolution theorem"). details are 0–4 short lines carrying the specifics a student must know: defining traits, examples, values, distribution. Prefer several precise lines over one vague one. Set conceptId to the matching concept id when the node is the same idea as one of your concepts, otherwise "".
  - Use "TD" for hierarchies and classifications, "LR" for sets of traits, comparisons and cause-effect chains.
  - Edges point from the more general or causal node to the more specific or resulting one. style "solid" for classification ("is a", "contains") or a relationship the material states; "dotted" for a looser connection you are drawing between related ideas. Give a short label only when the relationship is not obvious from the layout (e.g. "activity timing", "predicts"); otherwise "".
  - sources lists where the section's content comes from. If the material prints its own slide or page numbers, cite those and say so in sourceNote; otherwise cite the [Page N] markers. note records caveats: uncertainty or open questions the lecture itself raises (keep them as open, do not resolve them), hypotheses that must not be read as established, terms defined, spellings standardized, and that examples are not exhaustive. Leave it "" if there is nothing to say.
  - Aim for 6–20 nodes per section. Keep claims to what the material says.
  - studyRoute: 1–3 sentences on the order to study the graphs in, following any review priorities the material gives.
Use only the provided material; if notation is ambiguous, follow the material's own convention.`;

const generatedDrafts = createGenerationCache<Extracted>();
const MODEL = "claude-opus-5-5";

// Preserve lines, equations, empty pages and all content; remove formatting-only whitespace.
export function prepareSource(pages: string[]): string {
  const source = pages.map((text, i) => {
    const cleaned = text.replace(/\r\n?/g, "\n").split("\n")
      .map((line) => line.trimEnd()).join("\n").replace(/\n{3,}/g, "\n\n").trim();
    return `[Page ${i + 1}]\n${cleaned}`;
  }).join("\n\n");
  if (!pages.some((page) => page.trim())) throw new Error("No extractable text in this PDF (it may be scanned images).");
  if (source.length > MAX_SOURCE_CHARS) {
    throw new Error(`This PDF has ${source.length.toLocaleString()} characters of text; the demo accepts up to ${MAX_SOURCE_CHARS.toLocaleString()}. Try a single lecture's notes.`);
  }
  return source;
}

export async function extract(pages: string[]): Promise<Extracted> {
  const source = prepareSource(pages);
  // Validate credentials before using a cache entry, even if a prior request succeeded.
  if (!process.env.ANTHROPIC_API_KEY) throw new Error("ANTHROPIC_API_KEY is not set on the server.");
  const key = createHash("sha256").update(JSON.stringify({ source, model: MODEL, system: SYSTEM, schema, credential: process.env.ANTHROPIC_API_KEY })).digest("hex");
  return generatedDrafts(key, () => generate(source, pages.length));
}

async function generate(source: string, pageCount: number): Promise<Extracted> {
  const client = new Anthropic();
  // Streamed so the long topic-map output doesn't hit non-streaming request timeouts.
  const response = await client.beta.messages
    .stream({
      model: MODEL,
      max_tokens: 64000,
      betas: ["server-side-fallback-2026-07-01"],
      fallbacks: "default",
      system: SYSTEM,
      output_config: { effort: "medium", format: { type: "json_schema", schema } },
      messages: [{ role: "user", content: `Lecture material:\n\n${source}` }],
    })
    .finalMessage();

  if (response.stop_reason === "refusal") throw new Error("The model declined to process this document.");
  if (response.stop_reason === "max_tokens") throw new Error("The model's response was cut off; try a shorter PDF.");
  const text = response.content.flatMap((b) => (b.type === "text" ? [b.text] : [])).join("");
  try {
    return sanitize(JSON.parse(text), pageCount);
  } catch (error) {
    // Metadata only: never log lecture text, generated content, or credentials.
    console.warn("[extract] generation validation failed", {
      messageId: response.id, model: response.model, stopReason: response.stop_reason,
      inputTokens: response.usage.input_tokens, outputTokens: response.usage.output_tokens,
      pageCount, sourceCharacters: source.length,
    });
    throw error;
  }
}

type Raw = {
  title: string;
  concepts: { id: string; name: string; description: string; foundational: boolean; sourcePage: number }[];
  relationships: { source: string; target: string; weight: number; rationale: string }[];
  topicMap?: RawTopicMap;
  questions: { id: string; text: string; options: string[]; correctAnswer: number; conceptIds: string[]; explanation: string; sourcePage: number }[];
};

// The model answered, but nothing it returned could be used (as opposed to an API or credential failure).
export class UnusableDraftError extends Error {}

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
  // Models sometimes tag questions by concept name or with different casing ("C1"); resolve those too.
  const resolve = new Map<string, string>();
  for (const c of concepts) for (const k of [c.id, c.name]) resolve.set(k.trim().toLowerCase(), c.id);
  const dropped = { duplicate: 0, untagged: 0, options: 0, key: 0 };
  const questionSeen = new Set<string>();
  const questions = raw.questions
    .filter((q) => (q.id && !questionSeen.has(q.id) && (questionSeen.add(q.id), true)) || (dropped.duplicate++, false))
    .map((q) => ({ ...q, conceptIds: [...new Set(q.conceptIds.flatMap((id) => resolve.get(String(id).trim().toLowerCase()) ?? []))] }))
    .filter((q) => {
      if (q.options.length !== 4) return dropped.options++, false;
      if (!Number.isInteger(q.correctAnswer) || q.correctAnswer < 0 || q.correctAnswer >= q.options.length) return dropped.key++, false;
      if (!q.conceptIds.length) return dropped.untagged++, false;
      return true;
    })
    .map((q) => ({ ...q, sourcePage: page(q.sourcePage), approved: false, invalidated: false, revision: 0 }));
  if (!concepts.length || !questions.length) {
    const reasons = [
      dropped.untagged && `${dropped.untagged} not tagged with a known concept`,
      dropped.options && `${dropped.options} without exactly 4 options`,
      dropped.key && `${dropped.key} with an invalid answer key`,
      dropped.duplicate && `${dropped.duplicate} with a duplicate id`,
    ].filter(Boolean);
    const summary = `The AI returned ${raw.concepts.length} concept(s) and ${raw.questions.length} question(s)` +
      (reasons.length ? `; questions dropped: ${reasons.join(", ")}` : "");
    console.warn(`[extract] unusable draft: ${summary}`);
    // An empty model result does not establish anything about the document's suitability.
    if (!raw.concepts.length && !raw.questions.length) {
      throw new UnusableDraftError("The PDF text was extracted, but the AI returned an empty draft (0 concepts and 0 questions). This is a generation failure, not a determination that your PDF is unsuitable");
    }
    throw new UnusableDraftError(`${summary}. Try again, or try a PDF of lecture notes or slides`);
  }
  return { title: raw.title, concepts, edges: orientEdges(concepts.map((c) => c.id), edges), topicMap: sanitizeTopicMap(raw.topicMap, ids), questions, source: "llm" };
}
