/**
 * DeepSeek chat completion (OpenAI-compatible API). SERVER-SIDE ONLY.
 * --------------------------------------------------------------------------
 * Returns the raw JSON string in the model's message content — parsing/repair
 * and schema validation happen upstream (lib/scoring/providers/aiProvider).
 * The API key is read from env and never logged or returned.
 */

import "server-only";
import OpenAI from "openai";

export const DEEPSEEK_DEFAULT_MODEL = "deepseek-v4-flash";

let client: OpenAI | null = null;

function getClient(): OpenAI {
  const apiKey = process.env.DEEPSEEK_API_KEY?.trim();
  if (!apiKey) {
    throw new Error(
      "DEEPSEEK_API_KEY is not set. Add it to .env.local (server-side only).",
    );
  }
  if (!client) {
    client = new OpenAI({
      apiKey,
      baseURL: process.env.DEEPSEEK_BASE_URL?.trim() || "https://api.deepseek.com",
    });
  }
  return client;
}

export function getDeepSeekModel(): string {
  return process.env.DEEPSEEK_MODEL?.trim() || DEEPSEEK_DEFAULT_MODEL;
}

export interface ModelCallArgs {
  systemPrompt: string;
  userPrompt: string;
  maxTokens?: number;
  temperature?: number;
}

/** Call DeepSeek in JSON mode and return the raw content string. */
export async function callDeepSeek(args: ModelCallArgs): Promise<string> {
  const model = getDeepSeekModel();
  try {
    const res = await getClient().chat.completions.create({
      model,
      messages: [
        { role: "system", content: args.systemPrompt },
        { role: "user", content: args.userPrompt },
      ],
      temperature: args.temperature ?? 0.2,
      max_tokens: args.maxTokens ?? 1200,
      response_format: { type: "json_object" },
    });
    return res.choices[0]?.message?.content ?? "";
  } catch (err) {
    // Surface status + message only — never the API key, prompt, or resume.
    if (err instanceof OpenAI.APIError) {
      console.error(`[deepseek] ${model} ${err.status ?? ""}: ${err.message}`);
      throw new Error(
        `DeepSeek API error${err.status ? ` (${err.status})` : ""}: ${err.message}`,
      );
    }
    const message = err instanceof Error ? err.message : "DeepSeek call failed";
    console.error(`[deepseek] ${model}: ${message}`);
    throw new Error(`DeepSeek call failed: ${message}`);
  }
}
