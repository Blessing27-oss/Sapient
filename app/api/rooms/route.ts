import { requireProfessor } from "@/lib/auth";
import { newCode, withDB } from "@/lib/store";
import type { Room } from "@/lib/types";

export async function POST(req: Request) {
  const deny = await requireProfessor();
  if (deny) return deny;
  const b = await req.json();
  const questions = (b.questions as Room["questions"]).filter((q) => q.approved);
  if (!questions.length) return Response.json({ error: "Approve at least one question." }, { status: 400 });
  const code = await withDB((db) => {
    const code = newCode(db);
    db[code] = { code, title: b.title, concepts: b.concepts, edges: b.edges, questions, students: [], challenges: [], insights: [] };
    return code;
  });
  return Response.json({ code });
}
