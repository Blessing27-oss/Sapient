import { currentUser, requireProfessor } from "@/lib/auth";
import { sourceStore } from "@/lib/sources";
import { questionProblems } from "@/lib/questions";
import { newCode, withDB } from "@/lib/store";
import type { Room } from "@/lib/types";

export async function POST(req: Request) {
  const deny = await requireProfessor();
  if (deny) return deny;
  const user = (await currentUser())!;
  const b = await req.json();
  const sourceIds: string[] = [];
  if (b.sourceId !== undefined) {
    if (typeof b.sourceId !== "string" || !await sourceStore.read(b.sourceId, user.id)) return Response.json({ error: "Source not found." }, { status: 400 });
    sourceIds.push(b.sourceId);
  }
  // Drafts are kept so they can be approved later from the dashboard; only approved, answerable questions go live.
  const conceptIds = ((b.concepts ?? []) as Room["concepts"]).map((c) => c.id);
  const seen = new Set<string>();
  const questions = ((b.questions ?? []) as Room["questions"])
    .filter((q) => !seen.has(q.id) && (seen.add(q.id), true))
    .map((q) => ({ ...q, approved: !!q.approved && !questionProblems(q, conceptIds).length, invalidated: false }));
  const code = await withDB((db) => {
    const code = newCode(db);
    db[code] = { code, ownerId: user.id, sourceIds, topicMap: b.topicMap, title: b.title, concepts: b.concepts, edges: b.edges, layout: validLayout(b.layout), questions, students: [], challenges: [], insights: [] };
    return code;
  });
  return Response.json({ code });
}

// Keep the professor's map arrangement only if it is well-formed; otherwise students get the automatic layout.
function validLayout(l: unknown): Room["layout"] {
  const v = l as Room["layout"];
  const num = (n: unknown) => typeof n === "number" && Number.isFinite(n);
  if (!v || !num(v.w) || !num(v.h) || !v.pos || typeof v.pos !== "object") return undefined;
  const pos = Object.fromEntries(Object.entries(v.pos).filter(([, p]) => p && num(p.x) && num(p.y)).map(([id, p]) => [id, { x: p.x, y: p.y }]));
  return { w: v.w, h: v.h, pos };
}
