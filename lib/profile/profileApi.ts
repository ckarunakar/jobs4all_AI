/**
 * Browser-side calls to /api/profile, used by the swipe store. Client-safe:
 * no "server-only" and no server imports. Neither function throws — a failure
 * comes back as `{ kind: "error" }` / `false` so the store can fall back to
 * the browser copy and the website keeps working when the server is down.
 */

import { DEFAULT_SWIPE_PROFILE } from "@/lib/swipe/defaultProfile";
import type { ResumeProfile } from "@/lib/careerOps/types";
import type {
  ProfileSaveBody,
  ServerProfileResult,
} from "@/lib/profile/profileSync";

/** The signed-in account's saved profile: found, none saved yet, or error. */
export async function fetchServerProfile(): Promise<ServerProfileResult> {
  try {
    const res = await fetch("/api/profile");
    if (res.status !== 200) return { kind: "error" };
    const data = (await res.json()) as {
      ok?: unknown;
      profile?: unknown;
      prefFilters?: unknown;
    };
    if (data?.ok !== true) return { kind: "error" };
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
