export type NormalizedMessage = {
  role: "user" | "assistant";
  text: string;
  imageUrls?: string[];
};

export type Draft = { content: string; hours_worked: number };

export interface LLMProvider {
  generate(systemPrompt: string, messages: NormalizedMessage[]): Promise<string>;
}
