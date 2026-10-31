import { NextResponse } from "next/server";
import { getRoom, newId } from "@/lib/store";

export async function POST(req: Request, { params }: { params: Promise<{ code: string }> }) {
  const room = getRoom((await params).code);
  if (!room) return NextResponse.json({ error: "Room not found." }, { status: 404 });
  const name = String((await req.json()).name ?? "").trim().slice(0, 40);
  if (!name) return NextResponse.json({ error: "Enter a display name." }, { status: 400 });
  const student = { id: newId("s"), name, joinedAt: Date.now() };
  room.students.push(student);
  return NextResponse.json({ studentId: student.id, code: room.code });
}
