/**
 * Career-Ops scoring service. SERVER-SIDE ONLY.
 * --------------------------------------------------------------------------
 * Thin orchestration over the existing scoring engine (lib/scoring/evaluateJob)
 * for the real-jobs flow:
 *   resume-by-email → ensure resume text → job-by-id → DB cache check →
 *   evaluate (engine) → map to card score → DB cache upsert.
 *
 * Reuses: evaluateJob (provider + Zod validation + normalization), the AI
 * provider, and the Career-Ops rubric. Caches only in SQL Server (DB cache),
 * not the local file cache (skipCache: true).
 */

import "server-only";
import { evaluateJob } from "@/lib/scoring/scoreJob";
import { getProvider, getProviderInfo } from "@/lib/scoring/providerRegistry";
import { toCandidateProfile } from "@/lib/scoring/adapters";
import type { CandidateProfile, JobForScoring } from "@/lib/scoring/types";
import {
  getLatestResumeByEmail,
  getLatestResumeByUserId,
  updateResumeText,
  type ResumeRecord,
} from "@/lib/db/resumeRepository";
import { getCachedScore, upsertScore } from "@/lib/db/scoresRepository";
import { fetchJobById } from "@/lib/db/jobsRepository";
import { extractResumeText } from "@/lib/resume/extractText";
import { toCareerOpsAiScore, type CareerOpsAiScore } from "./aiScore";
import type { ResumeProfile } from "./types";
import type { JobListing } from "@/types/jobListing";

/** Bump when the rubric/prompt changes so cached scores recompute. */
export const RUBRIC_VERSION = "career-ops-v2";

const MAX_TOP = 10;
// DeepSeek v4-flash allows 2,500 concurrent requests (no per-minute limit), so
// we score the whole top-10 batch in parallel — ~15-25s wall clock. (For a
// low-tier Anthropic key you'd lower this to ~2 to avoid 429s.)
const CONCURRENCY = 10;

/** Thrown when the user has no uploaded resume → 400 upstream. */
export class NoResumeError extends Error {
  constructor(message = "Upload a resume before scoring jobs.") {
    super(message);
    this.name = "NoResumeError";
  }
}

/**
 * Find the user's latest resume: prefer the logged-in user id (LoginUserID),
 * then fall back to email (covers sessions that lack a numeric id).
 */
async function resolveResume(
  userId?: number,
  email?: string,
): Promise<ResumeRecord | null> {
  if (userId != null) {
    const byId = await getLatestResumeByUserId(userId);
    if (byId) return byId;
  }
  if (email) {
    const byEmail = await getLatestResumeByEmail(email);
    if (byEmail) return byEmail;
  }
  return null;
}

export interface ScoreOutcome {
  jobId: string;
  status: "scored" | "cached" | "error";
  careerOpsScore?: CareerOpsAiScore;
  error?: string;
}

function jobListingToJobForScoring(j: JobListing): JobForScoring {
  return {
    id: j.id,
    title: j.title,
    company: j.company,
    location: j.location,
    employmentType: j.jobType,
    description: j.description || j.briefInfo || "",
    sourceUrl: j.url,
    postedAt: j.postedAt,
    raw: j,
  };
}

/** Build the candidate: real resume text, enriched with client prefs if sent. */
function buildCandidateProfile(
  resume: ResumeRecord,
  resumeText: string,
  profile: ResumeProfile | undefined,
): CandidateProfile {
  const base: CandidateProfile = profile
    ? toCandidateProfile(profile)
    : {
        id: resume.email,
        label: resume.email,
        targetRoles: [],
        targetLocations: [],
        preferredWorkTypes: [],
        skills: [],
        experienceSummary: "",
        projects: [],
        resumeText: "",
        dealbreakers: [],
        niceToHaves: [],
      };

  return {
    ...base,
    id: resume.email || base.id,
    // The real extracted resume is the primary signal for scoring.
    resumeText: resumeText || base.resumeText,
  };
}

