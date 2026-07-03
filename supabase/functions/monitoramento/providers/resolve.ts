import type { LLMProvider } from "./types.ts";
import { createAnthropicProvider } from "./anthropic.ts";
import { createGeminiProvider } from "./gemini.ts";

export type AiProvider = "anthropic" | "gemini";

export function resolveProvider(provider: AiProvider): LLMProvider {
  if (provider === "gemini") {
    return createGeminiProvider(Deno.env.get("GEMINI_API_KEY")!);
  }
  return createAnthropicProvider(Deno.env.get("ANTHROPIC_API_KEY")!);
}
