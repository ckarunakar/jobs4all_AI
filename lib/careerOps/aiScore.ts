/**
 * Career-Ops AI score — the compact shape shown on swipe cards.
 * --------------------------------------------------------------------------
 * Isomorphic (client + server safe): just a type + pure mapping from the
 * scoring engine's rich `JobEvaluationResult` into card-friendly fields. Score
 * is rounded to the nearest 0.5; label + recommendation come from thresholds:
 *   ≥4.5 Excellent / apply_immediately · 4.0–4.4 Strong / worth_applying
 *   3.5–3.9 Decent / maybe · <3.5 Weak / against
 */

import type { JobEvaluationResult } from "@/lib/scoring/types";

export interface CareerOpsAiScore {
  /** 1.0–5.0, rounded to the nearest 0.5. */
  score: number;
  /** "Excellent fit" | "Strong fit" | "Decent fit" | "Weak fit". */
  label: string;
  /** apply_immediately | worth_applying | maybe | against. */
  recommendation: string;
  summary: string;
  pros: string[];
  cons: string[];
  warnings: string[];
  dimensions?: Record<string, number>;
  /** True when served from the DB cache (no fresh model call). */
  cached?: boolean;
}

export function roundToHalf(n: number): number {
  const clamped = Math.min(5, Math.max(1, n));
  return Math.round(clamped * 2) / 2;
}

export function labelForScore(score: number): string {
  if (score >= 4.5) return "Excellent fit";
  if (score >= 4.0) return "Strong fit";
  if (score >= 3.5) return "Decent fit";
  return "Weak fit";
}

export function recommendationForScore(score: number): string {
  if (score >= 4.5) return "apply_immediately";
  if (score >= 4.0) return "worth_applying";
  if (score >= 3.5) return "maybe";
  return "against";
}

const LEGITIMACY_SCORE: Record<string, number> = {
  "High Confidence": 5,
  "Proceed with Caution": 3,
  Suspicious: 1,
  Unknown: 3,
};

/** Map the engine's evaluation → the card score shape (spec's dimension names). */
export function toCareerOpsAiScore(
  result: JobEvaluationResult,
): CareerOpsAiScore {
  const score = roundToHalf(result.score);
  const d = result.dimensions;

  const dimensions: Record<string, number> = {
    skillMatch: d.skillsFit,
    experienceLevel: d.seniorityFit,
    roleAlignment: d.roleAlignment,
    locationFit: d.locationFit,
    growthPotential: d.domainFit,
    companyLegitimacy:
      LEGITIMACY_SCORE[result.careerOpsBlocks?.postingLegitimacy?.tier ?? ""] ??
      3,
    redFlags: d.redFlags,
  };

  const warnings = [result.cardSummary.warning]
    .filter((w): w is string => Boolean(w && w.trim()))
    .map((w) => w.trim());

  return {
    score,
    label: labelForScore(score),
    recommendation: recommendationForScore(score),
    summary: result.cardSummary.headline,
    pros: result.strengths.slice(0, 4),
    cons: result.gaps.map((g) => g.gap).filter(Boolean).slice(0, 4),
    warnings,
    dimensions,
  };
}
