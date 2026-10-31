import { test } from "node:test";
import assert from "node:assert/strict";
import { askerKey, summarizeAsked, topicWords } from "./asked.ts";
import type { AskedTopic } from "./types.ts";

const concepts = [
  { id: "c1", name: "Dental formula", importance: 1, verified: true },
  { id: "c2", name: "Tooth comb", importance: 1, verified: true },
];
const ask = (who: string, conceptIds: string[], topic: string): AskedTopic => ({ asker: askerKey("salt", who), conceptIds, topic });

test("asker keys are stable per room, differ between rooms, and don't contain the student id", () => {
  assert.equal(askerKey("salt", "s_123"), askerKey("salt", "s_123"));
  assert.notEqual(askerKey("salt", "s_123"), askerKey("other", "s_123"));
  assert.ok(!askerKey("salt", "s_123").includes("123"));
});

test("only topics several different students asked about are shown; repeat askers don't inflate them", () => {
  const asked = [
    ask("a", ["c1"], "How dental formulas are written"),
    ask("b", ["c1"], "How dental formulas are written."),
    ask("c", ["c1"], "Why the aye-aye's formula differs"),
    // one student asking repeatedly about the tooth comb stays hidden
    ask("a", ["c2"], "What the tooth comb is used for"),
    ask("a", ["c2"], "What the tooth comb is used for"),
    ask("a", ["c2"], "Tooth comb versus grooming claw"),
    ask("b", [], "How to study for the exam"),
    ask("c", [], "How to study for the exam"),
  ];
  const { groups, hidden } = summarizeAsked({ concepts, asked });
  assert.equal(hidden, 3);
  assert.deepEqual(groups.map((g) => [g.name, g.students, g.questions]), [["Dental formula", 3, 3], ["General lesson questions", 2, 2]]);
  assert.deepEqual(groups[0].themes, ["How dental formulas are written"], "a theme from a single student is not listed");
  assert.equal(JSON.stringify(groups).includes(askerKey("salt", "a")), false, "asker keys never leave the summary");
});

test("rewordings of the same question merge into one theme; different questions don't", () => {
  assert.deepEqual([...topicWords("How dental formulas are read")].sort(), [...topicWords("How to read a dental formula")].sort());
  const { groups } = summarizeAsked({ concepts, asked: [
    ask("a", ["c1"], "How to read a dental formula"),
    ask("b", ["c1"], "How dental formulas are read"),
    ask("c", ["c1"], "Why the aye-aye has fewer teeth"),
  ] });
  assert.deepEqual(groups[0].themes, ["How to read a dental formula"]);
});
