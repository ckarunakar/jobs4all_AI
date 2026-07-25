/**
 * Scoring orchestrator. The one function the API routes call.
 *   normalize input → check cache → call provider → validate → normalize →
 *   assemble result + metadata → cache → return.
 */

import { PROMPT_VERSION, evaluationSchema } from "./careerOpsPrompt";
import { computeInputHash } from "./cacheKey";
import { getCached, setCached } from "./scoreCache";
import { getScoreLabel, normalizeEvaluation } from "./normalizeScore";
import { getProvider } from "./providerRegistry";
import type {
  CandidateProfile,
  JobEvaluationResult,
  JobForScoring,
  LlmEvaluation,
} from "./types";

export interface EvaluateArgs {
  job: JobForScoring;
  profile: CandidateProfile;
  forceRefresh?: boolean;
  /**
   * Skip the local file cache entirely (no read, no write). The real-jobs flow
   * uses this so it caches only in the DB (see lib/db/scoresRepository).
   */
  skipCache?: boolean;
}

export async function evaluateJob(
  args: EvaluateArgs,
): Promise<{ result: JobEvaluationResult; cached: boolean }> {
  const provider = getProvider();
  const inputHash = computeInputHash({
    job: args.job,
    profile: args.profile,
    provider: provider.name,
    model: provider.model,
  });

  if (!args.forceRefresh && !args.skipCache) {
    const hit = await getCached(inputHash);
    if (hit) return { result: hit, cached: true };
  }

  const raw = await provider.evaluate({ job: args.job, profile: args.profile });

  // Validate defensively, then normalize (clamp/dedupe/cap).
  const parsed = evaluationSchema.safeParse(raw);
  const evaluation = normalizeEvaluation(
    (parsed.success ? parsed.data : raw) as LlmEvaluation,
  );

  const result: JobEvaluationResult = {
    ...evaluation,
    jobId: args.job.id,
    candidateProfileId: args.profile.id,
    scoreLabel: getScoreLabel(evaluation.score),
    model: provider.model,
    provider: provider.name,
    promptVersion: PROMPT_VERSION,
    inputHash,
    scoredAt: new Date().toISOString(),
  };

  if (!args.skipCache) await setCached(inputHash, result);
  return { result, cached: false };
}
