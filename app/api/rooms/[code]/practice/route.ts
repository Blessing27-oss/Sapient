import Anthropic from "@anthropic-ai/sdk";
import { requireStudent } from "@/lib/auth";
import { getRoom } from "@/lib/store";
import { PRACTICE_SCHEMA, buildPracticePrompt, diagnosticFinished, validPracticeQuestion } from "@/lib/tutor";

export const runtime = "nodejs";

// Practice questions are for the student only: nothing here is written to the room or counted as evidence.
export async function POST(req: Request, { params }: { params: Promise<{ code: string }> }) {
  const auth = await requireStudent();
  if ("deny" in auth) return auth.deny;
  const { code } = await params;
  const body = await req.json().catch(() => ({}));
  const room = await getRoom(code);
  const student = room?.students.find((s) => s.id === body.studentId && s.userId === auth.user.id);
  if (!room || !student) return Response.json({ error: "Not found" }, { status: 404 });
  if (!diagnosticFinished(room, student)) {
    return Response.json({ error: "Practice opens after you finish your questions." }, { status: 403 });
  }
  const prompt = buildPracticePrompt(room, student, String(body.conceptId ?? ""));
  if (!prompt) return Response.json({ error: "Unknown concept." }, { status: 400 });

  try {
    const response = await new Anthropic().beta.messages.create({
      model: "claude-opus-5-5",
      max_tokens: 16000,
      betas: ["server-side-fallback-2026-07-01"],
      fallbacks: "default",
      output_config: { effort: "low", format: { type: "json_schema", schema: PRACTICE_SCHEMA } },
      messages: [{ role: "user", content: prompt }],
    });
    if (response.stop_reason === "refusal" || response.stop_reason === "max_tokens") {
      return Response.json({ error: "Couldn't write a practice question. Try again." }, { status: 502 });
    }
    const text = response.content.flatMap((b) => (b.type === "text" ? [b.text] : [])).join("");
    const question = JSON.parse(text);
    if (!validPracticeQuestion(question)) return Response.json({ error: "Couldn't write a practice question. Try again." }, { status: 502 });
    return Response.json(question);
  } catch (err) {
    console.error("practice error", err);
    const setup = err instanceof Anthropic.AuthenticationError || !(err instanceof Anthropic.APIError || err instanceof SyntaxError);
    return Response.json(
      { error: setup ? "Practice isn't set up yet (no valid ANTHROPIC_API_KEY on the server)." : "Couldn't write a practice question. Try again." },
      { status: 503 },
    );
  }
}
