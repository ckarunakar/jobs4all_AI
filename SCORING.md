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
scoreJob.evaluateJob()
  ├─ computeInputHash(job + profile + prompt + provider + model)
  ├─ cache hit? → return cached  (data/job-scores.json)
  ├─ provider.evaluate() ──► ClaudeScoringProvider  (structured JSON via messages.parse)
  │                          └─ or MockScoringProvider (deterministic, no key)
  ├─ validate (zod) + normalize (clamp 1–5, dedupe, cap bullets)
  ├─ derive scoreLabel + attach metadata (model, provider, inputHash, scoredAt)
  └─ write cache
        ▼
JobEvaluationResult → card score/label/strengths/gaps + detail report
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

- `ClaudeScoringProvider` — [`lib/scoring/providers/claudeProvider.ts`](lib/scoring/providers/claudeProvider.ts)
  (Anthropic Node SDK, structured outputs via `messages.parse` + `zodOutputFormat`).
- `MockScoringProvider` — [`lib/scoring/providers/mockProvider.ts`](lib/scoring/providers/mockProvider.ts)
  (deterministic, profile-aware, no network). Used automatically when there's no API key.
- Selected in [`providerRegistry.ts`](lib/scoring/providerRegistry.ts). Add Gemini /
  DeepSeek / OpenAI / local by implementing `LlmProvider` and branching there — **nothing
  else changes** (routes, cache, UI are provider-agnostic).

## Setup (`.env.local`)

Copy [`.env.local.example`](.env.local.example) → `.env.local`:

```env
AI_PROVIDER=deepseek                  # "deepseek" (cheap) or "anthropic" (fallback)

DEEPSEEK_API_KEY=sk-...               # server-side only; .env.local is gitignored
DEEPSEEK_MODEL=deepseek-v4-flash
DEEPSEEK_BASE_URL=https://api.deepseek.com

ANTHROPIC_API_KEY=sk-ant-...          # fallback provider
ANTHROPIC_MODEL=claude-haiku-4-5
# SCORING_PROVIDER=mock               # force mock even with a key (free demos)
```

- **Provider-neutral:** the AI call lives behind `lib/ai/modelClient.ts`
  (`generateCareerOpsJson`) → `lib/ai/deepseek.ts` / `lib/ai/anthropic.ts`. Switching
  providers is a one-line `AI_PROVIDER` change; the rubric, cache, and routes don't change.
- **No key set → mock mode** (free, deterministic) so the demo always runs.
- Cache rows are namespaced by provider (`ModelName = "deepseek:deepseek-v4-flash"`), so
  DeepSeek and Anthropic scores never collide.
- Keys are read only inside server code (`app/api/scoring/*`, `lib/ai/*`) — never sent to the client.

## How to score

- **Lazy (automatic):** the swipe page scores the current + next two cards as you reach them,
  cached so re-renders never re-call. Cards show "AI scoring…" then update.
- **Single job:** `POST /api/scoring/score-job` `{ "jobId": "s-001", "forceRefresh": false }`
- **Batch:** `POST /api/scoring/score-batch` `{ "jobIds": ["s-001","s-002"] }`
  (concurrency-limited to 2, capped at 20). The dashboard's **Score all jobs** button uses this.
- **Re-score:** the job detail panel has a **Re-score** button (`forceRefresh: true`).

Both routes also accept an optional `profile` (the app's editable profile); without it they
use the server demo candidate ([`lib/scoring/demoCandidate.ts`](lib/scoring/demoCandidate.ts)).

## Caching

Scores are cached in `data/job-scores.json` (gitignored) keyed by an input hash of
`promptVersion + provider + model + job + profile`. Change any of those → re-score.
Swap [`scoreCache.ts`](lib/scoring/scoreCache.ts) for a DB table later (the
`getCached`/`setCached` signatures are the seam).

## Cost controls

Cache; lazy (only visible cards) scoring; concurrency limit 2; batch cap 20; job/profile
truncation (12k chars each); cheapest model by default; `forceRefresh` only on explicit
re-score. No scoring on every render.

## Future hooks

Gemini/DeepSeek/OpenAI/local providers; real resume upload + parsing → richer
`CandidateProfile`; DB-backed score storage; per-skill score analytics. The types and
seams are in place; none are built yet.
