import type { ResumeProfile } from "@/lib/careerOps/types";

interface CompletionField {
  label: string;
  done: boolean;
}

/** Compute a 0–100 profile completion score + per-field checklist. */
export function getProfileCompletion(profile: ResumeProfile): {
  percent: number;
  fields: CompletionField[];
} {
  const fields: CompletionField[] = [
    { label: "Name & email", done: !!(profile.fullName && profile.email) },
    { label: "Resume uploaded", done: profile.resumes.length > 0 },
    { label: "LinkedIn", done: !!profile.linkedinUrl },
    { label: "GitHub", done: !!profile.githubUrl },
    { label: "Portfolio", done: !!profile.portfolioUrl },
    { label: "Education", done: !!(profile.school && profile.major) },
    { label: "Graduation date", done: !!profile.graduationDate },
    { label: "Location preferences", done: profile.locationPreferences.length > 0 },
    { label: "Role preferences", done: profile.rolePreferences.length > 0 },
    { label: "Tech stack", done: (profile.techStack?.length ?? 0) > 0 },
  ];
  const done = fields.filter((f) => f.done).length;
  return {
    percent: Math.round((done / fields.length) * 100),
    fields,
  };
}
