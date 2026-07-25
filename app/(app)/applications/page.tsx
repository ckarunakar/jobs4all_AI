"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { Inbox, SlidersHorizontal } from "lucide-react";
import { SwipeShell } from "@/components/swipe/SwipeShell";
import { SwipePipelineBoard } from "@/components/swipe/SwipePipelineBoard";
import { EmptyState } from "@/components/shared/EmptyState";
import { Select } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { useSwipeStore } from "@/lib/swipe/swipeStore";
import { swipeJobScore } from "@/lib/swipe/jobScore";
import { RECOMMEND_THRESHOLD } from "@/lib/careerOps/scoreUtils";
import { SWIPE_ROLE_LABELS } from "@/types/swipe";
import type { SwipeJobStatus, SwipeRoleType } from "@/types/swipe";

type ScoreFilter = "all" | "excellent" | "recommended" | "review";
const SCORE_MIN: Record<ScoreFilter, number> = {
  all: 0,
  excellent: 4.5,
  recommended: RECOMMEND_THRESHOLD,
  review: 2.5,
};

export default function Demo2ApplicationsPage() {
  const { jobs, hydrated } = useSwipeStore();
  const [status, setStatus] = useState<"all" | SwipeJobStatus>("all");
  const [score, setScore] = useState<ScoreFilter>("all");
  const [roleType, setRoleType] = useState<"all" | SwipeRoleType>("all");

  // Tracker shows only jobs the user has acted on (not still in the deck).
  const tracked = useMemo(
    () =>
      jobs.filter((j) => {
        if (j.status === "new") return false;
        if (status !== "all" && j.status !== status) return false;
        if (roleType !== "all" && j.roleType !== roleType) return false;
        if (swipeJobScore(j) < SCORE_MIN[score]) return false;
        return true;
      }),
    [jobs, status, score, roleType],
  );

  const hasAny = jobs.some((j) => j.status !== "new");

  return (
    <SwipeShell
      title="Applications"
      description="Track every job you've acted on — you stay in control"
    >
      <div className="space-y-4">
        {/* Filters */}
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex items-center gap-1.5 text-xs text-muted">
            <SlidersHorizontal className="size-3.5" />
            Filters
          </div>
          <Select
            className="h-9 w-auto min-w-[8rem]"
            value={status}
            onChange={(e) =>
              setStatus(e.target.value as "all" | SwipeJobStatus)
            }
          >
            <option value="all">All statuses</option>
            <option value="interested">Interested</option>
            <option value="saved">Saved</option>
            <option value="ready">Ready to Apply</option>
            <option value="applied">Applied</option>
            <option value="interview">Interview</option>
            <option value="rejected">Rejected / Archived</option>
            <option value="skipped">Skipped</option>
          </Select>
          <Select
            className="h-9 w-auto min-w-[8rem]"
            value={score}
            onChange={(e) => setScore(e.target.value as ScoreFilter)}
          >
            <option value="all">Any score</option>
            <option value="excellent">Excellent (4.5+)</option>
            <option value="recommended">Recommended (3.5+)</option>
            <option value="review">Review (2.5+)</option>
          </Select>
          <Select
            className="h-9 w-auto min-w-[7.5rem]"
            value={roleType}
            onChange={(e) =>
              setRoleType(e.target.value as "all" | SwipeRoleType)
            }
          >
            <option value="all">All roles</option>
            {(Object.keys(SWIPE_ROLE_LABELS) as SwipeRoleType[]).map((r) => (
              <option key={r} value={r}>
                {SWIPE_ROLE_LABELS[r]}
              </option>
            ))}
          </Select>
        </div>

        {!hydrated ? (
          <div className="flex gap-3 overflow-hidden">
            {[0, 1, 2, 3].map((i) => (
              <Skeleton key={i} className="h-72 w-64 shrink-0" />
            ))}
          </div>
        ) : !hasAny ? (
          <EmptyState
            icon={Inbox}
            title="No applications yet"
            description="Swipe right on jobs you're interested in and they'll show up here."
            action={
              <Link href="/swipe">
                <Button>Start swiping</Button>
              </Link>
            }
          />
        ) : (
          <SwipePipelineBoard jobs={tracked} />
        )}
      </div>
    </SwipeShell>
  );
}
