/**
 * Career-Ops frontend adapter — SCORE UTILITIES
 * --------------------------------------------------------------------------
 * Centralizes the scoring thresholds and labels so they can be tuned in ONE
 * place. Adopts the Career-Ops scale: recommended apply threshold = 4.0,
 * with six fit labels mapped onto four color tokens.
 */

import type {
  ApplicationStatus,
  CareerOpsScore,
  CareerOpsScoreBreakdown,
} from "./types";

/** Recommended "apply" threshold (Career-Ops scale). Change here to retune. */
export const RECOMMEND_THRESHOLD = 4.0;

export const SCORE_MIN = 1.0;
export const SCORE_MAX = 5.0;

export type ScoreTier = "excellent" | "recommended" | "review" | "low";

export interface ScoreTierMeta {
  tier: ScoreTier;
  label: string;
  /** CSS variable-backed Tailwind token name used for text/bg colors. */
  token: "excellent" | "recommended" | "caution" | "low";
  description: string;
}

/**
 * Career-Ops scoring bands (six labels → four color tokens):
 *   4.5–5.0   → Excellent fit   (apply immediately)
 *   4.0–4.49  → Strong fit      (worth applying)        ← recommended cutoff
 *   3.5–3.99  → Good fit        (review carefully)
 *   3.0–3.49  → Possible fit    (only if strategic)
 *   2.5–2.99  → Weak fit
 *   < 2.5     → Not recommended
 */
export function getScoreTier(score: CareerOpsScore): ScoreTierMeta {
  if (score >= 4.5) {
    return {
      tier: "excellent",
      label: "Excellent fit",
      token: "excellent",
      description: "Strong alignment across the board — apply soon.",
    };
  }
  if (score >= RECOMMEND_THRESHOLD) {
    return {
      tier: "recommended",
      label: "Strong fit",
      token: "recommended",
      description: "Matches most important requirements — worth applying.",
    };
  }
  if (score >= 3.5) {
    return {
      tier: "review",
      label: "Good fit",
      token: "caution",
      description: "Some alignment, but review the gaps before spending time.",
    };
  }
  if (score >= 3.0) {
    return {
      tier: "review",
      label: "Possible fit",
      token: "caution",
      description: "You may be able to stretch — only apply if strategic.",
    };
  }
  if (score >= 2.5) {
    return {
      tier: "low",
      label: "Weak fit",
      token: "low",
      description: "Significant gaps — lower priority.",
    };
  }
  return {
    tier: "low",
    label: "Not recommended",
    token: "low",
    description: "Too little alignment to prioritize.",
  };
}

/** True when a job clears the recommended-apply threshold. */
export function isRecommended(score: CareerOpsScore): boolean {
  return score >= RECOMMEND_THRESHOLD;
}

/** Short tier label for a score (e.g. "Excellent fit"). */
export function getScoreLabel(score: CareerOpsScore): string {
  return getScoreTier(score).label;
}

/** Tailwind text-color class for a score's tier. */
export function getScoreColorClass(score: CareerOpsScore): string {
  const map: Record<ScoreTierMeta["token"], string> = {
    excellent: "text-[var(--excellent)]",
    recommended: "text-[var(--recommended)]",
    caution: "text-[var(--caution)]",
    low: "text-[var(--low)]",
  };
  return map[getScoreTier(score).token];
}

/** CSS variable name (e.g. "var(--excellent)") for a score's tier. */
export function getScoreColorVar(score: CareerOpsScore): string {
  return `var(--${getScoreTier(score).token})`;
}

/** Recommended next action copy for a score. */
export function getNextAction(score: CareerOpsScore): string {
  if (score >= RECOMMEND_THRESHOLD) return "Recommended: review and apply";
  if (score >= 3.0) return "Possible fit: check the gaps first";
  return "Low priority: skip unless you're highly interested";
}

/** Format a score as a fixed "X.X" string out of 5.0. */
export function formatScore(score: CareerOpsScore): string {
  return score.toFixed(1);
}

/** Normalize a 1–5 score to a 0–1 fraction (for rings / bars). */
export function scoreFraction(score: CareerOpsScore): number {
  return Math.max(0, Math.min(1, (score - SCORE_MIN) / (SCORE_MAX - SCORE_MIN)));
}

/** Recompute the weighted global score from a breakdown (kept for parity). */
export function computeGlobalScore(
  items: CareerOpsScoreBreakdown["items"],
): CareerOpsScore {
  const totalWeight = items.reduce((sum, i) => sum + i.weight, 0) || 1;
  const weighted = items.reduce((sum, i) => sum + i.score * i.weight, 0);
  return Number((weighted / totalWeight).toFixed(2));
}

// --- Application status helpers -------------------------------------------

export type PipelineColumn =
  | "saved"
  | "reviewing"
  | "ready"
  | "applied"
  | "interview"
  | "archived";

export const PIPELINE_COLUMNS: {
  key: PipelineColumn;
  label: string;
}[] = [
  { key: "saved", label: "Saved" },
  { key: "reviewing", label: "Reviewing" },
  { key: "ready", label: "Ready to Apply" },
  { key: "applied", label: "Applied" },
  { key: "interview", label: "Interview" },
  { key: "archived", label: "Rejected / Archived" },
];

/** Map a canonical Career-Ops status onto a UI pipeline column. */
export function statusToPipelineColumn(
  status: ApplicationStatus,
): PipelineColumn {
  switch (status) {
    case "saved":
      return "saved";
    case "evaluated":
    case "reviewing":
      return "reviewing";
    case "ready":
      return "ready";
    case "applied":
      return "applied";
    case "responded":
    case "interview":
    case "offer":
      return "interview";
    case "rejected":
    case "discarded":
    default:
      return "archived";
  }
}

export const STATUS_LABELS: Record<ApplicationStatus, string> = {
  saved: "Saved",
  evaluated: "Evaluated",
  reviewing: "Reviewing",
  ready: "Ready to Apply",
  applied: "Applied",
  responded: "Responded",
  interview: "Interview",
  offer: "Offer",
  rejected: "Rejected",
  discarded: "Archived",
};
