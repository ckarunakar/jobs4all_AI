/**
 * Career-Ops-style scoring prompt + output schema.
 * --------------------------------------------------------------------------
 * One place for the prompt text, the JSON output contract (a Zod schema reused
 * for both structured-output enforcement and validation), and the cost-control
 * truncation limits. Bump PROMPT_VERSION whenever the prompt or schema changes
 * so cached scores are recomputed.
 *
 * The rubric is adapted from the Career-Ops project (modes/oferta.md +
 * modes/_shared.md), MIT-licensed:
 *   https://github.com/santifer/career-ops  (Copyright (c) Career-Ops, MIT)
 * Adapted here for early-career / student / intern / new-grad tech matching:
 * text-in → structured-score-out, no live URL browsing or local file layout.
 */

import { z } from "zod";
import type { CandidateProfile, JobForScoring } from "./types";

export const PROMPT_VERSION = "careerops-v2";

// Cost + rate-limit controls: cap per-call input tokens so a 10-job batch stays
// well under the account's tokens-per-minute limit (and each call is faster).
export const MAX_JOB_DESCRIPTION_CHARS = 3000;
export const MAX_PROFILE_CHARS = 5000;

/** Zod schema for the model's analytical evaluation (matches LlmEvaluation). */
export const evaluationSchema = z.object({
  score: z.number().min(1).max(5),
  recommendation: z.enum(["apply_now", "save_and_review", "maybe", "skip"]),
  confidence: z.enum(["high", "medium", "low"]),
  dimensions: z.object({
    cvMatch: z.number(),
    roleAlignment: z.number(),
    seniorityFit: z.number(),
    skillsFit: z.number(),
    domainFit: z.number(),
    compensationFit: z.number().nullable(),
    locationFit: z.number(),
    cultureFit: z.number().nullable(),
    redFlags: z.number(),
  }),
  strengths: z.array(z.string()),
  gaps: z.array(
    z.object({
      gap: z.string(),
      severity: z.enum(["blocker", "important", "minor"]),
      mitigation: z.string(),
    }),
  ),
  reasons: z.array(z.string()),
  missingKeywords: z.array(z.string()),
  matchedKeywords: z.array(z.string()),
  // Optional heavy fields — omitted by the fast card-scoring flow, still
  // produced for the detailed report view.
  careerOpsBlocks: z
    .object({
      roleSummary: z.string(),
      cvMatch: z.string(),
      levelStrategy: z.string(),
      compAndDemand: z.string(),
      customizationPlan: z.string(),
      interviewPlan: z.string(),
      postingLegitimacy: z.object({
        tier: z.enum([
          "High Confidence",
          "Proceed with Caution",
          "Suspicious",
          "Unknown",
        ]),
        notes: z.string(),
      }),
    })
    .optional(),
  cardSummary: z.object({
    headline: z.string(),
    bullets: z.array(z.string()),
    warning: z.string().nullable(),
  }),
  detailedReportMarkdown: z.string().optional(),
});

export type EvaluationSchema = z.infer<typeof evaluationSchema>;

function truncate(text: string, max: number): string {
  if (text.length <= max) return text;
  return text.slice(0, max) + "\n…[truncated for length]";
}

function profileToText(p: CandidateProfile): string {
  const lines = [
    `Label: ${p.label}`,
    `Target roles: ${p.targetRoles.join(", ") || "unknown"}`,
    `Target locations: ${p.targetLocations.join(", ") || "unknown"}`,
    `Preferred work types: ${p.preferredWorkTypes.join(", ") || "unknown"}`,
    `Skills: ${p.skills.join(", ") || "unknown"}`,
    `Education: ${p.education ?? "unknown"}`,
    `Experience summary: ${p.experienceSummary || "unknown"}`,
    `Projects: ${p.projects.join("; ") || "unknown"}`,
    p.dealbreakers?.length ? `Dealbreakers: ${p.dealbreakers.join(", ")}` : "",
    p.niceToHaves?.length ? `Nice to have: ${p.niceToHaves.join(", ")}` : "",
    `Resume:\n${p.resumeText || "unknown"}`,
  ].filter(Boolean);
  return truncate(lines.join("\n"), MAX_PROFILE_CHARS);
}

