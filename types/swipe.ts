/**
 * Demo 2 (swipe-first) types.
 * Kept separate from Demo 1's `Job`/`ApplicationStatus` so the two demos stay
 * fully independent. Score types/utilities are shared via lib/careerOps.
 */

import type { CareerOpsScore, RemoteType } from "@/lib/careerOps/types";
import type { CareerOpsAiScore } from "@/lib/careerOps/aiScore";

export type { RemoteType };
export type { CareerOpsAiScore };

export type SwipeRoleType =
  | "internship"
  | "new_grad"
  | "full_time"
  | "contract";

export const SWIPE_ROLE_LABELS: Record<SwipeRoleType, string> = {
  internship: "Internship",
  new_grad: "New Grad",
  full_time: "Full-time",
  contract: "Contract",
};

export const SWIPE_REMOTE_LABELS: Record<RemoteType, string> = {
  remote: "Remote",
  hybrid: "Hybrid",
  onsite: "On-site",
};

/** Lifecycle of a job within the swipe demo. */
export type SwipeJobStatus =
  | "new" // not yet decided — still in the deck
  | "interested" // swiped right
  | "saved" // bookmarked
  | "ready" // ready to apply
  | "applied" // human-confirmed applied
  | "interview" // interviewing
  | "rejected" // rejected / archived
  | "skipped"; // swiped left

export type SwipeDecision = "interested" | "skip" | "save";

export interface SwipeJob {
  id: string;
  company: string;
  /** Placeholder "logo" — an accent hex color for the initials tile. */
  companyLogo: string;
  title: string;
  location: string;
  remoteType: RemoteType;
  roleType: SwipeRoleType;
  compensation?: string;
  source: string;
  score: CareerOpsScore;
  /** Denormalized tier label (kept in sync via getScoreLabel). */
  scoreLabel: string;
  /** Real Career-Ops AI score, set after the manual "Score top 10" batch. */
  careerOpsScore?: CareerOpsAiScore;
  matchSummary: string;
  strengths: string[];
  gaps: string[];
  cautionFlags: string[];
  requiredSkills: string[];
  niceToHaveSkills: string[];
  tags: string[];
  description: string;
  status: SwipeJobStatus;
  postedDate: string;
  applicationUrl: string;
}

export interface ApplicationChecklistItem {
  key: string;
  label: string;
  hint?: string;
}
