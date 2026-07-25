# Production Cleanup & Go-Live Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Remove all demo/mock scaffolding from the ITJobCafe app, rename the app-owned DB tables to production names, ship real docs, and push to the new `jobs4all_AI` GitHub repo.

**Architecture:** Surgical deletion of the mock data + legacy client-side scoring path (which is already dead in production because `USE_REAL_JOBS=true` disables it), leaving one scoring path: `swipe page → POST /api/scoring/score-batch → lib/careerOps/scoringService → lib/scoring/scoreJob → lib/ai/*`, with results carried on `job.careerOpsScore`. UI components read `job.careerOpsScore` or show an honest "Not scored yet" state.

**Tech Stack:** Next.js 16.2.9 (App Router), React 19, TypeScript, Tailwind 4, NextAuth v5 beta, mssql, DeepSeek/Anthropic via `lib/ai`.

## Global Constraints

- Spec: `docs/superpowers/specs/2026-07-25-production-cleanup-design.md`. Read it first.
- Branding stays **ITJobCafe** everywhere (repo name `jobs4all_AI` is just a repo name).
- No new npm dependencies. No test framework exists — every task verifies with `npm run lint` and `npx tsc --noEmit`; run `npm run build` where marked.
- New production table names: `login_users`, `resume_upload`, `career_ops_scores`, `user_job_seen`. The scraper-owned `temp_tbl_Scrap_jobs` is NEVER renamed — the string `temp_tbl_Scrap_jobs` legitimately remains in code/SQL as a reference to that table.
- The DB host IP `<db-host>` must not appear anywhere in the repo after Task 10.
- Follow existing code conventions (JSDoc header comments per module, `@/` imports, existing Tailwind idioms).
- Commit after every task with the message given in the task. All work happens on `main` (repo has no remote yet).
- Per AGENTS.md, this Next.js version may differ from training data — the existing working code in each file is the authoritative pattern; do not introduce new Next.js APIs.

---

### Task 1: Move the default profile out of lib/mockData

`DEFAULT_SWIPE_PROFILE` is already an empty (non-demo) profile; it just lives in the mock folder. Move it so `lib/mockData/` can die later.

**Files:**
- Create: `lib/swipe/defaultProfile.ts`
- Modify: `lib/swipe/swipeStore.tsx` (one import line)
- Delete: `lib/mockData/swipeProfile.ts`

**Interfaces:**
- Produces: `DEFAULT_SWIPE_PROFILE: ResumeProfile` exported from `@/lib/swipe/defaultProfile` (same value as today).

- [ ] **Step 1: Create `lib/swipe/defaultProfile.ts`** with exactly the current content of `lib/mockData/swipeProfile.ts`:

```ts
import type { ResumeProfile } from "@/lib/careerOps/types";

/**
 * Empty starting profile for the swipe app — the user fills this in themselves.
 * (Nothing is pre-populated so the Profile page starts blank.)
 */
export const DEFAULT_SWIPE_PROFILE: ResumeProfile = {
  fullName: "",
  email: "",
  linkedinUrl: "",
  githubUrl: "",
  portfolioUrl: "",
  school: "",
  major: "",
  graduationDate: "",
  workAuthorization: "unspecified",
  locationPreferences: [],
  rolePreferences: [],
  remotePreferences: [],
  targetRoles: [],
  techStack: [],
  resumes: [],
  primaryResumeId: undefined,
};
```

- [ ] **Step 2: Update the import in `lib/swipe/swipeStore.tsx`** (line 21):

```ts
// old
import { DEFAULT_SWIPE_PROFILE } from "@/lib/mockData/swipeProfile";
// new
import { DEFAULT_SWIPE_PROFILE } from "@/lib/swipe/defaultProfile";
```

- [ ] **Step 3: Delete `lib/mockData/swipeProfile.ts`** (`rm lib/mockData/swipeProfile.ts`).

- [ ] **Step 4: Verify**

Run: `grep -rn "mockData/swipeProfile" app lib components` → expect no output.
Run: `npx tsc --noEmit && npm run lint` → expect both to pass.

- [ ] **Step 5: Commit**

```bash
git add -A && git commit -m "refactor: move default profile out of mockData"
```

---

### Task 2: Production copy on landing + login, self-contained preview card

**Files:**
- Modify: `components/landing/Landing.tsx`, `app/page.tsx`, `app/login/page.tsx`

- [ ] **Step 1: In `components/landing/Landing.tsx`**, remove the mock import and add a local sample card. Replace line 12 (`import { MOCK_SWIPE_JOBS } ...`) with nothing, add `import type { SwipeJob } from "@/types/swipe";` to the imports, and add this constant above the `FEATURES` array:

```ts
/** Illustrative sample card for the marketing hero (not a live posting). */
const PREVIEW_JOB: SwipeJob = {
  id: "preview-001",
  company: "Vercel",
  companyLogo: "#6366f1",
  title: "Software Engineering Intern",
  location: "San Francisco, CA",
  remoteType: "hybrid",
  roleType: "internship",
  compensation: "$9,500 / month",
  source: "Sample role",
  score: 4.8,
  scoreLabel: "Excellent fit",
  matchSummary:
    "Your Next.js projects and TypeScript depth line up almost perfectly with this team.",
  strengths: [
    "Strong React + TypeScript portfolio",
    "Shipped a Next.js App Router project",
    "Cares about developer experience",
  ],
  gaps: ["No large-scale production experience yet"],
  cautionFlags: [],
  requiredSkills: ["React", "TypeScript", "Next.js"],
  niceToHaveSkills: ["Edge runtime", "Serverless", "CI/CD"],
  tags: ["React", "TypeScript", "Next.js", "Edge"],
  description:
    "Join the framework team building tooling millions of developers rely on. Work on the Next.js App Router, edge runtime, and DX features alongside senior engineers.",
  status: "new",
  postedDate: "2026-06-18",
  applicationUrl: "https://example.com/apply/vercel-swe-intern",
};
```

Then inside `Landing()`: replace `const previewJob = MOCK_SWIPE_JOBS[0];` with `const previewJob = PREVIEW_JOB;` and update the copy:

