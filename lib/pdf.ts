import { createHash } from "node:crypto";
import { extractText, getDocumentProxy } from "unpdf";
import { createGenerationCache } from "./generationCache.ts";

export const MAX_PDF_BYTES = 20 * 1024 * 1024;
const parsedPDFs = createGenerationCache<string[]>();

export async function parsePDF(bytes: Uint8Array): Promise<string[]> {
  if (bytes.byteLength > MAX_PDF_BYTES) throw new Error("Upload a PDF smaller than 20 MB.");
  const key = createHash("sha256").update(bytes).digest("hex");
  return parsedPDFs(key, async () => {
    const pdf = await getDocumentProxy(bytes);
    const pages = (await extractText(pdf, { mergePages: false })).text;
    if (pages.reduce((size, page) => size + page.length, 0) > 400_000) {
      throw new Error("This PDF is too long. Upload a single lecture with up to 400,000 characters of text.");
    }
    return pages;
  });
}
