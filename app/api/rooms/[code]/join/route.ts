import { uid, withDB } from "@/lib/store";

export async function POST(req: Request, { params }: { params: Promise<{ code: string }> }) {
  const { code } = await params;
  const { name } = await req.json();
  const res = await withDB((db) => {
    const room = db[code.toUpperCase()];
    if (!room) return null;
    const s = { id: uid(), name: String(name || "Student").slice(0, 40), responses: [] };
    room.students.push(s);
    return { studentId: s.id, title: room.title };
  });
  return res ? Response.json(res) : Response.json({ error: "Room not found" }, { status: 404 });
}
