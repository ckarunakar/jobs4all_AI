/** Best-effort JSON extraction: direct parse, strip code fences, first {...}. */
export function parseJsonLoose(text: string): unknown | null {
  if (!text) return null;
  const candidates = [text];
  const unfenced = text.replace(/```json/gi, "").replace(/```/g, "").trim();
  if (unfenced !== text) candidates.push(unfenced);
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start >= 0 && end > start) candidates.push(text.slice(start, end + 1));
  for (const c of candidates) {
    try {
      return JSON.parse(c);
    } catch {
      // try the next candidate
    }
  }
  return null;
}
