import type { ResumeProfile } from "@/lib/careerOps/types";
import type { ResumeSuggestions } from "./suggestPreferences.ts";

type MergeInput = Pick<ResumeProfile, "targetRoles" | "rolePreferences" | "techStack">;

/**
 * Fill only the empty preference fields from résumé suggestions. Anything the
 * user already typed is left alone; empty suggestions never write an empty array.
 */
export function mergeSuggestions(
  profile: MergeInput,
  s: ResumeSuggestions,
): { patch: { targetRoles?: string[]; techStack?: string[] }; filledRoles: number; filledTech: number } {
  const patch: { targetRoles?: string[]; techStack?: string[] } = {};
  let filledRoles = 0;
  let filledTech = 0;

  const hasRoles = (profile.targetRoles?.length ?? 0) > 0 || (profile.rolePreferences?.length ?? 0) > 0;
  if (!hasRoles && s.targetRoles.length > 0) {
    patch.targetRoles = s.targetRoles;
    filledRoles = s.targetRoles.length;
  }
  if ((profile.techStack?.length ?? 0) === 0 && s.techStack.length > 0) {
    patch.techStack = s.techStack;
    filledTech = s.techStack.length;
  }
  return { patch, filledRoles, filledTech };
}

export function fillToastMessage(filledRoles: number, filledTech: number): string | null {
  const tail = "from your résumé. You can edit them on your Profile.";
  if (filledRoles > 0 && filledTech > 0) return `We filled in your target roles and skills ${tail}`;
  if (filledRoles > 0) return `We filled in your target roles ${tail}`;
  if (filledTech > 0) return `We filled in your skills ${tail}`;
  return null;
}

export const NO_TECH_FOUND_MESSAGE =
  "Resume uploaded, but we couldn't find any tech roles or skills in it. You can add them on your Profile to narrow your feed.";

/**
 * True when the AI answered and found no tech roles or skills at all. A null or
 * missing answer (AI off, failed or timed out) says nothing about the résumé.
 */
export function foundNoTech(s: ResumeSuggestions | null | undefined): boolean {
  return !!s && s.targetRoles.length === 0 && s.techStack.length === 0;
}
