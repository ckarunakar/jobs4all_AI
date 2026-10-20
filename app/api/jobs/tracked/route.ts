/**
 * GET /api/jobs/tracked — the logged-in user's pipeline (statuses + notes),
 * newest-updated first, capped at 500. Live job data when the scraper still
 * has the job; snapshot fallback (empty description) when it doesn't.
 */

import { NextResponse } from "next/server";
import { getRequestUser } from "@/lib/auth/requestUser";
import { fetchTrackedJobListings } from "@/lib/db/jobsRepository";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const user = await getRequestUser(req);
  const loginUserId = user?.id;
  if (!loginUserId) {
    return NextResponse.json(
      { ok: false, error: "Not authenticated" },
      { status: 401 },
    );
  }

  try {
    const tracked = await fetchTrackedJobListings(loginUserId);
    return NextResponse.json({
      ok: true,
      count: tracked.length,
      jobs: tracked.map((t) => ({
        job: t.listing,
        status: t.status,
        notes: t.notes,
      })),
    });
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "Failed to load pipeline";
    console.error(`[api/jobs/tracked] ${message}`);
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
