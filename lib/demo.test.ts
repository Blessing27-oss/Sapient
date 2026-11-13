import { test } from "node:test";
import assert from "node:assert/strict";
import { summarizeAsked } from "./asked.ts";
import { openDatabase } from "./db.ts";
import { buildDemoRoom, createDemo, DEMO_CODE, DEMO_PROFESSOR, DEMO_RESET_MS } from "./demo.ts";
import { classDiagnostic, QUESTION_BUDGET } from "./engine.ts";
import { createRoomStore } from "./store.ts";
import { createUserStore } from "./users.ts";

test("the seeded class is deterministic and shows a planted gap, challenges, and study topics", () => {
  const a = buildDemoRoom(0), b = buildDemoRoom(0);
  assert.deepEqual(a.students, b.students);
  assert.equal(a.students.length, 16);
  assert.ok(a.students.every((s) => s.responses.length === QUESTION_BUDGET));
  assert.ok(a.topicMap && a.topicMap.sections.length === 3);

  const rows = classDiagnostic(a);
  const missRate = (id: string) => { const r = rows.find((x) => x.conceptId === id)!; return r.asked ? r.missed / r.asked : 0; };
  assert.ok(missRate("c5") >= 0.5 && rows.find((r) => r.conceptId === "c5")!.flag, "convolution is the planted, flagged gap");
  assert.ok(missRate("c3") < 0.3, "orthogonality is a class strength");

  assert.equal(a.challenges.filter((c) => c.status === "open").length, 2);
  for (const c of a.challenges) {
    const s = a.students.find((x) => x.id === c.studentId)!;
    assert.ok(s.responses.some((r) => r.questionId === c.questionId), "challenger answered the question");
  }
  assert.ok(summarizeAsked(a).groups.length >= 2, "study topics clear the two-asker privacy threshold");
});

test("ensureDemo seeds once, keeps visitor edits, then resets after DEMO_RESET_MS", async () => {
  const db = await openDatabase();
  try {
    let clock = 1_000_000;
    const demo = createDemo(async () => db, () => clock);
    const rooms = createRoomStore(async () => db);
    await Promise.all([demo.ensureDemo(), demo.ensureDemo()]);
    assert.equal((await rooms.listOwnedRooms(DEMO_PROFESSOR.id)).length, 1);

    await rooms.withRoom(DEMO_CODE, (r) => { r!.questions[0].invalidated = true; });
    clock += DEMO_RESET_MS - 1;
    await demo.ensureDemo();
    assert.equal((await rooms.getRoom(DEMO_CODE))!.questions[0].invalidated, true, "edits survive until the reset time");

    clock += 1;
    await demo.ensureDemo();
    const reset = (await rooms.getRoom(DEMO_CODE))!;
    assert.ok(!reset.questions[0].invalidated);
    assert.equal(reset.demoSeededAt, clock);
  } finally { await db.close(); }
});

test("guests are enrolled in the demo room, and demo accounts can't sign in with a password", async () => {
  const db = await openDatabase();
  try {
    const demo = createDemo(async () => db);
    const rooms = createRoomStore(async () => db);
    const users = createUserStore(async () => db);
    const guest = await demo.createGuest();
    const other = await demo.createGuest();
    assert.notEqual(guest.id, other.id);
    assert.deepEqual((await rooms.listJoinedRooms(guest.id)).map((r) => r.code), [DEMO_CODE]);
    assert.ok((await rooms.getRoom(DEMO_CODE))!.students.some((s) => s.userId === guest.id));

    assert.equal(await users.verifyUser(DEMO_PROFESSOR.username, ""), null);
    assert.equal(await users.verifyUser(`demo:guest-${guest.id}`, ""), null);
    assert.ok("error" in await users.createUser({ name: "demo:professor", password: "secret1", role: "professor" }));
  } finally { await db.close(); }
});

test("guest accounts expire after a day", async () => {
  const db = await openDatabase();
  try {
    const demo = createDemo(async () => db);
    const guest = await demo.createGuest();
    await db.query("UPDATE users SET created_at = now() - interval '25 hours' WHERE id = $1", [guest.id]);
    await demo.ensureDemo();
    assert.equal((await db.query("SELECT 1 FROM users WHERE id = $1", [guest.id])).length, 0);
    assert.equal((await db.query("SELECT 1 FROM users WHERE id = $1", [DEMO_PROFESSOR.id])).length, 1, "the demo professor is kept");
  } finally { await db.close(); }
});
