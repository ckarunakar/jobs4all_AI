/**
 * Resolve API request inputs into normalized scoring shapes. Jobs come from the
 * mock dataset by id (or an inline override, for future DB-backed jobs); the
 * profile comes from the client (the editable ResumeProfile) or the demo
 * fallback.
 */

import { MOCK_SWIPE_JOBS } from "@/lib/mockData/swipeJobs";
import type { ResumeProfile } from "@/lib/careerOps/types";
import type { SwipeJob } from "@/types/swipe";
import { toCandidateProfile, toJobForScoring } from "./adapters";
import { DEMO_CANDIDATE_PROFILE } from "./demoCandidate";
import type { CandidateProfile, JobForScoring } from "./types";

export function resolveCandidateProfile(
  input: ResumeProfile | undefined | null,
): CandidateProfile {
  if (!input) return DEMO_CANDIDATE_PROFILE;
  return toCandidateProfile(input);
}

export function resolveJob(
  jobId: string,
  override?: SwipeJob | null,
): JobForScoring | null {
  const job = MOCK_SWIPE_JOBS.find((j) => j.id === jobId) ?? override ?? null;
  return job ? toJobForScoring(job) : null;
}

export const MAX_BATCH_SIZE = 20;
export const SCORING_CONCURRENCY = 2;