```ts
// old
const ctaLabel = loggedIn ? "Open Swipe Demo" : "Login to see demo";
// new
const ctaLabel = loggedIn ? "Open the app" : "Log in to get started";
```

```tsx
// old (line ~87)
Mobile-first · mock data · no auto-apply, ever
// new
Mobile-first · human-confirmed applications · no auto-apply, ever
```

```tsx
// old (line ~161)
Start swiping through high-fit tech roles — all on mock data.
// new
Start swiping through high-fit tech roles, scored against your resume.
```

- [ ] **Step 2: In `app/page.tsx`**, update the header button (line 20) and footer tagline (line 34):

```tsx
// old
{loggedIn ? "Open Swipe Demo" : "Login to see demo"}
// new
{loggedIn ? "Open the app" : "Log in"}
```

```tsx
// old
Frontend MVP · mock data · Career-Ops integration via adapter layer
// new
AI-ranked job discovery for students and new grads
```

- [ ] **Step 3: In `app/login/page.tsx`** (line 22):

```tsx
// old
Log in to open the swipe demo.
// new
Log in to your account.
```

- [ ] **Step 4: Verify**

Run: `grep -rn "MOCK_SWIPE_JOBS" components/landing app/page.tsx` → no output.
Run: `grep -rniE "\bdemo\b" app/page.tsx app/login/page.tsx components/landing/Landing.tsx` → no output.
Run: `npx tsc --noEmit && npm run lint` → pass.

- [ ] **Step 5: Commit**

```bash
git add -A && git commit -m "feat: production copy on landing and login pages"
```

---

### Task 3: Remove the legacy mock scoring path (server side)

The scoring routes have a dead "legacy mock" branch that scores mock jobs with a fake provider. Production identity always comes from the session, so the only behavior change is: unauthenticated callers now get 401 instead of fake scores.

**Files:**
- Delete: `lib/scoring/resolve.ts`, `lib/scoring/demoCandidate.ts`, `lib/scoring/providers/mockProvider.ts`
- Modify: `lib/scoring/providerRegistry.ts`, `app/api/scoring/score-job/route.ts`, `app/api/scoring/score-batch/route.ts`, `lib/scoring/types.ts`

**Interfaces:**
- Produces: `getProvider(): LlmProvider` (now throws when no AI key configured) and `getProviderInfo(): { provider: string; model: string }` from `@/lib/scoring/providerRegistry`. `getProviderMode()` is REMOVED — nothing may import it after this task.
- Consumes: `isAiConfigured()` from `@/lib/ai/modelClient`, `createAiProvider()` from `./providers/aiProvider` (both unchanged).

- [ ] **Step 1: Replace the full content of `lib/scoring/providerRegistry.ts`:**

```ts
/**
 * Provider selection. Returns the configured AI provider (DeepSeek or
 * Anthropic, per AI_PROVIDER). Scoring requires an API key — there is no
 * mock fallback.
 *
 * The AI call itself lives in lib/ai/* behind a provider-neutral seam, so
 * swapping models is a one-line env change — UI/routes/cache don't change.
 */

import { createAiProvider } from "./providers/aiProvider";
import { isAiConfigured } from "@/lib/ai/modelClient";
import type { LlmProvider } from "./types";

let cached: LlmProvider | null = null;

export function getProvider(): LlmProvider {
  if (cached) return cached;
  if (!isAiConfigured()) {
    throw new Error(
      "AI scoring is not configured — set DEEPSEEK_API_KEY or ANTHROPIC_API_KEY (see .env.example).",
    );
  }
  cached = createAiProvider();
  return cached;
}

/** Provider name + raw model, for response metadata. */
export function getProviderInfo(): { provider: string; model: string } {
  const p = getProvider();
  return { provider: p.name, model: p.model };
}
```

- [ ] **Step 2: In `app/api/scoring/score-job/route.ts`:**
  1. Delete the imports of `evaluateJob`, `resolveCandidateProfile, resolveJob`, and `getProviderMode` (keep `getProviderInfo`). Delete the `SwipeJob` type import and the `job?: SwipeJob;` field from `Body`.
  2. Replace everything from the comment `// --- Legacy mock flow -------------------------------------------------` to the end of the `POST` function (the entire legacy block after the `if (userId || email) { ... }` block) with:

```ts
  return NextResponse.json(
    { ok: false, error: "Sign in to score jobs." },
    { status: 401 },
  );
```

  3. Update the file's header comment to describe only the real flow:

```ts
/**
 * POST /api/scoring/score-job
 * Body: { jobId: string, profile?: ResumeProfile, forceRefresh?: boolean }
 * Scores the signed-in user's latest resume against one job (DB-cached).
 * All scoring happens server-side. The API key is never exposed to the client.
 */
```

- [ ] **Step 3: In `app/api/scoring/score-batch/route.ts`:**
  1. Delete the imports of `evaluateJob`, the `resolve` module (`MAX_BATCH_SIZE, SCORING_CONCURRENCY, resolveCandidateProfile, resolveJob`), `getProviderMode`, and `ScoreJobOutcome`.
  2. Delete the whole `mapWithConcurrency` helper function.
  3. Replace everything from `// --- Legacy mock flow (used by scoresClient in mock mode) -------------` to the end of `POST` with the same 401 response as Step 2.
  4. In the header comment, delete the `Mock (legacy)` bullet lines so it documents only the real mode.

- [ ] **Step 4: Delete the three dead modules:**

```bash
rm lib/scoring/resolve.ts lib/scoring/demoCandidate.ts lib/scoring/providers/mockProvider.ts
```

- [ ] **Step 5: Remove the now-unused `ScoreJobOutcome` type.**

Run: `grep -rn "ScoreJobOutcome" app lib components types` — expect the only remaining hit to be its definition in `lib/scoring/types.ts`. Delete that interface (and its JSDoc) from `lib/scoring/types.ts`. If any other hit appears, stop and remove that usage first.

- [ ] **Step 6: Verify**

