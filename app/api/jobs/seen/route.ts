/**
 * /api/jobs/seen — per-user "seen jobs" history.
 *   POST   { jobReference, action } → mark a job seen for the logged-in user.
 *
 * Requires a session (auth()). The user id comes from the session, never
 * the client. Parameterized SQL only.
 */

import { NextResponse } from "next/server";
import { auth } from "@/auth";
import {
  markJobSeen,
  SEEN_ACTIONS,
  type SeenAction,
} from "@/lib/jobs/userJobSeenRepository";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function isSeenAction(v: unknown): v is SeenAction {
  return typeof v === "string" && (SEEN_ACTIONS as readonly string[]).includes(v);
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

  let body: { jobReference?: string; action?: string };
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
  // Unknown actions are still recorded as seen, but normalized to null.
  const action = isSeenAction(body.action) ? body.action : null;

  try {
    await markJobSeen({ loginUserId, jobReference, action });
    return NextResponse.json({ ok: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to mark seen";
    console.error(`[api/jobs/seen] ${message}`);
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
