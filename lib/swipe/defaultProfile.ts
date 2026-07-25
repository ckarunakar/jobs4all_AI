import type { ResumeProfile } from "@/lib/careerOps/types";

/**
 * Empty starting profile for the swipe app — the user fills this in themselves.
 * (Nothing is pre-populated so the Profile page starts blank.)
 */
export const DEFAULT_SWIPE_PROFILE: ResumeProfile = {
  fullName: "",
  email: "",
  linkedinUrl: "",
  githubUrl: "",
  portfolioUrl: "",
  school: "",
  major: "",
  graduationDate: "",
  workAuthorization: "unspecified",
  locationPreferences: [],
  rolePreferences: [],
  remotePreferences: [],
  targetRoles: [],
  techStack: [],
  resumes: [],
  primaryResumeId: undefined,
};
