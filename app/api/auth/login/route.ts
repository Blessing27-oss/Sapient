import { startSession } from "@/lib/auth";
import { verifyUser } from "@/lib/users";

export async function POST(req: Request) {
  const { name, password } = await req.json();
  const user = await verifyUser(String(name ?? ""), String(password ?? ""));
  if (!user) return Response.json({ error: "Wrong name or password." }, { status: 401 });
  await startSession({ id: user.id, name: user.name, role: user.role });
  return Response.json({ ok: true, role: user.role });
}