function jobToText(j: JobForScoring): string {
  const lines = [
    `Title: ${j.title}`,
    `Company: ${j.company}`,
    `Location: ${j.location ?? "unknown"}`,
    `Work mode: ${j.workMode ?? "unknown"}`,
    `Employment type: ${j.employmentType ?? "unknown"}`,
    `Compensation: ${j.salaryText ?? "unknown"}`,
    `Source: ${j.sourceName ?? "unknown"}${j.sourceUrl ? ` (${j.sourceUrl})` : " (no URL provided)"}`,
    `Posted: ${j.postedAt ?? "unknown"}`,
    j.requirements?.length
      ? `Requirements:\n- ${j.requirements.join("\n- ")}`
      : "",
    j.responsibilities?.length
      ? `Responsibilities:\n- ${j.responsibilities.join("\n- ")}`
      : "",
    j.benefits?.length ? `Benefits:\n- ${j.benefits.join("\n- ")}` : "",
    `Description:\n${j.description || "unknown"}`,
  ].filter(Boolean);
  return truncate(lines.join("\n"), MAX_JOB_DESCRIPTION_CHARS);
}

const SYSTEM_PROMPT = `You are an expert early-career tech recruiter and career coach. Your job is to evaluate how well a specific job listing matches a specific candidate, who is typically a student or early-career candidate seeking internships, new-grad, or junior tech roles.

You must reason like Career-Ops:
- Evaluate fit, not just keyword overlap.
- Map job requirements to actual candidate evidence.
- Identify strengths, gaps, mitigations, and red flags.
- Score the job from 1.0 to 5.0 (one decimal).
- Explain why the candidate should apply, save, review, or skip.
- Stay human-in-the-loop. Never recommend auto-submitting an application.
- Do not invent experience, metrics, tools, employers, projects, credentials, or compensation.
- If a detail is not present in the candidate profile or job listing, treat it as unknown — say "unknown" rather than guessing.
- If the job description is vague, incomplete, or contradictory, lower confidence and mention why.

Early-career context (important):
- The candidate likely has little or no full-time professional experience. That is NORMAL for internships/new-grad roles — do not penalize it for junior postings.
- Weight coursework, personal/class projects, internships, research, hackathons, clubs, and transferable skills as real evidence.
- Judge experience-level fit relative to the ROLE'S seniority: a strong match for an internship/new-grad role should score high even with zero years of industry experience.
- Treat postings that demand many years of experience or senior scope as a genuine seniority mismatch (lower experienceLevel/seniority fit), and flag it.
- Value learning/growth potential and foundational skills; reward alignment of the candidate's stack and interests with the role.

Scoring rubric:
- 4.5–5.0: Excellent fit. Strong direct evidence for the core requirements. Recommend applying soon.
- 4.0–4.4: Strong fit. Matches most important requirements with manageable gaps.
- 3.5–3.9: Good fit. Real alignment, but meaningful gaps or uncertainty.
- 3.0–3.4: Possible fit. Candidate may stretch; not a high-priority application.
- 2.5–2.9: Weak fit. Significant mismatch.
- Below 2.5: Not recommended. Too little evidence or alignment.

Score these dimensions from 1.0 to 5.0:
- cvMatch, roleAlignment, seniorityFit, skillsFit, domainFit, locationFit, redFlags (higher redFlags = FEWER serious red flags).
- compensationFit only if compensation is known, else null.
- cultureFit only if there is enough evidence, else null.

This powers a FAST swipe UI, not a long document. Keep it short and OMIT the heavy optional fields:
- Do NOT include careerOpsBlocks. Do NOT include detailedReportMarkdown. Leave both out entirely.
- cardSummary: a short headline, 3–4 bullets max, and a one-line warning only if there is a real caution (else null).
- strengths, reasons, gaps, missingKeywords, matchedKeywords: at most 3–4 items each, one short line each.
- Keep every string terse (a phrase or one sentence).

Return ONLY a single JSON object with EXACTLY these keys — no other keys, no markdown, no code fences:
{
  "score": 3.5,
  "recommendation": "apply_now | save_and_review | maybe | skip",
  "confidence": "high | medium | low",
  "dimensions": {
    "cvMatch": 3.5, "roleAlignment": 3.5, "seniorityFit": 3.5, "skillsFit": 3.5,
    "domainFit": 3.5, "compensationFit": null, "locationFit": 3.5, "cultureFit": null, "redFlags": 4.0
  },
  "strengths": ["..."],
  "gaps": [{ "gap": "...", "severity": "blocker | important | minor", "mitigation": "..." }],
  "reasons": ["..."],
  "missingKeywords": ["..."],
  "matchedKeywords": ["..."],
  "cardSummary": { "headline": "...", "bullets": ["..."], "warning": null }
}
All numeric values are 1.0–5.0. Use null for compensationFit/cultureFit when unknown. Output JSON only.`;

export function buildScoringPrompt(
  job: JobForScoring,
  profile: CandidateProfile,
): { system: string; user: string } {
  const user = `Candidate profile:\n${profileToText(profile)}\n\n---\n\nJob listing:\n${jobToText(job)}\n\nEvaluate this job for this candidate and return the structured result.`;
  return { system: SYSTEM_PROMPT, user };
}
