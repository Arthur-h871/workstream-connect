import Anthropic from "https://esm.sh/@anthropic-ai/sdk@0.27.0";
import type { LLMProvider, NormalizedMessage } from "./types.ts";

const MODEL = "claude-haiku-4-5-20251001";

function toWireMessage(message: NormalizedMessage) {
  if (message.imageUrls && message.imageUrls.length > 0) {
    return {
      role: message.role,
      content: [
        ...message.imageUrls.map((url) => ({
          type: "image" as const,
          source: { type: "url" as const, url },
        })),
        { type: "text" as const, text: message.text },
      ],
    };
  }
  return { role: message.role, content: message.text };
}

export function createAnthropicProvider(apiKey: string): LLMProvider {
  const anthropic = new Anthropic({ apiKey });

  return {
    async generate(systemPrompt, messages) {
      const response = await anthropic.messages.create({
        model: MODEL,
        max_tokens: 1024,
        system: systemPrompt,
        messages: messages.map(toWireMessage) as unknown as Parameters<
          typeof anthropic.messages.create
        >[0]["messages"],
      });
      return response.content[0].type === "text" ? response.content[0].text : "";
    },
  };
}
