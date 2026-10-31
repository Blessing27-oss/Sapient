import { startSession } from "@/lib/auth";
import { createUser } from "@/lib/users";

export async function POST(req: Request) {
  const { name, password, role } = await req.json();
  if (role !== "professor" && role !== "student") return Response.json({ error: "Choose professor or student." }, { status: 400 });
  const user = await createUser({ name: String(name ?? ""), password: String(password ?? ""), role });
  if ("error" in user) return Response.json({ error: user.error }, { status: 400 });
  await startSession({ id: user.id, name: user.name, role: user.role });
  return Response.json({ ok: true, role: user.role });
}
