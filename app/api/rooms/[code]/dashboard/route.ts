import { requireProfessor } from "@/lib/auth";
import { QUESTION_BUDGET, gradeResponse, selectNextQuestion, classDiagnostic, classify, computeState, validResponses } from "@/lib/engine";
import { getRoom } from "@/lib/store";

export async function GET(_: Request, { params }: { params: Promise<{ code: string }> }) {
  const deny = await requireProfessor();
  if (deny) return deny;
  const room = await getRoom((await params).code);
  if (!room) return Response.json({ error: "Not found" }, { status: 404 });
  const students = room.students.map((s) => {
    const valid = validResponses(room, s);
    const st = computeState(room, valid);
    return {
      id: s.id, name: s.name, answered: valid.length,
      done: valid.length >= QUESTION_BUDGET || !selectNextQuestion(room.questions, room.concepts, st, valid.map((r) => r.questionId)),
      path: s.responses.map((r) => {
        const q = room.questions.find((q) => q.id === r.questionId);
        return { questionId: r.questionId, correct: q ? gradeResponse(q, r) : false, invalidated: !q || !!q.invalidated, revised: !!q?.revision };
      }),
      concepts: room.concepts.map((c) => ({ conceptId: c.id, label: classify(st[c.id]), directCount: st[c.id].directCount, correctCount: st[c.id].correctCount, inferred: st[c.id].inferred })),
    };
  });
  const challengeGroups = room.questions
    .map((q) => ({ question: q, items: room.challenges.filter((c) => c.questionId === q.id && c.status === "open") }))
    .filter((g) => g.items.length)
    .map((g) => ({
      question: g.question,
      reasons: g.items.map((i) => ({ student: room.students.find((s) => s.id === i.studentId)?.name ?? "?", reason: i.reason })),
    }));
  return Response.json({
    room: { code: room.code, title: room.title, concepts: room.concepts, edges: room.edges, topicMap: room.topicMap, questions: room.questions },
    students, classRows: classDiagnostic(room), challengeGroups, insights: room.insights,
  });
}
