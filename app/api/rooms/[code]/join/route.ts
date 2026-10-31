import { requireStudent } from "@/lib/auth";
import { uid, withDB } from "@/lib/store";

export async function POST(_: Request, { params }: { params: Promise<{ code: string }> }) {
  const auth = await requireStudent();
  if ("deny" in auth) return auth.deny;
  const { user } = auth;
  const { code } = await params;
  const res = await withDB((db) => {
    const room = db[code.toUpperCase()];
    if (!room) return null;
    // Rejoining resumes the same record, so a student's progress follows their account.
    let s = room.students.find((x) => x.userId === user.id);
    if (!s) { s = { id: uid(), name: user.name, userId: user.id, responses: [] }; room.students.push(s); }
    return { studentId: s.id, title: room.title, code: room.code };
  });
  return res ? Response.json(res) : Response.json({ error: "Room not found" }, { status: 404 });
}
