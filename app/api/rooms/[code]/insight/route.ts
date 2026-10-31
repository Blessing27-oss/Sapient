import { currentUser, ownsRoom, requireProfessor } from "@/lib/auth";
import { withDB } from "@/lib/store";

export async function POST(req: Request, { params }: { params: Promise<{ code: string }> }) {
  const deny = await requireProfessor();
  if (deny) return deny;
  const { code } = await params;
  const user = await currentUser();
  const { conceptId, status, note } = await req.json();
  const ok = await withDB((db) => {
    const room = db[code.toUpperCase()];
    if (!room || !ownsRoom(room, user)) return false;
    const cur = room.insights.find((i) => i.conceptId === conceptId);
    if (cur) Object.assign(cur, { status, note: note ?? cur.note });
    else room.insights.push({ conceptId, status, note });
    return true;
  });
  return ok ? Response.json({ ok }) : Response.json({ error: "Not found" }, { status: 404 });
}
