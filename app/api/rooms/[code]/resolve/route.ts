import { requireProfessor } from "@/lib/auth";
import { withDB } from "@/lib/store";
import { reviseQuestion } from "@/lib/moderate";
import type { QuestionPatch, RevisionMode } from "@/lib/moderate";

export async function POST(req: Request, { params }: { params: Promise<{ code: string }> }) {
  const deny = await requireProfessor();
  if (deny) return deny;
  const { code } = await params;
  const { questionId, action, patch, mode = "reset" } = (await req.json()) as {
    questionId: string; action: "invalidate" | "revise" | "dismiss"; patch?: QuestionPatch; mode?: RevisionMode;
  };
  if (!["invalidate", "revise", "dismiss"].includes(action)) return Response.json({ error: "Unknown action" }, { status: 400 });
  const result = await withDB((db) => {
    const room = db[code.toUpperCase()];
    const q = room?.questions.find((x) => x.id === questionId);
    if (!room || !q) return { error: "Not found", status: 404 };
    if (action === "revise") {
      if (!patch) return { error: "Provide a revision", status: 400 };
      const error = reviseQuestion(room, q, patch, mode);
      if (error) return { error, status: 400 };
    }
    if (action === "invalidate") q.invalidated = true;
    for (const c of room.challenges) if (c.questionId === questionId) c.status = "resolved";
    return { ok: true };
  });
  return "error" in result ? Response.json({ error: result.error }, { status: result.status }) : Response.json(result);
}
