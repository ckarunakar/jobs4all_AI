/**
 * Provider selection. Returns the configured AI provider (DeepSeek or
 * Anthropic, per AI_PROVIDER). Scoring requires an API key — there is no
 * offline fallback provider.
 *
 * The AI call itself lives in lib/ai/* behind a provider-neutral seam, so
 * swapping models is a one-line env change — UI/routes/cache don't change.
 */

import { createAiProvider } from "./providers/aiProvider";
import { isAiConfigured } from "@/lib/ai/modelClient";
import type { LlmProvider } from "./types";

let cached: LlmProvider | null = null;

export function getProvider(): LlmProvider {
  if (cached) return cached;
  if (!isAiConfigured()) {
    throw new Error(
      "AI scoring is not configured — set DEEPSEEK_API_KEY or ANTHROPIC_API_KEY (see .env.example).",
    );
  }
  cached = createAiProvider();
  return cached;
}

/** Provider name + raw model, for response metadata. */
export function getProviderInfo(): { provider: string; model: string } {
  const p = getProvider();
  return { provider: p.name, model: p.model };
}
