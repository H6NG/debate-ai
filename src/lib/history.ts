import type { DebateReport, UsageInfo } from "./types";

export function formatTokens(n: number): string {
  return n >= 1000 ? `${(n / 1000).toFixed(1)}k` : `${n}`;
}

export type ForecastOutcome = "yes" | "no";

export interface Resolution {
  outcome: ForecastOutcome;
  resolvedAt: string;
}

export interface DebateInputs {
  personas: { id: string; name: string }[];
  rounds: number;
  enableWebSearch: boolean;
  crossExamine: boolean;
  redTeam: boolean;
  autonomousResearch: boolean;
  moderatorModelId?: string;
}

export interface HistoryEntry {
  id: string;
  savedAt: string;
  question: string;
  provider: string;
  modelId: string;
  probability: number;
  report: DebateReport;
  resolution?: Resolution;
  usage?: UsageInfo;
  inputs?: DebateInputs;
}

// Squared error of the forecast: 0 is perfect, 0.25 is a coin flip.
export function brierScore(probability: number, outcome: ForecastOutcome): number {
  const p = Math.max(0, Math.min(100, probability)) / 100;
  const o = outcome === "yes" ? 1 : 0;
  return (p - o) * (p - o);
}

export function resolveHistoryEntry(id: string, outcome: ForecastOutcome): HistoryEntry[] {
  const entries = loadHistory().map((e) =>
    e.id === id ? { ...e, resolution: { outcome, resolvedAt: new Date().toISOString() } } : e
  );
  persist(entries);
  return entries;
}

export function trackRecord(entries: HistoryEntry[]): { resolved: number; meanBrier: number | null } {
  const scores = entries
    .filter((e) => e.resolution)
    .map((e) => brierScore(e.probability, e.resolution!.outcome));
  if (scores.length === 0) return { resolved: 0, meanBrier: null };
  return { resolved: scores.length, meanBrier: scores.reduce((a, b) => a + b, 0) / scores.length };
}

const STORAGE_KEY = "debate-ai:history";
const MAX_ENTRIES = 20;

export function loadHistory(): HistoryEntry[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as HistoryEntry[]) : [];
  } catch {
    return [];
  }
}

function persist(entries: HistoryEntry[]): void {
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(entries.slice(0, MAX_ENTRIES)));
}

export function saveHistoryEntry(entry: Omit<HistoryEntry, "id" | "savedAt">): HistoryEntry[] {
  const full: HistoryEntry = {
    ...entry,
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    savedAt: new Date().toISOString(),
  };
  const entries = [full, ...loadHistory()].slice(0, MAX_ENTRIES);
  persist(entries);
  return entries;
}

export function deleteHistoryEntry(id: string): HistoryEntry[] {
  const entries = loadHistory().filter((e) => e.id !== id);
  persist(entries);
  return entries;
}

export function replaceHistory(entries: HistoryEntry[]): HistoryEntry[] {
  const capped = entries.slice(0, MAX_ENTRIES);
  persist(capped);
  return capped;
}

export function exportHistoryJson(entries: HistoryEntry[]): string {
  return JSON.stringify(entries, null, 2);
}

function isHistoryEntry(value: unknown): value is HistoryEntry {
  if (typeof value !== "object" || value === null) return false;
  const e = value as HistoryEntry;
  return (
    typeof e.id === "string" &&
    typeof e.savedAt === "string" &&
    typeof e.question === "string" &&
    typeof e.probability === "number" &&
    typeof e.report === "object" &&
    e.report !== null
  );
}

export function importHistoryJson(text: string): HistoryEntry[] {
  const parsed: unknown = JSON.parse(text);
  if (!Array.isArray(parsed)) throw new Error("That file doesn't look like a history export.");
  const existing = loadHistory();
  const ids = new Set(existing.map((e) => e.id));
  const incoming = parsed.filter(isHistoryEntry).filter((e) => !ids.has(e.id));
  if (incoming.length === 0) throw new Error("No new reports found in that file.");
  const merged = [...incoming, ...existing].slice(0, MAX_ENTRIES);
  persist(merged);
  return merged;
}

export function reportToMarkdown(
  question: string,
  report: DebateReport,
  provider?: string,
  modelId?: string,
  usage?: UsageInfo
): string {
  const lines = [
    `# Debate report`,
    ``,
    `**Question:** ${question}`,
    ``,
    `**Probability:** ${Math.round(report.probability)}% (${report.confidence} confidence)`,
  ];
  if (provider || modelId) {
    lines.push(`**Panel:** ${[provider, modelId].filter(Boolean).join(" · ")}`);
  }
  if (usage && usage.inputTokens + usage.outputTokens > 0) {
    lines.push(`**Tokens:** ${formatTokens(usage.inputTokens)} in / ${formatTokens(usage.outputTokens)} out`);
  }
  lines.push(
    ``,
    `## Summary`,
    ``,
    report.summary,
    ``,
    `## Pros`,
    ``,
    ...report.pros.map((p) => `- ${p}`),
    ``,
    `## Cons`,
    ``,
    ...report.cons.map((c) => `- ${c}`),
    ``,
    `## Key uncertainties`,
    ``,
    ...report.keyUncertainties.map((u) => `- ${u}`),
    ``,
    `## Key claims`,
    ``,
    ...(report.keyClaims ?? []).map((c) => `- ${c.claim} (source: ${c.source})`),
    ``
  );
  return lines.join("\n");
}
