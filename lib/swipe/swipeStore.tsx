"use client";

/**
 * Swipe demo store (Demo 2) — MOCK PERSISTENCE.
 * Client-side store for the swipe app. Persists job statuses, notes, and the
 * profile to localStorage.
 *
 * TODO(backend): swap localStorage for API calls; keep this action surface.
 */

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { MOCK_SWIPE_JOBS } from "@/lib/mockData/swipeJobs";
import { DEFAULT_SWIPE_PROFILE } from "@/lib/mockData/swipeProfile";
import { RECOMMEND_THRESHOLD } from "@/lib/careerOps/scoreUtils";
import { swipeJobScore } from "@/lib/swipe/jobScore";
import { SCORE_TOP_N, USE_REAL_JOBS } from "@/lib/config";
import { jobListingsToSwipeJobs } from "@/lib/jobs/jobListingToSwipeJob";
import type { ResumeProfile } from "@/lib/careerOps/types";
import type { CareerOpsAiScore } from "@/lib/careerOps/aiScore";
import type { JobListing } from "@/types/jobListing";
import type { SwipeDecision, SwipeJob, SwipeJobStatus } from "@/types/swipe";

type JobSource = "mock" | "sql-server";

/** Active job filters — drive the SQL WHERE clauses via /api/jobs (server-side). */
export interface JobFilterState {
  jobType?: string;
  city?: string;
  postedWithinDays?: 1 | 7 | 30;
  sort?: "default" | "newest";
}

/** Number of active filters (for the filter-button badge). */
export function countActiveFilters(f: JobFilterState): number {
  let n = 0;
  if (f.jobType) n++;
  if (f.city) n++;
  if (f.postedWithinDays) n++;
  if (f.sort && f.sort !== "default") n++;
  return n;
}

function buildJobsUrl(filters: JobFilterState, limit = 100): string {
  const p = new URLSearchParams();
  p.set("limit", String(limit));
  if (filters.jobType) p.set("jobType", filters.jobType);
  if (filters.city) p.set("city", filters.city);
  if (filters.postedWithinDays)
    p.set("postedWithinDays", String(filters.postedWithinDays));
  if (filters.sort && filters.sort !== "default") p.set("sort", filters.sort);
  return `/api/jobs?${p.toString()}`;
}

/**
 * Fetch jobs from the SQL Server feed with optional filters. Falls back to the
 * mock dataset when real jobs are disabled or the request fails. An *empty*
 * filtered result is returned as-is (so the UI can say "no jobs matched"),
 * never replaced by mock.
 */
