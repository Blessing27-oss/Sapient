import { QUESTION_BUDGET, gradeResponse, classify, computeState, selectNextQuestion, validResponses } from "@/lib/engine";
import { requireStudent } from "@/lib/auth";
import { isLive } from "@/lib/questions";
import { getRoom } from "@/lib/store";

export async function GET(req: Request, { params }: { params: Promise<{ code: string }> }) {
  const auth = await requireStudent();
  if ("deny" in auth) return auth.deny;
  const { code } = await params;
  const room = await getRoom(code);
  const student = room?.students.find((s) => s.id === new URL(req.url).searchParams.get("student") && s.userId === auth.user.id);
  if (!room || !student) return Response.json({ error: "Not found" }, { status: 404 });
  if (!room.questions.some(isLive)) return Response.json({ noQuestions: true, title: room.title });
  const valid = validResponses(room, student);
  const state = computeState(room, valid);
  const done = valid.length >= QUESTION_BUDGET;
  const next = done ? undefined : selectNextQuestion(room.questions, room.concepts, state, valid.map((r) => r.questionId));
  const progress = { answered: valid.length, total: QUESTION_BUDGET };
  if (next) {
    // Never send the answer key to the student.
    const { correctAnswer: _a, explanation: _e, ...safe } = next;
    return Response.json({ question: safe, progress });
  }
  const diagnostic = room.concepts.map((c) => ({
    conceptId: c.id, name: c.name, foundational: !!c.foundational, description: c.description, label: classify(state[c.id]),
    evidence: { correct: state[c.id].correctCount, wrong: state[c.id].wrongCount },
  }));
  const answered = valid.map((r) => {
    const q = room.questions.find((x) => x.id === r.questionId)!;
    return { questionId: q.id, text: q.text, correct: gradeResponse(q, r), choice: r.choice, options: q.options, correctAnswer: q.correctAnswer, explanation: q.explanation };
  });
  return Response.json({ done: true, progress, diagnostic, answered, edges: room.edges, layout: room.layout });
}
