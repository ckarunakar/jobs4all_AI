/**
 * GET /api/jobs/filter-options — options for the swipe filter panel.
 * Query params: citySearch (optional)
 * Returns: { ok: true, commonCities: string[], cities: string[], jobTypes: string[] }
 *
 * Read-only + parameterized. `cities` is populated only when `citySearch` is
 * given (autocomplete); otherwise the client shows `commonCities`.
 */

import { NextResponse } from "next/server";
import { fetchFilterOptions } from "@/lib/db/jobsRepository";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const citySearch = searchParams.get("citySearch")?.trim() || undefined;

  try {
    const options = await fetchFilterOptions(citySearch);
    return NextResponse.json({ ok: true, ...options });
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "Failed to load filter options";
    console.error(`[api/jobs/filter-options] ${message}`);
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
