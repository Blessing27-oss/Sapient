import { requireProfessor } from "@/lib/auth";
import { withDB } from "@/lib/store";
import type { Question } from "@/lib/types";

// invalidate: question removed for everyone, its evidence disappears (states are recomputed on read).
// revise: question rewritten and earlier responses to it are cleared so students can re-answer.
// dismiss: keep the question as is.
export async function POST(req: Request, { params }: { params: Promise<{ code: string }> }) {
  const deny = await requireProfessor();
  if (deny) return deny;
  const { code } = await params;
  const { questionId, action, patch } = (await req.json()) as { questionId: string; action: "invalidate" | "revise" | "dismiss"; patch?: Partial<Question> };
  const ok = await withDB((db) => {
    const room = db[code.toUpperCase()];
    const q = room?.questions.find((x) => x.id === questionId);
    if (!room || !q) return false;
    if (action === "invalidate") q.invalidated = true;
    if (action === "revise" && patch) {
      Object.assign(q, { text: patch.text ?? q.text, options: patch.options ?? q.options, correctAnswer: patch.correctAnswer ?? q.correctAnswer, invalidated: false });
      for (const s of room.students) s.responses = s.responses.filter((r) => r.questionId !== questionId);
    }
    for (const c of room.challenges) if (c.questionId === questionId) c.status = "resolved";
    return true;
  });
  return ok ? Response.json({ ok }) : Response.json({ error: "Not found" }, { status: 404 });
}
