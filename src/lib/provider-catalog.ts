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
  },
  {
    id: "groq",
    label: "Llama (via Groq)",
    helpUrl: "https://console.groq.com/keys",
    keyPlaceholder: "gsk_...",
    webSearch: "none",
    models: [
      { id: "llama-3.3-70b-versatile", label: "Llama 3.3 70B" },
      { id: "llama-3.1-8b-instant", label: "Llama 3.1 8B (fast)" },
    ],
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
  },
];

export function getProviderMeta(id: ProviderId): ProviderMeta {
  const meta = PROVIDER_CATALOG.find((p) => p.id === id);
  if (!meta) throw new Error(`Unknown provider: ${id}`);
  return meta;
}
