import { parseJsonLoose } from "../ai/parseJsonLoose.ts";
import {
  buildSuggestPreferencesPrompt,
  suggestionsSchema,
} from "./suggestPreferencesPrompt.ts";

export type ResumeSuggestions = { targetRoles: string[]; techStack: string[] };

export const MAX_SUGGESTED_ROLES = 5;
export const MAX_SUGGESTED_TECH = 3;
export const SUGGEST_TIMEOUT_MS = 12000;
// The default model reasons before it answers, and those reasoning tokens count
// toward this cap. The JSON itself is about 50 tokens, but reasoning on a full
// résumé often runs past 250, so a tight cap cuts the answer off mid-string.
export const SUGGEST_MAX_TOKENS = 2000;

const MAX_ROLE_CHARS = 60;
const MAX_ROLE_WORDS = 4;
const MAX_TECH_CHARS = 40;

export type SuggestModelCall = (args: {
  systemPrompt: string;
  userPrompt: string;
  maxTokens?: number;
  temperature?: number;
}) => Promise<string>;

export type SuggestErrorKind =
  | "timeout"
  | "model-error"
  | "invalid-json"
  | "invalid-shape";

const LEVEL_WORDS = new Set([
  "intern", "internship", "junior", "jr", "senior", "sr", "lead",
  "principal", "entry", "level", "graduate",
]);
const ROMAN = new Set(["I", "II", "III"]);

function hasLevelWord(role: string): boolean {
  const tokens = role.split(/[^A-Za-z0-9]+/).filter(Boolean);
  for (let i = 0; i < tokens.length; i++) {
    const t = tokens[i];
    if (ROMAN.has(t)) return true;
    const lower = t.toLowerCase();
    if (LEVEL_WORDS.has(lower)) return true;
    if (lower === "new" && tokens[i + 1]?.toLowerCase() === "grad") return true;
  }
  return false;
}

function tidy(items: unknown): string[] {
  if (!Array.isArray(items)) return [];
  const seen = new Set<string>();
  const out: string[] = [];
  for (const item of items) {
    if (typeof item !== "string") continue;
    const s = item.trim().replace(/\s+/g, " ");
    if (!s) continue;
    const key = s.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(s);
  }
  return out;
}

export function cleanSuggestions(raw: unknown): ResumeSuggestions {
  const obj =
    raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};
  const targetRoles = tidy(obj.targetRoles)
    .filter(
      (r) =>
        r.length <= MAX_ROLE_CHARS &&
        r.split(/\s+/).length <= MAX_ROLE_WORDS &&
        !r.includes("/") &&
        !hasLevelWord(r),
    )
    .slice(0, MAX_SUGGESTED_ROLES);
  const techStack = tidy(obj.techStack)
    .filter((t) => t.length <= MAX_TECH_CHARS)
    .slice(0, MAX_SUGGESTED_TECH);
  return { targetRoles, techStack };
}

const TIMED_OUT = Symbol("timeout");

export async function suggestPreferences(
  resumeText: string,
  callModel: SuggestModelCall,
  opts: {
    timeoutMs?: number;
    onError?: (kind: SuggestErrorKind) => void;
  } = {},
): Promise<ResumeSuggestions | null> {
  if (!resumeText || !resumeText.trim()) return null;
  const onError =
    opts.onError ??
    ((kind: SuggestErrorKind) => console.warn(`[resume-suggest] ${kind}`));
  const fail = (kind: SuggestErrorKind): null => {
    try {
      onError(kind);
    } catch {
      // reporting must never break the caller
    }
    return null;
  };

  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    const { systemPrompt, userPrompt } = buildSuggestPreferencesPrompt(resumeText);
    const timeout = new Promise<typeof TIMED_OUT>((resolve) => {
      timer = setTimeout(() => resolve(TIMED_OUT), opts.timeoutMs ?? SUGGEST_TIMEOUT_MS);
    });
    let raw: string | typeof TIMED_OUT;
    try {
      const call = callModel({ systemPrompt, userPrompt, temperature: 0.1, maxTokens: SUGGEST_MAX_TOKENS });
      call.catch(() => {}); // a late rejection after timeout must not go unhandled
      raw = await Promise.race([call, timeout]);
    } catch {
      return fail("model-error");
    }
    if (raw === TIMED_OUT) return fail("timeout");
    const parsed = parseJsonLoose(raw);
    if (!parsed) return fail("invalid-json");
    const validated = suggestionsSchema.safeParse(parsed);
    if (!validated.success) return fail("invalid-shape");
    return cleanSuggestions(validated.data);
  } catch {
    return fail("model-error");
  } finally {
    if (timer) clearTimeout(timer);
  }
}