Run: `grep -rn "getProviderMode\|mockProvider\|demoCandidate\|scoring/resolve" app lib components` → no output.
Run: `npx tsc --noEmit && npm run lint` → pass. (`lib/scoring/scoresClient.tsx` still exists and still compiles — it calls the routes at runtime only; it is deleted in Task 4.)

- [ ] **Step 7: Commit**

```bash
git add -A && git commit -m "refactor: remove legacy mock scoring path (server)"
```

---

### Task 4: Remove the legacy scoring client; job detail modal shows real scores only

`ScoresProvider`/`useScores` is disabled whenever real jobs are on — it is dead code. Real score data lives on `job.careerOpsScore` (type `CareerOpsAiScore` from `@/lib/careerOps/aiScore`: `{ score, label, recommendation, summary, pros, cons, warnings, dimensions? }`), set by the "Score top N jobs" batch in `swipeStore.scoreTopJobs`.

**Files:**
- Delete: `lib/scoring/scoresClient.tsx`, `lib/careerOps/swipeAdapter.ts`
- Modify: `app/(app)/layout.tsx`, `app/(app)/swipe/page.tsx`, `app/(app)/dashboard/page.tsx`, `components/swipe/SwipeDeck.tsx`, `components/swipe/DraggableCard.tsx`, `components/swipe/SwipeJobCard.tsx`
- Rewrite: `components/swipe/JobDetailModal.tsx`

**Interfaces:**
- Consumes: `job.careerOpsScore?: CareerOpsAiScore`, `swipeJobScore(job)` from `@/lib/swipe/jobScore`, `getNextAction(score)` from `@/lib/careerOps/scoreUtils`, `CareerOpsScoreBreakdown` (`{ global, items: [{key,label,score,weight,note?}] }`) from `@/lib/careerOps/types`.
- Produces: `SwipeJobCard`, `DraggableCard`, `SwipeDeck` no longer accept `evaluation`/`scoring` props.

- [ ] **Step 1: `app/(app)/layout.tsx`** — delete the `ScoresProvider` import (line 5) and unwrap it:

```tsx
      <ToastProvider>
        <SwipeInteractionsProvider>{children}</SwipeInteractionsProvider>
      </ToastProvider>
```

- [ ] **Step 2: `app/(app)/swipe/page.tsx`** — delete the `useScores` import (line 17), the `const { ensureScored } = useScores();` line, and the whole "Lazily AI-score" block (the `upcomingIds` const + its `useEffect`, lines 54–59).

- [ ] **Step 3: `app/(app)/dashboard/page.tsx`:**
  1. Delete the `useScores` import and the `const { entries, mode, enabled, ensureScored } = useScores();` line.
  2. Delete the `effective` memo. Replace the `scored` memo with:

```ts
  const scored = useMemo(
    () => ({
      count: jobs.filter((j) => j.careerOpsScore).length,
      recommended: jobs.filter((j) => swipeJobScore(j) >= RECOMMEND_THRESHOLD)
        .length,
      average: jobs.length
        ? jobs.reduce((s, j) => s + swipeJobScore(j), 0) / jobs.length
        : 0,
    }),
    [jobs],
  );
```

  3. Replace the `topRecommended` memo body's filter/sort to use `swipeJobScore(j)` directly (same shape, no `effective`):

```ts
  const topRecommended = useMemo(
    () =>
      [...jobs]
        .filter((j) => swipeJobScore(j) >= RECOMMEND_THRESHOLD)
        .sort((a, b) => swipeJobScore(b) - swipeJobScore(a))
        .slice(0, 5),
    [jobs],
  );
```

  4. Delete the entire `{enabled && ( ... "Score all jobs" ... )}` JSX block (the "Scoring control" section, lines 76–99).
  5. Remove the now-unused `Badge` import; keep `Button`, `Sparkles` (still used below).

- [ ] **Step 4: `components/swipe/SwipeDeck.tsx`** — delete the `useScoresOptional` import, the `const scores = useScoresOptional();` line, the `topEntry`/`nextEntry` consts, and the `evaluation=`/`scoring=` props on both `<SwipeJobCard>` and `<DraggableCard>`.

- [ ] **Step 5: `components/swipe/DraggableCard.tsx`** — delete the `evaluation`/`scoring` prop declarations (lines 31–32), remove them from the destructuring on line 54, and delete the `evaluation={evaluation}` / `scoring={scoring}` pass-through (lines 121–122).

- [ ] **Step 6: `components/swipe/SwipeJobCard.tsx`:**
  1. Delete the `evaluation` and `scoring` props (interface + destructuring), the `JobEvaluationResult` import, the `Loader2` icon import, and the `USE_REAL_JOBS` import.
  2. Replace the derivation block with:

```ts
  // Real Career-Ops AI score when scored, else the neutral placeholder values.
  const ai = job.careerOpsScore;
  const score = ai?.score ?? job.score;
  const strengths = ai?.pros ?? job.strengths;
  const warning =
    ai?.warnings?.[0] ??
    job.cautionFlags[0] ??
    (job.gaps[0] ? `Gap: ${job.gaps[0]}` : null);
```

  3. Replace the score-status JSX (the `scoring ? ... : evaluation || ai ? ... : USE_REAL_JOBS ? ... : null` chain around lines 118–131) with:

```tsx
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
```

- [ ] **Step 7: Rewrite `components/swipe/JobDetailModal.tsx`** with this full content (same props, real-score-only rendering):

```tsx
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
```

- [ ] **Step 8: Delete the dead client modules:**

```bash
rm lib/scoring/scoresClient.tsx lib/careerOps/swipeAdapter.ts
```

- [ ] **Step 9: Verify**

Run: `grep -rn "scoresClient\|useScores\|ScoresProvider\|swipeAdapter\|evaluateJobForUser" app lib components` → the ONLY acceptable hit is the stale comment in `lib/jobs/jobListingToSwipeJob.ts` (fixed in Task 7).
Run: `npm run build && npm run lint` → pass.

- [ ] **Step 10: Commit**

```bash
git add -A && git commit -m "refactor: remove legacy scoring client; modal renders real AI scores only"
```

---

### Task 5: Rebuild Settings as a minimal real page; delete dev tooling

