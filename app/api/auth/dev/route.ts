import { isAuthorizedProfessor, devLoginAllowed, startSession } from "@/lib/auth";

export async function POST(req: Request) {
  if (!devLoginAllowed()) return Response.json({ error: "Disabled" }, { status: 403 });
  const { email } = await req.json();
  const normalizedEmail = String(email ?? "").trim().toLowerCase();
  if (!isAuthorizedProfessor(normalizedEmail)) return Response.json({ error: "Not authorized." }, { status: 403 });
  await startSession(normalizedEmail);
  return Response.json({ ok: true });
}
