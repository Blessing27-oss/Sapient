import { QUESTION_BUDGET, validResponses } from "@/lib/engine";
import { currentUser, ownsRoom } from "@/lib/auth";
import { getAllRooms } from "@/lib/store";

export async function GET() {
  const user = await currentUser();
  if (!user) return Response.json({ error: "Sign in" }, { status: 401 });
  const rooms = await getAllRooms();
  if (user.role === "professor")
    return Response.json({ rooms: rooms.filter((r) => r.ownerId === user.id).map((r) => ({ code: r.code, title: r.title, students: r.students.length })) });
  return Response.json({
    rooms: rooms.flatMap((r) => {
      const s = r.students.find((x) => x.userId === user.id);
      return s ? [{ code: r.code, title: r.title, answered: validResponses(r, s).length, total: QUESTION_BUDGET }] : [];
    }),
  });
}
