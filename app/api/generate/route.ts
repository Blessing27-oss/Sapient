import { requireProfessor } from "@/lib/auth";
import { extract } from "@/lib/extract";
import { SAMPLE } from "@/lib/sample";

export const runtime = "nodejs";

export async function POST(req: Request) {
  const deny = await requireProfessor();
  if (deny) return deny;
  const form = await req.formData();
  const file = form.get("pdf");
  if (!(file instanceof File) || file.size === 0) return Response.json({ ...SAMPLE, source: "sample", note: "Loaded the sample lesson." });
  try {
    // Import the implementation directly: pdf-parse's index runs a debug read on import.
    const pdf = (await import("pdf-parse/lib/pdf-parse.js")).default as (b: Buffer) => Promise<{ text: string }>;
    const { text } = await pdf(Buffer.from(await file.arrayBuffer()));
    return Response.json(await extract(text));
  } catch {
    return Response.json({ ...SAMPLE, source: "sample", note: "Could not read that PDF; loaded the sample lesson." });
  }
}