async function fetchJobs(filters: JobFilterState = {}): Promise<{
  jobs: SwipeJob[];
  source: JobSource;
  error: string | null;
}> {
  if (!USE_REAL_JOBS) {
    return { jobs: MOCK_SWIPE_JOBS, source: "mock", error: null };
  }
  try {
    const res = await fetch(buildJobsUrl(filters));
    const data = (await res.json()) as {
      ok?: boolean;
      jobs?: JobListing[];
      error?: string;
    };
    if (!res.ok || !data.ok || !Array.isArray(data.jobs)) {
      throw new Error(data.error || `Request failed (${res.status})`);
    }
    return {
      jobs: jobListingsToSwipeJobs(data.jobs),
      source: "sql-server",
      error: null,
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to load jobs";
    return { jobs: MOCK_SWIPE_JOBS, source: "mock", error: message };
  }
}

/** Re-apply persisted per-job statuses (keyed by id) onto a fresh job list. */
function withStatuses(
  jobs: SwipeJob[],
  statuses: Record<string, SwipeJobStatus>,
): SwipeJob[] {
  return jobs.map((j) => ({ ...j, status: statuses[j.id] ?? j.status }));
}

// v2: profile now starts empty (was the "Jordan Lee" demo profile in v1).
// Bumping the key discards old persisted state so the blank profile takes effect.
const STORAGE_KEY = "itjobcafe.swipe.v2";

interface Persisted {
  statuses: Record<string, SwipeJobStatus>;
  notes: Record<string, string>;
  profile: ResumeProfile;
}

export interface ScoreTopJobsResult {
  ok: boolean;
  error?: string;
  scored?: number;
  cached?: number;
  count?: number;
}

interface SwipeStore {
  jobs: SwipeJob[];
  profile: ResumeProfile;
  notes: Record<string, string>;
  hydrated: boolean;
  /** Where the current jobs came from. */
  source: JobSource;
  /** Non-null when the real-jobs feed failed and we fell back to mock. */
  error: string | null;
  /** True while the manual "Score top 10" batch is running. */
  scoring: boolean;
  /** Currently-applied job filters. */
  jobFilters: JobFilterState;
  /** Number of active filters (for the filter-button badge). */
  activeFilterCount: number;
  /** True while a filtered/default job fetch is in flight. */
  filtering: boolean;
  /** Jobs still awaiting a decision (the deck queue). */
  queue: SwipeJob[];
  decide: (jobId: string, decision: SwipeDecision) => void;
  setStatus: (jobId: string, status: SwipeJobStatus) => void;
  setNotes: (jobId: string, notes: string) => void;
  markApplied: (jobId: string) => void;
  updateProfile: (patch: Partial<ResumeProfile>) => void;
  /** Merge a patch into the draft filter state (does not fetch). */
  updateJobFilters: (patch: Partial<JobFilterState>) => void;
  /** Apply filters: fetch matching jobs server-side and replace the deck. */
  loadFilteredJobs: (
    filters?: JobFilterState,
  ) => Promise<{ ok: boolean; count: number; error: string | null }>;
  /** Clear filters and reload the default feed. */
  clearJobFilters: () => void;
  /** Dev/testing: wipe the user's seen-job history, then reload the feed. */
  clearSeenJobs: () => Promise<{ ok: boolean; error?: string }>;
  /** Score the first 10 jobs with AI, then show only those, ranked by score. */
  scoreTopJobs: () => Promise<ScoreTopJobsResult>;
  reset: () => void;
  metrics: {
    total: number;
    reviewed: number;
    interested: number;
    skipped: number;
    saved: number;
    applied: number;
    averageScore: number;
    recommended: number;
  };
}

const Ctx = createContext<SwipeStore | null>(null);

const DECISION_STATUS: Record<SwipeDecision, SwipeJobStatus> = {
  interested: "interested",
  skip: "skipped",
  save: "saved",
};

/** Swipe decision → the action recorded in the user's seen history. */
const SEEN_ACTION: Record<SwipeDecision, string> = {
  interested: "interested",
  skip: "skipped",
  save: "saved",
};

export function SwipeStoreProvider({
  children,
  sessionEmail,
}: {
  children: React.ReactNode;
  /** Logged-in email — seeded onto the profile so uploads/scoring use it. */
  sessionEmail?: string;
}) {
  const [jobs, setJobs] = useState<SwipeJob[]>(MOCK_SWIPE_JOBS);
  const [notes, setNotesState] = useState<Record<string, string>>({});
  const [profile, setProfile] = useState<ResumeProfile>(DEFAULT_SWIPE_PROFILE);
  const [hydrated, setHydrated] = useState(false);
  const [source, setSource] = useState<JobSource>("mock");
  const [error, setError] = useState<string | null>(null);
  const [scoring, setScoring] = useState(false);
  const [jobFilters, setJobFilters] = useState<JobFilterState>({});
  const [filtering, setFiltering] = useState(false);

  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => {
    let cancelled = false;

    // Read persisted statuses/notes/profile first (localStorage is sync).
    let statuses: Record<string, SwipeJobStatus> = {};
    let persistedProfile: Partial<ResumeProfile> | null = null;
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw) as Persisted;
        statuses = parsed.statuses ?? {};
        if (parsed.notes) setNotesState(parsed.notes);
        if (parsed.profile) persistedProfile = parsed.profile;
      }
    } catch {
      // ignore corrupt state
    }

    // Seed the profile; the logged-in email (if any) is authoritative, so the
    // resume upload + scoring always use the account's email, not a typo.
    const base = persistedProfile
      ? { ...DEFAULT_SWIPE_PROFILE, ...persistedProfile }
      : DEFAULT_SWIPE_PROFILE;
    setProfile(sessionEmail ? { ...base, email: sessionEmail } : base);

    // Then load the base jobs (real feed or mock) and re-apply statuses.
    fetchJobs().then((res) => {
      if (cancelled) return;
      setJobs(withStatuses(res.jobs, statuses));
      setSource(res.source);
      setError(res.error);
      setHydrated(true);
    });

    return () => {
      cancelled = true;
    };
  }, [sessionEmail]);
  /* eslint-enable react-hooks/set-state-in-effect */

  useEffect(() => {
    if (!hydrated) return;
    try {
      const statuses = Object.fromEntries(jobs.map((j) => [j.id, j.status]));
      localStorage.setItem(
        STORAGE_KEY,
        JSON.stringify({ statuses, notes, profile }),
      );
    } catch {
      // storage unavailable — non-fatal
    }
  }, [jobs, notes, profile, hydrated]);

  const setStatus = useCallback((jobId: string, status: SwipeJobStatus) => {
    setJobs((prev) =>
      prev.map((j) => (j.id === jobId ? { ...j, status } : j)),
    );
  }, []);

  // Persist "job seen" for the logged-in user (fire-and-forget; never blocks the
  // swipe). Deduped per (job, action) so React double-fires don't re-POST. Only
  // for real jobs — mock ids aren't real job_references. jobId === job_reference.
  const markedSeenRef = useRef<Set<string>>(new Set());
  const markSeen = useCallback((jobId: string, action: string) => {
    if (!USE_REAL_JOBS || !jobId) return;
    const key = `${jobId}:${action}`;
    if (markedSeenRef.current.has(key)) return;
    markedSeenRef.current.add(key);
    void fetch("/api/jobs/seen", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ jobReference: jobId, action }),
    }).catch((err) => {
      console.warn("[swipe] failed to mark job seen:", err);
    });
  }, []);

  const decide = useCallback(
    (jobId: string, decision: SwipeDecision) => {
      setStatus(jobId, DECISION_STATUS[decision]);
      markSeen(jobId, SEEN_ACTION[decision]);
    },
    [setStatus, markSeen],
  );

  const markApplied = useCallback(
    (jobId: string) => {
      setStatus(jobId, "applied");
      markSeen(jobId, "applied");
    },
    [setStatus, markSeen],
  );

  // Dev/testing: wipe this user's seen history so jobs can resurface, then
  // reload the (now larger) feed. NOT part of Reset.
  const clearSeenJobs = useCallback(async (): Promise<{
    ok: boolean;
    error?: string;
  }> => {
    setFiltering(true);
    try {
      const res = await fetch("/api/jobs/seen", { method: "DELETE" });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data?.ok) {
        return { ok: false, error: data?.error ?? "Failed to clear history" };
      }
      markedSeenRef.current.clear();
      const jobsRes = await fetchJobs(jobFilters);
      setJobs(jobsRes.jobs);
      setSource(jobsRes.source);
      setError(jobsRes.error);
      return { ok: true };
    } catch (err) {
      return {
        ok: false,
        error: err instanceof Error ? err.message : "Failed to clear history",
      };
    } finally {
      setFiltering(false);
    }
  }, [jobFilters]);

  const setNotes = useCallback((jobId: string, value: string) => {
    setNotesState((prev) => ({ ...prev, [jobId]: value }));
  }, []);

  const updateProfile = useCallback(
    (patch: Partial<ResumeProfile>) =>
      setProfile((prev) => ({ ...prev, ...patch })),
    [],
  );

  const scoreTopJobs = useCallback(async (): Promise<ScoreTopJobsResult> => {
    if (scoring) return { ok: false, error: "Already scoring…" };
    const email = profile.email?.trim();
    if (!email) {
      return { ok: false, error: "Add your email in your profile first." };
    }
    const topJobs = jobs.slice(0, SCORE_TOP_N);
    if (topJobs.length === 0) return { ok: false, error: "No jobs to score." };

    setScoring(true);
    try {
      const res = await fetch("/api/scoring/score-batch", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          email,
          jobIds: topJobs.map((j) => j.id),
          profile,
        }),
      });
      const data = await res.json();
      if (!res.ok || !data.ok) {
        return { ok: false, error: data?.error ?? "Scoring failed" };
      }

      const byId = new Map<string, CareerOpsAiScore>();
      for (const r of data.results ?? []) {
        if (r?.jobId && r?.careerOpsScore) byId.set(r.jobId, r.careerOpsScore);
      }

      // Keep only the scored jobs, attach the score, rank desc, reset the deck.
      const ranked = topJobs
        .map((j) => ({
          ...j,
          careerOpsScore: byId.get(j.id),
          status: "new" as SwipeJobStatus,
        }))
        .sort(
          (a, b) =>
            (b.careerOpsScore?.score ?? -1) - (a.careerOpsScore?.score ?? -1),
        );
      setJobs(ranked);

      return {
        ok: true,
        scored: data.scoredCount,
        cached: data.cachedCount,
        count: data.count,
      };
    } catch (err) {
      return {
        ok: false,
        error: err instanceof Error ? err.message : "Scoring failed",
      };
    } finally {
      setScoring(false);
    }
  }, [scoring, jobs, profile]);

  // Update the draft filter state locally (no fetch until Apply).
  const updateJobFilters = useCallback((patch: Partial<JobFilterState>) => {
    setJobFilters((prev) => ({ ...prev, ...patch }));
  }, []);

  // Apply filters: fetch the matching jobs server-side and replace the deck.
  // Fresh jobs are all status "new", so progress resets to 0.
  const loadFilteredJobs = useCallback(
    async (
      filters?: JobFilterState,
    ): Promise<{ ok: boolean; count: number; error: string | null }> => {
      const active = filters ?? {};
      if (filters) setJobFilters(filters);
      setFiltering(true);
      try {
        const res = await fetchJobs(active);
        setJobs(res.jobs);
        setSource(res.source);
        setError(res.error);
        return { ok: true, count: res.jobs.length, error: res.error };
      } finally {
        setFiltering(false);
      }
    },
    [],
  );

  // Clear filters and reload the default (unfiltered) feed.
  const clearJobFilters = useCallback(() => {
    setJobFilters({});
    setFiltering(true);
    fetchJobs()
      .then((res) => {
        setJobs(res.jobs);
        setSource(res.source);
        setError(res.error);
      })
      .finally(() => setFiltering(false));
  }, []);

  const reset = useCallback(() => {
    setNotesState({});
    setProfile(DEFAULT_SWIPE_PROFILE);
    setJobFilters({}); // Reset also clears active filters.
    setFiltering(true);
    // Re-load fresh default jobs with no persisted statuses / no filters.
    fetchJobs()
      .then((res) => {
        setJobs(res.jobs);
        setSource(res.source);
        setError(res.error);
      })
      .finally(() => setFiltering(false));
  }, []);

  const queue = useMemo(
    () => jobs.filter((j) => j.status === "new"),
    [jobs],
  );

  const activeFilterCount = useMemo(
    () => countActiveFilters(jobFilters),
    [jobFilters],
  );

  const metrics = useMemo(() => {
    const count = (s: SwipeJobStatus) =>
      jobs.filter((j) => j.status === s).length;
    const scores = jobs.map((j) => swipeJobScore(j));
    return {
      total: jobs.length,
      reviewed: jobs.filter((j) => j.status !== "new").length,
      interested: count("interested"),
      skipped: count("skipped"),
      saved: count("saved"),
      applied: count("applied"),
      averageScore: scores.length
        ? Number((scores.reduce((a, b) => a + b, 0) / scores.length).toFixed(2))
        : 0,
      recommended: jobs.filter((j) => swipeJobScore(j) >= RECOMMEND_THRESHOLD)
        .length,
    };
  }, [jobs]);

  const value: SwipeStore = {
    jobs,
    profile,
    notes,
    hydrated,
    source,
    error,
    scoring,
    jobFilters,
    activeFilterCount,
    filtering,
    queue,
    decide,
    setStatus,
    setNotes,
    markApplied,
    updateProfile,
    updateJobFilters,
    loadFilteredJobs,
    clearJobFilters,
    clearSeenJobs,
    scoreTopJobs,
    reset,
    metrics,
  };

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useSwipeStore(): SwipeStore {
  const ctx = useContext(Ctx);
  if (!ctx)
    throw new Error("useSwipeStore must be used within a SwipeStoreProvider");
  return ctx;
}
