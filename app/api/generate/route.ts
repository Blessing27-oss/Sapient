import { requireProfessor } from "@/lib/auth";
import { extract } from "@/lib/extract";
import { extractText, getDocumentProxy } from "unpdf";

export const runtime = "nodejs";
export const maxDuration = 300;

export async function POST(req: Request) {
  const deny = await requireProfessor();
  if (deny) return deny;
  const form = await req.formData();
  const file = form.get("pdf");
  if (!(file instanceof File) || file.size === 0) return Response.json({ error: "Choose a PDF to upload." }, { status: 400 });
  let pages: string[];
  try {
    const pdf = await getDocumentProxy(new Uint8Array(await file.arrayBuffer()));
    pages = (await extractText(pdf, { mergePages: false })).text;
  } catch {
    return Response.json({ error: "Could not read that PDF. Try another file." }, { status: 400 });
  }
  try {
    return Response.json(await extract(pages));
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return Response.json({ error: `AI generation failed: ${message}. Check ANTHROPIC_API_KEY and try again.` }, { status: 502 });
  }
}
