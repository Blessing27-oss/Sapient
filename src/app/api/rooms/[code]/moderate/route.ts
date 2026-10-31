import { NextResponse } from "next/server";
import { getRoom } from "@/lib/store";
import type { Challenge, Question } from "@/lib/types";

type Body =
  | { action: "dismiss"; challengeId: string }
  | { action: "invalidate" | "restore"; questionId: string }
  | { action: "revise"; questionId: string; patch: Partial<Pick<Question, "text" | "options" | "correctAnswer" | "conceptIds" | "explanation">> };

// Evidence is never stored; every read replays the response log, so these edits
// take effect on all diagnostics immediately.
export async function POST(req: Request, { params }: { params: Promise<{ code: string }> }) {
  const room = getRoom((await params).code);
  if (!room) return NextResponse.json({ error: "Room not found." }, { status: 404 });
  const body = (await req.json()) as Body;

  const resolveOpen = (questionId: string, status: Challenge["status"]) => {
    for (const c of room.challenges) if (c.questionId === questionId && c.status === "open") c.status = status;
  };

  if (body.action === "dismiss") {
    const ch = room.challenges.find((c) => c.id === body.challengeId);
    if (!ch) return NextResponse.json({ error: "Challenge not found." }, { status: 404 });
    ch.status = "dismissed";
    return NextResponse.json({ ok: true });
  }

  const q = room.questions.find((x) => x.id === body.questionId);
  if (!q) return NextResponse.json({ error: "Question not found." }, { status: 404 });

  if (body.action === "invalidate") {
    q.status = "invalidated";
    resolveOpen(q.id, "invalidated");
  } else if (body.action === "restore") {
    q.status = "active";
  } else if (body.action === "revise") {
    const p = body.patch;
    const options = p.options ?? q.options;
    const correctAnswer = p.correctAnswer ?? q.correctAnswer;
    if (correctAnswer < 0 || correctAnswer >= options.length) {
      return NextResponse.json({ error: "Answer key must point at an option." }, { status: 400 });
    }
    // Options keep their positions so stored choices still refer to the same answer.
    if (options.length !== q.options.length) {
      return NextResponse.json({ error: "Revisions must keep the same number of options." }, { status: 400 });
    }
    Object.assign(q, { ...p, options, correctAnswer, revision: q.revision + 1 });
    resolveOpen(q.id, "revised");
  }
  return NextResponse.json({ ok: true });
}
