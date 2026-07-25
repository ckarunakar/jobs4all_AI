"use client";

import { CompanyLogo } from "./CompanyLogo";
import { ScoreBadge } from "@/components/jobs/ScoreBadge";
import { Select } from "@/components/ui/select";
import { SWIPE_PIPELINE_COLUMNS, SWIPE_STATUS_LABELS } from "@/lib/swipe/status";
import { swipeJobScore } from "@/lib/swipe/jobScore";
import { useSwipeStore } from "@/lib/swipe/swipeStore";
import { useSwipeInteractions } from "./SwipeInteractionsProvider";
import type { SwipeJob, SwipeJobStatus } from "@/types/swipe";

const NEXT_ACTION: Record<SwipeJobStatus, string> = {
  new: "Swipe to decide",
  interested: "Review & apply",
  saved: "Decide & move",
  ready: "Apply now",
  applied: "Await response",
  interview: "Prep interview",
  rejected: "Archive",
  skipped: "—",
};

const MOVE_OPTIONS: SwipeJobStatus[] = [
  "interested",
  "saved",
  "ready",
  "applied",
  "interview",
  "rejected",
  "skipped",
];

export function SwipePipelineBoard({ jobs }: { jobs: SwipeJob[] }) {
  const { setStatus } = useSwipeStore();
  const { openDetail } = useSwipeInteractions();

  return (
    <div className="flex gap-3 overflow-x-auto pb-4">
      {SWIPE_PIPELINE_COLUMNS.map((col) => {
        const items = jobs.filter((j) => j.status === col.key);
        return (
          <div
            key={col.key}
            className="flex w-64 shrink-0 flex-col rounded-lg border border-border bg-surface/50"
          >
            <div className="flex items-center justify-between border-b border-border px-3 py-2.5">
              <div className="flex items-center gap-2">
                <span
                  className="size-2 rounded-full"
                  style={{ backgroundColor: col.color }}
                />
                <span className="text-sm font-medium">{col.label}</span>
              </div>
              <span className="rounded-full bg-elevated px-2 py-0.5 text-xs font-medium text-muted tabular-nums">
                {items.length}
              </span>
            </div>

            <div className="flex-1 space-y-2 p-2.5">
              {items.length === 0 ? (
                <p className="py-5 text-center text-xs text-muted-foreground">
                  Empty
                </p>
              ) : (
                items.map((job) => (
                  <div
                    key={job.id}
                    className="rounded-lg border border-border bg-card p-2.5"
                  >
                    <button
                      onClick={() => openDetail(job)}
                      className="flex w-full items-start gap-2 text-left"
                    >
                      <CompanyLogo
                        company={job.company}
                        color={job.companyLogo}
                        size={30}
                      />
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-medium leading-tight">
                          {job.title}
                        </p>
                        <p className="truncate text-xs text-muted">
                          {job.company}
                        </p>
                      </div>
                    </button>
                    <div className="mt-2 flex items-center justify-between">
                      <ScoreBadge score={swipeJobScore(job)} />
                      <span className="text-[11px] text-muted-foreground">
                        {NEXT_ACTION[job.status]}
                      </span>
                    </div>
                    <Select
                      className="mt-2 h-8 text-xs"
                      value={job.status}
                      onChange={(e) =>
                        setStatus(job.id, e.target.value as SwipeJobStatus)
                      }
                      aria-label="Move job"
                    >
                      {MOVE_OPTIONS.map((s) => (
                        <option key={s} value={s}>
                          Move to: {SWIPE_STATUS_LABELS[s]}
                        </option>
                      ))}
                    </Select>
                  </div>
                ))
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}
