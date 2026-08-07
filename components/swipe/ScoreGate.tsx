"use client";

import { useState } from "react";
import Link from "next/link";
import { Loader2, Lock, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ScoreMeter } from "./ScoreMeter";
import { useSwipeStoreOptional } from "@/lib/swipe/swipeStore";
import type { SwipeJob } from "@/types/swipe";

/**
 * The score area's three states:
 *  - guest → blurred meter + "Log in to see AI ratings"
 *  - logged in, unscored → "Ask AI to score" (per-job, fills in place)
 *  - scored → the caller-provided `scored` content
 * Works without a SwipeStoreProvider (landing preview card) — treated as guest.
 */
export function ScoreGate({
  job,
  scored,
}: {
  job: SwipeJob;
  scored: React.ReactNode;
}) {
  const store = useSwipeStoreOptional();
  const [error, setError] = useState<string | null>(null);

  if (job.careerOpsScore) return <>{scored}</>;

  const isLoggedIn = store?.isLoggedIn ?? false;

  if (!isLoggedIn) {
    return (
      <div className="relative" onPointerDown={(e) => e.stopPropagation()}>
        <div className="pointer-events-none select-none opacity-60 blur-[6px]" aria-hidden>
          <ScoreMeter score={4.2} />
        </div>
        <div className="absolute inset-0 flex items-center justify-center">
          <Link href="/login">
            <Button size="sm" variant="secondary">
              <Lock className="size-3.5" />
              Log in to see AI ratings
            </Button>
          </Link>
        </div>
      </div>
    );
  }

  const busy = store?.scoringJobIds.has(job.id) ?? false;

  const handleAsk = async () => {
    if (!store || busy) return;
    setError(null);
    const res = await store.scoreOneJob(job.id);
    if (!res.ok) setError(res.error ?? "Scoring failed");
  };

  return (
    <div
      className="flex flex-col items-center gap-1.5 py-1"
      onPointerDown={(e) => e.stopPropagation()}
    >
      <Button size="sm" variant="secondary" disabled={busy} onClick={handleAsk}>
        {busy ? (
          <Loader2 className="size-3.5 animate-spin" />
        ) : (
          <Sparkles className="size-3.5" />
        )}
        {busy ? "AI scoring…" : "Ask AI to score"}
      </Button>
      {error && (
        <p className="text-xs text-[var(--caution)]">{error}</p>
      )}
    </div>
  );
}
