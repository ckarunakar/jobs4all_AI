/**
 * Career-Ops frontend adapter — TYPES
 * --------------------------------------------------------------------------
 * These types mirror the concepts found in the Career-Ops project
 * (https://github.com/santifer/career-ops) so that this frontend can later
 * consume real evaluation output with minimal changes.
 *
 * Career-Ops concepts being adapted here:
 *  - A 6-block A–F evaluation framework (CV match, North Star alignment,
 *    compensation, cultural signals, red flags, global score).
 *  - Archetype detection (AI Platform, Agentic, Technical AI PM, etc.).
 *  - A canonical application status state machine
 *    (evaluated → applied → responded → interview → offer | rejected | ...).
 *  - Profile sources (cv.md, config/profile.yml, modes/_profile.md).
 *  - A strict human-in-the-loop rule: the system NEVER auto-submits.
 *
 * NOTE: Nothing here calls Career-Ops directly — these are the shared shapes
 * the scoring service and UI exchange.
 */

/** A single fit score on the 1.0–5.0 scale. */
export type CareerOpsScore = number; // 1.0 – 5.0

/**
 * Career-Ops scores jobs across weighted dimensions ("blocks"). Each block
 * carries its own 1–5 sub-score plus the weight used in the global average.
 */
export interface CareerOpsScoreBreakdownItem {
  /** Stable key, e.g. "cv_match" — safe to map to backend block ids later. */
  key: string;
  /** Human label, e.g. "Match with CV". */
  label: string;
  /** Sub-score on the same 1.0–5.0 scale. */
  score: CareerOpsScore;
  /** Relative weight (0–1) this block contributes to the global score. */
  weight: number;
  /** Short rationale for this block. */
  note?: string;
}

/** The full per-dimension breakdown that produces the global score. */
export interface CareerOpsScoreBreakdown {
  /** Weighted global score (what the UI shows as the headline number). */
  global: CareerOpsScore;
  items: CareerOpsScoreBreakdownItem[];
}

/**
 * Career-Ops classifies each role into an archetype to tailor evaluation and
 * CV strategy. Kept open-ended (string) so new archetypes don't break types.
 */
export type CareerOpsArchetype =
  | "AI Platform / LLMOps"
  | "Agentic / Automation"
  | "Technical AI PM"
  | "Solutions Architect"
  | "Forward Deployed"
  | "Transformation"
  | "General Software"
  | (string & {});

/**
 * Canonical application status, mirroring Career-Ops' templates/states.yml
 * state machine. The UI groups these into pipeline columns (see
 * statusToPipelineColumn in scoreUtils).
 */
export type ApplicationStatus =
  | "saved" // candidate bookmarked (UI-only convenience state)
  | "evaluated" // AI produced a fit evaluation
  | "reviewing" // candidate is reviewing before applying
  | "ready" // checklist complete, ready to submit manually
  | "applied" // application submitted by the human
  | "responded" // recruiter responded
  | "interview" // active interview stage
  | "offer" // offer received
  | "rejected" // terminal (company side)
  | "discarded"; // terminal (candidate side) / archived

/**
 * The output of a single job evaluation. This is the primary contract the
 * frontend depends on; a real backend should return this shape.
 */
export interface CareerOpsEvaluation {
  jobId: string;
  /** Headline fit score (1.0–5.0). Equals breakdown.global. */
  score: CareerOpsScore;
  breakdown: CareerOpsScoreBreakdown;
  archetype: CareerOpsArchetype;
  /** One-line summary of why this role fits the candidate. */
  matchSummary: string;
  /** Concrete strengths / proof points that align with the role. */
  strengths: string[];
  /** Gaps the candidate should be aware of (missing skills, etc.). */
  gaps: string[];
  /** Red-flag / caution signals (ghost job, comp mismatch, etc.). */
  cautionFlags: string[];
  /** Suggested next action surfaced to the candidate. */
  suggestedAction: string;
  /** ISO timestamp of when the evaluation was produced. */
  evaluatedAt: string;
}

/**
 * Candidate profile — adapted from Career-Ops' cv.md + profile.yml + _profile.md.
 * Persisted locally in the MVP via the swipe store.
 */
export interface ResumeProfile {
  // Identity / links
  fullName: string;
  email: string;
  linkedinUrl: string;
  githubUrl: string;
  portfolioUrl: string;

  // Education
  school: string;
  major: string;
  graduationDate: string; // e.g. "2026-05"

  // Eligibility
  workAuthorization: WorkAuthorization;

  /** Optional phone number (collected on the resume upload card). */
  phone?: string;

  // Preferences (drive scoring + filters)
  locationPreferences: string[];
  rolePreferences: string[];
  remotePreferences: RemoteType[];

  /** Uploaded resume files (UI placeholders — no real parsing in the MVP). */
  resumes: ResumeFileRef[];
  /** Which uploaded resume is the default for applications. */
  primaryResumeId?: string;

  // --- Optional fields used by the swipe app ---
  /** Specific target-role tags (e.g. "ML Intern", "Backend New Grad"). */
  targetRoles?: string[];
  /** Preferred tech-stack chips that influence fit. */
  techStack?: string[];
  /** Preferred employment types (e.g. "internship", "new_grad"). */
  preferredRoleTypes?: string[];
}

export type WorkAuthorization =
  | "unspecified"
  | "us_citizen"
  | "permanent_resident"
  | "needs_sponsorship"
  | "opt_cpt"
  | "other";

export type RemoteType = "remote" | "hybrid" | "onsite";

/** Reference to an uploaded resume. */
export interface ResumeFileRef {
  id: string;
  label: string;
  fileName: string;
  uploadedAt: string;
  /** True once resume text has been extracted for AI scoring. */
  parsed: boolean;
  /** Row ID in dbo.resume_upload once uploaded to SQL Server. */
  dbId?: number;
}

/** Aggregate pipeline metrics — mirrors Career-Ops' PipelineMetrics. */
export interface PipelineMetrics {
  totalReviewed: number;
  averageScore: number;
  topScore: number;
  recommendedCount: number;
  applicationsStarted: number;
  responsesCount: number;
  byStatus: Record<ApplicationStatus, number>;
}
