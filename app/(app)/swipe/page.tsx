"use client";

import { useEffect, useRef } from "react";
import Link from "next/link";
import { Bookmark, Inbox, Loader2, PartyPopper, Sparkles } from "lucide-react";
import { SwipeShell } from "@/components/swipe/SwipeShell";
import { JobFilterButton } from "@/components/swipe/JobFilterButton";
import { SwipeDeck, type SwipeDeckHandle } from "@/components/swipe/SwipeDeck";
import { SwipeActionButtons } from "@/components/swipe/SwipeActionButtons";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/shared/EmptyState";
import { useSwipeStore } from "@/lib/swipe/swipeStore";
import { SCORE_TOP_N } from "@/lib/config";
import { useSwipeInteractions } from "@/components/swipe/SwipeInteractionsProvider";
import { useToast } from "@/components/ui/toast";
import type { SwipeDecision } from "@/types/swipe";

export default function SwipePage() {
  const {
    queue,
    jobs,
    metrics,
    hydrated,
    error,
    source,
    scoring,
    filtering,
    activeFilterCount,
    decide,
    scoreTopJobs,
  } = useSwipeStore();
  const { openDetail, openApply } = useSwipeInteractions();
  const { toast } = useToast();
  const deckRef = useRef<SwipeDeckHandle>(null);

  const top = queue[0];

  const handleScoreTop = async () => {
    const res = await scoreTopJobs();
    if (!res.ok) {
      toast(res.error ?? "Scoring failed", "danger");
      return;
    }
    toast(
      `Scored top ${res.count} · ${res.scored} new, ${res.cached} cached`,
      "success",
    );
  };

  const handleDecision = (jobId: string, decision: SwipeDecision) => {
    decide(jobId, decision);
    toast(
      decision === "interested"
        ? "Marked interested"
        : decision === "save"
          ? "Saved"
          : "Skipped",
      decision === "skip" ? "default" : "success",
    );
  };

  // Keyboard shortcuts: ← skip, → interested, ↑ save, Enter details.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA") return;
      if (document.querySelector('[role="dialog"]')) return; // modal open
      if (!queue[0]) return;
      if (e.key === "ArrowLeft") deckRef.current?.swipe("left");
      else if (e.key === "ArrowRight") deckRef.current?.swipe("right");
      else if (e.key === "ArrowUp") deckRef.current?.swipe("up");
      else if (e.key === "Enter") openDetail(queue[0]);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [queue, openDetail]);

  const reviewed = metrics.reviewed;
  const total = metrics.total;

  return (
    <SwipeShell flush headerActions={<JobFilterButton />}>
      {/* Progress */}
      <div className="flex min-h-0 flex-1 flex-col">
        {/* Progress */}
        <div className="mb-4 shrink-0">
          <div className="flex items-center justify-between text-xs text-muted">
            <span>
              {hydrated ? `${reviewed} of ${total} jobs reviewed` : "Loading…"}
            </span>
            <span className="flex items-center gap-1 text-accent">
              <Sparkles className="size-3" />
              {metrics.recommended} recommended
            </span>
          </div>
          <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-elevated">
            <div
              className="h-full rounded-full bg-primary transition-all"
              style={{ width: `${total ? (reviewed / total) * 100 : 0}%` }}
            />
          </div>

          {/* Manual, cost-controlled AI scoring of the first 10 real jobs. */}
          {hydrated && source === "sql-server" && jobs.length > 0 && (
            <div className="mt-3">
              <Button
                onClick={handleScoreTop}
                disabled={scoring}
                className="w-full sm:w-auto"
              >
                {scoring ? (
                  <Loader2 className="size-4 animate-spin" />
                ) : (
                  <Sparkles className="size-4" />
                )}
                {scoring
                  ? `Scoring top ${SCORE_TOP_N}…`
                  : `Score top ${SCORE_TOP_N} jobs with AI`}
              </Button>
            </div>
          )}
        </div>

        {/* Live-feed error → we fell back to mock jobs. */}
        {error && (
          <div className="mb-4 shrink-0 rounded-lg border-2 border-[var(--caution)]/40 bg-[var(--caution)]/10 px-4 py-2.5 text-xs text-[var(--caution)]">
            Couldn&apos;t load live jobs ({error}). Showing sample jobs instead.
          </div>
        )}

        {!hydrated || filtering ? (
          <div className="flex min-h-0 flex-1 items-center justify-center">
            <Skeleton className="h-[31rem] w-full max-w-[600px] rounded-lg sm:h-[33rem] md:max-w-[640px] lg:h-[35rem] lg:max-w-[680px]" />
          </div>
        ) : jobs.length === 0 ? (
          <div className="flex min-h-0 flex-1 items-center justify-center">
            <EmptyState
              icon={Inbox}
              title={
                activeFilterCount > 0
                  ? "You've reviewed all jobs matching these filters"
                  : "You're all caught up"
              }
              description={
                activeFilterCount > 0
                  ? "Try clearing filters or check back later for new jobs."
                  : "Check back later for new jobs."
              }
            />
          </div>
        ) : queue.length === 0 ? (
          <div className="flex min-h-0 flex-1 items-center justify-center">
            <EmptySummary
              reviewed={reviewed}
              interested={metrics.interested}
              skipped={metrics.skipped}
              saved={metrics.saved}
              recommended={metrics.recommended}
            />
          </div>
        ) : (
          <>
            <div className="flex min-h-0 flex-1 items-center justify-center">
              <SwipeDeck
                ref={deckRef}
                queue={queue}
                onDecision={handleDecision}
                onDetails={openDetail}
              />
            </div>

            <div className="mx-auto mt-5 w-full max-w-[600px] shrink-0 md:max-w-[640px] lg:max-w-[680px]">
              <SwipeActionButtons
                onSkip={() => deckRef.current?.swipe("left")}
                onSave={() => deckRef.current?.swipe("up")}
                onInterested={() => deckRef.current?.swipe("right")}
                onDetails={() => top && openDetail(top)}
                onReviewApply={() => top && openApply(top)}
              />
              <p className="mt-3 text-center text-xs text-muted-foreground">
                Swipe or use ← skip · → interested · ↑ save · Enter for details
              </p>
            </div>
          </>
        )}
      </div>
    </SwipeShell>
  );
}

