import type { SwipeJobStatus } from "@/types/swipe";

export const SWIPE_STATUS_LABELS: Record<SwipeJobStatus, string> = {
  new: "New",
  interested: "Interested",
  saved: "Saved",
  ready: "Ready to Apply",
  applied: "Applied",
  interview: "Interview",
  rejected: "Rejected / Archived",
  skipped: "Skipped",
};

/** Badge variant for each status (maps to ui/badge variants). */
export const SWIPE_STATUS_VARIANT: Record<
  SwipeJobStatus,
  "default" | "info" | "primary" | "recommended" | "excellent" | "caution" | "danger"
> = {
  new: "default",
  interested: "primary",
  saved: "info",
  ready: "caution",
  applied: "recommended",
  interview: "excellent",
  rejected: "danger",
  skipped: "default",
};

/** Columns for the applications tracker / pipeline board. */
export const SWIPE_PIPELINE_COLUMNS: {
  key: SwipeJobStatus;
  label: string;
  color: string;
}[] = [
  { key: "interested", label: "Interested", color: "var(--primary)" },
  { key: "saved", label: "Saved", color: "var(--info)" },
  { key: "ready", label: "Ready to Apply", color: "var(--caution)" },
  { key: "applied", label: "Applied", color: "var(--recommended)" },
  { key: "interview", label: "Interview", color: "var(--excellent)" },
  { key: "rejected", label: "Rejected / Archived", color: "var(--danger)" },
  { key: "skipped", label: "Skipped", color: "var(--low)" },
];
