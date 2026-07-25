"use client";

import { useState } from "react";
import { Check } from "lucide-react";
import { SwipeShell } from "@/components/swipe/SwipeShell";
import { SwipeResumeUploadCard } from "@/components/swipe/SwipeResumeUploadCard";
import { TagInput } from "@/components/profile/TagInput";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { useSwipeStore } from "@/lib/swipe/swipeStore";
import { getProfileCompletion } from "@/lib/swipe/profileCompletion";
import { useToast } from "@/components/ui/toast";
import {
  SWIPE_REMOTE_LABELS,
  SWIPE_ROLE_LABELS,
  type RemoteType,
  type SwipeRoleType,
} from "@/types/swipe";
import type { WorkAuthorization } from "@/lib/careerOps/types";
import { cn } from "@/lib/utils/cn";

const WORK_AUTH: { value: WorkAuthorization; label: string }[] = [
  { value: "unspecified", label: "Select…" },
  { value: "us_citizen", label: "U.S. Citizen" },
  { value: "permanent_resident", label: "Permanent Resident" },
  { value: "opt_cpt", label: "F-1 OPT / CPT" },
  { value: "needs_sponsorship", label: "Will need sponsorship" },
  { value: "other", label: "Other" },
];

const REMOTE_TYPES: RemoteType[] = ["remote", "hybrid", "onsite"];
const ROLE_TYPES: SwipeRoleType[] = [
  "internship",
  "new_grad",
  "full_time",
  "contract",
];

function Field({
  label,
  htmlFor,
  children,
}: {
  label: string;
  htmlFor?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-2">
      <Label htmlFor={htmlFor}>{label}</Label>
      {children}
    </div>
  );
}

function Chip({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "rounded-md border px-3 py-1.5 text-sm transition-colors",
        active
          ? "border-primary bg-primary-soft text-accent"
          : "border-border text-muted hover:border-border-strong",
      )}
    >
      {children}
    </button>
  );
}

