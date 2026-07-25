# AI Job Scoring (Career-Ops integration)

This app scores each job against the candidate profile using a **provider-agnostic**,
**server-side** pipeline inspired by [Career-Ops](https://github.com/santifer/career-ops).
Each job gets a single **1.0–5.0 fit score**, strengths, gaps, a recommendation, and a
full Career-Ops-style report.

## How scoring works

```
SwipeJob + candidate profile
        │  (client → POST, server-side only)
        ▼
/api/scoring/score-job | score-batch
        │
        ▼
scoringService: cache hit? → return cached  (career_ops_scores DB table)
        │  (skipCache: true — the engine's file cache below is bypassed in prod)
        ▼
scoreJob.evaluateJob()
  ├─ computeInputHash(job + profile + prompt + provider + model)
  ├─ provider.evaluate() ──► AiScoringProvider  (lib/scoring/providers/aiProvider.ts)
  ├─ validate (zod) + normalize (clamp 1–5, dedupe, cap bullets)
  └─ derive scoreLabel + attach metadata (model, provider, inputHash, scoredAt)
        ▼
JobEvaluationResult → card score/label/strengths/gaps + detail report
        ▼
scoringService writes the result to career_ops_scores
```

- **Scale (Career-Ops):** recommended apply threshold = **4.0**. Labels: Excellent (4.5+),
  Strong (4.0+), Good (3.5+), Possible (3.0+), Weak (2.5+), Not recommended. All thresholds
  live in [`lib/careerOps/scoreUtils.ts`](lib/careerOps/scoreUtils.ts).
- **Human-in-the-loop:** the model never auto-applies. It recommends `apply_now` /
  `save_and_review` / `maybe` / `skip`; you still review and confirm in Review & Apply.

## Provider abstraction

`LlmProvider` ([`lib/scoring/types.ts`](lib/scoring/types.ts)) is the seam:

```ts
interface LlmProvider {
  name: string;
  model: string;
  evaluate(input: JobEvaluationInput): Promise<LlmEvaluation>;
}
```

- `AiScoringProvider` — [`lib/scoring/providers/aiProvider.ts`](lib/scoring/providers/aiProvider.ts) — provider-neutral (DeepSeek or Anthropic via `lib/ai`)
- Selected in [`providerRegistry.ts`](lib/scoring/providerRegistry.ts). Add Gemini /
  DeepSeek / OpenAI / local by implementing `LlmProvider` and branching there — **nothing
  else changes** (routes, cache, UI are provider-agnostic).

## Setup (`.env.local`)

Copy [`.env.example`](.env.example) → `.env.local`:

```env
AI_PROVIDER=deepseek                  # "deepseek" (cheap) or "anthropic" (fallback)

DEEPSEEK_API_KEY=sk-...               # server-side only; .env.local is gitignored
DEEPSEEK_MODEL=deepseek-v4-flash
DEEPSEEK_BASE_URL=https://api.deepseek.com

ANTHROPIC_API_KEY=sk-ant-...          # fallback provider
ANTHROPIC_MODEL=claude-haiku-4-5
```

- **Provider-neutral:** the AI call lives behind `lib/ai/modelClient.ts`
  (`generateCareerOpsJson`) → `lib/ai/deepseek.ts` / `lib/ai/anthropic.ts`. Switching
  providers is a one-line `AI_PROVIDER` change; the rubric, cache, and routes don't change.
- **Requires an API key** — set `DEEPSEEK_API_KEY` or `ANTHROPIC_API_KEY` (matching
  `AI_PROVIDER`). Scoring fails without one; there is no offline fallback provider.
- Cache rows are namespaced by provider (`ModelName = "deepseek:deepseek-v4-flash"`), so
  DeepSeek and Anthropic scores never collide.
- Keys are read only inside server code (`app/api/scoring/*`, `lib/ai/*`) — never sent to the client.

## How to score

- **Manual, user-triggered scoring:** there is no automatic/lazy scoring on card view — the
  swipe page's **"Score top N jobs with AI"** button (`SCORE_TOP_N` in
  [`lib/config.ts`](lib/config.ts), currently 10) is what scores jobs, using the signed-in
  session's latest uploaded resume. Results attach to each job as
  `careerOpsScore`; until scored, the job detail modal shows "Not scored yet".
- **Single job:** `POST /api/scoring/score-job` `{ "jobId": "...", "forceRefresh": false }` —
  same real flow (session identity, DB cache) for one job; exists as an API with no current
  UI caller.
- **Batch:** `POST /api/scoring/score-batch` `{ "jobIds": ["...", "..."] }` (concurrency-limited
  to 10, capped at 10 jobs per call) — this is what the swipe page's **Score top N jobs with
  AI** button calls, DB-cached in `career_ops_scores`.
- **Re-score:** pass `forceRefresh: true` to either route to bypass the cache.

Both routes also accept an optional `profile` (the app's editable profile) that enriches the
candidate; the primary signal is always the signed-in user's latest uploaded resume, resolved
server-side in [`lib/careerOps/scoringService.ts`](lib/careerOps/scoringService.ts). If the user
has no uploaded resume, scoring fails with `NoResumeError`.

## Caching

**Production:** the real-jobs flow ([`lib/careerOps/scoringService.ts`](lib/careerOps/scoringService.ts))
caches scores in the `career_ops_scores` SQL Server table, keyed by resume + job + provider/model
+ rubric version, and calls `evaluateJob` with `skipCache: true` so the engine's own file cache is
never consulted or written in prod.

**Local dev seam:** the underlying engine ([`lib/scoring/scoreJob.ts`](lib/scoring/scoreJob.ts)) can
also cache to `data/job-scores.json` (gitignored) via [`scoreCache.ts`](lib/scoring/scoreCache.ts),
keyed by an input hash of `promptVersion + provider + model + job + profile`. This path only runs
when a caller does *not* pass `skipCache: true` — useful for local scripts/tests that exercise the
engine directly, outside the DB-backed production flow.

## Cost controls

Cache; manual, user-triggered scoring only (never automatic); concurrency limit 10; batch cap
10 jobs per call; job/profile truncation (12k chars each); cheapest model by default;
`forceRefresh` only on explicit re-score. No scoring on card view or page load.

## Future hooks

Gemini/DeepSeek/OpenAI/local providers; real resume upload + parsing → richer
`CandidateProfile`; DB-backed score storage; per-skill score analytics. The types and
seams are in place; none are built yet.
