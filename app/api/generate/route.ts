import { requireProfessor } from "@/lib/auth";
import { extract } from "@/lib/extract";

export const runtime = "nodejs";

export async function POST(req: Request) {
  const deny = await requireProfessor();
  if (deny) return deny;
  const file = (await req.formData()).get("pdf");
  if (!(file instanceof File) || file.size === 0) return Response.json({ error: "Choose a PDF to upload." }, { status: 400 });
  let text: string;
  try {
    // Import the implementation directly: pdf-parse's index runs a debug read on import.
    const pdf = (await import("pdf-parse/lib/pdf-parse.js")).default as (b: Buffer) => Promise<{ text: string }>;
    text = (await pdf(Buffer.from(await file.arrayBuffer()))).text;
  } catch {
    return Response.json({ error: "Could not read that file as a PDF." }, { status: 422 });
  }
  try {
    return Response.json(await extract(text));
  } catch (err) {
    return Response.json({ error: (err as Error).message }, { status: 422 });
  }
}
