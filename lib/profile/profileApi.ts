/**
 * Browser-side calls to /api/profile, used by the swipe store. Client-safe:
 * no "server-only" and no server imports. Neither function throws — a failure
 * comes back as `{ kind: "error" }` / `false` so the store can fall back to
 * the browser copy and the website keeps working when the server is down.
 */

import { DEFAULT_SWIPE_PROFILE } from "@/lib/swipe/defaultProfile";
import type { ResumeProfile } from "@/lib/careerOps/types";
import {
  normalizeOwner,
  type ProfileSaveBody,
  type ServerProfileResult,
} from "@/lib/profile/profileSync";

/**
 * How long the profile GET may take. The first job fetch waits for it and
 * edits made meanwhile can be replaced by the server copy, so a hung request
 * is cut off and treated like any other failure (the browser copy is used).
 */
export const PROFILE_FETCH_TIMEOUT_MS = 8000;

/**
 * The signed-in account's saved profile: found, none saved yet, or error.
 * `expectedAccount` is the account this tab is showing. An answer for any
 * other account (the cookie changed in another tab), or one that doesn't say
 * whose it is, counts as an error, so it is never shown or stored as this
 * account's profile.
 */
export async function fetchServerProfile(
  expectedAccount: string,
): Promise<ServerProfileResult> {
  try {
    const res = await fetch("/api/profile", {
      signal: AbortSignal.timeout(PROFILE_FETCH_TIMEOUT_MS),
    });
    if (res.status !== 200) return { kind: "error" };
    const data = (await res.json()) as {
      ok?: unknown;
      email?: unknown;
      profile?: unknown;
      prefFilters?: unknown;
    };
    if (data?.ok !== true) return { kind: "error" };
    if (
      typeof data.email !== "string" ||
      normalizeOwner(data.email) !== normalizeOwner(expectedAccount)
    ) {
      return { kind: "error" };
    }
    const prefFilters =
      typeof data.prefFilters === "boolean" ? data.prefFilters : true;
    if (data.profile === null) return { kind: "none", prefFilters };
    if (typeof data.profile !== "object" || Array.isArray(data.profile)) {
      return { kind: "error" };
    }
    return {
      kind: "found",
      profile: {
        ...DEFAULT_SWIPE_PROFILE,
        ...(data.profile as Partial<ResumeProfile>),
      },
      prefFilters,
    };
  } catch {
    return { kind: "error" };
  }
}

/** PUT the whole profile; true only when the server confirmed the save. */
export async function sendServerProfile(
  body: ProfileSaveBody,
  keepalive: boolean,
): Promise<boolean> {
  try {
    const res = await fetch("/api/profile", {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
      keepalive,
    });
    return res.ok;
  } catch {
    return false;
  }
}