**Files:**
- Rewrite: `app/(app)/settings/page.tsx`
- Delete: `components/swipe/DevClearSeenButton.tsx`
- Modify: `lib/swipe/swipeStore.tsx` (remove the dev-only `clearSeenJobs` action)

**Interfaces:**
- Consumes: `auth()` from `@/auth`, `IntegrationStatusCard` from `@/components/settings/IntegrationStatusCard` (unchanged), `SignOutButton` from `@/components/auth/SignOutButton` (unchanged).
- Produces: `SwipeStore` interface no longer has `clearSeenJobs`.

- [ ] **Step 1: Replace the full content of `app/(app)/settings/page.tsx`** (it becomes a server component — no `"use client"`):

```tsx
import { UserRound } from "lucide-react";
import { auth } from "@/auth";
import { SwipeShell } from "@/components/swipe/SwipeShell";
import { IntegrationStatusCard } from "@/components/settings/IntegrationStatusCard";
import { SignOutButton } from "@/components/auth/SignOutButton";

export default async function SettingsPage() {
  const session = await auth();
  const name = session?.user?.name?.trim();
  const email = session?.user?.email?.trim();
  const who =
    name && email ? `${name} (${email})` : (email ?? name ?? "your account");

  return (
    <SwipeShell title="Settings" description="Manage your account">
      <div className="space-y-4">
        <IntegrationStatusCard
          icon={UserRound}
          title="Account"
          description={`Signed in as ${who}. Signing out returns you to the landing page.`}
          statusLabel="Signed in"
          tone="live"
        >
          <SignOutButton />
        </IntegrationStatusCard>
      </div>
    </SwipeShell>
  );
}
```

- [ ] **Step 2: Delete the dev button:** `rm components/swipe/DevClearSeenButton.tsx`

- [ ] **Step 3: In `lib/swipe/swipeStore.tsx`**, remove the dev-only action: delete the `clearSeenJobs` JSDoc + member from the `SwipeStore` interface (line ~155-156), delete the whole `const clearSeenJobs = useCallback(...)` implementation (the block starting `// Dev/testing: wipe this user's seen history...`), and delete `clearSeenJobs,` from the `value: SwipeStore` object literal.

- [ ] **Step 4: Verify**

Run: `grep -rn "DevClearSeenButton\|clearSeenJobs" app lib components` → no output.
Run: `grep -rniE "\bdemo\b|\bmock\b" "app/(app)/settings/page.tsx"` → no output.
Run: `npx tsc --noEmit && npm run lint` → pass. (The `DELETE /api/jobs/seen` route stays — it is part of the seen-jobs API surface, just no longer has a dev button.)

- [ ] **Step 5: Commit**

```bash
git add -A && git commit -m "feat: minimal real settings page; remove dev-only tooling"
```

---

### Task 6: Always-real jobs — remove USE_REAL_JOBS flag and mock job data

After this task the SQL feed is the only job source; a failed feed shows an error and an empty deck (never fake jobs).

**Files:**
- Modify: `lib/config.ts`, `lib/swipe/swipeStore.tsx`, `app/(app)/swipe/page.tsx`
- Delete: `lib/mockData/swipeJobs.ts` (and the now-empty `lib/mockData/` directory)

**Interfaces:**
- Produces: `lib/config.ts` exports ONLY `SCORE_TOP_N`. `SwipeStore` no longer has a `source` field; `error: string | null` keeps its meaning (feed failure).

- [ ] **Step 1: `lib/config.ts`** — delete the `USE_REAL_JOBS` export and its JSDoc; keep `SCORE_TOP_N` and the file header (drop the words "feature flags" — it now holds client-safe constants):

```ts
/**
 * Client-safe constants (inlined at build time). Never secrets.
 */

/**
 * How many top jobs the "Score with AI" button scores at once.
 * 10 on DeepSeek: v4-flash has a 2,500 concurrency limit and no per-minute
 * request/token limit, so scoring 10 jobs fully in parallel finishes in
 * ~15-25s (see scoringService CONCURRENCY). Hard-capped at 10 in the service.
 */
export const SCORE_TOP_N = 10;
```

- [ ] **Step 2: `lib/swipe/swipeStore.tsx`:**
  1. Delete imports of `MOCK_SWIPE_JOBS` and `USE_REAL_JOBS` (keep `SCORE_TOP_N`).
  2. Delete `type JobSource = "mock" | "sql-server";` and the `source: JobSource;` member (+ its JSDoc) from the `SwipeStore` interface, the `const [source, setSource] = useState...` line, every `setSource(...)` call, and `source,` in the `value` object.
  3. Replace `fetchJobs` with:

```ts
/**
 * Fetch jobs from the SQL Server feed with optional filters. On failure the
 * deck is left empty and `error` carries the reason — there is no fallback
 * data source. An *empty* filtered result is returned as-is (so the UI can
 * say "no jobs matched").
 */
async function fetchJobs(filters: JobFilterState = {}): Promise<{
  jobs: SwipeJob[];
  error: string | null;
}> {
  try {
    const res = await fetch(buildJobsUrl(filters));
    const data = (await res.json()) as {
      ok?: boolean;
      jobs?: JobListing[];
      error?: string;
    };
    if (!res.ok || !data.ok || !Array.isArray(data.jobs)) {
      throw new Error(data.error || `Request failed (${res.status})`);
    }
    return { jobs: jobListingsToSwipeJobs(data.jobs), error: null };
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to load jobs";
    return { jobs: [], error: message };
  }
}
```

  4. Change the initial jobs state: `useState<SwipeJob[]>(MOCK_SWIPE_JOBS)` → `useState<SwipeJob[]>([])`.
  5. In `markSeen`, change the guard `if (!USE_REAL_JOBS || !jobId) return;` → `if (!jobId) return;` and drop the "Only for real jobs — mock ids..." sentence from its comment.
  6. Update the `error` field's JSDoc: `/** Non-null when the jobs feed failed to load. */`

- [ ] **Step 3: `app/(app)/swipe/page.tsx`:**
  1. Remove `source` from the `useSwipeStore()` destructuring.
  2. Change the Score-button condition `hydrated && source === "sql-server" && jobs.length > 0` → `hydrated && jobs.length > 0`.
  3. Replace the error banner text and its comment:

