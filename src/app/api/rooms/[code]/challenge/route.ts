import { NextResponse } from "next/server";
import { getRoom, newId } from "@backend/lib/store";

export async function POST(req: Request, { params }: { params: Promise<{ code: string }> }) {
  const room = getRoom((await params).code);
  if (!room) return NextResponse.json({ error: "Room not found." }, { status: 404 });
  const { studentId, questionId, reason } = await req.json();

  const answered = room.responses.some((r) => r.studentId === studentId && r.questionId === questionId);
  if (!answered) return NextResponse.json({ error: "You can only challenge a question you answered." }, { status: 400 });
  const text = String(reason ?? "").trim().slice(0, 1000);
  if (!text) return NextResponse.json({ error: "Explain what seems ambiguous or unfair." }, { status: 400 });

  room.challenges.push({ id: newId("ch"), studentId, questionId, reason: text, status: "open", at: Date.now() });
  return NextResponse.json({ ok: true });
}
