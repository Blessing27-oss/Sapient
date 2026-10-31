import { currentUser, requireProfessor } from "@/lib/auth";
import { questionProblems } from "@/lib/questions";
import { newCode, withDB } from "@/lib/store";
import type { Room } from "@/lib/types";

export async function POST(req: Request) {
  const deny = await requireProfessor();
  if (deny) return deny;
  const user = (await currentUser())!;
  const b = await req.json();
  // Drafts are kept so they can be approved later from the dashboard; only approved, answerable questions go live.
  const conceptIds = ((b.concepts ?? []) as Room["concepts"]).map((c) => c.id);
  const seen = new Set<string>();
  const questions = ((b.questions ?? []) as Room["questions"])
    .filter((q) => !seen.has(q.id) && (seen.add(q.id), true))
    .map((q) => ({ ...q, approved: !!q.approved && !questionProblems(q, conceptIds).length, invalidated: false }));
  const code = await withDB((db) => {
    const code = newCode(db);
    db[code] = { code, ownerId: user.id, title: b.title, concepts: b.concepts, edges: b.edges, questions, students: [], challenges: [], insights: [] };
    return code;
  });
  return Response.json({ code });
}
