import { randomBytes } from "node:crypto";
import { askerKey } from "./asked.ts";
import { getDatabase, type Database } from "./db.ts";
import { emptyState, QUESTION_BUDGET, selectNextQuestion, updateKnowledge } from "./engine.ts";
import { SAMPLE } from "./sample.ts";
import { createRoomStore } from "./store.ts";
import { sanitizeTopicMap, type RawTopicMap } from "./topicMap.ts";
import type { Challenge, Room, Student } from "./types.ts";

// Real room codes never contain I or O (see store.ts), so the demo code can't collide with one.
export const DEMO_CODE = "DEMO";
export const DEMO_PROFESSOR = { id: "demo-professor", name: "Demo Professor", username: "demo:professor" };
// Visitors can edit the demo freely; it goes back to the seeded state after this long.
export const DEMO_RESET_MS = 6 * 60 * 60_000;
export const GUEST_TTL_HOURS = 24;
// Usernames with this prefix are reserved for demo accounts (createUser rejects them).
export const DEMO_USERNAME_PREFIX = "demo:";

// Small deterministic PRNG so the seeded class looks the same on every reset.
function mulberry32(seed: number) {
  return () => {
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const NAMES = ["Avery", "Jordan", "Priya", "Mateo", "Sofia", "Kwame", "Lena", "Hiro", "Amara", "Noah", "Ines", "Tariq", "Mei", "Oscar", "Zara", "Eli"];
// How well the simulated class knows each concept (probability of answering it correctly).
// Convolution (and, more mildly, windowing) is the planted class-wide gap the dashboard should surface. (The engine
// favors questions tagged with several concepts, so those are the questions a fresh class is asked.)
const MASTERY: Record<string, number> = { c1: 0.9, c2: 0.85, c3: 0.85, c4: 0.9, c5: 0.3, c6: 0.6, c7: 0.6, c8: 0.6, c9: 0.3, c10: 0.75 };

const n = (id: string, label: string, conceptId = "", details: string[] = []) => ({ id, label, details, conceptId });
const e = (source: string, target: string, style = "solid", label = "") => ({ source, target, style, label });
const RAW_MAP: RawTopicMap = {
  sourceNote: "Page numbers refer to the sample lecture notes.",
  studyRoute: "Start with the Fourier series and orthogonality, then the transform, then convolution, and finish with sampling.",
  sections: [
    {
      title: "From series to transform", direction: "TD", sources: "pp. 1–3", note: "",
      nodes: [
        n("series", "Fourier series", "c2", ["Periodic signal = sum of harmonics"]),
        n("orth", "Orthogonality", "c3", ["Distinct harmonics have zero inner product"]),
        n("ft", "Fourier transform", "c1", ["Extends the series to non-periodic signals"]),
        n("freq", "Frequency domain", "c4", ["A signal described by its spectrum"]),
        n("parseval", "Parseval's theorem", "c10", ["Energy is the same in both domains"]),
      ],
      edges: [e("orth", "series", "solid", "makes coefficients computable"), e("series", "ft", "solid", "generalizes to"), e("ft", "freq"), e("ft", "parseval", "dotted")],
    },
    {
      title: "Convolution", direction: "LR", sources: "pp. 4–5", note: "Most of the class's mistakes fall in this section.",
      nodes: [
        n("ft", "Fourier transform", "c1"),
        n("conv", "Convolution", "c5", ["Filtering in the time domain"]),
        n("convthm", "Convolution theorem", "c6", ["Convolution ↔ multiplication"]),
      ],
      edges: [e("conv", "convthm"), e("ft", "convthm", "solid", "proved with")],
    },
    {
      title: "Sampling in practice", direction: "TD", sources: "pp. 6–7", note: "",
      nodes: [
        n("sampling", "Sampling", "c7", ["Nyquist rate = 2 × highest frequency"]),
        n("alias", "Aliasing", "c8", ["Undersampled tones fold to lower frequencies"]),
        n("window", "Windowing", "c9", ["Finite observation → spectral leakage"]),
      ],
      edges: [e("sampling", "alias", "solid", "below Nyquist causes"), e("sampling", "window", "dotted")],
    },
  ],
  links: [e("freq", "sampling", "dotted", "spectrum sets the sampling rate"), e("convthm", "window", "dotted", "windowing is multiplication")],
};

const CHALLENGES: Record<string, string> = {
  q1: "For sampled signals isn't it circular convolution that becomes multiplication? \"It becomes multiplication\" seems only true for continuous signals.",
  q6: "Isn't the answer the same as multiplying the spectra? The slides only showed the time → frequency direction.",
};
const ASKED: { topic: string; conceptIds: string[]; askers: number }[] = [
  { topic: "Why convolution becomes multiplication", conceptIds: ["c5", "c6"], askers: 5 },
  { topic: "Why windowing causes spectral leakage", conceptIds: ["c9"], askers: 3 },
  { topic: "Difference between Fourier series and transform", conceptIds: ["c1", "c2"], askers: 2 },
];

// The seeded demo room: the sample lesson plus a simulated class whose answers come from the
// real adaptive engine, so the dashboard shows exactly what a real class would produce.
export function buildDemoRoom(now = Date.now()): Room {
  const rand = mulberry32(70);
  const concepts = SAMPLE.concepts.map((c) => ({ ...c, verified: true }));
  const questions = SAMPLE.questions.map((q) => ({ ...q, approved: true }));
  const room: Room = {
    code: DEMO_CODE, ownerId: DEMO_PROFESSOR.id, title: "Fourier Transforms (demo class)",
    concepts, edges: SAMPLE.edges, questions, topicMap: sanitizeTopicMap(RAW_MAP, new Set(concepts.map((c) => c.id))),
    students: [], challenges: [], insights: [], asked: [], askSalt: randomBytes(16).toString("hex"), demoSeededAt: now,
  };

  NAMES.forEach((name, i) => {
    const skill = (rand() - 0.5) * 0.3; // some students are stronger overall than others
    const student: Student = { id: `demo-s${i + 1}`, name, responses: [] };
    const state = emptyState(concepts);
    for (let k = 0; k < QUESTION_BUDGET; k++) {
      const q = selectNextQuestion(questions, concepts, state, student.responses.map((r) => r.questionId));
      if (!q) break;
      const p = q.conceptIds.reduce((t, id) => t + (MASTERY[id] ?? 0.6), 0) / q.conceptIds.length + skill;
      const correct = rand() < p;
      const wrong = q.options.map((_, j) => j).filter((j) => j !== q.correctAnswer);
      const choice = correct ? q.correctAnswer : wrong[Math.floor(rand() * wrong.length)];
      student.responses.push({ questionId: q.id, choice, correct, at: now - (NAMES.length - i) * 7 * 60_000 + k * 60_000 });
      updateKnowledge(q, correct, state, room.edges);
    }
    room.students.push(student);
  });

  // An open challenge from the first student who missed each challenged question.
  for (const [questionId, reason] of Object.entries(CHALLENGES)) {
    const s = room.students.find((x) => x.responses.some((r) => r.questionId === questionId && !r.correct));
    if (s) room.challenges.push({ id: `demo-ch-${questionId}`, questionId, studentId: s.id, reason, status: "open", at: now - 30 * 60_000 } satisfies Challenge);
  }
  let next = 0;
  for (const a of ASKED) {
    for (let j = 0; j < a.askers; j++) {
      const s = room.students[next++ % room.students.length];
      room.asked!.push({ asker: askerKey(room.askSalt!, s.id), conceptIds: a.conceptIds, topic: a.topic });
    }
  }
  return room;
}

export function createDemo(db: () => Promise<Database>, now = Date.now) {
  const rooms = createRoomStore(db);

  // Make sure the demo professor and room exist, and reset the room once it is older than DEMO_RESET_MS.
  async function ensureDemo() {
    const database = await db();
    await database.query(
      "INSERT INTO users (id, name, username, role, salt, hash, demo) VALUES ($1, $2, $3, 'professor', '', '', true) ON CONFLICT DO NOTHING",
      [DEMO_PROFESSOR.id, DEMO_PROFESSOR.name, DEMO_PROFESSOR.username],
    );
    await rooms.putRoom(buildDemoRoom(now()));
    const reset = await rooms.withRoom(DEMO_CODE, (room) => {
      if (!room || now() - (room.demoSeededAt ?? 0) < DEMO_RESET_MS) return false;
      const fresh = buildDemoRoom(now());
      for (const key of Object.keys(room)) delete (room as Record<string, unknown>)[key];
      Object.assign(room, fresh);
      return true;
    });
    // Guests who joined the old copy no longer have a record in the room. (Runs after the room's
    // transaction: a second statement on another connection inside it would deadlock embedded PGlite.)
    if (reset) await database.query("DELETE FROM room_members WHERE room_code = $1", [DEMO_CODE]);
    // Guest accounts are disposable; drop the expired ones.
    await database.query(`DELETE FROM users WHERE demo AND role = 'student' AND created_at < now() - interval '${GUEST_TTL_HOURS} hours'`);
  }

  return {
    ensureDemo,
    // A fresh, password-less guest student already enrolled in the demo room.
    async createGuest() {
      await ensureDemo();
      const id = randomBytes(6).toString("hex");
      const name = `Guest ${1000 + Math.floor(Math.random() * 9000)}`;
      await (await db()).query(
        "INSERT INTO users (id, name, username, role, salt, hash, demo) VALUES ($1, $2, $3, 'student', '', '', true)",
        [id, name, `${DEMO_USERNAME_PREFIX}guest-${id}`],
      );
      await rooms.withRoom(DEMO_CODE, (room) => { room!.students.push({ id: `guest-${id}`, name, userId: id, responses: [] }); });
      return { id, name, role: "student" as const };
    },
  };
}

export const demo = createDemo(getDatabase);
