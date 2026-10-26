/**
 * Profile validator — turns untrusted input into a well-formed stored profile.
 * PURE: type-only imports, so the server routes and `node --test` can both load it.
 * --------------------------------------------------------------------------
 * Runs on every save and every read. It never rejects a partial or old-shaped
 * profile; it fills defaults, trims, caps lengths and drops everything it does
 * not know (including `email`, which always comes from the signed-in account).
 * Only a value that is not a plain object is refused (returns null).
 */

import type {
  RemoteType,
  ResumeFileRef,
  ResumeProfile,
  WorkAuthorization,
} from "@/lib/careerOps/types";

export const PROFILE_MAX_BYTES = 65536;
export const TEXT_MAX = 500;
export const LIST_MAX_ITEMS = 50;
export const LIST_ITEM_MAX = 200;
export const RESUMES_MAX = 20;

const ID_MAX = 200;
const UPLOADED_AT_MAX = 50;

const WORK_AUTHORIZATIONS: readonly WorkAuthorization[] = [
  "unspecified",
  "us_citizen",
  "permanent_resident",
  "needs_sponsorship",
  "opt_cpt",
  "other",
];
const REMOTE_TYPES: readonly RemoteType[] = ["remote", "hybrid", "onsite"];

export type StoredProfile = Omit<ResumeProfile, "email">;

type Obj = Record<string, unknown>;

function isObject(v: unknown): v is Obj {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

/** Trimmed string cut to `max`, or "" when not a string. */
function text(v: unknown, max: number = TEXT_MAX): string {
  return typeof v === "string" ? v.trim().slice(0, max) : "";
}

/** Trimmed non-blank strings, each cut to LIST_ITEM_MAX, first LIST_MAX_ITEMS kept. */
function stringList(v: unknown): string[] {
  if (!Array.isArray(v)) return [];
  const out: string[] = [];
  for (const item of v) {
    if (typeof item !== "string") continue;
    const s = item.trim().slice(0, LIST_ITEM_MAX);
    if (s === "") continue;
    out.push(s);
    if (out.length === LIST_MAX_ITEMS) break;
  }
  return out;
}

function resumeRef(v: unknown): ResumeFileRef | null {
  if (!isObject(v)) return null;
  if (typeof v.id !== "string" || v.id === "") return null;
  const ref: ResumeFileRef = {
    id: v.id.slice(0, ID_MAX),
    label: text(v.label),
    fileName: text(v.fileName),
    uploadedAt: text(v.uploadedAt, UPLOADED_AT_MAX),
    parsed: v.parsed === true,
  };
  if (typeof v.dbId === "number" && Number.isInteger(v.dbId) && v.dbId > 0) {
    ref.dbId = v.dbId;
  }
  return ref;
}

export function sanitizeProfile(input: unknown): StoredProfile | null {
  if (!isObject(input)) return null;

  const remotePreferences: RemoteType[] = [];
  if (Array.isArray(input.remotePreferences)) {
    for (const r of input.remotePreferences) {
      const known = REMOTE_TYPES.find((t) => t === r);
      if (known && !remotePreferences.includes(known)) remotePreferences.push(known);
    }
  }

  const workAuthorization =
    WORK_AUTHORIZATIONS.find((w) => w === input.workAuthorization) ??
    "unspecified";

  const resumes: ResumeFileRef[] = [];
  if (Array.isArray(input.resumes)) {
    for (const entry of input.resumes.slice(0, RESUMES_MAX)) {
      const ref = resumeRef(entry);
      if (ref) resumes.push(ref);
    }
  }

  const profile: StoredProfile = {
    fullName: text(input.fullName),
    linkedinUrl: text(input.linkedinUrl),
    githubUrl: text(input.githubUrl),
    portfolioUrl: text(input.portfolioUrl),
    school: text(input.school),
    major: text(input.major),
    graduationDate: text(input.graduationDate),
    workAuthorization,
    locationPreferences: stringList(input.locationPreferences),
    rolePreferences: stringList(input.rolePreferences),
    remotePreferences,
    targetRoles: stringList(input.targetRoles),
    techStack: stringList(input.techStack),
    preferredRoleTypes: stringList(input.preferredRoleTypes),
    resumes,
  };
  if (typeof input.phone === "string") profile.phone = text(input.phone);
  if (typeof input.primaryResumeId === "string" && input.primaryResumeId !== "") {
    profile.primaryResumeId = input.primaryResumeId.slice(0, ID_MAX);
  }
  return profile;
}

/** Copy of `profile` where resumes whose dbId is not in `owned` lose the dbId. */
export function stripForeignResumeIds(
  profile: StoredProfile,
  owned: ReadonlySet<number>,
): StoredProfile {
  return {
    ...profile,
    resumes: profile.resumes.map((r) => {
      if (r.dbId === undefined || owned.has(r.dbId)) return { ...r };
      const { dbId: _dbId, ...rest } = r;
      void _dbId;
      return rest;
    }),
  };
}
