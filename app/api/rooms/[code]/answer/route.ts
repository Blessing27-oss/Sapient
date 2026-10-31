import { withDB } from "@/lib/store";

export async function POST(req: Request, { params }: { params: Promise<{ code: string }> }) {
  const { code } = await params;
  const { studentId, questionId, choice } = await req.json();
  const res = await withDB((db) => {
    const room = db[code.toUpperCase()];
    const s = room?.students.find((x) => x.id === studentId);
    const q = room?.questions.find((x) => x.id === questionId && !x.invalidated);
    if (!room || !s || !q) return null;
    if (s.responses.some((r) => r.questionId === questionId)) return { duplicate: true };
    s.responses.push({ questionId, choice, correct: choice === q.correctAnswer, at: Date.now() });
    return { ok: true };
  });
  return res ? Response.json(res) : Response.json({ error: "Not found" }, { status: 404 });
}
