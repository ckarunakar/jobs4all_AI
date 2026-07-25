/**
 * POST /api/scoring/score-batch
 *
 * { email, jobIds[], profile?, forceRefresh?, limit? }
 *   → scores the user's latest resume vs each job (DB-cached, cap 10).
 *   Returns { ok, count, cachedCount, scoredCount, model, results } sorted desc.
 *
 * Concurrency-limited so we never fan out a large burst of model calls.
 */

import { NextResponse } from "next/server";
import { auth } from "@/auth";
import {
  NoResumeError,
  scoreTopForEmail,
  type ScoreOutcome,
} from "@/lib/careerOps/scoringService";
import type { ResumeProfile } from "@/lib/careerOps/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface Body {
  email?: string;
  jobIds?: string[];
  profile?: ResumeProfile;
  forceRefresh?: boolean;
  limit?: number;
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

  return NextResponse.json(
    { ok: false, error: "Sign in to score jobs." },
    { status: 401 },
  );
}
