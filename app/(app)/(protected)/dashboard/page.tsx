"use client";

import { useMemo } from "react";
import Link from "next/link";
import {
  Bookmark,
  CheckCircle2,
  GalleryHorizontalEnd,
  Send,
  Sparkles,
  Star,
  ThumbsUp,
} from "lucide-react";
import { SwipeShell } from "@/components/swipe/SwipeShell";
import { StatCard } from "@/components/dashboard/StatCard";
import { FitScoreCard } from "@/components/dashboard/FitScoreCard";
import { ProfileCompletionCard } from "@/components/swipe/ProfileCompletionCard";
import { PipelineErrorBanner } from "@/components/shared/PipelineErrorBanner";
import { SwipeJobRow } from "@/components/swipe/SwipeJobRow";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { useSwipeStore } from "@/lib/swipe/swipeStore";
import { swipeJobScore } from "@/lib/swipe/jobScore";
import { useSwipeInteractions } from "@/components/swipe/SwipeInteractionsProvider";
import { RECOMMEND_THRESHOLD } from "@/lib/careerOps/scoreUtils";

export default function DashboardPage() {
  const { jobs, metrics, hydrated } = useSwipeStore();
  const { openDetail } = useSwipeInteractions();

  const scored = useMemo(
    () => ({
      count: jobs.filter((j) => j.careerOpsScore).length,
      recommended: jobs.filter((j) => swipeJobScore(j) >= RECOMMEND_THRESHOLD)
        .length,
      average: jobs.length
        ? jobs.reduce((s, j) => s + swipeJobScore(j), 0) / jobs.length
        : 0,
    }),
    [jobs],
  );

  const topRecommended = useMemo(
    () =>
      [...jobs]
        .filter((j) => swipeJobScore(j) >= RECOMMEND_THRESHOLD)
        .sort((a, b) => swipeJobScore(b) - swipeJobScore(a))
        .slice(0, 5),
    [jobs],
  );

  const interestedJobs = useMemo(
    () => jobs.filter((j) => j.status === "interested" || j.status === "saved"),
    [jobs],
  );

  return (
    <SwipeShell
      title="Dashboard"
      description="Your swipe activity and high-fit roles"
    >
      <div className="space-y-5">
        <PipelineErrorBanner />
        {/* Stats */}
        <div className="grid grid-cols-2 gap-3">
          {!hydrated ? (
            [0, 1, 2, 3].map((i) => <Skeleton key={i} className="h-[108px]" />)
          ) : (
            <>
              <StatCard
                label="Jobs swiped"
                value={metrics.reviewed}
                icon={GalleryHorizontalEnd}
                accent="info"
              />
              <StatCard
                label="Interested"
                value={metrics.interested}
                icon={ThumbsUp}
                accent="primary"
              />
              <StatCard
                label="Saved"
                value={metrics.saved}
                icon={Bookmark}
                accent="info"
              />
              <StatCard
                label="Applied"
                value={metrics.applied}
                icon={Send}
                accent="recommended"
              />
              <StatCard
                label="Average fit"
                value={scored.average.toFixed(1)}
                hint="out of 5.0"
                icon={Star}
                accent="caution"
              />
              <StatCard
                label="High-fit found"
                value={scored.recommended}
                hint={`≥ ${RECOMMEND_THRESHOLD.toFixed(1)}`}
                icon={CheckCircle2}
                accent="excellent"
              />
            </>
          )}
        </div>

        {/* Today's activity */}
        <Card>
          <CardHeader className="flex-row items-center justify-between">
            <CardTitle>Today&apos;s swipe activity</CardTitle>
            <Link
              href="/swipe"
              className="flex items-center gap-1 text-xs font-medium text-accent hover:underline"
            >
              Keep swiping
              <Sparkles className="size-3" />
            </Link>
          </CardHeader>
          <CardContent>
            <div className="flex items-center justify-around rounded-lg border border-border bg-surface py-4 text-center">
              <Activity label="Interested" value={metrics.interested} />
              <Activity label="Saved" value={metrics.saved} />
              <Activity label="Skipped" value={metrics.skipped} />
              <Activity label="Remaining" value={metrics.total - metrics.reviewed} />
            </div>
          </CardContent>
        </Card>

        {/* Top recommended */}
        <Card>
          <CardHeader className="flex-row items-center justify-between">
            <CardTitle>Top recommended jobs</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {!hydrated ? (
              [0, 1, 2].map((i) => <Skeleton key={i} className="h-14" />)
            ) : topRecommended.length === 0 ? (
              <p className="py-4 text-center text-sm text-muted">
                No recommended jobs yet.
              </p>
            ) : (
              topRecommended.map((job) => (
                <SwipeJobRow key={job.id} job={job} onClick={openDetail} />
              ))
            )}
          </CardContent>
        </Card>

        {/* Your pipeline (interested + saved) */}
        {interestedJobs.length > 0 && (
          <Card>
            <CardHeader className="flex-row items-center justify-between">
              <CardTitle>Your pipeline</CardTitle>
              <Link
                href="/applications"
                className="text-xs font-medium text-accent hover:underline"
              >
                View tracker
              </Link>
            </CardHeader>
            <CardContent className="space-y-2">
              {interestedJobs.slice(0, 4).map((job) => (
                <SwipeJobRow
                  key={job.id}
                  job={job}
                  onClick={openDetail}
                  showStatus
                />
              ))}
            </CardContent>
          </Card>
        )}

        {/* Scoring + readiness */}
        <FitScoreCard />
        <ProfileCompletionCard />

        <Link href="/swipe" className="block">
          <Button className="w-full" size="lg">
            <GalleryHorizontalEnd className="size-4" />
            Back to swipe feed
          </Button>
        </Link>
      </div>
    </SwipeShell>
  );
}

function Activity({ label, value }: { label: string; value: number }) {
  return (
    <div>
      <div className="text-2xl font-semibold tabular-nums">{value}</div>
      <div className="text-xs text-muted-foreground">{label}</div>
    </div>
  );
}
