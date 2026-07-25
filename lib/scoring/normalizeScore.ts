/**
 * Normalization helpers for raw LLM evaluations.
 * Keeps scores in-range, rounds to one decimal, dedupes lists, and caps card
 * bullets — so providers can be a bit sloppy and the UI still gets clean data.
 */

import { getScoreLabel as tierLabel } from "@/lib/careerOps/scoreUtils";
import type { LlmEvaluation, ScoreLabel } from "./types";

/** Clamp to [1.0, 5.0] and round to one decimal place. */
export function normalizeScore(score: number): number {
  if (!Number.isFinite(score)) return 1.0;
  return Math.min(5, Math.max(1, Math.round(score * 10) / 10));
}

/** Clamp a dimension sub-score (nullable for unknown comp/culture). */
function clampDim(n: number | null): number | null {
  if (n === null || !Number.isFinite(n)) return null;
  return Math.min(5, Math.max(1, Math.round(n * 10) / 10));
}

/** The six fit labels match scoreUtils tier labels exactly. */
export function getScoreLabel(score: number): ScoreLabel {
  return tierLabel(score) as ScoreLabel;
}

function dedupe(arr: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const s of arr) {
    const t = s.trim();
    const key = t.toLowerCase();
    if (t && !seen.has(key)) {
      seen.add(key);
      out.push(t);
    }
  }
  return out;
}

/** Clean a raw evaluation: clamp scores, dedupe lists, cap card bullets. */
export function normalizeEvaluation(raw: LlmEvaluation): LlmEvaluation {
  return {
    ...raw,
    score: normalizeScore(raw.score),
    dimensions: {
      cvMatch: clampDim(raw.dimensions.cvMatch) ?? 1,
      roleAlignment: clampDim(raw.dimensions.roleAlignment) ?? 1,
      seniorityFit: clampDim(raw.dimensions.seniorityFit) ?? 1,
      skillsFit: clampDim(raw.dimensions.skillsFit) ?? 1,
      domainFit: clampDim(raw.dimensions.domainFit) ?? 1,
      compensationFit: clampDim(raw.dimensions.compensationFit),
      locationFit: clampDim(raw.dimensions.locationFit) ?? 1,
      cultureFit: clampDim(raw.dimensions.cultureFit),
      redFlags: clampDim(raw.dimensions.redFlags) ?? 1,
    },
    strengths: dedupe(raw.strengths),
    reasons: dedupe(raw.reasons),
    missingKeywords: dedupe(raw.missingKeywords),
    matchedKeywords: dedupe(raw.matchedKeywords),
    cardSummary: {
      ...raw.cardSummary,
      bullets: dedupe(raw.cardSummary.bullets).slice(0, 4),
      warning: raw.cardSummary.warning?.trim() || null,
    },
  };
}
