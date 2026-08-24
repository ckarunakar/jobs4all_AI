"use client";

/**
 * Swipe store — client-side state for the swipe app. Persists job statuses,
 * notes, and the profile to localStorage.
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
import { DEFAULT_SWIPE_PROFILE } from "@/lib/swipe/defaultProfile";
import { RECOMMEND_THRESHOLD } from "@/lib/careerOps/scoreUtils";
import { swipeJobScore } from "@/lib/swipe/jobScore";
import { SCORE_TOP_N } from "@/lib/config";
import {
  jobListingsToSwipeJobs,
  jobListingToSwipeJob,
} from "@/lib/jobs/jobListingToSwipeJob";
import type { ResumeProfile } from "@/lib/careerOps/types";
import type { CareerOpsAiScore } from "@/lib/careerOps/aiScore";
import type { JobListing } from "@/types/jobListing";
import type { SwipeDecision, SwipeJob, SwipeJobStatus } from "@/types/swipe";

/** Active job filters — drive the SQL WHERE clauses via /api/jobs (server-side). */
export interface JobFilterState {
  jobType?: string;
  city?: string;
  skills?: string[];
  postedWithinDays?: 1 | 7 | 30;
  sort?: "default" | "newest";
}

/** Number of active filters (for the filter-button badge). */
export function countActiveFilters(f: JobFilterState): number {
  let n = 0;
  if (f.jobType) n++;
  if (f.city) n++;
  if (f.skills && f.skills.length > 0) n++;
  if (f.postedWithinDays) n++;
  if (f.sort && f.sort !== "default") n++;
  return n;
}

function buildJobsUrl(filters: JobFilterState, limit = 100): string {
  const p = new URLSearchParams();
  p.set("limit", String(limit));
  if (filters.jobType) p.set("jobType", filters.jobType);
  if (filters.city) p.set("city", filters.city);
  for (const s of filters.skills ?? []) p.append("skill", s);
  if (filters.postedWithinDays)
    p.set("postedWithinDays", String(filters.postedWithinDays));
  if (filters.sort && filters.sort !== "default") p.set("sort", filters.sort);
  return `/api/jobs?${p.toString()}`;
}

/**
 * Fetch jobs from the SQL Server feed with optional filters. On failure the
 * deck is left empty and `error` carries the reason — there is no fallback
 * data source. An *empty* filtered result is returned as-is (so the UI can
 * say "no jobs matched").
 */
async function fetchJobs(filters: JobFilterState = {}): Promise<{
  jobs: SwipeJob[];
  error: string | null;
}> {
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
    return { jobs: jobListingsToSwipeJobs(data.jobs), error: null };
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to load jobs";
    return { jobs: [], error: message };
  }
}

/** LastAction values the tracker accepts (SwipeJobStatus minus "new"). */
const TRACKED_STATUSES: readonly SwipeJobStatus[] = [
  "interested",
  "saved",
  "ready",
  "applied",
  "interview",
  "rejected",
  "skipped",
];

function isTrackedStatus(v: string): v is SwipeJobStatus {
  return (TRACKED_STATUSES as readonly string[]).includes(v);
}

/** Fetch the logged-in user's server-side pipeline (statuses + notes). */
async function fetchTrackedJobs(): Promise<{
  jobs: SwipeJob[];
  notes: Record<string, string>;
  error: string | null;
}> {
  try {
    const res = await fetch("/api/jobs/tracked");
    const data = (await res.json()) as {
      ok?: boolean;
      jobs?: Array<{ job: JobListing; status: string; notes: string | null }>;
      error?: string;
    };
    if (!res.ok || !data.ok || !Array.isArray(data.jobs)) {
      throw new Error(data.error || `Request failed (${res.status})`);
    }
    const notes: Record<string, string> = {};
    const jobs: SwipeJob[] = [];
    for (const entry of data.jobs) {
      if (!isTrackedStatus(entry.status)) continue;
      const sj = jobListingToSwipeJob(entry.job);
      sj.status = entry.status;
      if (entry.notes) notes[sj.id] = entry.notes;
      jobs.push(sj);
    }
    return { jobs, notes, error: null };
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "Failed to load pipeline";
    return { jobs: [], notes: {}, error: message };
  }
}

/** Re-apply persisted per-job statuses (keyed by id) onto a fresh job list. */
function withStatuses(
  jobs: SwipeJob[],
  statuses: Record<string, SwipeJobStatus>,
): SwipeJob[] {
  return jobs.map((j) => ({ ...j, status: statuses[j.id] ?? j.status }));
}

