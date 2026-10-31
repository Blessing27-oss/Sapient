import { NextResponse } from "next/server";
import { classSummary } from "@/lib/engine";
import { getRoom } from "@/lib/store";

export async function GET(_req: Request, { params }: { params: Promise<{ code: string }> }) {
  const room = getRoom((await params).code);
  if (!room) return NextResponse.json({ error: "Room not found." }, { status: 404 });
  const names = new Map(room.students.map((s) => [s.id, s.name]));
  return NextResponse.json({
    code: room.code,
    title: room.title,
    budget: room.budget,
    concepts: room.concepts,
    edges: room.edges,
    questions: room.questions.filter((q) => q.approved),
    challenges: room.challenges.map((c) => ({ ...c, studentName: names.get(c.studentId) ?? "?" })),
    summary: classSummary(room),
  });
}
