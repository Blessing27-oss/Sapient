import Anthropic from "@anthropic-ai/sdk";
import { createHash, randomBytes } from "node:crypto";
import { getRoom, withDB } from "./store.ts";
import type { AskedTopic, Room } from "./types.ts";

// A topic appears on the dashboard only once this many different students have asked about it,
// so one student's question can't be singled out in a small class.
export const MIN_ASKERS = 2;
const MAX_THEMES = 4;

export function askerKey(salt: string, studentId: string) {
  return createHash("sha256").update(`${salt}:${studentId}`).digest("hex").slice(0, 16);
}

const SYSTEM = `You help a professor see, anonymously, what their class asks a study helper about.
Given one student's question and the lesson's concepts, return:
- conceptIds: the 0-2 concept ids the question is about (only ids from the list).
- topic: the question rewritten as a short, general topic of at most 8 words, as a noun phrase (e.g. "How dental formulas are written", "Why lemurs evolved on Madagascar"). Never quote the student. Remove names, personal details, grades, feelings and anything that could identify them. Two students asking the same thing in different words should get the same topic.
- onTopic: false if the question is not about the lesson (greetings, off-topic chat, requests for answers to the quiz); then topic can be "".`;

const schema = {
  type: "object",
  additionalProperties: false,
  required: ["conceptIds", "topic", "onTopic"],
  properties: {
    conceptIds: { type: "array", items: { type: "string" } },
    topic: { type: "string" },
    onTopic: { type: "boolean" },
  },
} as const;

// Paraphrase and tag one question. The student's own wording is used only for this call and never stored.
export async function tagQuestion(room: Pick<Room, "concepts">, question: string): Promise<Omit<AskedTopic, "asker"> | null> {
  const client = new Anthropic();
  const response = await client.messages.create({
    model: "claude-opus-5-5",
    max_tokens: 2000,
    output_config: { effort: "low", format: { type: "json_schema", schema } },
    system: SYSTEM,
    messages: [{
      role: "user",
      content: `Concepts:\n${room.concepts.map((c) => `${c.id}: ${c.name}`).join("\n")}\n\nStudent question:\n${question.slice(0, 2000)}`,
    }],
  });
  if (response.stop_reason !== "end_turn") return null;
  const text = response.content.flatMap((b) => (b.type === "text" ? [b.text] : [])).join("");
  const out = JSON.parse(text) as { conceptIds: string[]; topic: string; onTopic: boolean };
  const known = new Set(room.concepts.map((c) => c.id));
  const topic = out.topic.replace(/\s+/g, " ").replace(/^["']|["']$/g, "").trim().slice(0, 80);
  if (!out.onTopic || !topic) return null;
  return { conceptIds: [...new Set(out.conceptIds.filter((id) => known.has(id)))].slice(0, 2), topic };
}

export async function recordQuestion(code: string, studentId: string, question: string) {
  const room = await getRoom(code);
  if (!room) return;
  const tagged = await tagQuestion(room, question);
  if (!tagged) return;
  await withDB((db) => {
    const r = db[code.toUpperCase()];
    if (!r) return;
    r.askSalt ??= randomBytes(16).toString("hex");
    (r.asked ??= []).push({ asker: askerKey(r.askSalt, studentId), ...tagged });
  });
}

const STOP = new Set("a an the of in on to and or for with how what why when which who is are was were do does did be by it its as at from that this vs versus".split(" "));
// Content words of a topic, lightly singularized, for matching rewordings.
export function topicWords(topic: string) {
  return new Set(topic.toLowerCase().replace(/[^a-z0-9 ]/g, " ").split(/\s+/)
    .filter((w) => w && !STOP.has(w)).map((w) => w.replace(/(ies)$/, "y").replace(/(?<=[^s])s$/, "")));
}
function similar(a: Set<string>, b: Set<string>) {
  const shared = [...a].filter((w) => b.has(w)).length;
  return shared > 0 && shared / new Set([...a, ...b]).size >= 0.6;
}

export type AskedSummary = {
  conceptId: string | null; // null: lesson questions not tied to one concept
  name: string;
  questions: number;
  students: number;
  themes: string[];
};

// Group by concept; only groups (and themes) asked by at least MIN_ASKERS different students are shown.
export function summarizeAsked(room: Pick<Room, "concepts" | "asked">, minAskers = MIN_ASKERS): { groups: AskedSummary[]; hidden: number } {
  const byConcept = new Map<string | null, AskedTopic[]>();
  for (const a of room.asked ?? []) {
    for (const id of a.conceptIds.length ? a.conceptIds : [null]) byConcept.set(id, [...(byConcept.get(id) ?? []), a]);
  }
  let hidden = 0;
  const groups: AskedSummary[] = [];
  for (const [conceptId, items] of byConcept) {
    const students = new Set(items.map((a) => a.asker)).size;
    if (students < minAskers) { hidden += items.length; continue; }
    // A theme is listed only if several students asked it too; the rest still count toward the totals.
    // Rewordings of the same question ("How to read a dental formula" / "How dental formulas are read") merge.
    const themeAskers: { label: string; words: Set<string>; askers: Set<string> }[] = [];
    for (const a of items) {
      const words = topicWords(a.topic);
      const t = themeAskers.find((x) => similar(x.words, words));
      if (t) t.askers.add(a.asker);
      else themeAskers.push({ label: a.topic, words, askers: new Set([a.asker]) });
    }
    const themes = themeAskers.filter((t) => t.askers.size >= minAskers)
      .sort((a, b) => b.askers.size - a.askers.size).slice(0, MAX_THEMES).map((t) => t.label);
    groups.push({
      conceptId,
      name: conceptId ? room.concepts.find((c) => c.id === conceptId)?.name ?? "Unknown concept" : "General lesson questions",
      questions: items.length,
      students,
      themes,
    });
  }
  groups.sort((a, b) => b.students - a.students || b.questions - a.questions);
  return { groups, hidden };
}
