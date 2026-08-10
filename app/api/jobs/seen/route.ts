/**
 * /api/jobs/seen — per-user pipeline state.
 *   POST { jobReference, status, notes?, snapshot? } → upsert the logged-in
 *   user's state for one job ("action" accepted as a legacy alias for status).
 *
 * Requires a session (auth()). The user id comes from the session, never
 * the client. Parameterized SQL only.
 */

import { NextResponse } from "next/server";
import { auth } from "@/auth";
import {
  isPipelineStatus,
  upsertJobState,
  type JobSnapshot,
} from "@/lib/jobs/userJobSeenRepository";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_NOTES = 20_000;

function cleanStr(v: unknown, max: number): string | undefined {
  if (typeof v !== "string") return undefined;
  const s = v.trim();
  return s ? s.slice(0, max) : undefined;
}

/** Snapshot fields, trimmed and capped to the column sizes. NOT exported —
 *  Next.js route files may only export handlers/config. */
function parseSnapshot(v: unknown): JobSnapshot | undefined {
  if (!v || typeof v !== "object") return undefined;
  const o = v as Record<string, unknown>;
  const snapshot: JobSnapshot = {
    title: cleanStr(o.title, 500),
    company: cleanStr(o.company, 500),
    location: cleanStr(o.location, 500),
    url: cleanStr(o.url, 2000),
  };
  return snapshot.title || snapshot.company || snapshot.location || snapshot.url
    ? snapshot
    : undefined;
}

export async function POST(req: Request) {
  const session = await auth();
  const loginUserId = session?.user?.id ? Number(session.user.id) : undefined;
  if (!loginUserId) {
    return NextResponse.json(
      { ok: false, error: "Not authenticated" },
      { status: 401 },
    );
  }

  let body: {
    jobReference?: string;
    status?: string;
    action?: string; // legacy alias
    notes?: string;
    snapshot?: unknown;
  };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json(
      { ok: false, error: "Invalid JSON body" },
      { status: 400 },
    );
  }

  const jobReference = String(body.jobReference ?? "").trim();
  if (!jobReference) {
    return NextResponse.json(
      { ok: false, error: "Missing jobReference" },
      { status: 400 },
    );
  }
  // Unknown statuses are still recorded as seen, but normalized to null
  // (COALESCE in the MERGE keeps any existing status).
  const raw = body.status ?? body.action;
  const status = isPipelineStatus(raw) ? raw : null;
  // Notes: absent → keep existing (null); "" → clear (empty string passes).
  const notes =
    typeof body.notes === "string" ? body.notes.slice(0, MAX_NOTES) : null;

  try {
    await upsertJobState({
      loginUserId,
      jobReference,
      status,
      notes,
      snapshot: parseSnapshot(body.snapshot),
    });
    return NextResponse.json({ ok: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to save state";
    console.error(`[api/jobs/seen] ${message}`);
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
