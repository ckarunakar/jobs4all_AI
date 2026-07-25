/**
 * Career-Ops score cache. SERVER-SIDE ONLY.
 * --------------------------------------------------------------------------
 * Reads/writes ITJC_SCRAPPER.dbo.career_ops_scores, keyed by
 * (ResumeUploadID, JobID, ModelName, RubricVersion) so repeated scoring reuses
 * results. All values are bound parameters; JSON columns hold the detail.
 */

import "server-only";
import { getPool, sql } from "./sqlServer";
import type { CareerOpsAiScore } from "@/lib/careerOps/aiScore";

const SCORES_TABLE = "ITJC_SCRAPPER.dbo.career_ops_scores";

export interface ScoreCacheKey {
  resumeUploadId: number;
  jobId: string;
  model: string;
  rubricVersion: string;
}

function safeParseArray(json: unknown): string[] {
  if (json == null) return [];
  try {
    const v = JSON.parse(String(json));
    return Array.isArray(v) ? v.map(String) : [];
  } catch {
    return [];
  }
}

function safeParseObject(json: unknown): Record<string, number> | undefined {
  if (json == null) return undefined;
  try {
    const v = JSON.parse(String(json));
    return v && typeof v === "object" ? (v as Record<string, number>) : undefined;
  } catch {
    return undefined;
  }
}

/** Cached score for this (resume, job, model, rubric), or null on a miss. */
export async function getCachedScore(
  key: ScoreCacheKey,
): Promise<CareerOpsAiScore | null> {
  const pool = await getPool();
  const result = await pool
    .request()
    .input("ResumeUploadID", sql.Int, key.resumeUploadId)
    .input("JobID", sql.VarChar(100), key.jobId)
    .input("ModelName", sql.NVarChar(100), key.model)
    .input("RubricVersion", sql.NVarChar(50), key.rubricVersion)
    .query(
      `SELECT TOP 1 Score, Label, Recommendation, Summary,
              ProsJson, ConsJson, WarningsJson, DimensionsJson
         FROM ${SCORES_TABLE}
        WHERE ResumeUploadID = @ResumeUploadID
          AND JobID = @JobID
          AND ModelName = @ModelName
          AND RubricVersion = @RubricVersion`,
    );

  const row = result.recordset?.[0];
  if (!row) return null;

  return {
    score: Number(row.Score),
    label: String(row.Label),
    recommendation: String(row.Recommendation),
    summary: String(row.Summary ?? ""),
    pros: safeParseArray(row.ProsJson),
    cons: safeParseArray(row.ConsJson),
    warnings: safeParseArray(row.WarningsJson),
    dimensions: safeParseObject(row.DimensionsJson),
    cached: true,
  };
}

export interface UpsertScoreArgs extends ScoreCacheKey {
  userEmail: string;
  ai: CareerOpsAiScore;
  /** Full engine result, stored as JSON for debugging/auditing. */
  raw: unknown;
}

/** Insert or update the cached score for this key (idempotent via MERGE). */
export async function upsertScore(args: UpsertScoreArgs): Promise<void> {
  const pool = await getPool();
  await pool
    .request()
    .input("ResumeUploadID", sql.Int, args.resumeUploadId)
    .input("UserEmail", sql.NVarChar(255), args.userEmail)
    .input("JobID", sql.VarChar(100), args.jobId)
    .input("ModelName", sql.NVarChar(100), args.model)
    .input("RubricVersion", sql.NVarChar(50), args.rubricVersion)
    .input("Score", sql.Decimal(3, 1), args.ai.score)
    .input("Label", sql.NVarChar(100), args.ai.label)
    .input("Recommendation", sql.NVarChar(100), args.ai.recommendation)
    .input("Summary", sql.NVarChar(sql.MAX), args.ai.summary || null)
    .input("ProsJson", sql.NVarChar(sql.MAX), JSON.stringify(args.ai.pros ?? []))
    .input("ConsJson", sql.NVarChar(sql.MAX), JSON.stringify(args.ai.cons ?? []))
    .input(
      "WarningsJson",
      sql.NVarChar(sql.MAX),
      JSON.stringify(args.ai.warnings ?? []),
    )
    .input(
      "DimensionsJson",
      sql.NVarChar(sql.MAX),
      JSON.stringify(args.ai.dimensions ?? {}),
    )
    .input("RawResponseJson", sql.NVarChar(sql.MAX), JSON.stringify(args.raw))
    .query(
      `MERGE ${SCORES_TABLE} WITH (HOLDLOCK) AS t
         USING (SELECT @ResumeUploadID AS ResumeUploadID, @JobID AS JobID,
                       @ModelName AS ModelName, @RubricVersion AS RubricVersion) AS s
         ON  t.ResumeUploadID = s.ResumeUploadID
         AND t.JobID          = s.JobID
         AND t.ModelName      = s.ModelName
         AND t.RubricVersion  = s.RubricVersion
       WHEN MATCHED THEN UPDATE SET
         UserEmail = @UserEmail, Score = @Score, Label = @Label,
         Recommendation = @Recommendation, Summary = @Summary,
         ProsJson = @ProsJson, ConsJson = @ConsJson, WarningsJson = @WarningsJson,
         DimensionsJson = @DimensionsJson, RawResponseJson = @RawResponseJson,
         UpdatedAt = SYSUTCDATETIME()
       WHEN NOT MATCHED THEN INSERT
         (ResumeUploadID, UserEmail, JobID, ModelName, RubricVersion, Score, Label,
          Recommendation, Summary, ProsJson, ConsJson, WarningsJson, DimensionsJson,
          RawResponseJson)
         VALUES
         (@ResumeUploadID, @UserEmail, @JobID, @ModelName, @RubricVersion, @Score, @Label,
          @Recommendation, @Summary, @ProsJson, @ConsJson, @WarningsJson, @DimensionsJson,
          @RawResponseJson);`,
    );
}