```tsx
        {/* Jobs feed failed to load. */}
        {error && (
          <div className="mb-4 shrink-0 rounded-lg border-2 border-[var(--caution)]/40 bg-[var(--caution)]/10 px-4 py-2.5 text-xs text-[var(--caution)]">
            Couldn&apos;t load jobs ({error}). Try again in a moment.
          </div>
        )}
```

- [ ] **Step 4: Delete the mock dataset:** `rm lib/mockData/swipeJobs.ts && rmdir lib/mockData`

- [ ] **Step 5: Verify**

Run: `grep -rn "USE_REAL_JOBS\|MOCK_SWIPE_JOBS\|mockData" app lib components types` → no output.
Run: `npm run build && npm run lint` → pass.

- [ ] **Step 6: Commit**

```bash
git add -A && git commit -m "refactor: SQL feed is the only job source; drop USE_REAL_JOBS and mock jobs"
```

---

### Task 7: Rename Demo2* components and scrub stale demo comments

**Files:**
- Modify: `app/(app)/dashboard/page.tsx`, `app/(app)/applications/page.tsx`, `app/(app)/profile/page.tsx`, `lib/swipe/swipeStore.tsx`, `lib/jobs/jobListingToSwipeJob.ts`, `lib/scoring/scoreCache.ts`, `lib/careerOps/types.ts`

- [ ] **Step 1: Rename the default exports** (Settings was already renamed in Task 5):
  - `app/(app)/dashboard/page.tsx`: `export default function Demo2DashboardPage()` → `export default function DashboardPage()`
  - `app/(app)/applications/page.tsx`: `Demo2ApplicationsPage` → `ApplicationsPage`
  - `app/(app)/profile/page.tsx`: `Demo2ProfilePage` → `ProfilePage`

- [ ] **Step 2: `lib/swipe/swipeStore.tsx` header comment** — replace the header block (lines 3–9) with:

```ts
/**
 * Swipe store — client-side state for the swipe app. Persists job statuses,
 * notes, and the profile to localStorage.
 *
 * TODO(backend): swap localStorage for API calls; keep this action surface.
 */
```

- [ ] **Step 3: `lib/jobs/jobListingToSwipeJob.ts` header comment** (lines 1–5) — replace with:

```ts
/**
 * Map a DB `JobListing` into the swipe UI's `SwipeJob`.
 * Jobs get a neutral placeholder score until the user runs AI scoring
 * ("Score top jobs with AI"), which attaches `careerOpsScore`.
 */
```

- [ ] **Step 4: `lib/scoring/scoreCache.ts`** — in the header TODO (line 7), change `see SCORE.md for the suggested JobScores table` → `see SCORING.md`.

- [ ] **Step 5: `lib/careerOps/types.ts`** — resume text extraction IS wired up (`lib/resume/extractText.ts`), so replace the stale TODO on line 161:

```ts
  /** True once resume text has been extracted for AI scoring. */
  parsed: boolean;
```

- [ ] **Step 6: Verify**

Run: `grep -rn "Demo2" app components lib` → no output.
Run: `grep -rn "SCORE.md" lib` → no output.
Run: `npx tsc --noEmit && npm run lint` → pass.

- [ ] **Step 7: Commit**

```bash
git add -A && git commit -m "refactor: production component names; scrub stale demo comments"
```

---

### Task 8: Database — production table names in scripts and code

Renames the four app-owned tables. `temp_tbl_Scrap_jobs` (scraper-owned) keeps its name everywhere, including the `SourceTable` default value `'temp_tbl_Scrap_jobs'` (it labels which scraper table a seen-row refers to).

**Files:**
- Create: `database/migrate/rename-to-production.sql`, `database/setup/create-login-users.sql`, `database/setup/create-resume-upload.sql`, `database/setup/create-career-ops-scores.sql`, `database/setup/create-user-job-seen.sql`, `database/setup/recommended-scrap-job-filter-indexes.sql`
- Delete: all 7 existing `database/*.sql` files
- Modify: `lib/auth/users.ts`, `lib/db/scoresRepository.ts`, `lib/db/resumeRepository.ts`, `lib/db/jobsRepository.ts`, `lib/jobs/userJobSeenRepository.ts`, `app/api/resume-upload/route.ts`, `auth.ts`, `lib/careerOps/types.ts`, `types/next-auth.d.ts`

**Interfaces:**
- Produces: table name constants — `USERS_TABLE = "ITJC_SCRAPPER.dbo.login_users"`, `RESUME_TABLE = "ITJC_SCRAPPER.dbo.resume_upload"`, `SCORES_TABLE = "ITJC_SCRAPPER.dbo.career_ops_scores"`, `SEEN_TABLE = "ITJC_SCRAPPER.dbo.user_job_seen"`. `SCRAP_SOURCE_TABLE = "temp_tbl_Scrap_jobs"` is UNCHANGED.

- [ ] **Step 1: Create `database/migrate/rename-to-production.sql`:**

```sql
/*
  Rename app-owned tables to production names — run ONCE at cutover.
  --------------------------------------------------------------------------
  Run in DBeaver (or any SQL client) connected to ITJC_SCRAPPER, BEFORE
  deploying app code that queries the new names. Renames tables in place —
  no data is copied or lost. Idempotent: each rename is guarded so re-running
  is safe. Indexes, constraints, and FKs keep their old names (harmless).

  The scraper-owned dbo.temp_tbl_Scrap_jobs is intentionally NOT renamed.
*/

USE [ITJC_SCRAPPER];
GO

IF OBJECT_ID('dbo.temp_login_users', 'U') IS NOT NULL
   AND OBJECT_ID('dbo.login_users', 'U') IS NULL
    EXEC sp_rename 'dbo.temp_login_users', 'login_users';
GO

IF OBJECT_ID('dbo.temp_tbl_resume_upload', 'U') IS NOT NULL
   AND OBJECT_ID('dbo.resume_upload', 'U') IS NULL
    EXEC sp_rename 'dbo.temp_tbl_resume_upload', 'resume_upload';
GO

IF OBJECT_ID('dbo.temp_tbl_career_ops_scores', 'U') IS NOT NULL
   AND OBJECT_ID('dbo.career_ops_scores', 'U') IS NULL
    EXEC sp_rename 'dbo.temp_tbl_career_ops_scores', 'career_ops_scores';
GO

IF OBJECT_ID('dbo.temp_user_job_seen', 'U') IS NOT NULL
   AND OBJECT_ID('dbo.user_job_seen', 'U') IS NULL
    EXEC sp_rename 'dbo.temp_user_job_seen', 'user_job_seen';
GO
```

