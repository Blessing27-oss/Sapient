import { NextResponse } from "next/server";
import { extractText, getDocumentProxy } from "unpdf";
import { generateMaterial } from "@backend/lib/generate";
import { sampleMaterial } from "@backend/lib/sample";

export const runtime = "nodejs";
export const maxDuration = 300;

export async function POST(req: Request) {
  const form = await req.formData();
  if (form.get("sample")) {
    return NextResponse.json({ material: sampleMaterial(), source: "sample" });
  }

  const file = form.get("file");
  if (!(file instanceof File)) return NextResponse.json({ error: "Upload a PDF file." }, { status: 400 });

  let pages: string[];
  try {
    const pdf = await getDocumentProxy(new Uint8Array(await file.arrayBuffer()));
    pages = (await extractText(pdf, { mergePages: false })).text;
  } catch {
    return NextResponse.json({ error: "Could not read that PDF." }, { status: 400 });
  }

  try {
    const material = await generateMaterial(pages);
    return NextResponse.json({ material, source: "ai", pageCount: pages.length });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    const hint = /authentication|api key|401/i.test(message) ? " Set ANTHROPIC_API_KEY in .env.local and restart, or use the sample notes." : "";
    return NextResponse.json({ error: `AI generation failed: ${message}${hint}` }, { status: 502 });
  }
}
