import { isAuthorizedProfessor, googleClientId, startSession } from "@/lib/auth";

export async function POST(req: Request) {
  const { credential } = await req.json();
  const r = await fetch(`https://oauth2.googleapis.com/tokeninfo?id_token=${encodeURIComponent(credential ?? "")}`);
  if (!googleClientId() || !r.ok) return Response.json({ error: "Sign-in failed" }, { status: 401 });
  const t = await r.json();
  const ok = t.aud === googleClientId() && String(t.email_verified) === "true" && typeof t.email === "string" && isAuthorizedProfessor(t.email);
  if (!ok) return Response.json({ error: "Not authorized." }, { status: 403 });
  await startSession(t.email.trim().toLowerCase());
  return Response.json({ ok: true });
}
