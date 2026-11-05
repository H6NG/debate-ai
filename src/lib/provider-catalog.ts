import type { ProviderId, ProviderMeta } from "./types";

export const PROVIDER_CATALOG: ProviderMeta[] = [
  {
    id: "anthropic",
    label: "Claude (Anthropic)",
    helpUrl: "https://console.anthropic.com/settings/keys",
    keyPlaceholder: "sk-ant-...",
    webSearch: "native",
    models: [
      { id: "claude-sonnet-5", label: "Claude Sonnet 5 (recommended)" },
      { id: "claude-opus-4-8", label: "Claude Opus 4.8 (most capable)" },
      { id: "claude-haiku-4-5-20251001", label: "Claude Haiku 4.5 (fast & cheap)" },
    ],
    quickModelId: "claude-haiku-4-5-20251001",
  },
  {
    id: "openai",
    label: "OpenAI (GPT)",
    helpUrl: "https://platform.openai.com/api-keys",
    keyPlaceholder: "sk-...",
    webSearch: "native",
    models: [
      { id: "gpt-5.1", label: "GPT-5.1" },
      { id: "gpt-5-mini", label: "GPT-5 mini (fast & cheap)" },
      { id: "gpt-4.1", label: "GPT-4.1" },
    ],
    quickModelId: "gpt-5-mini",
  },
  {
    id: "google",
    label: "Gemini (Google)",
    helpUrl: "https://aistudio.google.com/app/apikey",
    keyPlaceholder: "AIza...",
    webSearch: "native",
    models: [
      { id: "gemini-3.1-pro-preview", label: "Gemini 3.1 Pro (recommended)" },
      { id: "gemini-3-flash-preview", label: "Gemini 3 Flash (fast & cheap)" },
    ],
    quickModelId: "gemini-3-flash-preview",
  },
  {
    id: "perplexity",
    label: "Perplexity",
    helpUrl: "https://www.perplexity.ai/settings/api",
    keyPlaceholder: "pplx-...",
    webSearch: "always",
    models: [
      { id: "medium", label: "Medium (recommended)" },
      { id: "fast", label: "Fast" },
    ],
    quickModelId: "fast",
  },
  {
    id: "groq",
    label: "Groq",
    helpUrl: "https://console.groq.com/keys",
    keyPlaceholder: "gsk_...",
    webSearch: "native",
    models: [
      { id: "openai/gpt-oss-120b", label: "GPT-OSS 120B (recommended, web search)" },
      { id: "openai/gpt-oss-20b", label: "GPT-OSS 20B (fast, web search)" },
      { id: "llama-3.3-70b-versatile", label: "Llama 3.3 70B (no web search)" },
      { id: "llama-3.1-8b-instant", label: "Llama 3.1 8B (fast, no web search)" },
    ],
    quickModelId: "openai/gpt-oss-20b",
  },
  {
    id: "meta",
    label: "Meta (Muse)",
    helpUrl: "https://dev.meta.ai/docs/authentication",
    keyPlaceholder: "LLM_...",
    webSearch: "none",
    models: [
      { id: "muse-wonder-1.0", label: "Muse Wonder 1.0 (most capable)" },
      { id: "muse-spark-1.3", label: "Muse Spark 1.3 (fast & cheap)" },
    ],
    quickModelId: "muse-spark-1.3",
  },
];

export function getProviderMeta(id: ProviderId): ProviderMeta {
  const meta = PROVIDER_CATALOG.find((p) => p.id === id);
  if (!meta) throw new Error(`Unknown provider: ${id}`);
  return meta;
}

// The single provider holding a usable key, or null when there is nothing
// to auto-select: no keys at all, or two or more (then the user decides).
export function soleKeyedProviderId(keys: Record<string, string>): ProviderId | null {
  const keyed = PROVIDER_CATALOG.filter((p) => (keys[p.id] ?? "").trim().length > 0);
  return keyed.length === 1 ? keyed[0].id : null;
}
