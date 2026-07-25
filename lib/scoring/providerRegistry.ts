/**
 * Provider selection. Returns the AI provider (DeepSeek or Anthropic, per
 * AI_PROVIDER) when its API key is present, otherwise the deterministic mock
 * provider (so the demo always works). Force mock with SCORING_PROVIDER=mock.
 *
 * The AI call itself lives in lib/ai/* behind a provider-neutral seam, so
 * swapping models is a one-line env change — UI/routes/cache don't change.
 */

import { createAiProvider } from "./providers/aiProvider";
import { mockProvider } from "./providers/mockProvider";
import { isAiConfigured } from "@/lib/ai/modelClient";
import type { LlmProvider } from "./types";

let cached: LlmProvider | null = null;

export function getProvider(): LlmProvider {
  if (cached) return cached;

  const forced = process.env.SCORING_PROVIDER?.trim().toLowerCase();
  if (forced === "mock") {
    cached = mockProvider;
  } else if (isAiConfigured()) {
    cached = createAiProvider();
  } else {
    cached = mockProvider;
  }
  return cached;
}

/** Mode surfaced in Settings: "live" (real model) or "mock". */
export function getProviderMode(): "live" | "mock" {
  return getProvider().name === "mock" ? "mock" : "live";
}

/** Provider name + raw model, for response metadata. */
export function getProviderInfo(): { provider: string; model: string } {
  const p = getProvider();
  return { provider: p.name, model: p.model };
}
