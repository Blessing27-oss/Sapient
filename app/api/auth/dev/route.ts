import { PROFESSOR_EMAIL, devLoginAllowed, startSession } from "@/lib/auth";

export async function POST(req: Request) {
  if (!devLoginAllowed()) return Response.json({ error: "Disabled" }, { status: 403 });
  const { email } = await req.json();
  if (String(email).trim().toLowerCase() !== PROFESSOR_EMAIL) return Response.json({ error: `Only ${PROFESSOR_EMAIL} can sign in as professor.` }, { status: 403 });
  await startSession(PROFESSOR_EMAIL);
  return Response.json({ ok: true });
}
