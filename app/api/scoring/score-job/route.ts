/**
 * POST /api/scoring/score-job
 * Body: { jobId: string, profile?: ResumeProfile, job?: SwipeJob, forceRefresh?: boolean }
 * Returns: { ok: true, score: JobEvaluationResult, cached, mode } | { ok: false, error }
 *
 * All scoring happens server-side. The API key is never exposed to the client.
 */

import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { evaluateJob } from "@/lib/scoring/scoreJob";
import { resolveCandidateProfile, resolveJob } from "@/lib/scoring/resolve";
import {
  getProviderInfo,
  getProviderMode,
} from "@/lib/scoring/providerRegistry";
import {
  NoResumeError,
  scoreOneForEmail,
} from "@/lib/careerOps/scoringService";
import type { ResumeProfile } from "@/lib/careerOps/types";
import type { SwipeJob } from "@/types/swipe";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface Body {
  email?: string;
  jobId?: string;
  profile?: ResumeProfile;
  job?: SwipeJob;
  forceRefresh?: boolean;
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

  if (!body.jobId) {
    return NextResponse.json(
      { ok: false, error: "Missing jobId" },
      { status: 400 },
    );
  }

  // --- Real-jobs flow: identity from the logged-in session (email fallback).
  const session = await auth();
  const userId = session?.user?.id ? Number(session.user.id) : undefined;
  const email = session?.user?.email ?? body.email?.trim();
  if (userId || email) {
    try {
      const outcome = await scoreOneForEmail({
        userId,
        email,
        jobId: body.jobId,
        profile: body.profile,
        forceRefresh: body.forceRefresh,
      });
      if (outcome.status === "error") {
        return NextResponse.json(
          { ok: false, error: outcome.error ?? "Scoring failed" },
          { status: 404 },
        );
      }
      return NextResponse.json({
        ok: true,
        ...getProviderInfo(),
        careerOpsScore: outcome.careerOpsScore,
        cached: outcome.status === "cached",
      });
    } catch (err) {
      if (err instanceof NoResumeError) {
        return NextResponse.json(
          { ok: false, error: err.message },
          { status: 400 },
        );
      }
      const message = err instanceof Error ? err.message : "Scoring failed";
      console.error(`[score-job] ${message}`);
      return NextResponse.json({ ok: false, error: message }, { status: 500 });
    }
  }

  // --- Legacy mock flow -------------------------------------------------
  const job = resolveJob(body.jobId, body.job);
  if (!job) {
    return NextResponse.json(
      { ok: false, error: `Unknown job: ${body.jobId}` },
      { status: 404 },
    );
  }

  const profile = resolveCandidateProfile(body.profile);

  try {
    const { result, cached } = await evaluateJob({
      job,
      profile,
      forceRefresh: body.forceRefresh,
    });
    return NextResponse.json({
      ok: true,
      score: result,
      cached,
      mode: getProviderMode(),
    });
  } catch (err) {
    // Log id + message only — never the full profile/JD or any key.
    const message = err instanceof Error ? err.message : "Scoring failed";
    console.error(`[score-job] ${body.jobId}: ${message}`);
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
