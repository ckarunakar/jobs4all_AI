"use client";

import { useMemo, useState } from "react";
import {
  ArrowLeft,
  CheckCircle2,
  ExternalLink,
  ShieldCheck,
} from "lucide-react";
import { Dialog } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { ApplicationChecklist } from "@/components/applications/ApplicationChecklist";
import { ScoreBadge } from "@/components/jobs/ScoreBadge";
import { useSwipeStore } from "@/lib/swipe/swipeStore";
import { swipeJobScore } from "@/lib/swipe/jobScore";
import { useToast } from "@/components/ui/toast";
import type { ApplicationChecklistItem, SwipeJob } from "@/types/swipe";

interface ApplicationReviewModalProps {
  job: SwipeJob | null;
  open: boolean;
  onClose: () => void;
}

const CHECKLIST: ApplicationChecklistItem[] = [
  { key: "resume", label: "Resume selected", hint: "Pick the best-fit resume." },
  {
    key: "links",
    label: "LinkedIn / GitHub / portfolio ready",
    hint: "Your profile links are filled in.",
  },
  {
    key: "work_auth",
    label: "Work authorization checked",
    hint: "Confirm you meet this role's requirements.",
  },
  {
    key: "location",
    label: "Location preference checked",
    hint: "Confirm the location/remote setup works.",
  },
  {
    key: "reviewed",
    label: "I reviewed the job description",
    hint: "Score, gaps, and requirements.",
  },
  {
    key: "confirm",
    label: "I confirm I want to apply",
    hint: "You're choosing to apply — nothing is automatic.",
  },
];

export function ApplicationReviewModal({
  job,
  open,
  onClose,
}: ApplicationReviewModalProps) {
  const { profile, markApplied, notes } = useSwipeStore();
  const { toast } = useToast();
  const [selectedResume, setSelectedResume] = useState(
    profile.primaryResumeId ?? profile.resumes[0]?.id,
  );
  const [draftNotes, setDraftNotes] = useState("");
  const [trackedJob, setTrackedJob] = useState<string | undefined>(job?.id);

  const initialChecks = useMemo<Record<string, boolean>>(
    () => ({
      resume: !!selectedResume,
      links: !!(profile.linkedinUrl && profile.githubUrl),
      work_auth: false,
      location: false,
      reviewed: false,
      confirm: false,
    }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [job?.id, open],
  );
  const [checks, setChecks] = useState<Record<string, boolean>>(initialChecks);

  // Reset transient state when a new job opens.
  if (open && job?.id !== trackedJob) {
    setTrackedJob(job?.id);
    setChecks(initialChecks);
    setDraftNotes(job ? (notes[job.id] ?? "") : "");
  }

  if (!job) return null;
  const allChecked = CHECKLIST.every((c) => checks[c.key]);

  const handleApplied = () => {
    markApplied(job.id, draftNotes);
    toast("Marked as applied", "success");
    onClose();
  };

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title="Review & Apply"
      description={`${job.title} · ${job.company}`}
      className="max-w-2xl"
      footer={
        <div className="space-y-3">
          <div className="flex items-start gap-2 rounded-lg border border-primary/30 bg-primary-soft p-3 text-xs text-accent">
            <ShieldCheck className="mt-0.5 size-4 shrink-0" />
            <span>
              ITJobCafe never submits applications automatically. You are
              always in control — you review, you decide, you apply.
            </span>
          </div>
          <div className="flex flex-col gap-2 sm:flex-row">
            <Button
              variant="ghost"
              onClick={onClose}
              className="sm:order-first"
            >
              <ArrowLeft className="size-4" />
              Back to Swipe Feed
            </Button>
            <div className="flex flex-1 flex-col gap-2 sm:flex-row">
              <Button
                variant="secondary"
                className="flex-1"
                onClick={() => window.open(job.applicationUrl, "_blank")}
              >
                <ExternalLink className="size-4" />
                Open External Application
              </Button>
              <Button
                className="flex-1"
                disabled={!allChecked}
                onClick={handleApplied}
              >
                <CheckCircle2 className="size-4" />
                Mark as Applied
              </Button>
            </div>
          </div>
          {!allChecked && (
            <p className="text-center text-xs text-muted-foreground">
              Complete the checklist to confirm you&apos;re ready to apply.
            </p>
          )}
        </div>
      }
    >
      <div className="space-y-6">
        {/* Job summary */}
        <div className="flex items-center justify-between rounded-lg border border-border bg-surface p-4">
          <div>
            <p className="text-sm font-medium">{job.title}</p>
            <p className="text-xs text-muted">
              {job.company} · {job.location}
            </p>
          </div>
          <ScoreBadge score={swipeJobScore(job)} showLabel />
        </div>

        {/* Resume select */}
        <div className="space-y-2">
          <Label htmlFor="swipe-resume">Selected resume</Label>
          <Select
            id="swipe-resume"
            value={selectedResume}
            onChange={(e) => setSelectedResume(e.target.value)}
          >
            {profile.resumes.map((r) => (
              <option key={r.id} value={r.id}>
                {r.label} ({r.fileName})
              </option>
            ))}
          </Select>
        </div>

        {/* Profile summary */}
        <div className="space-y-2">
          <Label>Your profile</Label>
          <div className="grid grid-cols-2 gap-2 rounded-lg border border-border bg-surface p-4 text-sm">
            <Detail label="Name" value={profile.fullName} />
            <Detail label="School" value={profile.school} />
            <Detail label="Major" value={profile.major} />
            <Detail label="Graduation" value={profile.graduationDate} />
          </div>
          <div className="flex flex-wrap gap-1.5">
            {profile.linkedinUrl && <Badge variant="outline">LinkedIn</Badge>}
            {profile.githubUrl && <Badge variant="outline">GitHub</Badge>}
            {profile.portfolioUrl && <Badge variant="outline">Portfolio</Badge>}
          </div>
        </div>

        {/* Checklist */}
        <div className="space-y-2">
          <Label>Application checklist</Label>
          <ApplicationChecklist
            items={CHECKLIST}
            checked={checks}
            onToggle={(key, value) =>
              setChecks((prev) => ({ ...prev, [key]: value }))
            }
          />
        </div>

        {/* Notes */}
        <div className="space-y-2">
          <Label htmlFor="swipe-notes">Application notes</Label>
          <Textarea
            id="swipe-notes"
            placeholder="Referral name, tailored points, follow-up date…"
            value={draftNotes}
            onChange={(e) => setDraftNotes(e.target.value)}
          />
        </div>
      </div>
    </Dialog>
  );
}

function Detail({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="truncate font-medium">{value}</div>
    </div>
  );
}
