"use client";

import { useState } from "react";
import {
  AlertTriangle,
  Check,
  ChevronUp,
  DollarSign,
  MapPin,
  Radio,
  Sparkles,
  ThumbsUp,
  X,
} from "lucide-react";
import { CompanyLogo } from "./CompanyLogo";
import { ScoreMeter } from "./ScoreMeter";
import { TagPill } from "./TagPill";
import { Badge } from "@/components/ui/badge";
import { SWIPE_REMOTE_LABELS, SWIPE_ROLE_LABELS } from "@/types/swipe";
import type { SwipeJob } from "@/types/swipe";
import { cn } from "@/lib/utils/cn";

interface SwipeJobCardProps {
  job: SwipeJob;
  onDetails?: () => void;
  /** Drag hint from the deck: shows a translucent INTERESTED / SKIP stamp. */
  dragHint?: "interested" | "skip" | null;
}

export function SwipeJobCard({ job, onDetails, dragHint }: SwipeJobCardProps) {
  // Real Career-Ops AI score when scored, else the neutral placeholder values.
  const ai = job.careerOpsScore;
  const score = ai?.score ?? job.score;
  const strengths = ai?.pros ?? job.strengths;
  const warning =
    ai?.warnings?.[0] ??
    job.cautionFlags[0] ??
    (job.gaps[0] ? `Gap: ${job.gaps[0]}` : null);

  // Descriptions vary wildly in length; keep the card a stable height and let
  // the user expand long ones in place.
  const description = job.description ?? "";
  const isLongDescription = description.length > 400;
  const [descExpanded, setDescExpanded] = useState(false);

  return (
    <div className="relative flex min-h-[28rem] select-none flex-col overflow-hidden rounded-lg border-2 border-border-strong bg-card sm:min-h-[30rem]">
      {/* Flat solid brand band (no gradients/shadows). */}
      <div
        className="pointer-events-none absolute inset-x-0 top-0 h-2"
        style={{ backgroundColor: job.companyLogo }}
      />

      {/* Drag stamps */}
      <Stamp show={dragHint === "interested"} tone="interested" label="INTERESTED" />
      <Stamp show={dragHint === "skip"} tone="skip" label="SKIP" />

      <div className="relative flex flex-1 flex-col p-5">
        {/* Header */}
        <div className="flex items-start gap-3">
          <CompanyLogo company={job.company} color={job.companyLogo} size={52} />
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-medium text-muted">
              {job.company}
            </p>
            <h2 className="mt-0.5 text-xl font-bold leading-tight tracking-tight">
              {job.title}
            </h2>
          </div>
          {onDetails && (
            <button
              onClick={onDetails}
              className="flex items-center gap-1 rounded-full border border-border bg-elevated px-2.5 py-1 text-xs text-muted hover:text-foreground"
            >
              <ChevronUp className="size-3.5" />
              Details
            </button>
          )}
        </div>

        {/* Meta row */}
        <div className="mt-3 flex flex-wrap items-center gap-1.5">
          <Badge variant="primary">{SWIPE_ROLE_LABELS[job.roleType]}</Badge>
          <Badge variant="outline">
            <MapPin className="size-3" />
            {SWIPE_REMOTE_LABELS[job.remoteType]}
          </Badge>
          <Badge variant="default" className="text-muted-foreground">
            <MapPin className="size-3" />
            {job.location}
          </Badge>
          {job.compensation && (
            <Badge variant="default" className="text-muted-foreground">
              <DollarSign className="size-3" />
              {job.compensation}
            </Badge>
          )}
        </div>

        {/* Score */}
        <div className="mt-4 rounded-2xl border border-border bg-surface p-4">
          <div className="mb-1.5 flex items-center justify-end">
            {ai ? (
              <span className="flex items-center gap-1 text-[11px] font-medium text-accent">
                <Sparkles className="size-3" />
                AI scored
              </span>
            ) : (
              <span className="text-[11px] font-medium text-muted-foreground">
                Not scored yet
              </span>
            )}
          </div>
          <ScoreMeter score={score} />
        </div>

        {/* Match reasons (AI/mock) — or the job description for real, unscored jobs */}
        {strengths.length > 0 ? (
          <div className="mt-4 space-y-1.5">
            {strengths.slice(0, 3).map((s) => (
              <div key={s} className="flex items-start gap-2 text-sm">
                <ThumbsUp className="mt-0.5 size-4 shrink-0 text-[var(--recommended)]" />
                <span className="text-muted">{s}</span>
              </div>
            ))}
          </div>
        ) : description ? (
          <div className="mt-4">
            {descExpanded ? (
              // Full text, capped to a scrollable region so the card stays sane.
              // stopPropagation lets you scroll without triggering a swipe.
              <div
                onPointerDown={(e) => e.stopPropagation()}
                className="max-h-[18rem] overflow-y-auto pr-1"
              >
                <p className="whitespace-pre-line text-sm leading-relaxed text-muted">
                  {description}
                </p>
              </div>
            ) : (
              <p className="line-clamp-[9] whitespace-pre-line text-sm leading-relaxed text-muted">
                {description}
              </p>
            )}
            {isLongDescription && (
              <button
                type="button"
                onPointerDown={(e) => e.stopPropagation()}
                onClick={(e) => {
                  e.stopPropagation();
                  setDescExpanded((v) => !v);
                }}
                className="mt-1.5 text-xs font-semibold text-accent hover:underline"
              >
                {descExpanded ? "Read less" : "Read more"}
              </button>
            )}
          </div>
        ) : (
          <p className="mt-4 text-sm italic text-muted-foreground">
            No description provided.
          </p>
        )}

        {/* Caution / warning */}
        {warning && (
          <div className="mt-3 flex items-start gap-2 text-sm text-[var(--caution)]">
            <AlertTriangle className="mt-0.5 size-4 shrink-0" />
            <span>{warning}</span>
          </div>
        )}

        {/* Tags */}
        <div className="mt-auto flex flex-wrap gap-1.5 pt-4">
          {job.tags.slice(0, 4).map((t) => (
            <TagPill key={t}>{t}</TagPill>
          ))}
        </div>

        {/* Source */}
        <div className="mt-3 flex items-center gap-1.5 text-xs text-muted-foreground">
          <Radio className="size-3" />
          {job.source}
        </div>
      </div>
    </div>
  );
}

function Stamp({
  show,
  tone,
  label,
}: {
  show: boolean;
  tone: "interested" | "skip";
  label: string;
}) {
  const isInterested = tone === "interested";
  return (
    <div
      className={cn(
        "pointer-events-none absolute top-8 z-10 rotate-[-12deg] rounded-lg border-2 px-4 py-1.5 text-lg font-extrabold tracking-wider transition-opacity",
        isInterested
          ? "left-6 border-[var(--recommended)] text-[var(--recommended)] rotate-[-12deg]"
          : "right-6 border-[var(--danger)] text-[var(--danger)] rotate-[12deg]",
        show ? "opacity-100" : "opacity-0",
      )}
    >
      <span className="flex items-center gap-1.5">
        {isInterested ? <Check className="size-5" /> : <X className="size-5" />}
        {label}
      </span>
    </div>
  );
}
