/**
 * Provider-neutral AI model client. SERVER-SIDE ONLY.
 * --------------------------------------------------------------------------
 * `generateCareerOpsJson()` returns the model's raw JSON string; the caller
 * parses + validates it. Provider is chosen by AI_PROVIDER:
 *   - "deepseek"  → DeepSeek (OpenAI-compatible)   [cheap default]
 *   - "anthropic" → Claude (fallback)
 * If AI_PROVIDER is unset, defaults to DeepSeek when its key is present, else
 * Anthropic. Swapping providers later is a one-line env change.
 */

import "server-only";
import { callDeepSeek, getDeepSeekModel, type ModelCallArgs } from "./deepseek";
import { callAnthropic, getAnthropicModel } from "./anthropic";

export type { ModelCallArgs };
export type AiProviderName = "deepseek" | "anthropic";

/** Active provider from AI_PROVIDER (safe default when unset). */
export function getAiProvider(): AiProviderName {
  const p = process.env.AI_PROVIDER?.trim().toLowerCase();
  if (p === "anthropic") return "anthropic";
  if (p === "deepseek") return "deepseek";
  // Unset: prefer DeepSeek when its key is present, otherwise Anthropic.
  if (process.env.DEEPSEEK_API_KEY?.trim()) return "deepseek";
  return "anthropic";
}

/** Raw model name for the active provider (e.g. "deepseek-v4-flash"). */
export function getAiModel(): string {
  return getAiProvider() === "deepseek"
    ? getDeepSeekModel()
    : getAnthropicModel();
}

/** True when the active provider's API key is configured. */
export function isAiConfigured(): boolean {
  return getAiProvider() === "deepseek"
    ? Boolean(process.env.DEEPSEEK_API_KEY?.trim())
    : Boolean(process.env.ANTHROPIC_API_KEY?.trim());
}

/**
 * Call the active provider and return its raw JSON string content. Throws a
 * clear configuration error if the required key is missing.
 */
export async function generateCareerOpsJson(
  args: ModelCallArgs,
): Promise<string> {
  return getAiProvider() === "deepseek"
    ? callDeepSeek(args)
    : callAnthropic(args);
}
