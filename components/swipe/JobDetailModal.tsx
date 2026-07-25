"use client";

import { useEffect, useMemo } from "react";
import {
  AlertTriangle,
  Bookmark,
  Check,
  CircleSlash,
  FileText,
  Lightbulb,
  ListChecks,
  Loader2,
  RotateCw,
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
import { evaluateJobForUser } from "@/lib/careerOps/swipeAdapter";
import { getNextAction } from "@/lib/careerOps/scoreUtils";
import { useSwipeStore } from "@/lib/swipe/swipeStore";
import { swipeJobScore } from "@/lib/swipe/jobScore";
import { useScores } from "@/lib/scoring/scoresClient";
import { SWIPE_REMOTE_LABELS, SWIPE_ROLE_LABELS } from "@/types/swipe";
import type { SwipeJob } from "@/types/swipe";
import type {
  CareerOpsBlocks,
  JobEvaluationResult,
  ScoreDimensions,
} from "@/lib/scoring/types";
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
  apply_now: "Apply now",
  save_and_review: "Save & review",
  maybe: "Maybe",
  skip: "Skip",
};

const DIMENSION_LABELS: { key: keyof ScoreDimensions; label: string }[] = [
  { key: "cvMatch", label: "CV match" },
  { key: "roleAlignment", label: "Role alignment" },
  { key: "seniorityFit", label: "Seniority fit" },
  { key: "skillsFit", label: "Skills fit" },
  { key: "domainFit", label: "Domain fit" },
  { key: "compensationFit", label: "Compensation" },
  { key: "locationFit", label: "Location / work mode" },
  { key: "cultureFit", label: "Cultural signals" },
  { key: "redFlags", label: "Red flags (higher = fewer)" },
];

/** Map AI dimensions into the shared ScoreBreakdown shape. */
function dimensionsToBreakdown(
  dims: ScoreDimensions,
  global: number,
): CareerOpsScoreBreakdown {
  const items = DIMENSION_LABELS.filter(
    ({ key }) => dims[key] !== null && dims[key] !== undefined,
  ).map(({ key, label }) => ({
    key,
    label,
    score: dims[key] as number,
    weight: 1 / DIMENSION_LABELS.length,
  }));
  return { global, items };
}