- [ ] **Step 2: Create the setup scripts by transforming the existing ones** (fresh-environment scripts; the two historical `add-*.sql` migrations fold into the resume-upload CREATE):

```bash
mkdir -p database/setup database/migrate
# login users
sed -e 's/temp_login_users/login_users/g' \
    database/create-temp-login-users.sql > database/setup/create-login-users.sql
# career ops scores
sed -e 's/temp_tbl_career_ops_scores/career_ops_scores/g' \
    -e 's/temp_tbl_resume_upload/resume_upload/g' \
    database/create-temp-tbl-career-ops-scores.sql > database/setup/create-career-ops-scores.sql
# user job seen (FK now references login_users; SourceTable default keeps temp_tbl_Scrap_jobs)
sed -e 's/temp_user_job_seen/user_job_seen/g' \
    -e 's/temp_login_users/login_users/g' \
    database/create-temp-user-job-seen.sql > database/setup/create-user-job-seen.sql
# scraper index recommendations (content unchanged — targets the scraper's table)
cp database/recommended-temp-scrap-job-filter-indexes.sql \
   database/setup/recommended-scrap-job-filter-indexes.sql
```

IMPORTANT after running the seds, open each generated file and verify no `temp_login_users` / `temp_tbl_` / `temp_user_job_seen` string remains EXCEPT `temp_tbl_Scrap_jobs` (allowed — scraper table, appears in the user-job-seen `SourceTable` default and throughout the index script).

- [ ] **Step 3: Create `database/setup/create-resume-upload.sql`** (the old CREATE + the two add-column migrations merged):

```sql
/*
  Resume upload table — run ONCE.
  --------------------------------------------------------------------------
  Run this a single time in DBeaver (or any SQL client) connected to the
  ITJC_SCRAPPER database. Idempotent: the IF OBJECT_ID(...) IS NULL guard means
  re-running it will NOT recreate or drop the table if it already exists.

  The app itself NEVER creates this table on upload — it only INSERTs rows.

  Stores applicant info plus the uploaded resume file as VARBINARY(MAX)
  (.pdf/.docx only, enforced by the API route). ResumeText holds the extracted
  plain text used for AI scoring (extracted on upload; old rows back-filled on
  first score). LoginUserID ties an upload to login_users.ID.

  NOTE: on the live DB this table already exists (renamed from
  temp_tbl_resume_upload with the ResumeText/LoginUserID columns already
  applied) — this script is for standing up a fresh environment.
*/

USE [ITJC_SCRAPPER];
GO

IF OBJECT_ID('dbo.resume_upload', 'U') IS NULL
BEGIN
    CREATE TABLE dbo.resume_upload (
        ID          INT IDENTITY(1,1) PRIMARY KEY,
        JobId       NVARCHAR(100)  NULL,
        FirstName   NVARCHAR(100)  NULL,
        LastName    NVARCHAR(100)  NULL,
        Email       NVARCHAR(255)  NOT NULL,
        JobTitle    NVARCHAR(255)  NULL,
        ResumeName  NVARCHAR(255)  NOT NULL,
        Resume      VARBINARY(MAX) NOT NULL,
        FileType    NVARCHAR(20)   NOT NULL,   -- "pdf" or "docx"
        Phone       NVARCHAR(50)   NULL,
        ResumeText  NVARCHAR(MAX)  NULL,
        LoginUserID INT            NULL,
        uploadDate  DATETIME2      NOT NULL DEFAULT SYSUTCDATETIME()
    );

    CREATE INDEX IX_resume_upload_LoginUserID_uploadDate
        ON dbo.resume_upload (LoginUserID, uploadDate DESC);
END;
GO
```

- [ ] **Step 4: Delete the old scripts:**

```bash
git rm database/create-temp-login-users.sql database/create-temp-tbl-career-ops-scores.sql \
  database/create-temp-tbl-resume-upload.sql database/create-temp-user-job-seen.sql \
  database/recommended-temp-scrap-job-filter-indexes.sql \
  database/add-login-user-id-to-resume-upload.sql database/add-resume-text-column.sql
```

