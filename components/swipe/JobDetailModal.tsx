"use client";

import {
  AlertTriangle,
  Bookmark,
  Check,
  CircleSlash,
  FileText,
  Lightbulb,
  ListChecks,
  Send,
  ShieldCheck,
  Sparkles,
  ThumbsUp,
  X,
} from "lucide-react";
import { Dialog } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { CompanyLogo } from "./CompanyLogo";
import { ScoreMeter } from "./ScoreMeter";
import { TagPill } from "./TagPill";
import { ScoreBreakdown } from "@/components/jobs/ScoreBreakdown";
import { getNextAction } from "@/lib/careerOps/scoreUtils";
import { SWIPE_REMOTE_LABELS, SWIPE_ROLE_LABELS } from "@/types/swipe";
import type { SwipeJob } from "@/types/swipe";
import type { CareerOpsScoreBreakdown } from "@/lib/careerOps/types";

interface JobDetailModalProps {
  job: SwipeJob | null;
  open: boolean;
  onClose: () => void;
  onSave: (job: SwipeJob) => void;
  onSkip: (job: SwipeJob) => void;
  onInterested: (job: SwipeJob) => void;
  onReviewApply: (job: SwipeJob) => void;
}

const REC_LABELS: Record<string, string> = {
  apply_immediately: "Apply now",
  worth_applying: "Worth applying",
  maybe: "Maybe",
  against: "Skip",
};

const AI_DIMENSION_LABELS: Record<string, string> = {
  skillMatch: "Skill match",
  experienceLevel: "Experience level",
  roleAlignment: "Role alignment",
  locationFit: "Location fit",
  growthPotential: "Growth potential",
  companyLegitimacy: "Company legitimacy",
  redFlags: "Red flags (higher = fewer)",
};

/** Map the AI score's dimension map into the shared ScoreBreakdown shape. */
function dimensionsToBreakdown(
  dimensions: Record<string, number>,
  global: number,
): CareerOpsScoreBreakdown {
  const entries = Object.entries(dimensions).filter(
    ([, value]) => typeof value === "number",
  );
  return {
    global,
    items: entries.map(([key, score]) => ({
      key,
      label: AI_DIMENSION_LABELS[key] ?? key,
      score,
      weight: 1 / entries.length,
    })),
  };
}

function Section({
  icon: Icon,
  title,
  children,
}: {
  icon: typeof Sparkles;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="border-t border-border pt-5">
      <h3 className="flex items-center gap-2 text-sm font-semibold">
        <Icon className="size-4 text-accent" />
        {title}
      </h3>
      <div className="mt-3">{children}</div>
    </section>
  );
}