const BLOCK_ORDER: { key: keyof CareerOpsBlocks; title: string }[] = [
  { key: "roleSummary", title: "A) Role Summary" },
  { key: "cvMatch", title: "B) Match With Candidate" },
  { key: "levelStrategy", title: "C) Level & Strategy" },
  { key: "compAndDemand", title: "D) Compensation & Demand" },
  { key: "customizationPlan", title: "E) Customization Plan" },
  { key: "interviewPlan", title: "F) Interview Plan" },
];

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
  const { profile } = useSwipeStore();
  const { getEntry, ensureScored, rescore } = useScores();

  // Ensure this job gets scored when the panel opens.
  useEffect(() => {
    if (open && job) ensureScored([job.id]);
  }, [open, job, ensureScored]);

  // Fallback breakdown (deterministic mock) until the AI score arrives.
  const fallback = useMemo(
    () => (job ? evaluateJobForUser(job, profile) : null),
    [job, profile],
  );

  if (!job || !fallback) return null;

  const entry = getEntry(job.id);
  const result: JobEvaluationResult | undefined = entry?.result;
  const reportBlocks = result?.careerOpsBlocks;
  const scoring = entry?.status === "scoring";
  const score = result?.score ?? swipeJobScore(job);
  const breakdown = result
    ? dimensionsToBreakdown(result.dimensions, score)
    : fallback.breakdown;

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
        <div className="mb-2 flex items-center justify-between">
          <span className="flex items-center gap-1.5 text-xs font-medium">
            {scoring ? (
              <span className="flex items-center gap-1 text-muted-foreground">
                <Loader2 className="size-3 animate-spin" /> AI scoring…
              </span>
            ) : result ? (
              <span className="flex items-center gap-1 text-accent">
                <Sparkles className="size-3" /> AI scored · {result.model}
              </span>
            ) : entry?.status === "error" ? (
              <span className="text-[var(--danger)]">Scoring failed</span>
            ) : null}
          </span>
          <button
            onClick={() => rescore(job.id)}
            className="flex items-center gap-1 text-xs font-medium text-muted hover:text-foreground"
          >
            <RotateCw className="size-3" /> Re-score
          </button>
        </div>
        <ScoreMeter score={score} />
        <div className="mt-3 flex flex-wrap items-center gap-1.5">
          {result && (
            <Badge variant="primary">{REC_LABELS[result.recommendation]}</Badge>
          )}
          {result && (
            <Badge variant="outline">Confidence: {result.confidence}</Badge>
          )}
        </div>
        <p className="mt-3 text-sm text-muted">
          {result?.cardSummary.headline ?? job.matchSummary}
        </p>
      </div>

      <div className="mt-6 space-y-5">
        <Section icon={Sparkles} title="Score breakdown (Career-Ops)">
          <ScoreBreakdown breakdown={breakdown} />
        </Section>

        <Section icon={Lightbulb} title="Suggested action">
          <p className="text-sm text-muted">{getNextAction(score)}</p>
        </Section>

        <Section icon={ThumbsUp} title="Why this role matches you">
          <ul className="space-y-2">
            {(result?.strengths ?? job.strengths).map((s) => (
              <li key={s} className="flex items-start gap-2 text-sm">
                <ThumbsUp className="mt-0.5 size-3.5 shrink-0 text-[var(--recommended)]" />
                <span className="text-muted">{s}</span>
              </li>
            ))}
          </ul>
        </Section>

        {/* Gaps */}
        {result ? (
          result.gaps.length > 0 && (
            <Section icon={AlertTriangle} title="Gaps & how to mitigate">
              <ul className="space-y-3">
                {result.gaps.map((g) => (
                  <li key={g.gap} className="text-sm">
                    <div className="flex items-start gap-2">
                      <CircleSlash className="mt-0.5 size-3.5 shrink-0 text-muted-foreground" />
                      <span className="font-medium">{g.gap}</span>
                      <Badge
                        variant={
                          g.severity === "blocker"
                            ? "danger"
                            : g.severity === "important"
                              ? "caution"
                              : "default"
                        }
                      >
                        {g.severity}
                      </Badge>
                    </div>
                    <p className="ml-5 mt-1 text-muted">{g.mitigation}</p>
                  </li>
                ))}
              </ul>
            </Section>
          )
        ) : (
          (job.gaps.length > 0 || job.cautionFlags.length > 0) && (
            <Section icon={AlertTriangle} title="Gaps & caution flags">
              <ul className="space-y-2">
                {job.cautionFlags.map((c) => (
                  <li
                    key={c}
                    className="flex items-start gap-2 text-sm text-[var(--caution)]"
                  >
                    <AlertTriangle className="mt-0.5 size-3.5 shrink-0" />
                    <span>{c}</span>
                  </li>
                ))}
                {job.gaps.map((g) => (
                  <li key={g} className="flex items-start gap-2 text-sm">
                    <CircleSlash className="mt-0.5 size-3.5 shrink-0 text-muted-foreground" />
                    <span className="text-muted">{g}</span>
                  </li>
                ))}
              </ul>
            </Section>
          )
        )}

        {/* Skills */}
        <Section icon={ListChecks} title="Required skills">
          <div className="flex flex-wrap gap-1.5">
            {job.requiredSkills.map((s) => (
              <TagPill key={s} tone="primary">
                {s}
              </TagPill>
            ))}
          </div>
          {result && result.missingKeywords.length > 0 && (
            <>
              <p className="mt-3 text-xs text-muted-foreground">
                Missing keywords
              </p>
              <div className="mt-1.5 flex flex-wrap gap-1.5">
                {result.missingKeywords.map((s) => (
                  <TagPill key={s} tone="muted">
                    {s}
                  </TagPill>
                ))}
              </div>
            </>
          )}
        </Section>

        {/* Career-Ops A–G blocks (only when the mock evaluation includes them) */}
        {reportBlocks && (
          <Section icon={FileText} title="Career-Ops report">
            <div className="space-y-3">
              {BLOCK_ORDER.map(({ key, title }) => (
                <div key={key}>
                  <p className="text-xs font-semibold text-foreground/80">
                    {title}
                  </p>
                  <p className="mt-0.5 text-sm text-muted">
                    {reportBlocks[key] as string}
                  </p>
                </div>
              ))}
              <div>
                <p className="text-xs font-semibold text-foreground/80">
                  G) Posting Legitimacy
                </p>
                <div className="mt-1 flex items-center gap-2">
                  <Badge
                    variant={
                      reportBlocks.postingLegitimacy.tier === "High Confidence"
                        ? "recommended"
                        : reportBlocks.postingLegitimacy.tier === "Suspicious"
                          ? "danger"
                          : "caution"
                    }
                  >
                    {reportBlocks.postingLegitimacy.tier}
                  </Badge>
                </div>
                <p className="mt-1 text-sm text-muted">
                  {reportBlocks.postingLegitimacy.notes}
                </p>
              </div>
            </div>
          </Section>
        )}

        <Section icon={ShieldCheck} title="Location & work authorization">
          <p className="text-sm text-muted">
            {job.location} · {SWIPE_REMOTE_LABELS[job.remoteType]}. Confirm this
            role&apos;s work-authorization requirements during Review &amp; Apply.
          </p>
        </Section>

        <Section icon={FileText} title="Job description">
          <p className="whitespace-pre-line text-sm leading-relaxed text-muted">
            {job.description}
          </p>
          <p className="mt-3 text-xs text-muted-foreground">
            Placeholder description — full posting arrives from the scraper feed.
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
