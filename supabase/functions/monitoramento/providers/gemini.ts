import { GoogleGenAI } from "https://esm.sh/@google/genai@2.10.0";
import type { LLMProvider, NormalizedMessage } from "./types.ts";

const MODEL = "gemini-2.5-flash";

async function toInlineImage(url: string): Promise<{ mimeType: string; data: string }> {
  const response = await fetch(url);
  const bytes = new Uint8Array(await response.arrayBuffer());
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return {
    mimeType: response.headers.get("content-type") ?? "image/png",
    data: btoa(binary),
  };
}

async function toWireContent(message: NormalizedMessage) {
  const parts: Array<{ text: string } | { inlineData: { mimeType: string; data: string } }> = [];
  if (message.imageUrls && message.imageUrls.length > 0) {
    const images = await Promise.all(message.imageUrls.map(toInlineImage));
    for (const image of images) parts.push({ inlineData: image });
  }
  parts.push({ text: message.text });
  return { role: message.role === "assistant" ? "model" : "user", parts };
}

export function createGeminiProvider(apiKey: string): LLMProvider {
  const ai = new GoogleGenAI({ apiKey });

  return {
    async generate(systemPrompt, messages) {
      const contents = await Promise.all(messages.map(toWireContent));
      const response = await ai.models.generateContent({
        model: MODEL,
        contents,
        config: { systemInstruction: systemPrompt },
      });
      return response.text ?? "";
    },
  };
}
