import { startSession } from "@/lib/auth";
import { demo, DEMO_CODE, DEMO_PROFESSOR } from "@/lib/demo";

// One-click demo sign-in: the shared demo professor, or a fresh guest student enrolled in the demo room.
export async function POST(req: Request) {
  const { role } = await req.json().catch(() => ({}));
  if (role === "professor") {
    await demo.ensureDemo();
    await startSession({ id: DEMO_PROFESSOR.id, name: DEMO_PROFESSOR.name, role: "professor", demo: true });
    return Response.json({ next: `/dashboard/${DEMO_CODE}` });
  }
  if (role === "student") {
    const guest = await demo.createGuest();
    await startSession({ ...guest, demo: true });
    return Response.json({ next: `/student?code=${DEMO_CODE}&join=1` });
  }
  return Response.json({ error: "Choose professor or student." }, { status: 400 });
}
