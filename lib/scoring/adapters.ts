/**
 * Adapters: map the app's domain objects into the normalized scoring shapes.
 * Keeps the SwipeJob / ResumeProfile types decoupled from the scoring lib so
 * either side can change independently.
 */

import type { ResumeProfile } from "@/lib/careerOps/types";
import { SWIPE_ROLE_LABELS } from "@/types/swipe";
import type { SwipeJob } from "@/types/swipe";
import type { CandidateProfile, JobForScoring } from "./types";

export function toJobForScoring(job: SwipeJob): JobForScoring {
  return {
    id: job.id,
    title: job.title,
    company: job.company,
    location: job.location,
    workMode: job.remoteType,
    employmentType: SWIPE_ROLE_LABELS[job.roleType],
    salaryText: job.compensation,
    description: job.description,
    requirements: job.requiredSkills,
    responsibilities: undefined,
    benefits: job.niceToHaveSkills,
    sourceUrl: job.applicationUrl,
    sourceName: job.source,
    postedAt: job.postedDate,
    raw: job,
  };
}

/** Build a candidate profile from the app's editable ResumeProfile. */
export function toCandidateProfile(p: ResumeProfile): CandidateProfile {
  const skills = p.techStack?.length ? p.techStack : [];
  const targetRoles = [
    ...(p.targetRoles ?? []),
    ...p.rolePreferences,
  ];
  const preferredWorkTypes = [
    ...p.remotePreferences,
    ...(p.preferredRoleTypes ?? []),
  ];

  const experienceSummary = `${p.major || "Computer Science"} student at ${
    p.school || "university"
  }, graduating ${p.graduationDate || "soon"}. Work authorization: ${
    p.workAuthorization
  }.`;

  // No real resume upload/parsing in the MVP — synthesize a summary.
  const resumeText = [
    `${p.fullName}`,
    experienceSummary,
    skills.length ? `Skills: ${skills.join(", ")}.` : "",
    targetRoles.length ? `Targeting: ${targetRoles.join(", ")}.` : "",
  ]
    .filter(Boolean)
    .join("\n");

  return {
    id: p.email || "unknown-candidate",
    label: p.fullName || "Candidate",
    targetRoles,
    targetLocations: p.locationPreferences,
    preferredWorkTypes,
    skills,
    experienceSummary,
    projects: [],
    education: `${p.major || "B.S. Computer Science"}, ${p.school || ""}`.trim(),
    resumeText,
    dealbreakers: [],
    niceToHaves: [],
  };
}
