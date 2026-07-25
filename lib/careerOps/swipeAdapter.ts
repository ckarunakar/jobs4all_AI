/**
 * Career-Ops frontend adapter for the swipe demo (Demo 2).
 * Mirrors the same contract as the dashboard adapter but operates on SwipeJob.
 * NOTHING here calls Career-Ops — all results are mock.
 *
 * TODO(backend): replace evaluateJobForUser with a real Career-Ops call (or a
 * backend endpoint wrapping it) and keep the CareerOpsEvaluation return shape.
 */

import {
  computeGlobalScore,
  getNextAction,
  getScoreLabel,
} from "./scoreUtils";
import type {
  CareerOpsEvaluation,
  CareerOpsScore,
  CareerOpsScoreBreakdown,
  ResumeProfile,
} from "./types";
import type { SwipeJob } from "@/types/swipe";

function clamp(score: number): CareerOpsScore {
  return Number(Math.max(1, Math.min(5, score)).toFixed(1));
}

/** Deterministic per-job breakdown around the headline score (stable demo). */
function buildBreakdown(
  global: CareerOpsScore,
  seed: number,
  hasCautions: boolean,
): CareerOpsScoreBreakdown {
  const wobble = (n: number) => ((seed % (n * 7)) % 9) / 10 - 0.4;
  const items = [
    {
      key: "cv_match",
      label: "Match with CV",
      score: clamp(global + 0.3 + wobble(2)),
      weight: 0.35,
      note: "Skills, experience, and proof points vs. the job description.",
    },
    {
      key: "north_star",
      label: "North Star alignment",
      score: clamp(global + wobble(3)),
      weight: 0.2,
      note: "Fit with your target roles and preferences.",
    },
    {
      key: "comp",
      label: "Compensation",
      score: clamp(global - 0.2 + wobble(5)),
      weight: 0.15,
      note: "Pay vs. market for this level.",
    },
    {
      key: "culture",
      label: "Cultural signals",
      score: clamp(global - 0.1 + wobble(4)),
      weight: 0.15,
      note: "Team, growth, stability, and remote policy.",
    },
    {
      key: "red_flags",
      label: "Red flags",
      score: clamp(hasCautions ? global - 1.2 : 4.6 + wobble(6)),
      weight: 0.15,
      note: "Blockers and warnings (lower = more concerns).",
    },
  ];
  return { global: computeGlobalScore(items), items };
}

/**
 * Mock evaluation of a job against a profile. In a real integration the profile
 * would influence the score; here we use the job's pre-baked mock score and
 * derive a plausible breakdown so the UI is stable and demo-ready.
 */
export function evaluateJobForUser(
  job: SwipeJob,
  _profile: ResumeProfile,
): CareerOpsEvaluation {
  void _profile; // profile will drive scoring once Career-Ops is wired up
  const seed = [...job.id].reduce((s, c) => s + c.charCodeAt(0), 0);
  return {
    jobId: job.id,
    score: job.score,
    breakdown: buildBreakdown(job.score, seed, job.cautionFlags.length > 0),
    archetype: "General Software",
    matchSummary: job.matchSummary,
    strengths: job.strengths,
    gaps: job.gaps,
    cautionFlags: job.cautionFlags,
    suggestedAction: getNextAction(job.score),
    evaluatedAt: new Date().toISOString(),
  };
}

/** Fields a swipe card pulls from an evaluation (kept for integration parity). */
export interface JobCardEvaluationView {
  score: CareerOpsScore;
  scoreLabel: string;
  matchSummary: string;
  strengths: string[];
  gaps: string[];
  cautionFlags: string[];
  suggestedAction: string;
}

/** Flatten a CareerOpsEvaluation into the shape a swipe card renders. */
export function convertCareerOpsEvaluationToJobCard(
  evaluation: CareerOpsEvaluation,
): JobCardEvaluationView {
  return {
    score: evaluation.score,
    scoreLabel: getScoreLabel(evaluation.score),
    matchSummary: evaluation.matchSummary,
    strengths: evaluation.strengths,
    gaps: evaluation.gaps,
    cautionFlags: evaluation.cautionFlags,
    suggestedAction: evaluation.suggestedAction,
  };
}
