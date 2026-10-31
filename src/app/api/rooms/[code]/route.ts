import { NextResponse } from "next/server";
import { getRoom } from "@backend/lib/store";

export async function GET(_req: Request, { params }: { params: Promise<{ code: string }> }) {
  const room = getRoom((await params).code);
  if (!room) return NextResponse.json({ error: "Room not found." }, { status: 404 });
  return NextResponse.json({ code: room.code, title: room.title, budget: room.budget });
}
