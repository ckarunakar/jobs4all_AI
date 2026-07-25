/**
 * Provider-neutral scoring provider. SERVER-SIDE ONLY.
 * --------------------------------------------------------------------------
 * Implements the LlmProvider seam using lib/ai/modelClient (DeepSeek or
 * Anthropic, chosen by AI_PROVIDER). Builds the Career-Ops prompt, asks the
 * model for JSON, then parses (with light repair) and validates against the
 * shared Zod schema — retrying once. `name`/`model` reflect the active provider
 * so the cache key + response metadata stay accurate.
 */

import "server-only";
import { buildScoringPrompt, evaluationSchema } from "../careerOpsPrompt";
import {
  generateCareerOpsJson,
  getAiModel,
  getAiProvider,
} from "@/lib/ai/modelClient";
import type { JobEvaluationInput, LlmEvaluation, LlmProvider } from "../types";

const MAX_TOKENS = 2000;
const TEMPERATURE = 0.2;

/** Best-effort JSON extraction: direct parse, strip code fences, first {...}. */
function parseJsonLoose(text: string): unknown | null {
  if (!text) return null;
  const candidates = [text];
  const unfenced = text.replace(/```json/gi, "").replace(/```/g, "").trim();
  if (unfenced !== text) candidates.push(unfenced);
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start >= 0 && end > start) candidates.push(text.slice(start, end + 1));
  for (const c of candidates) {
    try {
      return JSON.parse(c);
    } catch {
      // try the next candidate
    }
  }
  return null;
}

export function createAiProvider(): LlmProvider {
  const provider = getAiProvider(); // "deepseek" | "anthropic"
  const model = getAiModel(); // raw model name

  async function runOnce(
    input: JobEvaluationInput,
  ): Promise<LlmEvaluation | null> {
    const { system, user } = buildScoringPrompt(input.job, input.profile);
    const raw = await generateCareerOpsJson({
      systemPrompt: system,
      userPrompt: user,
      maxTokens: MAX_TOKENS,
      temperature: TEMPERATURE,
    });
    const parsed = parseJsonLoose(raw);
    if (!parsed) return null;
    const validated = evaluationSchema.safeParse(parsed);
    return validated.success ? (validated.data as LlmEvaluation) : null;
  }

  return {
    name: provider,
    model,
    async evaluate(input: JobEvaluationInput): Promise<LlmEvaluation> {
      // Retry on unparseable / schema-invalid JSON (DeepSeek's JSON mode isn't
      // as strict as structured output — occasional first-pass misses recover).
      const ATTEMPTS = 3;
      for (let i = 0; i < ATTEMPTS; i++) {
        const result = await runOnce(input);
        if (result) return result;
      }
      throw new Error(
        `${provider} returned no valid Career-Ops JSON after ${ATTEMPTS} attempts.`,
      );
    },
  };
}
