# Guest Browsing + Incremental AI Scoring — Design

**Date:** 2026-08-06
**Goal:** (1) Each click of the batch-score button scores the next 10 unscored jobs instead of dead-ending after one batch. (2) Guests can browse and swipe jobs without an account; only AI scoring requires login, with explicit login prompts in every place a score would appear.

## Decisions (approved)

- Deck model: keep the full fetched batch (100 jobs). Batch scoring merges scores in; scored-but-unswiped jobs sort first (score desc), unscored follow in original order. Nothing is discarded.
- Guest scope: swipe feed + job detail modal are public. Dashboard, applications, profile, settings stay login-only.
- Guests swipe freely (interested/save/skip, Review & Apply) via localStorage, same as logged-in users. Account-based seen-history sync is skipped for guests.
- "Ask AI to score" is a live per-job button using the existing `/api/scoring/score-job` endpoint (currently caller-less).
- Routing: nested `(protected)` route group with its own redirecting layout; the outer app-shell layout becomes auth-optional. URLs unchanged.

## Section 1 — Incremental scoring (store only; no server changes)

`lib/swipe/swipeStore.tsx`:

- `scoreTopJobs` is renamed `scoreNextJobs` (the old name described the discarded replace-the-deck behavior) and reworked:
  1. Candidates = queue jobs (status `"new"`) with no `careerOpsScore`, in current queue order; take the first `SCORE_TOP_N` (10).
  2. If none: return `{ ok: false, error: "All jobs are scored." }` (button should already be disabled).
  3. POST `/api/scoring/score-batch` with those `jobIds` + `profile` (server already accepts explicit ids, caps at 10, uses session identity).
  4. Merge returned `careerOpsScore`s into the existing jobs array (no replacement). Statuses untouched.
  5. Re-sort the jobs array: scored jobs with status `"new"` first, by `careerOpsScore.score` desc; then unscored `"new"` jobs in prior relative order; swiped jobs keep their entries (order among them irrelevant — queue derives from status).
- New action `scoreOneJob(jobId): Promise<{ ok: boolean; error?: string }>`: POST `/api/scoring/score-job` with `{ jobId, profile }`; on success merge that job's score in place. **No re-sort** — the card the user is reading must not move. De-dupe: no-op if that job already has a score or a single-job request for it is in flight.
- Scoring state: keep the global `scoring` flag for the batch button; per-job scoring tracks in-flight ids (e.g. `scoringIds: Set<string>` exposed as a lookup) so each card can show its own spinner.

Main button (swipe page, logged in): label `Score next 10 jobs with AI`; spinner + disabled while batch runs; disabled with label `All jobs scored` when no unscored jobs remain in the deck.

Error handling unchanged in kind: failures toast the server message (including "Upload a resume before scoring jobs."). Guests never reach these calls (UI gates them to /login), and the server 401s as a backstop.

## Section 2 — Public browsing & routing

- `app/(app)/layout.tsx`: remove the redirect. Read the session; pass `sessionEmail` (as today) plus `isLoggedIn: boolean` into `SwipeStoreProvider`. Guests get the same providers.
- New `app/(app)/(protected)/layout.tsx`: `const session = await auth(); if (!session?.user) redirect("/login"); return children;`. Move `dashboard/`, `applications/`, `profile/`, `settings/` directories into `(protected)/`. URLs unchanged (route groups don't affect paths).
- `lib/swipe/swipeStore.tsx`: store exposes `isLoggedIn`. `markSeen` no-ops when `isLoggedIn` is false (today a guest POST to `/api/jobs/seen` would 401 and warn).
- Implementation check (flagged for the plan): confirm `GET /api/jobs` and `GET /api/jobs/filter-options` serve guests (the seen-exclusion is session-conditional). If either rejects sessionless requests, make it optional-session.
- Nav: `components/swipe/MobileNav.tsx` and the `SwipeShell` header (the two navigation surfaces in the app group — the plan enumerates their exact link lists) show guests the feed link plus a **Log in** button; account-page links remain visible and land on /login via the protected layout.
- Landing (`app/page.tsx`, `components/landing/Landing.tsx`): header and hero CTAs always link to `/swipe`. Labels: logged out → `Browse jobs`; logged in → `Open the app`. The `Set Up Profile` secondary button keeps pointing at /profile (protected → login). The footer CTA section links to /swipe with the same label rule.

## Section 3 — Score-area UI states

One shared presentation concept ("score panel state"), applied to the card score box, the detail modal score panel, and the main button:

| State | Card score box | Detail modal panel | Main button |
|---|---|---|---|
| Guest | Blurred meter + overlay button `Log in to see AI ratings` → `/login` | Same blurred panel + login button | `Log in to get AI ratings` → `/login` |
| Logged in, unscored | `Ask AI to score` button (Sparkles) → `scoreOneJob`; `AI scoring…` spinner while that job is in flight | Same button/spinner | `Score next 10 jobs with AI` (or disabled `All jobs scored`) |
| Logged in, scored | Today's ScoreMeter + `AI scored` badge | Today's full score sections | unchanged |

Notes:
- The placeholder-3.0 meter and "Not scored yet" text disappear from cards and modal entirely.
- Blur implementation: static meter graphic under a `backdrop-blur`/opacity overlay with the login button centered — no real score data behind it (guests have none).
- The landing hero preview card (`PREVIEW_JOB`) will consequently show the guest state — blurred bar + "Log in to see AI ratings" — which is intentional advertising of the feature.
- Strengths/description section of the card is unchanged (unscored jobs continue to show the description).
- Out of scope, explicitly: dashboard/tracker row chips and metrics keep using the neutral internal fallback score; those pages are login-only and unchanged by this project.

## Error handling

- Guest hits any scoring control: routed to `/login` client-side; server 401 remains the backstop.
- `scoreOneJob` failure: toast the message; the panel returns to the `Ask AI to score` state.
- Batch with fewer than 10 unscored remaining: scores however many are left (server handles ≤10 fine).
- No-resume: existing 400 message surfaces as a toast; panel returns to unscored state.

## Verification (no test framework; build + smoke)

1. `npm run build` + `npm run lint` clean.
2. Guest persona: open landing → `Browse jobs` → feed loads 100 jobs sessionless; swipe + detail modal work; all three score surfaces show login prompts that land on /login; dashboard/profile/applications/settings URLs redirect to /login.
3. User persona: log in → batch click #1 scores 10 (ranked first), click #2 scores 10 more (20 ranked), per-job `Ask AI to score` fills in place without deck reorder, button reads `All jobs scored` when done; seen-history still syncs.

## Out of scope

- Server/API changes beyond the optional-session check on the jobs read endpoints.
- Any change to scoring cost controls (per-click cap stays 10).
- Server-side persistence of swipe state (separate planned project).
- Google OAuth / HTTPS work.
