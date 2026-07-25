/**
 * AI job scoring — shared types.
 * --------------------------------------------------------------------------
 * Provider-agnostic contracts for Career-Ops-style job evaluation. The
 * `LlmProvider` interface is the seam: ClaudeScoringProvider implements it
 * today; GeminiScoringProvider / DeepSeekScoringProvider / etc. can be added
 * later without touching the API routes, cache, or UI.
 */

import type { RemoteType } from "@/lib/careerOps/types";

// --- Candidate profile (the "you" we score jobs against) ------------------

export interface CandidateProfile {
  id: string;
  /** Anonymous label or name. */
  label: string;
  targetRoles: string[];
  targetLocations: string[];
  preferredWorkTypes: string[]; // e.g. "remote", "hybrid", "internship"
  skills: string[];
  experienceSummary: string;
  projects: string[];
  education?: string;
  /** Resume text or a resume summary. */
  resumeText: string;
  dealbreakers?: string[];
  niceToHaves?: string[];
}

// --- Normalized job input (maps from SwipeJob or future scraper rows) -----

export interface JobForScoring {
  id: string;
  title: string;
  company: string;
  location?: string;
  workMode?: RemoteType | "unknown";
  employmentType?: string;
  salaryText?: string;
  description: string;
  requirements?: string[];
  responsibilities?: string[];
  benefits?: string[];
  sourceUrl?: string;
  sourceName?: string;
  postedAt?: string;
  /** Original record for future re-mapping; never sent to the model. */
  raw?: unknown;
}

// --- Evaluation output shapes ---------------------------------------------

export type ScoreLabel =
  | "Excellent fit"
  | "Strong fit"
  | "Good fit"
  | "Possible fit"
  | "Weak fit"
  | "Not recommended";

export type Recommendation =
  | "apply_now"
  | "save_and_review"
  | "maybe"
  | "skip";

export type Confidence = "high" | "medium" | "low";

export type GapSeverity = "blocker" | "important" | "minor";

export type LegitimacyTier =
  | "High Confidence"
  | "Proceed with Caution"
  | "Suspicious"
  | "Unknown";

export interface ScoreDimensions {
  cvMatch: number;
  roleAlignment: number;
  seniorityFit: number;
  skillsFit: number;
  domainFit: number;
  compensationFit: number | null;
  locationFit: number;
  cultureFit: number | null;
  redFlags: number;
}

export interface ScoreGap {
  gap: string;
  severity: GapSeverity;
  mitigation: string;
}

export interface CareerOpsBlocks {
  roleSummary: string;
  cvMatch: string;
  levelStrategy: string;
  compAndDemand: string;
  customizationPlan: string;
  interviewPlan: string;
  postingLegitimacy: {
    tier: LegitimacyTier;
    notes: string;
  };
}

export interface CardSummary {
  headline: string;
  bullets: string[];
  warning?: string | null;
}

/**
 * The analytical evaluation produced by the LLM (everything except server
 * metadata + the derived scoreLabel). Validated against a Zod schema.
 */
export interface LlmEvaluation {
  score: number; // 1.0–5.0
  recommendation: Recommendation;
  confidence: Confidence;
  dimensions: ScoreDimensions;
  strengths: string[];
  gaps: ScoreGap[];
  reasons: string[];
  missingKeywords: string[];
  matchedKeywords: string[];
  /** Optional heavy fields (detailed report view only). */
  careerOpsBlocks?: CareerOpsBlocks;
  cardSummary: CardSummary;
  detailedReportMarkdown?: string;
}

/** Full evaluation result returned to the app (LLM output + metadata). */
export interface JobEvaluationResult extends LlmEvaluation {
  jobId: string;
  candidateProfileId: string;
  scoreLabel: ScoreLabel;
  model: string;
  provider: string;
  promptVersion: string;
  inputHash: string;
  scoredAt: string;
}

// --- Provider seam --------------------------------------------------------

export interface JobEvaluationInput {
  job: JobForScoring;
  profile: CandidateProfile;
}

/**
 * Implemented by each scoring backend. The orchestrator (scoreJob) handles
 * caching, normalization, and metadata — a provider only has to turn an
 * input into a validated `LlmEvaluation`.
 */
export interface LlmProvider {
  /** Stable id surfaced in results + settings, e.g. "deepseek" | "anthropic". */
  readonly name: string;
  /** Model id this provider will use (for cache keys + results). */
  readonly model: string;
  evaluate(input: JobEvaluationInput): Promise<LlmEvaluation>;
}

