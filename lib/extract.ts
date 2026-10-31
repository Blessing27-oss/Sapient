import Anthropic from "@anthropic-ai/sdk";
import type { Concept, Edge, Question } from "./types.ts";

export type Extracted = { title: string; concepts: Concept[]; edges: Edge[]; questions: Question[]; source: "llm" };

const SCHEMA = {
  type: "object",
  properties: {
    title: { type: "string" },
    concepts: { type: "array", items: { type: "object", properties: { id: { type: "string" }, name: { type: "string" }, importance: { type: "number" } }, required: ["id", "name", "importance"] } },
    edges: { type: "array", items: { type: "object", properties: { source: { type: "string" }, target: { type: "string" }, weight: { type: "number" } }, required: ["source", "target", "weight"] } },
    questions: { type: "array", items: { type: "object", properties: {
      id: { type: "string" }, text: { type: "string" }, options: { type: "array", items: { type: "string" } },
      correctAnswer: { type: "integer" }, conceptIds: { type: "array", items: { type: "string" } },
      sourcePage: { type: "integer" }, explanation: { type: "string" } },
      required: ["id", "text", "options", "correctAnswer", "conceptIds", "explanation"] } },
  },
  required: ["title", "concepts", "edges", "questions"],
} as const;

export async function extract(text: string): Promise<Extracted> {
  if (!process.env.ANTHROPIC_API_KEY) throw new Error("ANTHROPIC_API_KEY is not set on the server, so the PDF can't be analysed.");
  if (text.trim().length < 200) throw new Error("This PDF has almost no readable text (is it a scan or images only?).");

    const client = new Anthropic();
    const res = await client.messages.create({
      model: "claude-sonnet-5-5",
      max_tokens: 6000,
      tools: [{ name: "propose_assessment", description: "Propose an editable concept map and questions.", input_schema: SCHEMA as never }],
      tool_choice: { type: "tool", name: "propose_assessment" },
      messages: [{ role: "user", content:
        `From this lecture, propose 8-12 concepts (ids c1..cN, importance 0-1), undirected relationship edges (weight 0.1-0.4 = possible assessment relevance, not proof of mastery), and 8-10 multiple-choice questions with 4 options each. Each question lists the concepts it touches (1-3), a source page number if inferable, and a short explanation. Put the correct answer anywhere (vary the index).\n\n${text.slice(0, 40000)}` }],
    });
    const block = res.content.find((b) => b.type === "tool_use");
    if (!block || block.type !== "tool_use") throw new Error("no tool output");
    const d = block.input as { title: string; concepts: Concept[]; edges: Edge[]; questions: Question[] };
    const ids = new Set(d.concepts.map((c) => c.id));
    return {
      title: d.title,
      concepts: d.concepts.map((c) => ({ ...c, verified: false })),
      edges: d.edges.filter((e) => ids.has(e.source) && ids.has(e.target)).map((e) => ({ ...e, type: "related" as const })),
      questions: d.questions
        .map((q) => ({ ...q, conceptIds: q.conceptIds.filter((i) => ids.has(i)), approved: false }))
        .filter((q) => q.conceptIds.length && q.correctAnswer >= 0 && q.correctAnswer < q.options.length),
      source: "llm",
    };
}
