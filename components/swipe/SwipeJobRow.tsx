"use client";

import { ChevronRight } from "lucide-react";
import { CompanyLogo } from "./CompanyLogo";
import { ScoreBadge } from "@/components/jobs/ScoreBadge";
import { Badge } from "@/components/ui/badge";
import { SWIPE_STATUS_LABELS, SWIPE_STATUS_VARIANT } from "@/lib/swipe/status";
import { swipeJobScore } from "@/lib/swipe/jobScore";
import type { SwipeJob } from "@/types/swipe";

/** Compact clickable job row for dashboard + tracker lists. */
export function SwipeJobRow({
  job,
  onClick,
  showStatus,
}: {
  job: SwipeJob;
  onClick: (job: SwipeJob) => void;
  showStatus?: boolean;
}) {
  return (
    <button
      onClick={() => onClick(job)}
      className="group flex w-full items-center gap-3 rounded-lg border border-border bg-surface px-3 py-2.5 text-left transition-colors hover:border-border-strong hover:bg-card-hover"
    >
      <CompanyLogo company={job.company} color={job.companyLogo} size={36} />
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium">{job.title}</p>
        <p className="truncate text-xs text-muted">
          {job.company} · {job.location}
        </p>
      </div>
      {showStatus && (
        <Badge variant={SWIPE_STATUS_VARIANT[job.status]}>
          {SWIPE_STATUS_LABELS[job.status]}
        </Badge>
      )}
      <ScoreBadge score={swipeJobScore(job)} />
      <ChevronRight className="size-4 text-muted-foreground transition-transform group-hover:translate-x-0.5" />
    </button>
  );
}
