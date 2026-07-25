/**
 * Job-type normalization.
 * --------------------------------------------------------------------------
 * The scraped `job_type` column is messy free text — ~25 spellings of about 6
 * real concepts (FULL_TIME / "Full time" / FullTime / "Full Time Employee" / …).
 * This classifies any raw value into a clean category so the filter shows a
 * handful of options and each one matches all of its variants. Pure + isomorphic
 * (no DB/env), so it's the single source of truth for both the filter options
 * and the SQL expansion.
 */

/** Filterable categories, in display order. */
export const JOB_TYPE_CATEGORIES = [
  "Full-time",
  "Part-time",
  "Internship",
  "Contract",
  "Temporary",
  "Other",
] as const;

export type JobTypeCategory =
  | (typeof JOB_TYPE_CATEGORIES)[number]
  | "Not specified";

/** Map a raw `job_type` value to a clean category (order matters). */
export function classifyJobType(
  raw: string | null | undefined,
): JobTypeCategory {
  const v = (raw ?? "").trim().toLowerCase();
  if (!v) return "Not specified";
  if (v.includes("intern")) return "Internship";
  if (v.includes("part")) return "Part-time";
  if (
    v.includes("temp") ||
    v.includes("per_diem") ||
    v.includes("per diem") ||
    v.includes("seasonal")
  ) {
    return "Temporary";
  }
  if (v.includes("contract") || v.includes("freelance") || v.includes("c2c")) {
    return "Contract";
  }
  if (v.includes("full") || v.includes("permanent") || v.includes("regular")) {
    return "Full-time";
  }
  // OTHER, Remote, Hybrid, "Variable / Flex", or anything unrecognized.
  return "Other";
}
