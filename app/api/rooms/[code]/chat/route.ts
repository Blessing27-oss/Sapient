import Anthropic from "@anthropic-ai/sdk";
import { after } from "next/server";
import { recordQuestion } from "@/lib/asked";
import { requireStudent } from "@/lib/auth";
import { getRoomSources, retrieveSourceChunks } from "@/lib/sources";
import { getRoom } from "@/lib/store";
import { buildTutorSystemPrompt, diagnosticFinished, validateChatMessages } from "@/lib/tutor";

export const runtime = "nodejs";

export async function POST(req: Request, { params }: { params: Promise<{ code: string }> }) {
  const auth = await requireStudent();
  if ("deny" in auth) return auth.deny;
  const { code } = await params;
  const body = await req.json().catch(() => ({}));
  const room = await getRoom(code);
  const student = room?.students.find((s) => s.id === body.studentId && s.userId === auth.user.id);
  if (!room || !student) return Response.json({ error: "Not found" }, { status: 404 });
  if (!diagnosticFinished(room, student)) {
    return Response.json({ error: "The study helper opens after you finish your questions." }, { status: 403 });
  }
  const checked = validateChatMessages(body.messages);
  if ("error" in checked) return Response.json({ error: checked.error }, { status: 400 });

  const excerpts = retrieveSourceChunks(await getRoomSources(room, auth.user), checked.messages.at(-1)!.content);
  // After the reply is sent: store an anonymous, paraphrased topic for the professor's dashboard.
  // Only the topic is kept; the wording and the student's identity are not.
  const asked = checked.messages.at(-1)!;
  if (asked.role === "user") {
    after(() => recordQuestion(room.code, student.id, asked.content).catch((err) => console.error("asked-topic tagging failed", err instanceof Error ? err.message : err)));
  }
  const client = new Anthropic();
  const stream = client.beta.messages.stream({
    model: "claude-opus-5-5",
    max_tokens: 16000,
    betas: ["server-side-fallback-2026-07-01"],
    fallbacks: "default",
    // Chat is latency-sensitive and doesn't need deep reasoning.
    output_config: { effort: "low" },
    cache_control: { type: "ephemeral" },
    system: buildTutorSystemPrompt(room, student, excerpts),
    messages: checked.messages,
  });

  const encoder = new TextEncoder();
  const body$ = new ReadableStream<Uint8Array>({
    async start(controller) {
      let sent = false;
      const write = (text: string) => {
        controller.enqueue(encoder.encode(text));
        sent = true;
      };
      try {
        for await (const event of stream) {
          if (event.type === "content_block_delta" && event.delta.type === "text_delta") write(event.delta.text);
        }
        const final = await stream.finalMessage();
        if (final.stop_reason === "refusal") write(`${sent ? "\n\n" : ""}Sorry, I can't help with that. Try asking about the lesson.`);
      } catch (err) {
        const message =
          err instanceof Anthropic.RateLimitError
            ? "The study helper is busy. Try again in a moment."
            : err instanceof Anthropic.APIConnectionError
              ? "The study helper can't reach the AI service right now. Try again."
              : err instanceof Anthropic.AuthenticationError || !(err instanceof Anthropic.APIError)
                ? "The study helper isn't set up yet (no valid ANTHROPIC_API_KEY on the server)."
                : "Something went wrong. Try again.";
        console.error("chat error", err);
        write(`${sent ? "\n\n" : ""}[${message}]`);
      } finally {
        controller.close();
      }
    },
    cancel() {
      stream.abort();
    },
  });

  return new Response(body$, { headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "no-store" } });
}
