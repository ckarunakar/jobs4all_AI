/**
 * GET /api/jobs — read-only, filtered SQL Server job feed.
 * Query params: limit, jobType, city, postedWithinDays (1|7|30), sort
 *   (default|newest). Legacy search/state are still accepted.
 * Returns: { ok: true, jobs: JobListing[], source: "sql-server", count }
 *
 * SELECT-only, parameterized. Credentials stay server-side; filtering happens
 * in SQL so the browser only ever receives the limited matching result set.
 */

import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { fetchJobListings } from "@/lib/db/jobsRepository";
import type {
  JobFilters,
  JobSort,
  PostedWithinDays,
} from "@/types/jobListing";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Only 1, 7, or 30 are valid recency windows. */
function parsePostedWithinDays(v: string | null): PostedWithinDays | undefined {
  const n = Number(v);
  return n === 1 || n === 7 || n === 30 ? n : undefined;
}

/** Only "newest" (else default). Never trust arbitrary sort values. */
function parseSort(v: string | null): JobSort | undefined {
  return v === "newest" ? "newest" : v === "default" ? "default" : undefined;
}

function clean(v: string | null): string | undefined {
  const s = v?.trim();
  return s ? s : undefined;
}

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);

  const limitRaw = searchParams.get("limit");
  const filters: JobFilters = {
    limit: limitRaw ? Number(limitRaw) : undefined,
    search: clean(searchParams.get("search")),
    state: clean(searchParams.get("state")),
    city: clean(searchParams.get("city")),
    jobType: clean(searchParams.get("jobType")),
    postedWithinDays: parsePostedWithinDays(searchParams.get("postedWithinDays")),
    sort: parseSort(searchParams.get("sort")),
  };

  // Logged-in users get their already-seen jobs excluded (SQL-side). /swipe is
  // protected, so this is the normal path; unauthenticated calls still work.
  const session = await auth();
  const loginUserId = session?.user?.id ? Number(session.user.id) : undefined;

  try {
    const jobs = await fetchJobListings(filters, loginUserId);
    return NextResponse.json({
      ok: true,
      source: "sql-server",
      count: jobs.length,
      jobs,
    });
  } catch (err) {
    // Log message only — never the query values, profile, or credentials.
    const message = err instanceof Error ? err.message : "Failed to load jobs";
    console.error(`[api/jobs] ${message}`);
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