export default function ProfilePage() {
  const { profile, updateProfile } = useSwipeStore();
  const { toast } = useToast();
  const [saved, setSaved] = useState(false);
  const { percent } = getProfileCompletion(profile);

  const toggleArray = (
    key: "remotePreferences" | "preferredRoleTypes",
    value: string,
  ) => {
    const current = (profile[key] as string[] | undefined) ?? [];
    updateProfile({
      [key]: current.includes(value)
        ? current.filter((v) => v !== value)
        : [...current, value],
    });
  };

  return (
    <SwipeShell
      title="Profile"
      description="Set up your profile so jobs are scored against the real you"
    >
      <div className="space-y-4">
        {/* Completion */}
        <Card className="p-4">
          <div className="flex items-baseline justify-between">
            <span className="text-sm font-medium">Profile completion</span>
            <span className="font-mono text-lg font-semibold text-accent">
              {percent}%
            </span>
          </div>
          <div className="mt-2 h-2 overflow-hidden rounded-full bg-elevated">
            <div
              className="h-full rounded-full bg-primary transition-all"
              style={{ width: `${percent}%` }}
            />
          </div>
        </Card>

        {/* Resume */}
        <Card>
          <CardHeader>
            <CardTitle>Resume</CardTitle>
          </CardHeader>
          <CardContent>
            <SwipeResumeUploadCard />
          </CardContent>
        </Card>

        {/* Links */}
        <Card>
          <CardHeader>
            <CardTitle>Links</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <Field label="Full name" htmlFor="name">
              <Input
                id="name"
                value={profile.fullName}
                onChange={(e) => updateProfile({ fullName: e.target.value })}
              />
            </Field>
            <Field label="Email" htmlFor="email">
              <Input
                id="email"
                type="email"
                value={profile.email}
                readOnly
                className="cursor-not-allowed opacity-70"
              />
              <p className="mt-1 text-xs text-muted-foreground">
                Tied to your login — resumes upload under this email.
              </p>
            </Field>
            <Field label="LinkedIn URL" htmlFor="li">
              <Input
                id="li"
                value={profile.linkedinUrl}
                onChange={(e) => updateProfile({ linkedinUrl: e.target.value })}
              />
            </Field>
            <Field label="GitHub URL" htmlFor="gh">
              <Input
                id="gh"
                value={profile.githubUrl}
                onChange={(e) => updateProfile({ githubUrl: e.target.value })}
              />
            </Field>
            <Field label="Portfolio URL" htmlFor="pf">
              <Input
                id="pf"
                value={profile.portfolioUrl}
                onChange={(e) =>
                  updateProfile({ portfolioUrl: e.target.value })
                }
              />
            </Field>
          </CardContent>
        </Card>

        {/* Education */}
        <Card>
          <CardHeader>
            <CardTitle>Education</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <Field label="School" htmlFor="school">
              <Input
                id="school"
                value={profile.school}
                onChange={(e) => updateProfile({ school: e.target.value })}
              />
            </Field>
            <Field label="Major / Degree" htmlFor="major">
              <Input
                id="major"
                value={profile.major}
                onChange={(e) => updateProfile({ major: e.target.value })}
              />
            </Field>
            <Field label="Graduation date" htmlFor="grad">
              <Input
                id="grad"
                type="month"
                value={profile.graduationDate}
                onChange={(e) =>
                  updateProfile({ graduationDate: e.target.value })
                }
              />
            </Field>
          </CardContent>
        </Card>

        {/* Preferences */}
        <Card>
          <CardHeader>
            <CardTitle>Preferences</CardTitle>
          </CardHeader>
          <CardContent className="space-y-5">
            <Field label="Work authorization" htmlFor="wa">
              <Select
                id="wa"
                value={profile.workAuthorization}
                onChange={(e) =>
                  updateProfile({
                    workAuthorization: e.target.value as WorkAuthorization,
                  })
                }
              >
                {WORK_AUTH.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </Select>
            </Field>

            <Field label="Preferred work type">
              <div className="flex flex-wrap gap-2">
                {REMOTE_TYPES.map((r) => (
                  <Chip
                    key={r}
                    active={profile.remotePreferences.includes(r)}
                    onClick={() => toggleArray("remotePreferences", r)}
                  >
                    {SWIPE_REMOTE_LABELS[r]}
                  </Chip>
                ))}
              </div>
            </Field>

            <Field label="Preferred role type">
              <div className="flex flex-wrap gap-2">
                {ROLE_TYPES.map((r) => (
                  <Chip
                    key={r}
                    active={(profile.preferredRoleTypes ?? []).includes(r)}
                    onClick={() => toggleArray("preferredRoleTypes", r)}
                  >
                    {SWIPE_ROLE_LABELS[r]}
                  </Chip>
                ))}
              </div>
            </Field>

            <Field label="Location preferences">
              <TagInput
                values={profile.locationPreferences}
                onChange={(v) => updateProfile({ locationPreferences: v })}
                placeholder="Add a city or 'Remote (US)'…"
              />
            </Field>

            <Field label="Role preferences">
              <TagInput
                values={profile.rolePreferences}
                onChange={(v) => updateProfile({ rolePreferences: v })}
                placeholder="Add a role you're targeting…"
              />
            </Field>

            <Field label="Target role tags">
              <TagInput
                values={profile.targetRoles ?? []}
                onChange={(v) => updateProfile({ targetRoles: v })}
                placeholder="e.g. ML Intern, Backend New Grad…"
              />
            </Field>

            <Field label="Preferred tech stack">
              <TagInput
                values={profile.techStack ?? []}
                onChange={(v) => updateProfile({ techStack: v })}
                placeholder="e.g. TypeScript, Python…"
              />
            </Field>
          </CardContent>
        </Card>

        <Button
          className="w-full"
          size="lg"
          onClick={() => {
            setSaved(true);
            toast("Profile saved", "success");
            setTimeout(() => setSaved(false), 2000);
          }}
        >
          {saved ? (
            <>
              <Check className="size-4" />
              Saved
            </>
          ) : (
            "Save profile"
          )}
        </Button>
      </div>
    </SwipeShell>
  );
}
