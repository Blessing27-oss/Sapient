import { NextResponse } from "next/server";
import { createRoom, QUESTION_BUDGET } from "@/lib/store";
import type { CourseMaterial } from "@/lib/types";

export async function POST(req: Request) {
  const { material } = (await req.json()) as { material: CourseMaterial };
  const approved = material.questions.filter((q) => q.approved && q.status === "active");
  if (approved.length < QUESTION_BUDGET) {
    return NextResponse.json({ error: `Approve at least ${QUESTION_BUDGET} questions before publishing.` }, { status: 400 });
  }
  const room = createRoom(material);
  return NextResponse.json({ code: room.code });
}
