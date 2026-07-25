/**
 * Resume text extraction. SERVER-SIDE ONLY.
 * --------------------------------------------------------------------------
 * Turns an uploaded resume's binary into plain text for AI scoring:
 *   - .pdf  → pdf-parse (v2, pdfjs-based)
 *   - .docx → mammoth (raw text)
 * Never runs on the client. Throws on unsupported types or extraction failure;
 * callers decide whether to treat that as fatal (they don't — upload still
 * succeeds, scoring back-fills later).
 */

import "server-only";
import { PDFParse } from "pdf-parse";
import mammoth from "mammoth";

/** Collapse excessive whitespace so we don't waste tokens on blank runs. */
function tidy(text: string): string {
  return text
    .replace(/\r/g, "")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

/**
 * Extract plain text from a resume buffer. `fileType` is the normalized
 * extension we stored on upload ("pdf" | "docx").
 */
export async function extractResumeText(
  buffer: Buffer,
  fileType: string,
): Promise<string> {
  const type = fileType.toLowerCase().replace(/^\./, "");

  if (type === "pdf") {
    const parser = new PDFParse({ data: new Uint8Array(buffer) });
    try {
      const result = await parser.getText();
      return tidy(result.text ?? "");
    } finally {
      await parser.destroy();
    }
  }

  if (type === "docx") {
    const result = await mammoth.extractRawText({ buffer });
    return tidy(result.value ?? "");
  }

  throw new Error(`Unsupported resume type for extraction: ${fileType}`);
}
