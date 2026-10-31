import { currentUser, ownsRoom, requireProfessor } from "@/lib/auth";
import { isLive, questionProblems } from "@/lib/questions";
import { withDB } from "@/lib/store";
import type { Question } from "@/lib/types";

// The professor edits the room's unanswered questions. Questions students have already answered are locked
// (change those through the challenge flow), and are never dropped.
export async function POST(req: Request, { params }: { params: Promise<{ code: string }> }) {
  const deny = await requireProfessor();
  if (deny) return deny;
  const user = await currentUser();
  const { code } = await params;
  const { questions } = (await req.json()) as { questions: Question[] };
  const result = await withDB((db) => {
    const room = db[code.toUpperCase()];
    if (!room || !ownsRoom(room, user)) return null;
    const answered = new Set(room.students.flatMap((s) => s.responses.map((r) => r.questionId)));
    const conceptIds = room.concepts.map((c) => c.id);
    const existing = new Map(room.questions.map((q) => [q.id, q]));
    const seen = new Set<string>();
    const next: Question[] = [];
    for (const q of questions ?? []) {
      if (seen.has(q.id)) continue;
      seen.add(q.id);
      const cur = existing.get(q.id);
      if (cur && answered.has(q.id)) { next.push(cur); continue; }
      next.push({ ...q, approved: !!q.approved && !questionProblems(q, conceptIds).length, invalidated: cur?.invalidated ?? false, revision: cur?.revision ?? 0 });
    }
    for (const q of room.questions) if (!seen.has(q.id) && answered.has(q.id)) next.push(q);
    room.questions = next;
    return { live: next.filter(isLive).length };
  });
  return result ? Response.json(result) : Response.json({ error: "Not found" }, { status: 404 });
}
