/**
 * Preference-baseline filters — pure derivation from the profile.
 * Client-safe; mirrors the server's cleaning rules (the route re-enforces
 * them). See docs/superpowers/specs/2026-09-04-preference-default-filters-design.md.
 */

import type { ResumeProfile } from "@/lib/careerOps/types";

export interface PrefFilterParams {
  prefLoc: string[];
  prefRole: string[];
  prefTech: string[];
}

const MAX_LOC = 5;
const MAX_ROLE = 6;
const MAX_TECH = 3;
const MAX_LOC_ROLE_LEN = 60;
const MAX_TECH_LEN = 40;

function cleanList(
  values: string[],
  maxLen: number,
  maxCount: number,
): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const raw of values) {
    const s = raw.trim().slice(0, maxLen);
    if (!s) continue;
    const key = s.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(s);
    if (out.length === maxCount) break;
  }
  return out;
}

/** Map profile preferences to feed query params (empty lists when unset). */
export function derivePrefFilterParams(
  profile: ResumeProfile,
): PrefFilterParams {
  return {
    prefLoc: cleanList(profile.locationPreferences ?? [], MAX_LOC_ROLE_LEN, MAX_LOC),
    prefRole: cleanList(
      [...(profile.rolePreferences ?? []), ...(profile.targetRoles ?? [])],
      MAX_LOC_ROLE_LEN,
      MAX_ROLE,
    ),
    prefTech: cleanList(profile.techStack ?? [], MAX_TECH_LEN, MAX_TECH),
  };
}

/** True when at least one preference category has tags. */
export function hasPrefFilters(p: PrefFilterParams): boolean {
  return p.prefLoc.length > 0 || p.prefRole.length > 0 || p.prefTech.length > 0;
}

/** Compact caption ("2 locations · 4 roles · 3 tech"); null when empty. */
export function prefFilterSummaryText(p: PrefFilterParams): string | null {
  const parts: string[] = [];
  if (p.prefLoc.length)
    parts.push(`${p.prefLoc.length} location${p.prefLoc.length === 1 ? "" : "s"}`);
  if (p.prefRole.length)
    parts.push(`${p.prefRole.length} role${p.prefRole.length === 1 ? "" : "s"}`);
  if (p.prefTech.length) parts.push(`${p.prefTech.length} tech`);
  return parts.length ? parts.join(" · ") : null;
}
