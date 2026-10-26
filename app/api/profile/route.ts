/**
 * GET /api/profile — the caller's saved profile (null until one is saved),
 * plus the "use my profile to filter jobs" switch and the last-saved time.
 * PUT /api/profile — save the caller's profile. Both work with the website
 * cookie or the app's Bearer token.
 *
 * PUT body: { profile, prefFilters?, expectedEmail? }. `profile` is cleaned
 * by the validator (unknown fields dropped, `email` always comes from the
 * account). `prefFilters` omitted keeps the stored value. `expectedEmail`
 * (the website sends it) makes the save fail with 409 if the cookie now
 * belongs to a different account than the tab thinks.
 */

import { normalizeEmail } from "@/lib/auth/users";
import { getRequestUser, type RequestUser } from "@/lib/auth/requestUser";
import { noStoreJson } from "@/lib/auth/noStoreJson";
import {
  getOwnResumeUploadIds,
  getProfileRow,
  upsertProfile,
  type ProfileRow,
} from "@/lib/profile/profileRepository";
import {
  PROFILE_MAX_BYTES,
  sanitizeProfile,
  stripForeignResumeIds,
} from "@/lib/profile/sanitizeProfile";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** The 200 body shared by GET and PUT. */
function profileResponse(user: RequestUser, row: ProfileRow | null) {
  return noStoreJson({
    ok: true,
    profile: row ? { ...row.profile, email: user.email } : null,
    prefFilters: row?.prefFilters ?? true,
    updatedAt: row ? row.updatedAt.toISOString() : null,
  });
}

function logFailure(userId: number | null, err: unknown) {
  const message = err instanceof Error ? err.message : String(err);
  console.error(`[profile] user ${userId ?? "unknown"}: ${message}`);
}

export async function GET(req: Request) {
  let userId: number | null = null;
  try {
    const user = await getRequestUser(req);
    if (!user) {
      return noStoreJson({ ok: false, error: "Not authenticated" }, 401);
    }
    userId = user.id;
    return profileResponse(user, await getProfileRow(user.id));
  } catch (err) {
    logFailure(userId, err);
    return noStoreJson({ ok: false, error: "Could not load profile." }, 500);
  }
}

export async function PUT(req: Request) {
  let userId: number | null = null;
  try {
    const user = await getRequestUser(req);
    if (!user) {
      return noStoreJson({ ok: false, error: "Not authenticated" }, 401);
    }
    userId = user.id;

    // A cross-site form can't send application/json without a CORS preflight.
    const contentType = req.headers.get("content-type") ?? "";
    if (!contentType.toLowerCase().startsWith("application/json")) {
      return noStoreJson({ ok: false, error: "Invalid JSON body." }, 400);
    }

    const text = await req.text();
    if (Buffer.byteLength(text, "utf8") > PROFILE_MAX_BYTES) {
      return noStoreJson({ ok: false, error: "Profile too large." }, 400);
    }

    let body: unknown;
    try {
      body = JSON.parse(text);
    } catch {
      return noStoreJson({ ok: false, error: "Invalid JSON body." }, 400);
    }

    const obj =
      typeof body === "object" && body !== null && !Array.isArray(body)
        ? (body as Record<string, unknown>)
        : null;
    const clean = obj ? sanitizeProfile(obj.profile) : null;
    if (!obj || !clean) {
      return noStoreJson({ ok: false, error: "Invalid profile." }, 400);
    }

    if (
      typeof obj.expectedEmail === "string" &&
      normalizeEmail(obj.expectedEmail) !== normalizeEmail(user.email)
    ) {
      return noStoreJson(
        { ok: false, error: "Signed in as a different account." },
        409,
      );
    }

    const prefFilters =
      typeof obj.prefFilters === "boolean" ? obj.prefFilters : undefined;
    const owned = clean.resumes.some((r) => r.dbId !== undefined)
      ? await getOwnResumeUploadIds(user.id, user.email)
      : new Set<number>();
    const row = await upsertProfile(
      user.id,
      stripForeignResumeIds(clean, owned),
      prefFilters,
    );
    return profileResponse(user, row);
  } catch (err) {
    logFailure(userId, err);
    return noStoreJson({ ok: false, error: "Could not save profile." }, 500);
  }
}
