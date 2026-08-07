"use client";

import { createContext, useContext, useState } from "react";
import { JobDetailModal } from "./JobDetailModal";
import { ApplicationReviewModal } from "./ApplicationReviewModal";
import { useSwipeStore } from "@/lib/swipe/swipeStore";
import { useToast } from "@/components/ui/toast";
import type { SwipeJob } from "@/types/swipe";

interface SwipeInteractions {
  openDetail: (job: SwipeJob) => void;
  openApply: (job: SwipeJob) => void;
}

const Ctx = createContext<SwipeInteractions | null>(null);

/** Provides the detail + Review & Apply modals to every swipe page. */
export function SwipeInteractionsProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const { decide, jobs } = useSwipeStore();
  const { toast } = useToast();
  const [detailJob, setDetailJob] = useState<SwipeJob | null>(null);
  const [applyJob, setApplyJob] = useState<SwipeJob | null>(null);
  const [detailOpen, setDetailOpen] = useState(false);
  const [applyOpen, setApplyOpen] = useState(false);

  const openDetail = (job: SwipeJob) => {
    setDetailJob(job);
    setDetailOpen(true);
  };
  const openApply = (job: SwipeJob) => {
    setDetailOpen(false);
    setApplyJob(job);
    setApplyOpen(true);
  };

  // Resolve the live job from the store so scores that land after the modal
  // opened (scoreOneJob / a batch) show up instead of the stale snapshot.
  const liveDetailJob = detailJob
    ? (jobs.find((j) => j.id === detailJob.id) ?? detailJob)
    : null;

  return (
    <Ctx.Provider value={{ openDetail, openApply }}>
      {children}

      <JobDetailModal
        job={liveDetailJob}
        open={detailOpen}
        onClose={() => setDetailOpen(false)}
        onSave={(job) => {
          decide(job.id, "save");
          toast("Saved", "success");
          setDetailOpen(false);
        }}
        onSkip={(job) => {
          decide(job.id, "skip");
          toast("Skipped");
          setDetailOpen(false);
        }}
        onInterested={(job) => {
          decide(job.id, "interested");
          toast("Marked interested", "success");
          setDetailOpen(false);
        }}
        onReviewApply={openApply}
      />

      <ApplicationReviewModal
        job={applyJob}
        open={applyOpen}
        onClose={() => setApplyOpen(false)}
      />
    </Ctx.Provider>
  );
}

export function useSwipeInteractions(): SwipeInteractions {
  const ctx = useContext(Ctx);
  if (!ctx)
    throw new Error(
      "useSwipeInteractions must be used within a SwipeInteractionsProvider",
    );
  return ctx;
}
