# Guest Browsing + Incremental AI Scoring Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Repeated "Score next 10" clicks score fresh unscored jobs into a persistent ranked deck; guests browse and swipe the feed without an account, with login required only to see or request AI scores.

**Architecture:** All scoring changes are client-side in the swipe store (the batch endpoint already accepts explicit `jobIds`; the single-job endpoint exists unused). Auth opening is a route-group split: the app-shell layout becomes auth-optional and passes `isLoggedIn` into the store; the four account pages move into a nested `(protected)` group whose 4-line layout does the old redirect. A new shared `ScoreGate` component renders the three score-panel states (guest / unscored / scored) on both the card and the detail modal.

**Tech Stack:** Next.js 16.2.9 App Router, React 19, TypeScript, Tailwind 4, NextAuth v5 (`auth()` in server layouts).

## Global Constraints

- Spec: `docs/superpowers/specs/2026-08-06-guest-browsing-incremental-scoring-design.md`. Read it first.
- No server/API changes: `GET /api/jobs` already serves guests (`app/api/jobs/route.ts:54-56` — undefined `loginUserId` skips seen-exclusion) and `GET /api/jobs/filter-options` has no auth. Scoring endpoints keep their session-required 401s as the backstop.
- Exact UI copy: `Score next 10 jobs with AI` / `Scoring next 10…` / `All jobs scored` / `Log in to get AI ratings` (main button); `Log in to see AI ratings` (blurred bar); `Ask AI to score` / `AI scoring…` (per-job button); landing CTAs `Browse jobs` (guest) / `Open the app` (logged in).
- URLs never change: `(protected)` is a route group (parentheses folders don't appear in paths).
- The per-job score fills in place with NO deck re-sort; batch scoring DOES re-sort (scored-new first by score desc, unscored-new after in prior order).
- No test framework — every task verifies with `npx tsc --noEmit && npm run lint`; `npm run build` where marked. Commit after every task with the message given.
- Follow existing conventions: `"use client"` where hooks are used, `@/` imports, JSDoc headers, existing Tailwind idioms (`text-muted`, `bg-surface`, `border-border`, `var(--caution)`).

---

### Task 1: Incremental scoring in the swipe store + swipe page button

**Files:**
- Modify: `lib/swipe/swipeStore.tsx`
- Modify: `app/(app)/swipe/page.tsx`
- Modify: `app/(app)/layout.tsx` (one prop line only in this task)

**Interfaces (produced — later tasks rely on these exact names):**
- `SwipeStoreProvider` new prop: `isLoggedIn?: boolean` (default `false`).
- Store fields added: `isLoggedIn: boolean`, `scoringJobIds: Set<string>`.
- `scoreNextJobs(): Promise<ScoreNextJobsResult>` — replaces `scoreTopJobs` (type `ScoreTopJobsResult` renamed `ScoreNextJobsResult`, same shape).
- `scoreOneJob(jobId: string): Promise<{ ok: boolean; error?: string }>`.
- New export `useSwipeStoreOptional(): SwipeStore | null` (returns null outside the provider — the landing page renders a card with no provider).

- [ ] **Step 1: `lib/swipe/swipeStore.tsx` — provider signature and new state.**

Replace the `SwipeStoreProvider` signature (lines ~171-178) with:

```tsx
export function SwipeStoreProvider({
  children,
  sessionEmail,
  isLoggedIn = false,
}: {
  children: React.ReactNode;
  /** Logged-in email — seeded onto the profile so uploads/scoring use it. */
  sessionEmail?: string;
  /** True when a session exists. Gates seen-history sync and score UI. */
  isLoggedIn?: boolean;
}) {
```

Directly under `const [scoring, setScoring] = useState(false);` add:

```tsx
  const [scoringJobIds, setScoringJobIds] = useState<Set<string>>(new Set());
  // Session-level score memory: survives deck replacement (filters/reset) so
  // already-scored jobs stay visibly scored when they reappear.
  const scoresRef = useRef<Map<string, CareerOpsAiScore>>(new Map());

  /** Re-attach any known scores to a freshly fetched job list. */
  const withKnownScores = useCallback(
    (list: SwipeJob[]): SwipeJob[] =>
      list.map((j) => {
        const known = scoresRef.current.get(j.id);
        return known && !j.careerOpsScore
          ? { ...j, careerOpsScore: known }
          : j;
      }),
    [],
  );
```

- [ ] **Step 2: module-level sort helper.** Add below `withStatuses` (line ~91):

```tsx
/**
 * Deck order after a batch: scored-but-unswiped first (best score first),
 * unscored unswiped next (original order), swiped jobs after (order there is
 * irrelevant — the queue only reads status "new").
 */
function sortScoredFirst(list: SwipeJob[]): SwipeJob[] {
  const scoredNew = list.filter((j) => j.status === "new" && j.careerOpsScore);
  const unscoredNew = list.filter(
    (j) => j.status === "new" && !j.careerOpsScore,
  );
  const rest = list.filter((j) => j.status !== "new");
  scoredNew.sort(
    (a, b) => (b.careerOpsScore?.score ?? 0) - (a.careerOpsScore?.score ?? 0),
  );
  return [...scoredNew, ...unscoredNew, ...rest];
}
```

- [ ] **Step 3: apply `withKnownScores` at every deck load.** Three call sites:
  - Initial load (line ~217): `setJobs(withKnownScores(withStatuses(res.jobs, statuses)));` — and add `withKnownScores` to that effect's dependency array (it is stable, but the linter wants it listed).
  - `loadFilteredJobs` (line ~361): `setJobs(withKnownScores(res.jobs));` — add `withKnownScores` to the `useCallback` deps (currently `[]`).
  - `clearJobFilters` and `reset` (lines ~377, ~391): `setJobs(withKnownScores(res.jobs));` — same dep addition.

- [ ] **Step 4: gate `markSeen` for guests.** Change its first line (line ~252):

```tsx
    if (!isLoggedIn || !jobId) return;
```

(`isLoggedIn` is a plain prop — no dependency-array change needed beyond adding it: update `markSeen`'s `useCallback` deps from `[]` to `[isLoggedIn]`.)

- [ ] **Step 5: replace `scoreTopJobs` with `scoreNextJobs` + add `scoreOneJob`.**

Rename the result interface (line ~103): `export interface ScoreNextJobsResult { ... }` (same fields). Replace the whole `scoreTopJobs` callback (lines ~291-343) with:

```tsx
  const scoreNextJobs = useCallback(async (): Promise<ScoreNextJobsResult> => {
    if (scoring) return { ok: false, error: "Already scoring…" };
    const candidates = jobs
      .filter((j) => j.status === "new" && !j.careerOpsScore)
      .slice(0, SCORE_TOP_N);
    if (candidates.length === 0) {
      return { ok: false, error: "All jobs are scored." };
    }

    setScoring(true);
    try {
      const res = await fetch("/api/scoring/score-batch", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          jobIds: candidates.map((j) => j.id),
          profile,
        }),
      });
      const data = await res.json();
      if (!res.ok || !data.ok) {
        return { ok: false, error: data?.error ?? "Scoring failed" };
      }

      const byId = new Map<string, CareerOpsAiScore>();
      for (const r of data.results ?? []) {
        if (r?.jobId && r?.careerOpsScore) byId.set(r.jobId, r.careerOpsScore);
      }
      byId.forEach((score, id) => scoresRef.current.set(id, score));

      // Merge scores in (nothing is discarded), then float scored jobs to the
      // front of the queue ranked by fit.
      setJobs((prev) =>
        sortScoredFirst(
          prev.map((j) =>
            byId.has(j.id)
              ? { ...j, careerOpsScore: byId.get(j.id) }
              : j,
          ),
        ),
      );

      return {
        ok: true,
        scored: data.scoredCount,
        cached: data.cachedCount,
        count: data.count,
      };
    } catch (err) {
      return {
        ok: false,
        error: err instanceof Error ? err.message : "Scoring failed",
      };
    } finally {
      setScoring(false);
    }
  }, [scoring, jobs, profile]);

  // Score one job in place (per-card "Ask AI to score"). Deliberately NO
  // re-sort: the card being read must not move.
  const scoreOneJob = useCallback(
    async (jobId: string): Promise<{ ok: boolean; error?: string }> => {
      if (!jobId) return { ok: false, error: "Missing job id" };
      if (scoringJobIds.has(jobId)) {
        return { ok: false, error: "Already scoring this job." };
      }
      if (jobs.find((j) => j.id === jobId)?.careerOpsScore) {
        return { ok: true };
      }
      setScoringJobIds((prev) => new Set(prev).add(jobId));
      try {
        const res = await fetch("/api/scoring/score-job", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ jobId, profile }),
        });
        const data = await res.json();
        if (!res.ok || !data.ok || !data.careerOpsScore) {
          return { ok: false, error: data?.error ?? "Scoring failed" };
        }
        scoresRef.current.set(jobId, data.careerOpsScore);
        setJobs((prev) =>
          prev.map((j) =>
            j.id === jobId ? { ...j, careerOpsScore: data.careerOpsScore } : j,
          ),
        );
        return { ok: true };
      } catch (err) {
        return {
          ok: false,
          error: err instanceof Error ? err.message : "Scoring failed",
        };
      } finally {
        setScoringJobIds((prev) => {
          const next = new Set(prev);
          next.delete(jobId);
          return next;
        });
      }
    },
    [jobs, profile, scoringJobIds],
  );
```

- [ ] **Step 6: interface + value object + optional hook.**
  - In the `SwipeStore` interface: add `isLoggedIn: boolean;` (after `hydrated`), `scoringJobIds: Set<string>;` (after `scoring`, JSDoc: `/** Ids with a single-job scoring request in flight. */`), replace the `scoreTopJobs` member with `/** Score the next 10 unscored queue jobs; scored jobs float to the front. */ scoreNextJobs: () => Promise<ScoreNextJobsResult>;` and add `/** Score one job in place (no deck re-sort). */ scoreOneJob: (jobId: string) => Promise<{ ok: boolean; error?: string }>;`.
  - In the `value: SwipeStore` literal: add `isLoggedIn,`, `scoringJobIds,`, replace `scoreTopJobs,` with `scoreNextJobs,`, add `scoreOneJob,`.
  - After `useSwipeStore`, add:

```tsx
/** Like useSwipeStore, but returns null outside a provider (landing page). */
export function useSwipeStoreOptional(): SwipeStore | null {
  return useContext(Ctx);
}
```

- [ ] **Step 7: `app/(app)/layout.tsx`** — pass the flag (the guest redirect stays until Task 2):

```tsx
    <SwipeStoreProvider
      sessionEmail={session.user.email ?? undefined}
      isLoggedIn
    >
```

- [ ] **Step 8: `app/(app)/swipe/page.tsx`** — wire the new actions.
  1. Destructure `isLoggedIn` and `scoreNextJobs` from `useSwipeStore()` (replace `scoreTopJobs`).
  2. Replace `handleScoreTop` with:

```tsx
  const handleScoreNext = async () => {
    const res = await scoreNextJobs();
    if (!res.ok) {
      toast(res.error ?? "Scoring failed", "danger");
      return;
    }
    toast(
      `Scored ${res.count} jobs · ${res.scored} new, ${res.cached} cached`,
      "success",
    );
  };
```

  3. Above the `return`, add: `const hasUnscored = jobs.some((j) => j.status === "new" && !j.careerOpsScore);`
  4. Replace the score-button block (the `{hydrated && jobs.length > 0 && ( ... )}` div) with:

```tsx
          {/* Manual, cost-controlled AI scoring — 10 unscored jobs per click. */}
          {hydrated && jobs.length > 0 && (
            <div className="mt-3">
              {isLoggedIn ? (
                <Button
                  onClick={handleScoreNext}
                  disabled={scoring || !hasUnscored}
                  className="w-full sm:w-auto"
                >
                  {scoring ? (
                    <Loader2 className="size-4 animate-spin" />
                  ) : (
                    <Sparkles className="size-4" />
                  )}
                  {scoring
                    ? `Scoring next ${SCORE_TOP_N}…`
                    : hasUnscored
                      ? `Score next ${SCORE_TOP_N} jobs with AI`
                      : "All jobs scored"}
                </Button>
              ) : (
                <Link href="/login" className="inline-block w-full sm:w-auto">
                  <Button className="w-full">
                    <Sparkles className="size-4" />
                    Log in to get AI ratings
                  </Button>
                </Link>
              )}
            </div>
          )}
```

- [ ] **Step 9: Verify.**

Run: `grep -rn "scoreTopJobs\|ScoreTopJobsResult" app lib components` → no output.
Run: `npx tsc --noEmit && npm run lint` → pass.
Manual (logged in, `npm run dev`): click #1 scores 10 and ranks them first with the other 90 still below; click #2 scores 10 more (toast says `10 new` or cached mix); after all clicks button reads `All jobs scored` disabled; applying a city filter then clearing it keeps previously scored jobs visibly scored.

- [ ] **Step 10: Commit.**

```bash
git add -A && git commit -m "feat: incremental batch scoring; per-job scoring action; session score memory"
```

---

### Task 2: Open the feed to guests (routing, nav, landing)

**Files:**
- Modify: `app/(app)/layout.tsx`
- Create: `app/(app)/(protected)/layout.tsx`
- Move: `app/(app)/dashboard/` → `app/(app)/(protected)/dashboard/` (same for `applications/`, `profile/`, `settings/`)
- Modify: `components/swipe/SwipeShell.tsx`, `app/page.tsx`, `components/landing/Landing.tsx`

**Interfaces:**
- Consumes: `SwipeStoreProvider`'s `isLoggedIn` prop and the store's `isLoggedIn` field (Task 1).

- [ ] **Step 1: make the app shell auth-optional.** Replace the body of `app/(app)/layout.tsx`:

```tsx
import { auth } from "@/auth";
import { SwipeStoreProvider } from "@/lib/swipe/swipeStore";
import { ToastProvider } from "@/components/ui/toast";
import { SwipeInteractionsProvider } from "@/components/swipe/SwipeInteractionsProvider";

/**
 * App shell — public. Guests can browse the feed; account pages live under
 * the nested (protected) group, whose layout redirects to /login.
 */
export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await auth();

  return (
    <SwipeStoreProvider
      sessionEmail={session?.user?.email ?? undefined}
      isLoggedIn={Boolean(session?.user)}
    >
      <ToastProvider>
        <SwipeInteractionsProvider>{children}</SwipeInteractionsProvider>
      </ToastProvider>
    </SwipeStoreProvider>
  );
}
```

(The `redirect` import goes away.)

- [ ] **Step 2: create `app/(app)/(protected)/layout.tsx`:**

```tsx
import { redirect } from "next/navigation";
import { auth } from "@/auth";

/** Account pages require a session; guests are sent to /login. */
export default async function ProtectedLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await auth();
  if (!session?.user) redirect("/login");
  return children;
}
```

- [ ] **Step 3: move the four account pages** (route groups don't change URLs):

```bash
mkdir -p "app/(app)/(protected)"
git mv "app/(app)/dashboard" "app/(app)/(protected)/dashboard"
git mv "app/(app)/applications" "app/(app)/(protected)/applications"
git mv "app/(app)/profile" "app/(app)/(protected)/profile"
git mv "app/(app)/settings" "app/(app)/(protected)/settings"
```

- [ ] **Step 4: `components/swipe/SwipeShell.tsx`** — guests get a Log in button in the header. Destructure `isLoggedIn` too: `const { reset, isLoggedIn } = useSwipeStore();` and replace the header actions div:

```tsx
        <div className="flex items-center gap-1.5">
          {headerActions}
          <Button variant="ghost" size="sm" onClick={reset}>
            <RotateCcw className="size-4" />
            Reset
          </Button>
          {!isLoggedIn && (
            <Link href="/login">
              <Button size="sm">Log in</Button>
            </Link>
          )}
        </div>
```

(`Link` is already imported.)

- [ ] **Step 4b: `components/swipe/MobileNav.tsx`** — guests also get a Log in tab. Replace the component body with:

```tsx
"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { LogIn } from "lucide-react";
import { SWIPE_NAV_ITEMS, type SwipeNavItem } from "./swipe-nav-items";
import { useSwipeStore } from "@/lib/swipe/swipeStore";
import { cn } from "@/lib/utils/cn";

const LOGIN_ITEM: SwipeNavItem = { label: "Log in", href: "/login", icon: LogIn };

/** Bottom tab bar — the primary navigation for the mobile-first swipe flow. */
export function MobileNav() {
  const pathname = usePathname();
  const { isLoggedIn } = useSwipeStore();
  const items = isLoggedIn ? SWIPE_NAV_ITEMS : [...SWIPE_NAV_ITEMS, LOGIN_ITEM];

  return (
    <nav className="fixed inset-x-0 bottom-0 z-30 border-t-2 border-border bg-background">
      <div className="mx-auto flex max-w-2xl items-stretch justify-around">
        {items.map((item) => {
          const active = pathname === item.href;
          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                "flex flex-1 flex-col items-center gap-1 py-2.5 text-[11px] font-semibold transition-colors",
                active ? "text-primary" : "text-muted hover:text-foreground",
              )}
            >
              <item.icon
                className="size-5"
                strokeWidth={active ? 2.5 : 2}
              />
              {item.label}
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
```

(The account tabs stay visible for guests and land on /login via the protected layout; the explicit Log in tab makes the path obvious.)

- [ ] **Step 5: landing CTAs always point at the feed.**
  - `app/page.tsx` line ~18: `<Link href="/swipe">` (drop the ternary href) and label `{loggedIn ? "Open the app" : "Browse jobs"}`.
  - `components/landing/Landing.tsx` lines ~79-80: `const ctaHref = "/swipe";` and `const ctaLabel = loggedIn ? "Open the app" : "Browse jobs";` (both hero and footer CTA sections already use these two consts — no other edits).

- [ ] **Step 6: Verify.**

Run: `npx tsc --noEmit && npm run lint && npm run build` → pass (build proves the moved routes still resolve: `/dashboard`, `/applications`, `/profile`, `/settings` appear in the route list).
Manual: in a private/incognito window (no session): landing shows `Browse jobs` → `/swipe` loads 100 jobs; swiping works and NO request to `/api/jobs/seen` fires (check the network tab); header shows `Log in`; visiting `/dashboard` redirects to `/login`. Logged in: everything behaves as before; seen-history POSTs fire again.

- [ ] **Step 7: Commit.**

```bash
git add -A && git commit -m "feat: public job browsing; protected route group for account pages"
```

---

### Task 3: ScoreGate — three-state score panel on card and modal

**Files:**
- Create: `components/swipe/ScoreGate.tsx`
- Modify: `components/swipe/SwipeJobCard.tsx`, `components/swipe/JobDetailModal.tsx`

**Interfaces:**
- Consumes: `useSwipeStoreOptional`, `scoreOneJob`, `scoringJobIds`, `isLoggedIn` (Task 1).
- Produces: `<ScoreGate job={SwipeJob} scored={React.ReactNode} />` — renders `scored` when `job.careerOpsScore` exists; otherwise the guest or ask-AI state.

- [ ] **Step 1: create `components/swipe/ScoreGate.tsx`:**

```tsx
"use client";

import { useState } from "react";
import Link from "next/link";
import { Loader2, Lock, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ScoreMeter } from "./ScoreMeter";
import { useSwipeStoreOptional } from "@/lib/swipe/swipeStore";
import type { SwipeJob } from "@/types/swipe";

/**
 * The score area's three states:
 *  - guest → blurred meter + "Log in to see AI ratings"
 *  - logged in, unscored → "Ask AI to score" (per-job, fills in place)
 *  - scored → the caller-provided `scored` content
 * Works without a SwipeStoreProvider (landing preview card) — treated as guest.
 */
export function ScoreGate({
  job,
  scored,
}: {
  job: SwipeJob;
  scored: React.ReactNode;
}) {
  const store = useSwipeStoreOptional();
  const [error, setError] = useState<string | null>(null);

  if (job.careerOpsScore) return <>{scored}</>;

  const isLoggedIn = store?.isLoggedIn ?? false;

  if (!isLoggedIn) {
    return (
      <div className="relative" onPointerDown={(e) => e.stopPropagation()}>
        <div className="pointer-events-none select-none opacity-60 blur-[6px]" aria-hidden>
          <ScoreMeter score={4.2} />
        </div>
        <div className="absolute inset-0 flex items-center justify-center">
          <Link href="/login">
            <Button size="sm" variant="secondary">
              <Lock className="size-3.5" />
              Log in to see AI ratings
            </Button>
          </Link>
        </div>
      </div>
    );
  }

  const busy = store?.scoringJobIds.has(job.id) ?? false;

  const handleAsk = async () => {
    if (!store || busy) return;
    setError(null);
    const res = await store.scoreOneJob(job.id);
    if (!res.ok) setError(res.error ?? "Scoring failed");
  };

  return (
    <div
      className="flex flex-col items-center gap-1.5 py-1"
      onPointerDown={(e) => e.stopPropagation()}
    >
      <Button size="sm" variant="secondary" disabled={busy} onClick={handleAsk}>
        {busy ? (
          <Loader2 className="size-3.5 animate-spin" />
        ) : (
          <Sparkles className="size-3.5" />
        )}
        {busy ? "AI scoring…" : "Ask AI to score"}
      </Button>
      {error && (
        <p className="text-xs text-[var(--caution)]">{error}</p>
      )}
    </div>
  );
}
```

(`onPointerDown` stopPropagation keeps taps from starting a drag/swipe — same trick the card's description scroller uses. Errors render inline because the landing page has no ToastProvider.)

- [ ] **Step 2: `components/swipe/SwipeJobCard.tsx`** — replace the score box (the `{/* Score */}` div shown at lines ~100-115) with:

```tsx
        {/* Score */}
        <div className="mt-4 rounded-2xl border border-border bg-surface p-4">
          <ScoreGate
            job={job}
            scored={
              ai ? (
                <>
                  <div className="mb-1.5 flex items-center justify-end">
                    <span className="flex items-center gap-1 text-[11px] font-medium text-accent">
                      <Sparkles className="size-3" />
                      AI scored
                    </span>
                  </div>
                  <ScoreMeter score={ai.score} />
                </>
              ) : null
            }
          />
        </div>
```

Then: add `import { ScoreGate } from "./ScoreGate";`, delete the now-unused `const score = ai?.score ?? job.score;` line (check first: `score` has no other reference in this file — if the grep `grep -n "score\b" components/swipe/SwipeJobCard.tsx` shows another usage, keep the const).

- [ ] **Step 3: `components/swipe/JobDetailModal.tsx`** — replace the score panel (the `{/* Score */}` div: `<div className="mt-5 rounded-2xl border border-border bg-surface p-4">` through its closing `</div>`, currently the `ai ? (...) : ("Not scored yet" block)`) with:

```tsx
      {/* Score */}
      <div className="mt-5 rounded-2xl border border-border bg-surface p-4">
        <ScoreGate
          job={job}
          scored={
            ai ? (
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
            ) : null
          }
        />
      </div>
```

Add `import { ScoreGate } from "./ScoreGate";`. The "Not scored yet" copy is gone. All later sections (`breakdown`, suggested action, pros/cons) already render only when `ai` exists — unchanged.

- [ ] **Step 4: Verify.**

Run: `grep -rn "Not scored yet" app components lib` → no output.
Run: `npx tsc --noEmit && npm run lint && npm run build` → pass.
Manual: (a) incognito guest — landing hero preview card shows the blurred bar with `Log in to see AI ratings`; `/swipe` cards and the detail modal show it too; the button goes to /login and clicking it does NOT swipe the card. (b) Logged in — unscored card shows `Ask AI to score`; clicking shows `AI scoring…` then the meter fills in WITHOUT the deck reordering; modal behaves the same; scored cards show the meter + `AI scored` badge as before.

- [ ] **Step 5: Commit.**

```bash
git add -A && git commit -m "feat: three-state score panel (login gate, ask-AI, scored) on card and modal"
```

---

### Task 4: Docs truth-up + final sweep

**Files:**
- Modify: `README.md`

- [ ] **Step 1:** README's Architecture bullet says the `(app)` group's "layout enforces login" — now wrong. Update the two spots:
  - Features bullet `**Auth**` — append: `Browsing the job feed is public; an account is needed for AI scoring, seen-history sync, and the dashboard/tracker/profile pages.`
  - Architecture bullet about `app/(app)/` — change the parenthetical to: `(the feed is public; account pages live in a nested (protected) group whose layout enforces login)`.

- [ ] **Step 2: Verify + full regression sweep.**

Run: `npm run build && npm run lint` → pass.
Run: `grep -rn "scoreTopJobs\|Not scored yet\|Score top 10" app components lib README.md` → no output.
Manual end-to-end (both personas, from the spec's Verification section): guest browse/swipe/detail + three login prompts; user repeat-batch accumulation, per-job fill-in-place, `All jobs scored` end state, filter continuity, seen-history sync.

- [ ] **Step 3: Commit.**

```bash
git add README.md && git commit -m "docs: public browsing model in README"
```
