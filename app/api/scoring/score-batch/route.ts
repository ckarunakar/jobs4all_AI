/**
 * POST /api/scoring/score-batch
 *
 * Two modes (branch on `email`):
 *  - Real jobs:  { email, jobIds[], profile?, forceRefresh?, limit? }
 *      → scores the user's latest resume vs each job (DB-cached, cap 10).
 *      Returns { ok, count, cachedCount, scoredCount, model, results } sorted desc.
 *  - Mock (legacy): { jobIds[], profile?, forceRefresh? }
 *      → the original mock-dataset scoring used by lib/scoring/scoresClient.
 *
 * Concurrency-limited so we never fan out a large burst of model calls.
 */

import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { evaluateJob } from "@/lib/scoring/scoreJob";
import {
  MAX_BATCH_SIZE,
  SCORING_CONCURRENCY,
  resolveCandidateProfile,
  resolveJob,
} from "@/lib/scoring/resolve";
import { getProviderMode } from "@/lib/scoring/providerRegistry";
import {
  NoResumeError,
  scoreTopForEmail,
  type ScoreOutcome,
} from "@/lib/careerOps/scoringService";
import type { ResumeProfile } from "@/lib/careerOps/types";
import type { ScoreJobOutcome } from "@/lib/scoring/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface Body {
  email?: string;
  jobIds?: string[];
  profile?: ResumeProfile;
  forceRefresh?: boolean;
  limit?: number;
}

/** Run `worker` over `items` with a fixed concurrency, preserving order. */
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

export async function POST(req: Request) {
  let body: Body;
  try {
    body = (await req.json()) as Body;
  } catch {
    return NextResponse.json(
      { ok: false, error: "Invalid JSON body" },
      { status: 400 },
    );
  }

  if (!Array.isArray(body.jobIds) || body.jobIds.length === 0) {
    return NextResponse.json(
      { ok: false, error: "Missing jobIds" },
      { status: 400 },
    );
  }

  // --- Real-jobs flow: identity from the logged-in session (email fallback).
  const session = await auth();
  const userId = session?.user?.id ? Number(session.user.id) : undefined;
  const email = session?.user?.email ?? body.email?.trim();
  if (userId || email) {
    try {
      const { results, cachedCount, scoredCount, provider, model } =
        await scoreTopForEmail({
          userId,
          email,
          jobIds: body.jobIds,
          profile: body.profile,
          forceRefresh: body.forceRefresh,
          limit: body.limit,
        });

      const sorted = [...results].sort(
        (a, b) =>
          (b.careerOpsScore?.score ?? -1) - (a.careerOpsScore?.score ?? -1),
      );

      return NextResponse.json({
        ok: true,
        provider,
        model,
        count: sorted.length,
        cachedCount,
        scoredCount,
        results: sorted as ScoreOutcome[],
      });
    } catch (err) {
      if (err instanceof NoResumeError) {
        return NextResponse.json(
          { ok: false, error: err.message },
          { status: 400 },
        );
      }
      const message = err instanceof Error ? err.message : "Scoring failed";
      console.error(`[score-batch] ${message}`);
      return NextResponse.json({ ok: false, error: message }, { status: 500 });
    }
  }

  // --- Legacy mock flow (used by scoresClient in mock mode) -------------
  const jobIds = [...new Set(body.jobIds)].slice(0, MAX_BATCH_SIZE);
  const profile = resolveCandidateProfile(body.profile);

  const results = await mapWithConcurrency<string, ScoreJobOutcome>(
    jobIds,
    SCORING_CONCURRENCY,
    async (jobId): Promise<ScoreJobOutcome> => {
      const job = resolveJob(jobId);
      if (!job) return { jobId, status: "error", error: "Unknown job" };
      try {
        const { result, cached } = await evaluateJob({
          job,
          profile,
          forceRefresh: body.forceRefresh,
        });
        return { jobId, status: cached ? "cached" : "scored", score: result };
      } catch (err) {
        const message = err instanceof Error ? err.message : "Scoring failed";
        console.error(`[score-batch] ${jobId}: ${message}`);
        return { jobId, status: "error", error: message };
      }
    },
  );

  return NextResponse.json({ ok: true, results, mode: getProviderMode() });
}
