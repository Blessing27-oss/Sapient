import { requireProfessor } from "@/lib/auth";
import Anthropic from "@anthropic-ai/sdk";
import { UnusableDraftError, extract } from "@/lib/extract";
import { MAX_PDF_BYTES, parsePDF } from "@/lib/pdf";

export const runtime = "nodejs";
export const maxDuration = 300;

export async function POST(req: Request) {
  const deny = await requireProfessor();
  if (deny) return deny;
  const form = await req.formData();
  const file = form.get("pdf");
  if (!(file instanceof File) || file.size === 0) return Response.json({ error: "Choose a PDF to upload." }, { status: 400 });
  if (file.size > MAX_PDF_BYTES) return Response.json({ error: "Upload a PDF smaller than 20 MB." }, { status: 413 });
  let pages: string[];
  try {
    pages = await parsePDF(new Uint8Array(await file.arrayBuffer()));
  } catch {
    return Response.json({ error: "Could not read that PDF. Try another file." }, { status: 400 });
  }
  try {
    return Response.json(await extract(pages));
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    if (err instanceof UnusableDraftError) return Response.json({ error: `AI generation failed: ${message}` }, { status: 502 });
    const hint = err instanceof Anthropic.AuthenticationError || /ANTHROPIC_API_KEY/.test(message) ? " Check ANTHROPIC_API_KEY and try again." : "";
    return Response.json({ error: `AI generation failed: ${message}.${hint}` }, { status: 502 });
  }
}