/** Ensure we have resume text, extracting + persisting from the binary if needed. */
async function ensureResumeText(resume: ResumeRecord): Promise<string> {
  if (resume.resumeText) return resume.resumeText;
  try {
    const text = await extractResumeText(resume.resume, resume.fileType);
    if (text) {
      await updateResumeText(resume.id, text);
      return text;
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : "extraction failed";
    console.warn(`[scoring] resume ${resume.id} text back-fill skipped: ${msg}`);
  }
  return "";
}

interface ScoreOneArgs {
  resume: ResumeRecord;
  resumeText: string;
  jobId: string;
  profile?: ResumeProfile;
  forceRefresh?: boolean;
}

/** Score one job against an already-loaded resume (DB-cached). */
async function scoreResumeVsJob(args: ScoreOneArgs): Promise<ScoreOutcome> {
  const { resume, resumeText, jobId, profile, forceRefresh } = args;
  const p = getProvider();
  // Namespace the cache key by provider so DeepSeek and Anthropic scores never
  // collide (e.g. "deepseek:deepseek-v4-flash").
  const model = `${p.name}:${p.model}`;
  const key = {
    resumeUploadId: resume.id,
    jobId,
    model,
    rubricVersion: RUBRIC_VERSION,
  };

  if (!forceRefresh) {
    const cached = await getCachedScore(key);
    if (cached) return { jobId, status: "cached", careerOpsScore: cached };
  }

  const listing = await fetchJobById(jobId);
  if (!listing) return { jobId, status: "error", error: "Unknown job" };

  const candidate = buildCandidateProfile(resume, resumeText, profile);
  const { result } = await evaluateJob({
    job: jobListingToJobForScoring(listing),
    profile: candidate,
    skipCache: true,
  });

  const ai = toCareerOpsAiScore(result);
  await upsertScore({ ...key, userEmail: resume.email, ai, raw: result });
  return { jobId, status: "scored", careerOpsScore: { ...ai, cached: false } };
}

/** Run a worker over items with fixed concurrency, preserving order. */
async function mapWithConcurrency<T, R>(
  items: T[],
  concurrency: number,
  worker: (item: T) => Promise<R>,
): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let next = 0;
  async function run() {
    while (next < items.length) {
      const i = next++;
      results[i] = await worker(items[i]);
    }
  }
  await Promise.all(
    Array.from({ length: Math.min(concurrency, items.length) }, run),
  );
  return results;
}

export interface ScoreOneForEmailArgs {
  /** Logged-in user id (preferred). */
  userId?: number;
  /** Email fallback (used when the session lacks a numeric id). */
  email?: string;
  jobId: string;
  profile?: ResumeProfile;
  forceRefresh?: boolean;
}

/** Public: score a single job for a user (by user id, then email). */
export async function scoreOneForEmail(
  args: ScoreOneForEmailArgs,
): Promise<ScoreOutcome> {
  const resume = await resolveResume(args.userId, args.email);
  if (!resume) throw new NoResumeError();
  const resumeText = await ensureResumeText(resume);
  return scoreResumeVsJob({
    resume,
    resumeText,
    jobId: args.jobId,
    profile: args.profile,
    forceRefresh: args.forceRefresh,
  });
}

export interface ScoreTopArgs {
  /** Logged-in user id (preferred). */
  userId?: number;
  /** Email fallback (used when the session lacks a numeric id). */
  email?: string;
  jobIds: string[];
  profile?: ResumeProfile;
  forceRefresh?: boolean;
  limit?: number;
}

export interface ScoreTopResult {
  results: ScoreOutcome[];
  cachedCount: number;
  scoredCount: number;
  errorCount: number;
  /** Active provider (e.g. "deepseek") + raw model (e.g. "deepseek-v4-flash"). */
  provider: string;
  model: string;
}

/** Public: score the top N jobs for a user (hard-capped at 10). */
export async function scoreTopForEmail(
  args: ScoreTopArgs,
): Promise<ScoreTopResult> {
  const resume = await resolveResume(args.userId, args.email);
  if (!resume) throw new NoResumeError();
  const resumeText = await ensureResumeText(resume);

  const cap = Math.min(args.limit ?? MAX_TOP, MAX_TOP);
  const jobIds = [...new Set(args.jobIds.filter(Boolean))].slice(0, cap);

  const results = await mapWithConcurrency<string, ScoreOutcome>(
    jobIds,
    CONCURRENCY,
    async (jobId): Promise<ScoreOutcome> => {
      try {
        return await scoreResumeVsJob({
          resume,
          resumeText,
          jobId,
          profile: args.profile,
          forceRefresh: args.forceRefresh,
        });
      } catch (err) {
        const error = err instanceof Error ? err.message : "Scoring failed";
        console.error(`[scoring] ${jobId}: ${error}`);
        return { jobId, status: "error", error };
      }
    },
  );

  const info = getProviderInfo();
  return {
    results,
    cachedCount: results.filter((r) => r.status === "cached").length,
    scoredCount: results.filter((r) => r.status === "scored").length,
    errorCount: results.filter((r) => r.status === "error").length,
    provider: info.provider,
    model: info.model,
  };
}
