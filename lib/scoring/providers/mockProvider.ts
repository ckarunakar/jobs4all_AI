/**
 * Mock scoring provider — deterministic, free, no network.
 * --------------------------------------------------------------------------
 * Produces a genuinely profile-aware evaluation by comparing the job's
 * requirements against the candidate's skills. Used automatically when no
 * ANTHROPIC_API_KEY is set, so the demo always works. Same output shape as the
 * real provider, so swapping to Claude changes nothing downstream.
 */

import { getScoreLabel } from "../normalizeScore";
import type {
  JobEvaluationInput,
  LlmEvaluation,
  LlmProvider,
  Recommendation,
} from "../types";

const lc = (s: string) => s.trim().toLowerCase();

function seedFrom(id: string): number {
  return [...id].reduce((s, c) => s + c.charCodeAt(0), 0);
}

function recommendationFor(score: number): Recommendation {
  if (score >= 4.5) return "apply_now";
  if (score >= 4.0) return "save_and_review";
  if (score >= 3.0) return "maybe";
  return "skip";
}

function clamp(n: number): number {
  return Math.min(5, Math.max(1, Math.round(n * 10) / 10));
}

export const mockProvider: LlmProvider = {
  name: "mock",
  model: "mock-careerops-v1",

  async evaluate({ job, profile }: JobEvaluationInput): Promise<LlmEvaluation> {
    const reqs = job.requirements ?? [];
    const skills = new Set(profile.skills.map(lc));
    const matched = reqs.filter((r) => skills.has(lc(r)));
    const missing = reqs.filter((r) => !skills.has(lc(r)));
    const matchRatio = reqs.length ? matched.length / reqs.length : 0.5;

    const seed = seedFrom(job.id);
    const wobble = ((seed % 7) - 3) / 10; // -0.3..0.3
    const score = clamp(2.6 + matchRatio * 2.2 + wobble);
    const label = getScoreLabel(score);

    const hasComp = !!job.salaryText && job.salaryText !== "unknown";
    const hasUrl = !!job.sourceUrl;

    const dim = (base: number) => clamp(base + wobble);
    const dimensions = {
      cvMatch: dim(score + 0.2),
      roleAlignment: dim(score),
      seniorityFit: dim(score - 0.1),
      skillsFit: dim(2.5 + matchRatio * 2.4),
      domainFit: dim(score - 0.2),
      compensationFit: hasComp ? dim(score - 0.3) : null,
      locationFit: dim(4.2),
      cultureFit: null,
      redFlags: missing.length > 2 ? dim(score - 1) : dim(4.6),
    };

    const strengths = matched.length
      ? matched.slice(0, 3).map((m) => `Direct experience with ${m}`)
      : profile.skills.slice(0, 2).map((s) => `Background in ${s}`);
    if (profile.projects[0]) {
      strengths.push(`Relevant project work: ${profile.projects[0]}`);
    }

    const gaps = missing.slice(0, 2).map((m) => ({
      gap: `No demonstrated experience with ${m}`,
      severity: "important" as const,
      mitigation: `Highlight a transferable project or note a quick ramp on ${m}.`,
    }));

    const legitimacy = hasUrl
      ? ("High Confidence" as const)
      : ("Proceed with Caution" as const);
    const legitimacyNotes = hasUrl
      ? "Real title, company, and a direct posting URL were provided."
      : "Real title and description, but no direct apply URL was provided.";

    const bullets = [
      ...matched.slice(0, 2).map((m) => `Strong match on ${m}`),
      ...(missing[0] ? [`Gap: ${missing[0]}`] : []),
    ];

    const report = [
      `# Job Evaluation: ${job.company} — ${job.title}`,
      ``,
      `**Score:** ${score.toFixed(1)}/5  `,
      `**Recommendation:** ${recommendationFor(score)}  `,
      `**Posting Legitimacy:** ${legitimacy}`,
      ``,
      `## A) Role Summary`,
      `${job.title} at ${job.company}${job.location ? ` (${job.location})` : ""}.`,
      ``,
      `## B) Match With Candidate`,
      matched.length
        ? `Candidate matches ${matched.length}/${reqs.length} listed requirements, including ${matched.slice(0, 3).join(", ")}.`
        : `Limited direct overlap with the listed requirements.`,
      ``,
      `## C) Level and Strategy`,
      `Position as an early-career fit; emphasize the strongest matched skills first.`,
      ``,
      `## D) Compensation and Demand`,
      hasComp ? `Listed compensation: ${job.salaryText}.` : `Compensation: unknown.`,
      ``,
      `## E) Customization Plan`,
      missing.length
        ? `Surface transferable experience for: ${missing.slice(0, 3).join(", ")}.`
        : `Resume already aligns well; tailor the summary line to this role.`,
      ``,
      `## F) Interview Plan`,
      `Prepare STAR stories around ${(matched[0] ?? profile.skills[0]) ?? "your strongest project"}.`,
      ``,
      `## G) Posting Legitimacy`,
      legitimacyNotes,
      ``,
      `## Final Recommendation`,
      score >= 4.0
        ? `Strong enough to prepare an application — review the gaps, then Review & Apply.`
        : `Lower priority — skim the gaps before investing time.`,
    ].join("\n");

    return {
      score,
      recommendation: recommendationFor(score),
      confidence: reqs.length >= 2 ? "medium" : "low",
      dimensions,
      strengths,
      gaps,
      reasons: [
        matched.length
          ? `Your skills cover ${matched.length} of ${reqs.length} key requirements.`
          : `Few of the listed requirements map to your current skills.`,
        `${label} for an early-career applicant.`,
      ],
      missingKeywords: missing.slice(0, 6),
      matchedKeywords: matched.slice(0, 6),
      careerOpsBlocks: {
        roleSummary: `${job.title} at ${job.company}.`,
        cvMatch: matched.length
          ? `Matches ${matched.join(", ")}.`
          : `Limited direct overlap.`,
        levelStrategy: `Frame as an early-career fit; lead with strongest matches.`,
        compAndDemand: hasComp ? `Comp: ${job.salaryText}.` : `Comp: unknown.`,
        customizationPlan: missing.length
          ? `Address gaps: ${missing.slice(0, 3).join(", ")}.`
          : `Tailor the summary line to this role.`,
        interviewPlan: `Prepare stories around ${(matched[0] ?? profile.skills[0]) ?? "your top project"}.`,
        postingLegitimacy: { tier: legitimacy, notes: legitimacyNotes },
      },
      cardSummary: {
        headline: label,
        bullets: bullets.length ? bullets : ["Reviewed against your profile"],
        warning: hasComp ? null : "Compensation not listed",
      },
      detailedReportMarkdown: report,
    };
  },
};
