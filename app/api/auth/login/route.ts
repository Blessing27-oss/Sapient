import { PROFESSOR_WORD, startSession } from "@/lib/auth";

export async function POST(req: Request) {
  const { word } = await req.json();
  if (String(word ?? "").trim().toLowerCase() !== PROFESSOR_WORD.toLowerCase()) return Response.json({ error: "That's not right. Try again." }, { status: 403 });
  await startSession();
  return Response.json({ ok: true });
}
