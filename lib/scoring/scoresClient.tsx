"use client";

/**
 * Client-side scores store.
 * --------------------------------------------------------------------------
 * Holds AI evaluations keyed by jobId and lazily requests scoring from the
 * server (so the key stays server-side). De-dupes requests so re-renders and
 * swiping never re-trigger calls for an already-requested job.
 */

import {
  createContext,
  useCallback,
  useContext,
  useRef,
  useState,
} from "react";
import { useSwipeStore } from "@/lib/swipe/swipeStore";
import { USE_REAL_JOBS } from "@/lib/config";
import type { JobEvaluationResult } from "@/lib/scoring/types";

export type ScoreStatus = "scoring" | "scored" | "error";

export interface ScoreEntry {
  status: ScoreStatus;
  result?: JobEvaluationResult;
  error?: string;
}

interface ScoresApi {
  entries: Record<string, ScoreEntry>;
  mode: "mock" | "live" | null;
  /** False when AI scoring is disabled (e.g. real DB jobs in v1). */
  enabled: boolean;
  /** Request scores for any of these job ids not already requested. */
  ensureScored: (jobIds: string[]) => void;
  /** Force a fresh score for one job (ignores cache). */
  rescore: (jobId: string) => Promise<void>;
  getEntry: (jobId: string) => ScoreEntry | undefined;
}

const Ctx = createContext<ScoresApi | null>(null);

export function ScoresProvider({ children }: { children: React.ReactNode }) {
  const { profile } = useSwipeStore();
  const [entries, setEntries] = useState<Record<string, ScoreEntry>>({});
  const [mode, setMode] = useState<"mock" | "live" | null>(null);
  const requested = useRef<Set<string>>(new Set());
  // Keep the latest profile in a ref so callbacks stay stable.
  const profileRef = useRef(profile);
  profileRef.current = profile;

  const apply = useCallback(
    (results: { jobId: string; status: string; score?: JobEvaluationResult; error?: string }[]) => {
      setEntries((prev) => {
        const next = { ...prev };
        for (const r of results) {
          if (r.score) next[r.jobId] = { status: "scored", result: r.score };
          else next[r.jobId] = { status: "error", error: r.error ?? "Scoring failed" };
        }
        return next;
      });
    },
    [],
  );

  // v1: real DB jobs aren't AI-scored yet — scoring is disabled in that mode.
  const enabled = !USE_REAL_JOBS;

  const ensureScored = useCallback(
    (jobIds: string[]) => {
      if (!enabled) return;
      const todo = jobIds.filter((id) => id && !requested.current.has(id));
      if (todo.length === 0) return;
      todo.forEach((id) => requested.current.add(id));

      setEntries((prev) => {
        const next = { ...prev };
        for (const id of todo) next[id] = { status: "scoring" };
        return next;
      });

      fetch("/api/scoring/score-batch", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ jobIds: todo, profile: profileRef.current }),
      })
        .then((r) => r.json())
        .then((data) => {
          if (data?.mode) setMode(data.mode);
          if (data?.ok && Array.isArray(data.results)) apply(data.results);
          else {
            // Allow a later retry on hard failure.
            todo.forEach((id) => requested.current.delete(id));
            setEntries((prev) => {
              const next = { ...prev };
              for (const id of todo)
                next[id] = { status: "error", error: data?.error ?? "Request failed" };
              return next;
            });
          }
        })
        .catch((err) => {
          todo.forEach((id) => requested.current.delete(id));
          setEntries((prev) => {
            const next = { ...prev };
            for (const id of todo)
              next[id] = { status: "error", error: String(err) };
            return next;
          });
        });
    },
    [apply, enabled],
  );

  const rescore = useCallback(
    async (jobId: string) => {
      if (!enabled) return;
      setEntries((prev) => ({ ...prev, [jobId]: { status: "scoring" } }));
      try {
      const res = await fetch("/api/scoring/score-job", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          jobId,
          profile: profileRef.current,
          forceRefresh: true,
        }),
      });
      const data = await res.json();
      if (data?.mode) setMode(data.mode);
      requested.current.add(jobId);
      if (data?.ok && data.score) {
        setEntries((prev) => ({
          ...prev,
          [jobId]: { status: "scored", result: data.score },
        }));
      } else {
        setEntries((prev) => ({
          ...prev,
          [jobId]: { status: "error", error: data?.error ?? "Scoring failed" },
        }));
      }
      } catch (err) {
        setEntries((prev) => ({
          ...prev,
          [jobId]: { status: "error", error: String(err) },
        }));
      }
    },
    [enabled],
  );

  const getEntry = useCallback(
    (jobId: string) => entries[jobId],
    [entries],
  );

  return (
    <Ctx.Provider
      value={{ entries, mode, enabled, ensureScored, rescore, getEntry }}
    >
      {children}
    </Ctx.Provider>
  );
}

/** Returns the scores API, or null when used outside a ScoresProvider. */
export function useScoresOptional(): ScoresApi | null {
  return useContext(Ctx);
}

export function useScores(): ScoresApi {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("useScores must be used within a ScoresProvider");
  return ctx;
}
