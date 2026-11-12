import { QUESTION_BUDGET, validResponses } from "@/lib/engine";
import { currentUser, ownsRoom } from "@/lib/auth";
import { listJoinedRooms, listOwnedRooms } from "@/lib/store";

export async function GET() {
  const user = await currentUser();
  if (!user) return Response.json({ error: "Sign in" }, { status: 401 });
  if (user.role === "professor")
    return Response.json({ rooms: (await listOwnedRooms(user.id)).map((r) => ({ code: r.code, title: r.title, students: r.students.length })) });
  return Response.json({
    rooms: (await listJoinedRooms(user.id)).flatMap((r) => {
      const s = r.students.find((x) => x.userId === user.id);
      return s ? [{ code: r.code, title: r.title, answered: validResponses(r, s).length, total: QUESTION_BUDGET }] : [];
    }),
  });
}