/**
 * Deck order after a batch: scored-but-unswiped first (best score first),
 * unscored unswiped next (original order), swiped jobs after (order there is
 * irrelevant — the queue only reads status "new").
 */
function sortScoredFirst(list: SwipeJob[]): SwipeJob[] {
  const scoredNew = list.filter((j) => j.status === "new" && j.careerOpsScore);
  const unscoredNew = list.filter(
    (j) => j.status === "new" && !j.careerOpsScore,
  );
  const rest = list.filter((j) => j.status !== "new");
  scoredNew.sort(
    (a, b) => (b.careerOpsScore?.score ?? 0) - (a.careerOpsScore?.score ?? 0),
  );
  return [...scoredNew, ...unscoredNew, ...rest];
}

// v2: profile now starts empty (was the "Jordan Lee" sample profile in v1).
// Bumping the key discards old persisted state so the blank profile takes effect.
const STORAGE_KEY = "itjobcafe.swipe.v2";

interface Persisted {
  statuses: Record<string, SwipeJobStatus>;
  notes: Record<string, string>;
  profile: ResumeProfile;
}

export interface ScoreNextJobsResult {
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
  /** True when a session exists. Gates seen-history sync and score UI. */
  isLoggedIn: boolean;
  /** Non-null when the jobs feed failed to load. */
  error: string | null;
  /** Non-null when the saved pipeline failed to load. */
  pipelineError: string | null;
  /** True while a batch scoring of new jobs is running. */
  scoring: boolean;
  /** Ids with a single-job scoring request in flight. */
  scoringJobIds: Set<string>;
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
  markApplied: (jobId: string, notes?: string) => void;
  updateProfile: (patch: Partial<ResumeProfile>) => void;
  /** Merge a patch into the draft filter state (does not fetch). */
  updateJobFilters: (patch: Partial<JobFilterState>) => void;
  /** Apply filters: fetch matching jobs server-side and replace the deck. */
  loadFilteredJobs: (
    filters?: JobFilterState,
  ) => Promise<{ ok: boolean; count: number; error: string | null }>;
  /** Clear filters and reload the default feed. */
  clearJobFilters: () => void;
  /** Score the next 10 unscored queue jobs; scored jobs float to the front. */
  scoreNextJobs: () => Promise<ScoreNextJobsResult>;
  /** Score one job in place (no deck re-sort). */
  scoreOneJob: (jobId: string) => Promise<{ ok: boolean; error?: string }>;
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

export function SwipeStoreProvider({
  children,
  sessionEmail,
  isLoggedIn = false,
}: {
  children: React.ReactNode;
  /** Logged-in email — seeded onto the profile so uploads/scoring use it. */
  sessionEmail?: string;
  /** True when a session exists. Gates seen-history sync and score UI. */
  isLoggedIn?: boolean;
}) {
  const [jobs, setJobs] = useState<SwipeJob[]>([]);
  const [notes, setNotesState] = useState<Record<string, string>>({});
  const [profile, setProfile] = useState<ResumeProfile>(DEFAULT_SWIPE_PROFILE);
  const [hydrated, setHydrated] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Non-null when the server-side pipeline (tracked jobs) failed to load.
  const [pipelineError, setPipelineError] = useState<string | null>(null);
  const [scoring, setScoring] = useState(false);
  const [scoringJobIds, setScoringJobIds] = useState<Set<string>>(new Set());
  // Session-level score memory: survives deck replacement (filters/reset) so
  // already-scored jobs stay visibly scored when they reappear.
  const scoresRef = useRef<Map<string, CareerOpsAiScore>>(new Map());
  // Synchronous guard against same-frame double-clicks racing scoreOneJob:
  // state updates aren't visible until the next render, so this ref catches
  // a second call before setScoringJobIds would.
  const inFlightSingleRef = useRef<Set<string>>(new Set());

  /** Re-attach any known scores to a freshly fetched job list. */
  const withKnownScores = useCallback(
    (list: SwipeJob[]): SwipeJob[] =>
      list.map((j) => {
        const known = scoresRef.current.get(j.id);
        return known && !j.careerOpsScore
          ? { ...j, careerOpsScore: known }
          : j;
      }),
    [],
  );

  /** Replace only the undecided ("new") portion of the deck; jobs the user
   *  has acted on stay so the tracker survives filtering. */
  const replaceDeck = useCallback(
    (fetched: SwipeJob[]) => {
      setJobs((prev) => {
        const kept = prev.filter((j) => j.status !== "new");
        const keptIds = new Set(kept.map((j) => j.id));
        return withKnownScores([
          ...kept,
          ...fetched.filter((j) => !keptIds.has(j.id)),
        ]);
      });
    },
    [withKnownScores],
  );
  const [jobFilters, setJobFilters] = useState<JobFilterState>({});
  const [filtering, setFiltering] = useState(false);

  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => {
    let cancelled = false;

    // Read persisted statuses/notes/profile first (localStorage is sync).
    let statuses: Record<string, SwipeJobStatus> = {};
    let storedNotes: Record<string, string> = {};
    let persistedProfile: Partial<ResumeProfile> | null = null;
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw) as Persisted;
        statuses = parsed.statuses ?? {};
        storedNotes = parsed.notes ?? {};
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

    // One-time import of localStorage pipeline state into the account.
    // Existing server rows win; the flag is only set on success so a failed
    // import retries next load. Cap 500 (localStorage has no timestamps, so
    // "most recent" is unknowable — first 500 it is). On success the guest
    // payload is absorbed by this account: the stored statuses/notes are
    // cleared (profile kept) so a later account — or a later guest session —
    // on this shared browser starts fresh instead of re-inheriting the same
    // pipeline (the import flag is per-email; the payload itself is not).
    async function maybeImport(): Promise<void> {
      if (!isLoggedIn || !sessionEmail) return;
      const importKey = `itjobcafe.swipe.imported.${sessionEmail}`;
      try {
        if (localStorage.getItem(importKey)) return;
      } catch {
        return;
      }
      const entries = Object.entries(statuses)
        .filter(([, s]) => s !== "new")
        .slice(0, 500)
        .map(([jobReference, status]) => ({
          jobReference,
          status,
          notes: storedNotes[jobReference] || undefined,
        }));
      try {
        if (entries.length > 0) {
          const res = await fetch("/api/jobs/seen/import", {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ entries }),
          });
          if (!res.ok) return; // no flag — retry next load
        }
        localStorage.setItem(importKey, "1");
        // Absorb the guest-era payload into this account: clear the stored
        // statuses/notes (profile untouched) so this pipeline isn't
        // re-imported by the next account to log in on this browser.
        try {
          const raw = localStorage.getItem(STORAGE_KEY);
          if (raw) {
            const parsed = JSON.parse(raw) as Persisted;
            localStorage.setItem(
              STORAGE_KEY,
              JSON.stringify({ statuses: {}, notes: {}, profile: parsed.profile }),
            );
          }
        } catch {
          // ignore corrupt state — nothing to clear
        }
      } catch (err) {
        console.warn("[swipe] pipeline import failed:", err);
      }
    }

    async function load(): Promise<void> {
      if (isLoggedIn) {
        await maybeImport();
        const [feed, tracked] = await Promise.all([
          fetchJobs(),
          fetchTrackedJobs(),
        ]);
        if (cancelled) return;
        // Server state wins: localStorage statuses are NOT applied. The feed
        // excludes seen jobs server-side, so overlap is belt-and-braces only.
        const trackedIds = new Set(tracked.jobs.map((j) => j.id));
        setJobs(
          withKnownScores([
            ...tracked.jobs,
            ...feed.jobs.filter((j) => !trackedIds.has(j.id)),
          ]),
        );
        setNotesState(tracked.notes);
        setError(feed.error);
        setPipelineError(tracked.error);
      } else {
        const res = await fetchJobs();
        if (cancelled) return;
        setJobs(withKnownScores(withStatuses(res.jobs, statuses)));
        setNotesState(storedNotes);
        setError(res.error);
      }
      setHydrated(true);
    }

    void load();
    return () => {
      cancelled = true;
    };
  }, [sessionEmail, isLoggedIn, withKnownScores]);
  /* eslint-enable react-hooks/set-state-in-effect */

  useEffect(() => {
    if (!hydrated) return;
    try {
      if (isLoggedIn) {
        // Logged in: statuses/notes live server-side, not in localStorage —
        // don't let this effect clobber the on-disk guest-era payload with
        // {} (e.g. because the one-time import hasn't run/succeeded yet, or
        // the tracked fetch failed). Preserve whatever is already stored so
        // a failed import still has data to retry with next load; refresh
        // only the profile.
        let prevStatuses: Record<string, SwipeJobStatus> = {};
        let prevNotes: Record<string, string> = {};
        try {
          const raw = localStorage.getItem(STORAGE_KEY);
          if (raw) {
            const parsed = JSON.parse(raw) as Persisted;
            prevStatuses = parsed.statuses ?? {};
            prevNotes = parsed.notes ?? {};
          }
        } catch {
          // ignore corrupt state
        }
        localStorage.setItem(
          STORAGE_KEY,
          JSON.stringify({ statuses: prevStatuses, notes: prevNotes, profile }),
        );
      } else {
        const statuses = Object.fromEntries(jobs.map((j) => [j.id, j.status]));
        localStorage.setItem(
          STORAGE_KEY,
          JSON.stringify({ statuses, notes, profile }),
        );
      }
    } catch {
      // storage unavailable — non-fatal
    }
  }, [jobs, notes, profile, hydrated, isLoggedIn]);

  // Sync one job's full state (status + notes + snapshot) for the logged-in
  // user (fire-and-forget; never blocks the swipe). MERGE-on-server means a
  // lost write self-heals on the job's next touch. Deduped per in-flight
  // request — NOT permanently — so React double-fires don't re-POST, while a
  // later touch (including a bounce back to the same status) or a retry
  // after a failed POST still fires once the earlier request has settled.
  // jobId === job_reference.
  const syncedRef = useRef<Set<string>>(new Set());
  const syncJobState = useCallback(
    (job: SwipeJob, status: SwipeJobStatus, notesValue?: string) => {
      if (!isLoggedIn || !job.id || status === "new") return;
      const key = `${job.id}:${status}:${notesValue ?? ""}`;
      if (syncedRef.current.has(key)) return;
      syncedRef.current.add(key);
      void fetch("/api/jobs/seen", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          jobReference: job.id,
          status,
          notes: notesValue,
          snapshot: {
            title: job.title,
            company: job.company,
            location: job.location,
            url: job.applicationUrl || undefined,
          },
        }),
      })
        .catch((err) => {
          console.warn("[swipe] failed to sync job state:", err);
        })
        .finally(() => {
          syncedRef.current.delete(key);
        });
    },
    [isLoggedIn],
  );

  const setStatus = useCallback(
    (jobId: string, status: SwipeJobStatus) => {
      setJobs((prev) =>
        prev.map((j) => (j.id === jobId ? { ...j, status } : j)),
      );
      const job = jobs.find((j) => j.id === jobId);
      // Notes omitted → server keeps existing notes (COALESCE).
      if (job) syncJobState(job, status);
    },
    [jobs, syncJobState],
  );

  const decide = useCallback(
    (jobId: string, decision: SwipeDecision) => {
      setStatus(jobId, DECISION_STATUS[decision]);
    },
    [setStatus],
  );

  // Notes travel WITH the status in one POST — two racing requests could
  // otherwise resurrect stale values via COALESCE.
  const markApplied = useCallback(
    (jobId: string, notesValue?: string) => {
      if (notesValue !== undefined) {
        setNotesState((prev) => ({ ...prev, [jobId]: notesValue }));
      }
      setJobs((prev) =>
        prev.map((j) => (j.id === jobId ? { ...j, status: "applied" } : j)),
      );
      const job = jobs.find((j) => j.id === jobId);
      if (job) syncJobState(job, "applied", notesValue);
    },
    [jobs, syncJobState],
  );

  const setNotes = useCallback(
    (jobId: string, value: string) => {
      setNotesState((prev) => ({ ...prev, [jobId]: value }));
      const job = jobs.find((j) => j.id === jobId);
      if (job && job.status !== "new") syncJobState(job, job.status, value);
    },
    [jobs, syncJobState],
  );

  const updateProfile = useCallback(
    (patch: Partial<ResumeProfile>) =>
      setProfile((prev) => ({ ...prev, ...patch })),
    [],
  );

  const scoreNextJobs = useCallback(async (): Promise<ScoreNextJobsResult> => {
    if (scoring) return { ok: false, error: "Already scoring…" };
    const candidates = jobs
      .filter((j) => j.status === "new" && !j.careerOpsScore && !scoringJobIds.has(j.id))
      .slice(0, SCORE_TOP_N);
    if (candidates.length === 0) {
      return { ok: false, error: "All jobs are scored." };
    }

    setScoring(true);
    setScoringJobIds((prev) => {
      const next = new Set(prev);
      for (const j of candidates) next.add(j.id);
      return next;
    });
    try {
      const res = await fetch("/api/scoring/score-batch", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          jobIds: candidates.map((j) => j.id),
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
      byId.forEach((score, id) => scoresRef.current.set(id, score));

      // Merge scores in (nothing is discarded), then float scored jobs to the
      // front of the queue ranked by fit.
      setJobs((prev) =>
        sortScoredFirst(
          prev.map((j) =>
            byId.has(j.id)
              ? { ...j, careerOpsScore: byId.get(j.id) }
              : j,
          ),
        ),
      );

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
      setScoringJobIds((prev) => {
        const next = new Set(prev);
        for (const j of candidates) next.delete(j.id);
        return next;
      });
      setScoring(false);
    }
  }, [scoring, jobs, profile, scoringJobIds]);

  // Score one job in place (per-card "Ask AI to score"). Deliberately NO
  // re-sort: the card being read must not move.
  const scoreOneJob = useCallback(
    async (jobId: string): Promise<{ ok: boolean; error?: string }> => {
      if (!jobId) return { ok: false, error: "Missing job id" };
      if (scoringJobIds.has(jobId)) {
        return { ok: false, error: "Already scoring this job." };
      }
      if (inFlightSingleRef.current.has(jobId)) {
        return { ok: false, error: "Already scoring this job." };
      }
      if (jobs.find((j) => j.id === jobId)?.careerOpsScore) {
        return { ok: true };
      }
      inFlightSingleRef.current.add(jobId);
      setScoringJobIds((prev) => new Set(prev).add(jobId));
      try {
        const res = await fetch("/api/scoring/score-job", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ jobId, profile }),
        });
        const data = await res.json();
        if (!res.ok || !data.ok || !data.careerOpsScore) {
          return { ok: false, error: data?.error ?? "Scoring failed" };
        }
        scoresRef.current.set(jobId, data.careerOpsScore);
        setJobs((prev) =>
          prev.map((j) =>
            j.id === jobId ? { ...j, careerOpsScore: data.careerOpsScore } : j,
          ),
        );
        return { ok: true };
      } catch (err) {
        return {
          ok: false,
          error: err instanceof Error ? err.message : "Scoring failed",
        };
      } finally {
        inFlightSingleRef.current.delete(jobId);
        setScoringJobIds((prev) => {
          const next = new Set(prev);
          next.delete(jobId);
          return next;
        });
      }
    },
    [jobs, profile, scoringJobIds],
  );

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
        replaceDeck(res.jobs);
        setError(res.error);
        return { ok: true, count: res.jobs.length, error: res.error };
      } finally {
        setFiltering(false);
      }
    },
    [replaceDeck],
  );

  // Clear filters and reload the default (unfiltered) feed.
  const clearJobFilters = useCallback(() => {
    setJobFilters({});
    setFiltering(true);
    fetchJobs()
      .then((res) => {
        replaceDeck(res.jobs);
        setError(res.error);
      })
      .finally(() => setFiltering(false));
  }, [replaceDeck]);

  const reset = useCallback(() => {
    setNotesState({});
    setProfile(DEFAULT_SWIPE_PROFILE);
    setJobFilters({});
    setFiltering(true);
    if (isLoggedIn) {
      // Logged in: Reset re-syncs from the server — it does NOT clear the
      // saved pipeline (there is deliberately no delete endpoint).
      Promise.all([fetchJobs(), fetchTrackedJobs()])
        .then(([feed, tracked]) => {
          const trackedIds = new Set(tracked.jobs.map((j) => j.id));
          setJobs(
            withKnownScores([
              ...tracked.jobs,
              ...feed.jobs.filter((j) => !trackedIds.has(j.id)),
            ]),
          );
          setNotesState(tracked.notes);
          setError(feed.error);
          setPipelineError(tracked.error);
        })
        .finally(() => setFiltering(false));
    } else {
      fetchJobs()
        .then((res) => {
          setJobs(withKnownScores(res.jobs));
          setError(res.error);
        })
        .finally(() => setFiltering(false));
    }
  }, [isLoggedIn, withKnownScores]);

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
    isLoggedIn,
    error,
    pipelineError,
    scoring,
    scoringJobIds,
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
    scoreNextJobs,
    scoreOneJob,
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

/** Like useSwipeStore, but returns null outside a provider (landing page). */
export function useSwipeStoreOptional(): SwipeStore | null {
  return useContext(Ctx);
}