function EmptySummary({
  reviewed,
  interested,
  skipped,
  saved,
  recommended,
}: {
  reviewed: number;
  interested: number;
  skipped: number;
  saved: number;
  recommended: number;
}) {
  const stats = [
    { label: "Reviewed", value: reviewed },
    { label: "Interested", value: interested },
    { label: "Saved", value: saved },
    { label: "Skipped", value: skipped },
  ];
  return (
    <Card className="mx-auto max-w-md p-8 text-center">
      <div className="mx-auto flex size-14 items-center justify-center rounded-full bg-primary-soft text-accent">
        <PartyPopper className="size-7" />
      </div>
      <h2 className="mt-4 text-xl font-semibold">You&apos;re all caught up</h2>
      <p className="mt-1 text-sm text-muted">
        You reviewed every job in the feed. Found {recommended} high-fit roles.
      </p>

      <div className="mt-6 grid grid-cols-2 gap-3">
        {stats.map((s) => (
          <div
            key={s.label}
            className="rounded-lg border border-border bg-surface p-4"
          >
            <div className="text-2xl font-semibold tabular-nums">{s.value}</div>
            <div className="text-xs text-muted-foreground">{s.label}</div>
          </div>
        ))}
      </div>

      <div className="mt-6 flex flex-col gap-2">
        <Link href="/applications">
          <Button className="w-full">
            <Bookmark className="size-4" />
            Review interested jobs
          </Button>
        </Link>
        <Link href="/dashboard">
          <Button variant="secondary" className="w-full">
            View dashboard
          </Button>
        </Link>
      </div>
    </Card>
  );
}