export function JobDetailModal({
  job,
  open,
  onClose,
  onSave,
  onSkip,
  onInterested,
  onReviewApply,
}: JobDetailModalProps) {
  if (!job) return null;

  const ai = job.careerOpsScore;
  const breakdown =
    ai?.dimensions && Object.keys(ai.dimensions).length > 0
      ? dimensionsToBreakdown(ai.dimensions, ai.score)
      : null;

  return (
    <Dialog open={open} onClose={onClose} side="right">
      {/* Header */}
      <div className="flex items-start gap-3">
        <CompanyLogo company={job.company} color={job.companyLogo} size={52} />
        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium text-muted">{job.company}</p>
          <h2 className="mt-0.5 text-xl font-semibold leading-tight tracking-tight">
            {job.title}
          </h2>
          <div className="mt-2 flex flex-wrap items-center gap-1.5">
            <Badge variant="primary">{SWIPE_ROLE_LABELS[job.roleType]}</Badge>
            <Badge variant="outline">{SWIPE_REMOTE_LABELS[job.remoteType]}</Badge>
            <Badge variant="default" className="text-muted-foreground">
              {job.location}
            </Badge>
          </div>
        </div>
      </div>

      {/* Score */}
      <div className="mt-5 rounded-2xl border border-border bg-surface p-4">
        {ai ? (
          <>
            <div className="mb-2 flex items-center gap-1.5 text-xs font-medium text-accent">
              <Sparkles className="size-3" /> AI scored
            </div>
            <ScoreMeter score={ai.score} />
            <div className="mt-3 flex flex-wrap items-center gap-1.5">
              <Badge variant="primary">
                {REC_LABELS[ai.recommendation] ?? ai.recommendation}
              </Badge>
              <Badge variant="outline">{ai.label}</Badge>
            </div>
            {ai.summary && (
              <p className="mt-3 text-sm text-muted">{ai.summary}</p>
            )}
          </>
        ) : (
          <div className="py-2 text-center">
            <p className="text-sm font-medium">Not scored yet</p>
            <p className="mt-1 text-xs text-muted-foreground">
              Use “Score top jobs with AI” on the swipe screen to compare this
              job against your uploaded resume.
            </p>
          </div>
        )}
      </div>

      <div className="mt-6 space-y-5">
        {breakdown && (
          <Section icon={Sparkles} title="Score breakdown">
            <ScoreBreakdown breakdown={breakdown} />
          </Section>
        )}

        {ai && (
          <Section icon={Lightbulb} title="Suggested action">
            <p className="text-sm text-muted">{getNextAction(ai.score)}</p>
          </Section>
        )}

        {ai && ai.pros.length > 0 && (
          <Section icon={ThumbsUp} title="Why this role matches you">
            <ul className="space-y-2">
              {ai.pros.map((s) => (
                <li key={s} className="flex items-start gap-2 text-sm">
                  <ThumbsUp className="mt-0.5 size-3.5 shrink-0 text-[var(--recommended)]" />
                  <span className="text-muted">{s}</span>
                </li>
              ))}
            </ul>
          </Section>
        )}

        {ai && (ai.cons.length > 0 || ai.warnings.length > 0) && (
          <Section icon={AlertTriangle} title="Gaps & warnings">
            <ul className="space-y-2">
              {ai.warnings.map((w) => (
                <li
                  key={w}
                  className="flex items-start gap-2 text-sm text-[var(--caution)]"
                >
                  <AlertTriangle className="mt-0.5 size-3.5 shrink-0" />
                  <span>{w}</span>
                </li>
              ))}
              {ai.cons.map((g) => (
                <li key={g} className="flex items-start gap-2 text-sm">
                  <CircleSlash className="mt-0.5 size-3.5 shrink-0 text-muted-foreground" />
                  <span className="text-muted">{g}</span>
                </li>
              ))}
            </ul>
          </Section>
        )}

        {job.requiredSkills.length > 0 && (
          <Section icon={ListChecks} title="Required skills">
            <div className="flex flex-wrap gap-1.5">
              {job.requiredSkills.map((s) => (
                <TagPill key={s} tone="primary">
                  {s}
                </TagPill>
              ))}
            </div>
          </Section>
        )}

        <Section icon={ShieldCheck} title="Location & work authorization">
          <p className="text-sm text-muted">
            {job.location} · {SWIPE_REMOTE_LABELS[job.remoteType]}. Confirm this
            role&apos;s work-authorization requirements during Review &amp;
            Apply.
          </p>
        </Section>

        <Section icon={FileText} title="Job description">
          <p className="whitespace-pre-line text-sm leading-relaxed text-muted">
            {job.description}
          </p>
        </Section>
      </div>

      {/* Sticky actions */}
      <div className="sticky bottom-0 -mx-5 mt-6 space-y-2 border-t border-border bg-card px-5 pt-4">
        <Button className="w-full" onClick={() => onReviewApply(job)}>
          <Send className="size-4" />
          Review &amp; Apply
        </Button>
        <div className="flex items-center gap-2">
          <Button
            variant="secondary"
            className="flex-1"
            onClick={() => onInterested(job)}
          >
            <Check className="size-4" />
            Interested
          </Button>
          <Button variant="secondary" onClick={() => onSave(job)}>
            <Bookmark className="size-4" />
            Save
          </Button>
          <Button variant="danger" onClick={() => onSkip(job)}>
            <X className="size-4" />
            Skip
          </Button>
        </div>
      </div>
    </Dialog>
  );
}
