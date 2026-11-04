import { createAnthropic } from "@ai-sdk/anthropic";
import { createOpenAI } from "@ai-sdk/openai";
import { createGoogle } from "@ai-sdk/google";
import { createPerplexity } from "@ai-sdk/perplexity";
import { createGroq } from "@ai-sdk/groq";
import { createOpenAICompatible } from "@ai-sdk/openai-compatible";
import type { LanguageModel, ToolSet } from "ai";
import type { ProviderId } from "./types";

const META_BASE_URL = "https://api.meta.ai/v1";

// Meta's OpenAI-compatible API doesn't support structured JSON output,
// so structured calls must go through the plain-text fallback directly.
export function providerSupportsStructuredOutput(provider: ProviderId): boolean {
  return provider !== "meta";
}

export function buildModel(provider: ProviderId, apiKey: string, modelId: string): LanguageModel {
  switch (provider) {
    case "anthropic":
      return createAnthropic({ apiKey })(modelId);
    case "openai":
      return createOpenAI({ apiKey })(modelId);
    case "google":
      return createGoogle({ apiKey })(modelId);
    case "perplexity":
      return createPerplexity({ apiKey })(modelId);
    case "groq":
      return createGroq({ apiKey })(modelId);
    case "meta":
      return createOpenAICompatible({ name: "meta", baseURL: META_BASE_URL, apiKey })(modelId);
    default:
      throw new Error(`Unsupported provider: ${provider satisfies never}`);
  }
}

// Provider-executed (server-side) web search tools. These run as part of the
// model's own response generation, so no extra client-side execute() step or
// tool-result round trip is needed on our end.
export function buildWebSearchTools(provider: ProviderId, apiKey: string): ToolSet | undefined {
  switch (provider) {
    case "anthropic":
      return { web_search: createAnthropic({ apiKey }).tools.webSearch_20250305({ maxUses: 3 }) };
    case "openai":
      return { web_search: createOpenAI({ apiKey }).tools.webSearch({}) };
    case "google":
      return { google_search: createGoogle({ apiKey }).tools.googleSearch({}) };
    case "groq":
      // Supported on Groq's GPT-OSS models; other model IDs (e.g. Llama)
      // ignore the tool with a warning, so passing it is safe.
      return { browser_search: createGroq({ apiKey }).tools.browserSearch({}) };
    default:
      return undefined;
  }
}
