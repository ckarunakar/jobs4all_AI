/**
 * POST /api/jobs/seen/import — one-time bulk import of localStorage pipeline
 * state on login. Insert-only: existing server rows always win. Body:
 * { entries: [{ jobReference, status, notes? }] }, capped at 500 entries.
 */

import { NextResponse } from "next/server";
import { auth } from "@/auth";
import {
  importJobStates,
  isPipelineStatus,
  type ImportEntry,
} from "@/lib/jobs/userJobSeenRepository";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_ENTRIES = 500;
const MAX_NOTES = 20_000;

export async function POST(req: Request) {
  const session = await auth();
  const loginUserId = session?.user?.id ? Number(session.user.id) : undefined;
  if (!loginUserId) {
    return NextResponse.json(
      { ok: false, error: "Not authenticated" },
      { status: 401 },
    );
  }

  let body: { entries?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json(
      { ok: false, error: "Invalid JSON body" },
      { status: 400 },
    );
  }
  if (!Array.isArray(body.entries)) {
    return NextResponse.json(
      { ok: false, error: "Missing entries array" },
      { status: 400 },
    );
  }
  if (body.entries.length > MAX_ENTRIES) {
    return NextResponse.json(
      { ok: false, error: `Too many entries (max ${MAX_ENTRIES})` },
      { status: 400 },
    );
  }

  // Silently drop malformed entries — the rest still import.
  const entries: ImportEntry[] = [];
  for (const raw of body.entries) {
    if (!raw || typeof raw !== "object") continue;
    const e = raw as Record<string, unknown>;
    const jobReference = String(e.jobReference ?? "").trim();
    if (!jobReference || !isPipelineStatus(e.status)) continue;
    entries.push({
      jobReference,
      status: e.status,
      notes:
        typeof e.notes === "string" && e.notes
          ? e.notes.slice(0, MAX_NOTES)
          : undefined,
    });
  }

  try {
    const result = await importJobStates(loginUserId, entries);
    return NextResponse.json({ ok: true, ...result });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Import failed";
    console.error(`[api/jobs/seen/import] ${message}`);
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
