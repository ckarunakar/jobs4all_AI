/**
 * Anthropic (Claude) chat completion — kept as a fallback provider.
 * SERVER-SIDE ONLY. Returns the raw JSON string in the model's text content;
 * parsing/repair + schema validation happen upstream. Key read from env, never
 * logged or returned.
 */

import "server-only";
import Anthropic from "@anthropic-ai/sdk";
import type { ModelCallArgs } from "./deepseek";

export const ANTHROPIC_DEFAULT_MODEL = "claude-haiku-4-5";

let client: Anthropic | null = null;

function getClient(): Anthropic {
  const apiKey = process.env.ANTHROPIC_API_KEY?.trim();
  if (!apiKey) {
    throw new Error(
      "ANTHROPIC_API_KEY is not set. Add it to .env.local (server-side only).",
    );
  }
  // Extra retries so short 429 rate-limit bursts ride out via backoff.
  if (!client) client = new Anthropic({ apiKey, maxRetries: 4 });
  return client;
}

export function getAnthropicModel(): string {
  return process.env.ANTHROPIC_MODEL?.trim() || ANTHROPIC_DEFAULT_MODEL;
}

/** Call Claude (JSON-only via prompt) and return the raw text content. */
export async function callAnthropic(args: ModelCallArgs): Promise<string> {
  const model = getAnthropicModel();
  try {
    const res = await getClient().messages.create({
      model,
      max_tokens: args.maxTokens ?? 1200,
      temperature: args.temperature ?? 0.2,
      system: `${args.systemPrompt}\n\nRespond with ONLY a single valid JSON object — no markdown, no code fences, no prose.`,
      messages: [{ role: "user", content: args.userPrompt }],
    });
    if (res.stop_reason === "refusal") {
      throw new Error("The model declined to evaluate this job.");
    }
    return res.content
      .filter((b): b is Anthropic.TextBlock => b.type === "text")
      .map((b) => b.text)
      .join("");
  } catch (err) {
    if (err instanceof Anthropic.AuthenticationError) {
      throw new Error("Invalid ANTHROPIC_API_KEY (authentication failed).");
    }
    if (err instanceof Anthropic.RateLimitError) {
      throw new Error("Anthropic rate limit hit — try again shortly.");
    }
    if (err instanceof Anthropic.APIError) {
      console.error(`[anthropic] ${model} ${err.status}: ${err.message}`);
      throw new Error(`Anthropic API error ${err.status}: ${err.message}`);
    }
    throw err;
  }
}
