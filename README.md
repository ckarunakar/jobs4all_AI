# ITJobCafe — Frontend MVP

**Swipe through high-fit tech jobs.** AI-ranked job search for students and new
grads — focus on roles worth your time, with **Career-Ops-style fit scoring**
and a strict **human-confirmed** application flow.

> You review. You decide. You apply. ITJobCafe never auto-submits applications.

This repository is a **polished frontend demo** built to present to project
leads. It runs entirely on mock data — there is no backend, database, auth, or
scraper yet. Everything is wired through clean abstraction layers so the real
backend and [Career-Ops](https://github.com/santifer/career-ops) integration
can be dropped in later without rewriting the UI.

## Product

A **swipe-first** (Sorce-style) job-discovery app for **college students, new
grads, interns, and early-career tech job seekers** (not hourly/frontline work):

- **AI-ranked job search** — scraped tech roles ranked by fit, one card at a time.
- **Career-Ops-style fit scoring** — one transparent score per job, out of 5.0.
- **Human-confirmed applications** — swiping right means "prepare application," not
  auto-submit; you confirm a checklist before anything is marked applied.
- **Built for internships, new grad, and tech roles.**

### Design system

The UI follows a **flat, light, "poster" design system** (see
[`types/design.md`](types/design.md)): white / gray-100 surfaces, bold solid
color blocks, **Outfit** typography, moderate radii, **no shadows, no blur, no
realistic gradients** — hierarchy comes from scale, color, and type. Tokens are
centralized in [`app/globals.css`](app/globals.css) (CSS vars mapped via
`@theme`), so the palette is tunable in one place.

## MVP scope (what's built)

| Page | Route | Highlights |
|------|-------|-----------|
| Landing | `/` | Flat poster landing: hero with live preview card, color-block features, CTAs |
| Swipe feed | `/swipe` | Framer-Motion swipe deck, drag + button + keyboard controls, progress, toasts, end-of-deck summary |
| Job detail | (slide-over) | Score meter, Career-Ops breakdown, required/nice-to-have skills, suggested action |
| Review & Apply | (modal) | Resume select, profile summary, 6-item checklist, notes, external link, "Mark as Applied" |
| Dashboard | `/dashboard` | Swipe activity, top recommended, pipeline, fit-score + profile-readiness cards |
| Applications | `/applications` | Pipeline board (Interested → Saved → Ready → Applied → Interview → Rejected → Skipped) + filters |
| Profile | `/profile` | Profile form with completion %, chips, tag inputs, resume upload placeholder |
| Settings | `/settings` | Integration cards incl. "Human-confirmed apply mode: Enabled" |

Swipe controls: drag the card, use the action buttons (Skip / Save / Details /
Interested / Review & Apply), or keyboard — **← skip · → interested · ↑ save ·
Enter details**.

### Scoring rules (demo)

Scores run **1.0–5.0**; recommended apply threshold is **3.5**. All thresholds
live in [`lib/careerOps/scoreUtils.ts`](lib/careerOps/scoreUtils.ts) so they can
be retuned in one place.

- **4.5–5.0** → Excellent fit
- **3.5–4.49** → Recommended
- **2.5–3.49** → Possible, review carefully
- **< 2.5** → Low priority (shown, not hidden)

## What is mocked

- **Jobs** — ~16 mock roles in
  [`lib/mockData/swipeJobs.ts`](lib/mockData/swipeJobs.ts) by default. A
  **read-only SQL Server feed** is also wired up (`NEXT_PUBLIC_USE_REAL_JOBS=true`
  → `/api/jobs`); see **[SQL_INTEGRATION.md](SQL_INTEGRATION.md)**. Mock jobs are
  the automatic fallback if the live feed fails.
- **Fit evaluations** — **real AI scoring is wired up** (server-side,
  provider-agnostic) via `app/api/scoring/*`; see **[SCORING.md](SCORING.md)**.
  Set `AI_PROVIDER=deepseek` (cheap) or `anthropic` with that provider's key —
  the AI call is provider-neutral (`lib/ai/modelClient.ts`). Without a key it
  falls back to a deterministic **mock provider** so the demo always runs.
- **Profile & state** — held in a client store
  ([`lib/swipe/swipeStore.tsx`](lib/swipe/swipeStore.tsx)) and persisted to
  `localStorage`. No real backend/auth/database.
- **Resume upload & PDF parsing** — UI placeholders only; "uploading" appends a
  mock file reference.
- **Application submission** — never automatic. The flow only marks a job as
  applied locally after you confirm the checklist.
- **Settings integrations** — status placeholders; no real API calls or keys.

### Explicitly NOT implemented yet (by design)

AI-generated resumes, cover-letter generation, automatic submission, real PDF
parsing, and real Career-Ops execution. Each has a placeholder and/or adapter
seam with a `TODO(backend)` marker.

## Career-Ops integration notes

Career-Ops is an AI job-search pipeline that evaluates offers with a **6-block
A–F framework**, classifies roles into **archetypes**, and tracks applications
through a canonical **status state machine** — and it **never auto-submits**.
We adapted those concepts into a typed frontend seam:

```
lib/careerOps/
  types.ts        # CareerOpsEvaluation, CareerOpsScore,
                  # CareerOpsScoreBreakdown, ApplicationStatus, ResumeProfile
  scoreUtils.ts   # thresholds, tiers, score labels/colors, next-action copy
  swipeAdapter.ts # mock evaluateJobForUser() — shaped like real Career-Ops output
```

Concept mapping:

| Career-Ops | ITJobCafe frontend |
|------------|--------------------|
| 6-block A–F evaluation (CV match, North Star, comp, culture, red flags) | `CareerOpsScoreBreakdown` (weighted blocks → global score) |
| Archetype detection | `CareerOpsEvaluation.archetype` |
| Canonical statuses (`evaluated, applied, responded, interview, offer, rejected, discarded, skip`) | `ApplicationStatus` + `statusToPipelineColumn()` |
| `PipelineMetrics` (total, avg, top, by-status, actionable) | dashboard stat cards + metrics |
| Profile sources (`cv.md`, `profile.yml`, `_profile.md`) | `ResumeProfile` |
| Human-in-the-loop (never auto-submit) | the entire Review & Apply flow |

## Future backend integration plan

1. **Replace mock jobs** — point the data layer at the scraper feed; keep the
   `SwipeJob` shape in [`types/swipe.ts`](types/swipe.ts).
2. **Go live on scoring** — replace `evaluateJobForUser()` in
   [`lib/careerOps/swipeAdapter.ts`](lib/careerOps/swipeAdapter.ts) with a real
   Career-Ops call (HTTP endpoint wrapping Career-Ops, or read its
   `reports/*.md` / `applications.md` output). Keep the `CareerOpsEvaluation`
   return shape — no UI changes needed.
3. **Persistence & auth** — swap `localStorage` in `swipeStore.tsx` for API calls;
   the action surface (`decide`, `setStatus`, `markApplied`, `updateProfile`,
   …) already mirrors a real data layer.
4. **Resume parsing** — wire real upload + PDF parsing and set
   `ResumeFileRef.parsed`.
5. **Settings** — connect model-provider selection, real (secured) API keys,
   rate limits, and billing.

Search the codebase for `TODO(backend)` to find every integration seam.

## Tech stack

Next.js (App Router) · TypeScript · Tailwind CSS v4 · lucide-react ·
Framer Motion (swipe animations) · custom shadcn-style UI primitives
(`cn` + `class-variance-authority`).

## Folder structure

```
app/
  page.tsx                 # flat poster landing
  (app)/                   # app route group (no path segment)
    layout.tsx             # swipe store + toasts + shared modals
    swipe/ dashboard/ applications/ profile/ settings/
  globals.css              # centralized flat/light design tokens
components/
  landing/     # Landing (poster sections)
  swipe/       # SwipeDeck, DraggableCard, SwipeJobCard, ScoreMeter, MobileNav, …
  dashboard/   # StatCard, FitScoreCard
  applications/# ApplicationChecklist
  profile/     # TagInput
  settings/    # IntegrationStatusCard
  layout/      # Logo
  shared/ ui/  # EmptyState; flat shadcn-style primitives
lib/
  careerOps/   # adapter types, swipe mock adapter, score utils
  mockData/    # swipeJobs, default profile
  swipe/       # swipe store, status maps, profile completion
  utils/       # cn
types/         # swipe
```

## Run locally

```bash
npm install
npm run dev      # http://localhost:3000
```

Other scripts:

```bash
npm run build    # production build (passes clean)
npm run lint     # eslint (passes clean)
npm run start    # serve the production build
```

Open `/` for the landing page, then **Open Swipe Demo** (`/swipe`) to start
swiping. The app top bar has a **Reset** control to restore the original mock
data at any time.
