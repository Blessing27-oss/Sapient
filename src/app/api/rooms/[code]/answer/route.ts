import { NextResponse } from "next/server";
import { isCorrect, selectNextQuestion } from "@backend/lib/engine";
import { getRoom, newId } from "@backend/lib/store";

export async function POST(req: Request, { params }: { params: Promise<{ code: string }> }) {
  const room = getRoom((await params).code);
  if (!room) return NextResponse.json({ error: "Room not found." }, { status: 404 });
  const { studentId, questionId, choice } = await req.json();

  // Only the question the adaptive policy selected may be answered.
  const expected = selectNextQuestion(room, studentId);
  if (!expected || expected.id !== questionId) {
    return NextResponse.json({ error: "That question is no longer the current one. Refresh." }, { status: 409 });
  }
  if (!Number.isInteger(choice) || choice < 0 || choice >= expected.options.length) {
    return NextResponse.json({ error: "Invalid choice." }, { status: 400 });
  }

  room.responses.push({ id: newId("r"), studentId, questionId, choice, at: Date.now() });
  return NextResponse.json({
    correct: isCorrect(expected, choice),
    correctAnswer: expected.correctAnswer,
    explanation: expected.explanation,
  });
}
