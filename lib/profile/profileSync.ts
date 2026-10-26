/**
 * Pure sync decisions and the ordered save queue for the server-side profile.
 * Type-only imports so node --test, the browser and the server can all load it.
 */

import type { ResumeProfile } from "@/lib/careerOps/types";

export const PROFILE_SAVE_DELAY_MS = 1000;

export function normalizeOwner(email: string): string {
  return email.trim().toLowerCase();
}

/** A stored owner string wins (even ""); legacy data falls back to the stamped profile email. */
export function resolveOwner(storedOwner: unknown, storedProfileEmail: unknown): string {
  if (typeof storedOwner === "string") return normalizeOwner(storedOwner);
  if (typeof storedProfileEmail === "string") return normalizeOwner(storedProfileEmail);
  return "";
}

const TEXT_FIELDS = [
  "fullName", "phone", "linkedinUrl", "githubUrl", "portfolioUrl",
  "school", "major", "graduationDate",
] as const;
const LIST_FIELDS = [
  "locationPreferences", "rolePreferences", "remotePreferences",
  "targetRoles", "techStack", "preferredRoleTypes",
] as const;

/** True when the profile holds anything a person typed. `email` and `primaryResumeId` are ignored. */
export function isProfileFilled(profile: ResumeProfile | null | undefined): boolean {
  if (!profile) return false;
  const p = profile as unknown as Record<string, unknown>;
  for (const k of TEXT_FIELDS) {
    const v = p[k];
    if (typeof v === "string" && v.trim() !== "") return true;
  }
  for (const k of LIST_FIELDS) {
    const v = p[k];
    if (Array.isArray(v) && v.length > 0) return true;
  }
  if (profile.workAuthorization !== "unspecified") return true;
  return Array.isArray(profile.resumes) && profile.resumes.length > 0;
}

export type ServerProfileResult =
  | { kind: "found"; profile: ResumeProfile; prefFilters: boolean }
  | { kind: "none"; prefFilters: boolean }
  | { kind: "error" };

export interface LocalProfileState {
  profile: ResumeProfile | null;
  owner: string;
  dirty: boolean;
}

export type ProfileSyncDecision = "use-server" | "upload-local" | "use-local" | "start-blank";

/** `account` and `local.owner` must already be normalized. */
export function decideProfileSync(
  local: LocalProfileState,
  server: ServerProfileResult,
  account: string,
): ProfileSyncDecision {
  const mine = local.owner === "" || local.owner === account;
  switch (server.kind) {
    case "found":
      return local.dirty && local.owner === account ? "upload-local" : "use-server";
    case "none":
      return isProfileFilled(local.profile) && mine ? "upload-local" : "start-blank";
    case "error":
      return mine ? "use-local" : "start-blank";
  }
}

export interface ProfileSaveBody {
  profile: ResumeProfile;
  prefFilters: boolean;
  expectedEmail: string;
}

export interface ProfileSaveJob {
  account: string;
  version: number;
  body: ProfileSaveBody;
}

export interface ProfileSaver {
  schedule(job: ProfileSaveJob): void;
  flush(keepalive: boolean): void;
  cancel(): void;
}

/**
 * Debounced, ordered save queue: newer edits replace unsent ones, and at most one
 * send is in flight (except flush). A flush that goes out while another send is
 * still in flight is not confirmed through onSaved, because the two requests can
 * land in either order and the browser copy must stay dirty so it is re-uploaded.
 * Failed sends are not retried here; the store retries on the next edit or sync.
 */
export function createProfileSaver(opts: {
  send: (body: ProfileSaveBody, keepalive: boolean) => Promise<boolean>;
  currentAccount: () => string;
  onSaved: (job: ProfileSaveJob) => void;
  delayMs?: number;
}): ProfileSaver {
  const delay = opts.delayMs ?? PROFILE_SAVE_DELAY_MS;
  let waiting: ProfileSaveJob | null = null;
  let timer: ReturnType<typeof setTimeout> | null = null;
  let due = false; // timer fired while a send was in flight
  let inFlight = 0;

  function clearTimer() {
    if (timer !== null) clearTimeout(timer);
    timer = null;
  }

  function sendWaiting(keepalive: boolean) {
    const job = waiting;
    waiting = null;
    due = false;
    if (!job) return;
    if (job.account !== opts.currentAccount()) return;
    const overlapped = inFlight > 0;
    inFlight++;
    let p: Promise<boolean>;
    try {
      p = opts.send(job.body, keepalive);
    } catch {
      p = Promise.resolve(false);
    }
    p.then(
      (ok) => ok,
      () => false,
    ).then((ok) => {
      inFlight--;
      if (ok && !overlapped && job.account === opts.currentAccount()) opts.onSaved(job);
      if (inFlight === 0 && due && waiting) sendWaiting(false);
    });
  }

  return {
    schedule(job) {
      waiting = job;
      due = false;
      clearTimer();
      timer = setTimeout(() => {
        timer = null;
        if (inFlight > 0) due = true;
        else sendWaiting(false);
      }, delay);
    },
    flush(keepalive) {
      clearTimer();
      sendWaiting(keepalive);
    },
    cancel() {
      clearTimer();
      waiting = null;
      due = false;
    },
  };
}
