import { requireStudent } from "@/lib/auth";
import { uid, withDB } from "@/lib/store";

export async function POST(req: Request, { params }: { params: Promise<{ code: string }> }) {
  const auth = await requireStudent();
  if ("deny" in auth) return auth.deny;
  const { code } = await params;
  const { studentId, questionId, reason } = await req.json();
  const ok = await withDB((db) => {
    const room = db[code.toUpperCase()];
    if (!room || !room.students.some((s) => s.id === studentId && s.userId === auth.user.id)) return false;
    room.challenges.push({ id: uid(), questionId, studentId, reason: String(reason || "").slice(0, 500), status: "open", at: Date.now() });
    return true;
  });
  return ok ? Response.json({ ok }) : Response.json({ error: "Not found" }, { status: 404 });
}
