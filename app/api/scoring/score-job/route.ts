/**
 * POST /api/scoring/score-job
 * Body: { jobId: string, profile?: ResumeProfile, forceRefresh?: boolean }
 * Scores the signed-in user's latest resume against one job (DB-cached).
 * All scoring happens server-side. The API key is never exposed to the client.
 */

import { NextResponse } from "next/server";
import { getRequestUser } from "@/lib/auth/requestUser";
import { getProviderInfo } from "@/lib/scoring/providerRegistry";
import {
  NoResumeError,
  scoreOneForEmail,
} from "@/lib/careerOps/scoringService";
import type { ResumeProfile } from "@/lib/careerOps/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface Body {
  jobId?: string;
  profile?: ResumeProfile;
  forceRefresh?: boolean;
}

export async function POST(req: Request) {
  const user = await getRequestUser(req);
  if (!user) {
    return NextResponse.json(
      { ok: false, error: "Sign in to score jobs." },
      { status: 401 },
    );
  }

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

  // --- Real-jobs flow: identity from the signed-in user (cookie or Bearer).
  const userId = user.id;
  const email = user.email;
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
