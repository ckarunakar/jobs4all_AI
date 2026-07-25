/**
 * Client-safe feature flags (inlined from NEXT_PUBLIC_* at build time).
 * These are booleans/toggles only — never secrets.
 */

/** When true, the swipe app loads jobs from the SQL Server feed (/api/jobs). */
export const USE_REAL_JOBS = process.env.NEXT_PUBLIC_USE_REAL_JOBS === "true";

/**
 * How many top jobs the "Score with AI" button scores at once.
 * 10 on DeepSeek: v4-flash has a 2,500 concurrency limit and no per-minute
 * request/token limit, so scoring 10 jobs fully in parallel finishes in
 * ~15-25s (see scoringService CONCURRENCY). Hard-capped at 10 in the service.
 */
export const SCORE_TOP_N = 10;
