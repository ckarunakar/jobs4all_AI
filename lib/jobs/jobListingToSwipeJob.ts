/**
 * Map a DB `JobListing` into the swipe UI's `SwipeJob`.
 * Real jobs are NOT AI-scored in v1, so they get a neutral placeholder score;
 * lazy AI scoring is intentionally gated off for them (see scoresClient).
 */

import { getScoreLabel } from "@/lib/careerOps/scoreUtils";
import { truncate } from "@/lib/utils/text";
import type { JobListing } from "@/types/jobListing";
import type { RemoteType, SwipeJob, SwipeRoleType } from "@/types/swipe";

/** Neutral placeholder until real fit scoring is wired for DB jobs. */
export const PLACEHOLDER_SCORE = 3.0;

// Flat, on-brand accent palette for the company initials tile.
const LOGO_PALETTE = [
  "#3b82f6",
  "#10b981",
  "#f59e0b",
  "#8b5cf6",
  "#ef4444",
  "#0ea5e9",
  "#ec4899",
  "#14b8a6",
];

function colorForString(s: string): string {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
  return LOGO_PALETTE[h % LOGO_PALETTE.length];
}

function deriveRoleType(job: JobListing): SwipeRoleType {
  const hay = `${job.jobType ?? ""} ${job.title}`.toLowerCase();
  if (hay.includes("intern")) return "internship";
  if (/(new[\s-]?grad|graduate|entry[\s-]?level)/.test(hay)) return "new_grad";
  if (/(contract|contractor|c2c|temp\b)/.test(hay)) return "contract";
  return "full_time";
}

/** tbl_JobMaster has no remote flag, so derive from the posting text. */
function deriveRemoteType(job: JobListing): RemoteType {
  const hay = `${job.title} ${job.briefInfo ?? ""} ${job.description ?? ""}`;
  if (/\bhybrid\b/i.test(hay)) return "hybrid";
  if (/\bremote\b/i.test(hay)) return "remote";
  return "onsite"; // SwipeJob has no "unknown" — default to onsite for display
}

// Friendly source names for known ATS/board hosts.
const ATS_NAMES: [string, string][] = [
  ["myworkdayjobs.com", "Workday"],
  ["greenhouse.io", "Greenhouse"],
  ["lever.co", "Lever"],
  ["ashbyhq.com", "Ashby"],
  ["smartrecruiters.com", "SmartRecruiters"],
  ["icims.com", "iCIMS"],
  ["taleo.net", "Taleo"],
  ["workable.com", "Workable"],
  ["jobvite.com", "Jobvite"],
  ["breezy.hr", "Breezy"],
  ["jobicy.com", "Jobicy"],
];

/** Derive a human source label from the posting URL (else a generic fallback). */
function sourceFromUrl(url?: string): string {
  if (!url) return "Scraper feed";
  try {
    const host = new URL(url).hostname.replace(/^www\./, "");
    for (const [suffix, name] of ATS_NAMES) {
      if (host === suffix || host.endsWith("." + suffix)) return name;
    }
    // Company career site → use the registrable domain, capitalized.
    const parts = host.split(".");
    const base = parts.length >= 2 ? parts[parts.length - 2] : host;
    return base.charAt(0).toUpperCase() + base.slice(1);
  } catch {
    return "Scraper feed";
  }
}

export function jobListingToSwipeJob(job: JobListing): SwipeJob {
  const description = job.description ?? "";
  // Card preview: BriefInfo when present, else a truncated description.
  const preview = job.briefInfo || description;
  return {
    id: job.id,
    company: job.company,
    companyLogo: colorForString(job.company || job.id),
    title: job.title,
    location: job.location,
    remoteType: deriveRemoteType(job),
    roleType: deriveRoleType(job),
    // tbl_JobMaster has no salary field, so no compensation chip.
    compensation: undefined,
    source: sourceFromUrl(job.url),
    score: PLACEHOLDER_SCORE,
    scoreLabel: getScoreLabel(PLACEHOLDER_SCORE),
    matchSummary: preview
      ? truncate(preview, 160)
      : "Imported from the live job feed.",
    strengths: [],
    gaps: [],
    cautionFlags: [],
    requiredSkills: [],
    niceToHaveSkills: [],
    tags: [],
    description,
    status: "new",
    postedDate: job.postedAt ?? "",
    applicationUrl: job.url ?? "",
  };
}

export function jobListingsToSwipeJobs(jobs: JobListing[]): SwipeJob[] {
  return jobs.map(jobListingToSwipeJob);
}
