"use client";

import { useSwipeStore } from "@/lib/swipe/swipeStore";

/** Shown when the server-side pipeline failed to load (feed still works). */
export function PipelineErrorBanner() {
  const { pipelineError } = useSwipeStore();
  if (!pipelineError) return null;
  return (
    <div className="rounded-lg border-2 border-[var(--caution)]/40 bg-[var(--caution)]/10 px-4 py-2.5 text-xs text-[var(--caution)]">
      Couldn&apos;t load your saved pipeline ({pipelineError}) — refresh to
      retry.
    </div>
  );
}
