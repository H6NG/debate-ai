export type ProviderId = "anthropic" | "openai" | "google" | "perplexity" | "groq" | "meta";

export interface ProviderModelOption {
  id: string;
  label: string;
}

// "native"  = persona calls can attach a provider-executed web search tool
// "always"  = the provider's models search the web inherently (no tool needed)
// "none"    = no web search support wired up for this provider
export type WebSearchSupport = "native" | "always" | "none";

export interface ProviderMeta {
  id: ProviderId;
  label: string;
  helpUrl: string;
  keyPlaceholder: string;
  webSearch: WebSearchSupport;
  models: ProviderModelOption[];
}

export interface Persona {
  id: string;
  name: string;
  tagline: string;
  lens: string;
  custom?: boolean;
}

export interface DebateRequest {
  question: string;
  provider: ProviderId;
  apiKey: string;
  modelId: string;
  personas: Persona[];
  rounds: number;
  enableWebSearch: boolean;
}

export interface TranscriptTurn {
  personaName: string;
  round: number;
  text: string;
}

export interface ReportRequest {
  question: string;
  provider: ProviderId;
  apiKey: string;
  modelId: string;
  transcript: TranscriptTurn[];
}

export interface DebateReport {
  summary: string;
  pros: string[];
  cons: string[];
  probability: number;
  confidence: "low" | "medium" | "high";
  keyUncertainties: string[];
}

export type DebateEvent =
  | { type: "round_start"; round: number; totalRounds: number }
  | { type: "agent_start"; personaId: string; round: number }
  | { type: "agent_delta"; personaId: string; text: string }
  | { type: "agent_end"; personaId: string; fullText: string }
  | { type: "round_end"; round: number }
  | { type: "report_start" }
  | { type: "report"; data: DebateReport }
  | { type: "error"; message: string }
  | { type: "done" };