- [ ] **Step 5: Update code references** (constants AND comments):
  - `lib/auth/users.ts` line 13: `const USERS_TABLE = "ITJC_SCRAPPER.dbo.login_users";` (also fix the header comment on line 4).
  - `lib/db/scoresRepository.ts` line 13: `const SCORES_TABLE = "ITJC_SCRAPPER.dbo.career_ops_scores";` (+ header comment line 4).
  - `lib/db/resumeRepository.ts` line 12: `const RESUME_TABLE = "ITJC_SCRAPPER.dbo.resume_upload";` (+ header comment line 5).
  - `lib/jobs/userJobSeenRepository.ts` line 13: `const SEEN_TABLE = "ITJC_SCRAPPER.dbo.user_job_seen";` (+ header comment line 5). Do NOT touch `SCRAP_SOURCE_TABLE`.
  - `lib/db/jobsRepository.ts` line 185: `SELECT 1 FROM ITJC_SCRAPPER.dbo.user_job_seen s` (line 188's `SourceTable = 'temp_tbl_Scrap_jobs'` stays; `JOBS_TABLE` stays).
  - `app/api/resume-upload/route.ts` line 129: `INSERT INTO ITJC_SCRAPPER.dbo.resume_upload` (+ comment line 14).
  - Comments only: `auth.ts` line 6 (`temp_login_users` → `login_users`), `lib/careerOps/types.ts` line 163 (`dbo.temp_tbl_resume_upload` → `dbo.resume_upload`), `types/next-auth.d.ts` line 13 (`temp_login_users.ID` → `login_users.ID`).

- [ ] **Step 6: Verify**

Run: `grep -rn "temp_login_users\|temp_tbl_resume_upload\|temp_tbl_career_ops_scores\|temp_user_job_seen" app lib components types auth.ts database` → the ONLY hits are inside `database/migrate/rename-to-production.sql` and the historical NOTE in `database/setup/create-resume-upload.sql` (both intentional).
Run: `grep -rn "temp_tbl_Scrap_jobs" lib database | wc -l` → non-zero (unchanged, expected).
Run: `npx tsc --noEmit && npm run lint` → pass.

⚠️ Runtime note: from this commit on, the app queries the NEW names. Local/dev runs against the live DB will fail until `database/migrate/rename-to-production.sql` is executed there — that is the planned coordinated cutover (Task 11 rechecks this).

- [ ] **Step 7: Commit**

```bash
git add -A && git commit -m "feat: rename app-owned DB tables to production names + reorganize scripts"
```

---

### Task 9: Environment template

**Files:**
- Create: `.env.example`
- Delete: `.env.local.example` (tracked — use `git rm`)
- Modify: `.gitignore`

- [ ] **Step 1: In `.gitignore`**, the `.env*` rule would ignore the new template. Change the env section to:

```gitignore
# env files (can opt-in for committing if needed)
.env*
!.env.example
```

- [ ] **Step 2: Create `.env.example`** (placeholders only — no real host/IP, no removed flags):

```bash
# ITJobCafe — environment template
# Copy to .env.local and fill in values. `.env.local` is gitignored and must
# never be committed. All of these are read server-side only.

# ── Auth (NextAuth v5) ─────────────────────────────────────────────────────
# Generate with: npx auth secret   (or: openssl rand -base64 32)
AUTH_SECRET=
# Google OAuth (optional — email/password login works without it).
AUTH_GOOGLE_ID=
AUTH_GOOGLE_SECRET=

# ── AI scoring ─────────────────────────────────────────────────────────────
# Which model powers scoring: "deepseek" or "anthropic". At least one
# provider key is required — scoring endpoints error without one.
AI_PROVIDER=deepseek
# DeepSeek (OpenAI-compatible API). https://platform.deepseek.com/
DEEPSEEK_API_KEY=
DEEPSEEK_MODEL=deepseek-v4-flash
DEEPSEEK_BASE_URL=https://api.deepseek.com
# Anthropic / Claude (set AI_PROVIDER=anthropic to use it).
ANTHROPIC_API_KEY=
ANTHROPIC_MODEL=claude-haiku-4-5

# ── SQL Server (job feed, auth users, resumes, score cache) ────────────────
DB_SERVER=your-sql-server-host
# Optional named instance. Leave blank when a static DB_PORT is set (a static
# port and an instance name conflict — the port wins).
DB_INSTANCE=
DB_PORT=1433
DB_DATABASE=ITJC
DB_USER=
DB_PASSWORD=
DB_ENCRYPT=false
DB_TRUST_SERVER_CERTIFICATE=true
```

- [ ] **Step 3: Remove the old template:** `git rm .env.local.example`

- [ ] **Step 4: Verify**

Run: `git check-ignore .env.example` → exits non-zero (NOT ignored).
Run: `git status --short | grep env` → shows `.env.example` staged/added and `.env.local.example` deleted; `.env.local` must NOT appear.
Run: `grep -rn "NEXT_PUBLIC_USE_REAL_JOBS\|SCORING_PROVIDER" .env.example lib app` → no output.

- [ ] **Step 5: Commit**

```bash
git add -A && git commit -m "chore: production .env.example template"
```

---

### Task 10: Docs — README rewrite, SCORING.md / SQL_INTEGRATION.md fixes, boilerplate removal

**Files:**
- Rewrite: `README.md`
- Modify: `SCORING.md`, `SQL_INTEGRATION.md`
- Delete: `public/file.svg`, `public/globe.svg`, `public/next.svg`, `public/vercel.svg`, `public/window.svg`

- [ ] **Step 1: Replace `README.md` entirely with:**

```markdown
# ITJobCafe

Swipe-first job discovery for students and new grads. Jobs come from a live
scraper feed (SQL Server); each job can be AI-scored against the user's
uploaded resume to produce a 1.0–5.0 fit score with strengths, gaps, and a
recommendation. Applications are always human-confirmed — nothing is ever
submitted automatically.

## Features

- **Auth** — email/password (bcrypt) and optional Google OAuth via NextAuth v5.
- **Swipe feed** — jobs read server-side from SQL Server with filters (type,
  city, recency); per-user seen-history so reviewed jobs don't resurface.
- **Resume upload** — .pdf/.docx stored in SQL Server; text extracted
  (pdf-parse / mammoth) for scoring.
- **AI scoring** — "Score top jobs with AI" compares the latest resume against
  the top feed jobs via DeepSeek or Anthropic (server-side only, DB-cached).
- **Tracker** — interested / saved / applied pipeline with notes.

## Architecture

- Next.js 16 App Router. Pages live in `app/`, with the authenticated app
  under the `app/(app)/` group (layout enforces login).
- API routes in `app/api/` (auth, jobs, resume-upload, scoring) are the only
  code that touches secrets or the DB.
- `lib/db/*` + `lib/jobs/*` — pooled mssql access (read-only job feed; writes
  for users, resumes, seen-history, and the score cache).
- `lib/scoring/*` + `lib/ai/*` — provider-neutral scoring engine
  (`AI_PROVIDER=deepseek|anthropic`), see `SCORING.md`.
- `lib/careerOps/scoringService.ts` — the real scoring flow: resume text +
  job → model → `career_ops_scores` cache → `job.careerOpsScore` in the UI.

## Setup

1. `npm install`
2. `cp .env.example .env.local` and fill in every value (DB credentials,
   `AUTH_SECRET`, at least one AI provider key).
3. Database (SQL Server): run each script in `database/setup/` once against
   `ITJC_SCRAPPER` — see `database/` and `SQL_INTEGRATION.md`. (For the
   existing shared DB the tables already exist; see Migration below.)
4. `npm run dev` and open http://localhost:3000.

`npm run build` / `npm run start` for production; `npm run lint` to lint.

## Migration note (existing shared DB)

The app queries the production table names (`login_users`, `resume_upload`,
`career_ops_scores`, `user_job_seen`). If the database still has the old
`temp_*` names, run `database/migrate/rename-to-production.sql` once at
deploy time (renames in place, no data loss). The scraper-owned
`temp_tbl_Scrap_jobs` is not renamed.

## Known limitations

- **Swipe/application state is per-browser.** Job statuses, notes, and the
  profile persist to `localStorage` (`lib/swipe/swipeStore.tsx`), so they do
  not follow the user across devices. Server-side persistence is the top
  planned follow-up. (Seen-history and resumes ARE server-side already.)
- The AI score cache also has a local file layer (`data/job-scores.json`,
  gitignored) used by the scoring engine's file-cache seam; the real flow
  caches in the DB.

## Reference docs

- `SCORING.md` — AI scoring pipeline, providers, caching, thresholds.
- `SQL_INTEGRATION.md` — SQL Server integration details and table map.
```

- [ ] **Step 2: Fix `SCORING.md`:**
  1. Line 20: change `provider.evaluate() ──► ClaudeScoringProvider  (structured JSON via messages.parse)` → `provider.evaluate() ──► AiScoringProvider  (lib/scoring/providers/aiProvider.ts)`.
  2. Line 47: change the `ClaudeScoringProvider` bullet to: ``- `AiScoringProvider` — [`lib/scoring/providers/aiProvider.ts`](lib/scoring/providers/aiProvider.ts) — provider-neutral (DeepSeek or Anthropic via `lib/ai`)``.
  3. Run `grep -n "mock\|Mock\|claudeProvider\|SCORING_PROVIDER\|<db-host>" SCORING.md` and fix every remaining hit: delete sentences describing the mock provider / `SCORING_PROVIDER=mock` fallback (scoring now requires an API key), and replace any literal IP with `<your-db-host>`. Re-run the grep until the only possible output is nothing.

- [ ] **Step 3: Fix `SQL_INTEGRATION.md`:**
  1. Replace every occurrence of the IP: `sed -i '' 's/209\.59\.189\.133/<your-db-host>/g' SQL_INTEGRATION.md`
  2. Update renamed tables: `sed -i '' -e 's/temp_tbl_resume_upload/resume_upload/g' -e 's/temp_tbl_career_ops_scores/career_ops_scores/g' -e 's/temp_login_users/login_users/g' -e 's/temp_user_job_seen/user_job_seen/g' SQL_INTEGRATION.md` (leaves `temp_tbl_Scrap_jobs` alone — correct).
  3. Run `grep -n "NEXT_PUBLIC_USE_REAL_JOBS\|mock" SQL_INTEGRATION.md` and rewrite any hit (the feed is no longer toggleable; there is no mock fallback). Also fix any references to old script filenames (`create-temp-...sql` → `setup/create-...sql`).

- [ ] **Step 4: Delete boilerplate SVGs:**

```bash
git rm public/file.svg public/globe.svg public/next.svg public/vercel.svg public/window.svg
```

- [ ] **Step 5: Verify**

Run: `grep -rn "<db-host>" . --exclude-dir=node_modules --exclude-dir=.next --exclude-dir=.git --exclude=".env.local"` → no output.
Run: `grep -rniE "\bmock\b" README.md SCORING.md SQL_INTEGRATION.md` → no output.
Run: `npm run build` → pass (confirms no code referenced the SVGs).

- [ ] **Step 6: Commit**

```bash
git add -A && git commit -m "docs: production README, scoring/SQL doc fixes, remove boilerplate assets"
```

---

### Task 11: Final verification and push to jobs4all_AI

- [ ] **Step 1: Full grep sweep** (scope excludes `docs/superpowers/`, which legitimately discusses the demo history):

```bash
grep -rniE "\bdemo\b|\bmock\b|Demo2" app components lib types auth.ts database README.md SCORING.md SQL_INTEGRATION.md
grep -rn "temp_login_users|temp_tbl_resume_upload|temp_tbl_career_ops_scores|temp_user_job_seen" -E app components lib types auth.ts
grep -rn "<db-host>" . --exclude-dir=node_modules --exclude-dir=.next --exclude-dir=.git --exclude=".env.local"
```

Expected: first and third commands print nothing; second prints nothing (migrate/setup SQL files are outside its scope). Fix any hit before proceeding.

- [ ] **Step 2: Build + lint clean:** `npm run build && npm run lint` → both pass.

- [ ] **Step 3: Smoke test.** ⚠️ DB-dependent flows need the rename script run first — ASK THE USER to run `database/migrate/rename-to-production.sql` against the live ITJC_SCRAPPER database now (this is the coordinated cutover from the spec). Then `npm run dev` and verify: signup → login → swipe feed loads real jobs → job detail shows "Not scored yet" → "Score top 10 jobs with AI" attaches real scores (needs a resume: upload via profile) → new Settings page shows account + sign out works. If the user defers the DB rename, verify only the non-DB checks (landing, login page render, build, greps) and say so in the final report — do not claim full smoke passed.

- [ ] **Step 4: Secrets safety check before pushing:**

```bash
git ls-files | grep -iE "^\.env" # expect exactly: .env.example
git log --all --diff-filter=A --name-only -- ".env*" # expect only .env.local.example (deleted) and .env.example
git status --short # expect empty (everything committed)
```

- [ ] **Step 5: Push** (repo currently has no remote):

```bash
git remote add origin https://github.com/ckarunakar/jobs4all_AI.git
git branch -M main
git push -u origin main
```

Expected: push succeeds; `git branch -vv` shows `main` tracking `origin/main`.

- [ ] **Step 6: Report to the user**, including the two user-action items from the spec: (1) run the DB rename script at cutover if not already done, and (2) rotate the Google OAuth client secret, `AUTH_SECRET`, the SQL Server password, and the Anthropic/DeepSeek API keys before collaborators get access.
