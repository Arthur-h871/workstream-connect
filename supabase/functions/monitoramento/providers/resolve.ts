import type { LLMProvider } from "./types.ts";
import { createAnthropicProvider } from "./anthropic.ts";

export function resolveProvider(): LLMProvider {
  return createAnthropicProvider(Deno.env.get("ANTHROPIC_API_KEY")!);
}
