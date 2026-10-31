import { NextResponse } from "next/server";
import { diagnose, isCorrect, selectNextQuestion } from "@/lib/engine";
import { getRoom, publicQuestion } from "@/lib/store";

export async function GET(_req: Request, { params }: { params: Promise<{ code: string; sid: string }> }) {
  const { code, sid } = await params;
  const room = getRoom(code);
  const student = room?.students.find((s) => s.id === sid);
  if (!room || !student) return NextResponse.json({ error: "Not found." }, { status: 404 });

  const next = selectNextQuestion(room, sid);
  const answered = room.responses
    .filter((r) => r.studentId === sid)
    .map((r) => {
      const q = room.questions.find((x) => x.id === r.questionId)!;
      return {
        question: publicQuestion(q),
        choice: r.choice,
        correct: isCorrect(q, r.choice),
        correctAnswer: q.correctAnswer,
        explanation: q.explanation,
        invalidated: q.status === "invalidated",
        revised: q.revision > 0,
        challenge: room.challenges.findLast((c) => c.studentId === sid && c.questionId === q.id)?.status ?? null,
      };
    });

  return NextResponse.json({
    title: room.title,
    student: { id: student.id, name: student.name },
    budget: room.budget,
    next: next ? publicQuestion(next) : null,
    answered,
    concepts: room.concepts.map((c) => ({ id: c.id, name: c.name })),
    diagnostics: diagnose(room, sid),
  });
}
