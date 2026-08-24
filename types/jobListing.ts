/**
 * Normalized job as returned by the read-only SQL Server feed (`/api/jobs`).
 * Sourced from the single table ITJC_SCRAPPER.dbo.temp_tbl_Scrap_jobs
 * (descriptions inline). This is the DB-facing shape; the swipe UI maps it to
 * `SwipeJob` via lib/jobs/jobListingToSwipeJob.
 */
export type JobListing = {
  /** job_reference (unique natural key). */
  id: string;
  jobReference?: string;
  title: string;
  company: string;
  /** Optional short summary (unused by the scrap table; kept for compatibility). */
  briefInfo?: string;
  location: string;
  city?: string;
  state?: string;
  zip?: string;
  url?: string;
  jobType?: string;
  postedAt?: string;
  /** Reserved (not sourced from the scrap table). */
  published?: string;
  /** Reserved (not sourced from the scrap table). */
  sourceId?: number;
  /** country column. */
  country?: string;
  /** Isremote (0/1) → boolean. */
  isRemote?: boolean;
  /** category column. */
  category?: string;
  /** Full job description (inline on the scrap table, HTML-stripped). */
  description?: string;
  source: "sql-server";
};

/** How recent a posting must be (posted_at within N days; 1 = past 24h). */
export type PostedWithinDays = 1 | 7 | 30;

/** Result ordering (allowlisted — never raw user input in SQL). */
export type JobSort = "default" | "newest";

/** Query filters accepted by the jobs API / repository. */
export interface JobFilters {
  limit?: number;
  search?: string;
  state?: string;
  city?: string;
  jobType?: string;
  /** Whole-word skill keywords (max 3) — matches if ANY appears in title/description. */
  skills?: string[];
  /** Only postings from the past 1 / 7 / 30 days (uses posted_at). */
  postedWithinDays?: PostedWithinDays;
  /** "newest" → posted_at DESC; "default" → diverse company round-robin. */
  sort?: JobSort;
}
