import { streamText, generateObject, type LanguageModel } from "ai";
import { z } from "zod";
import { buildModel, buildWebSearchTools } from "./providers";
import type { DebateEvent, DebateRequest, DebateReport, Persona, ProviderId, TranscriptTurn } from "./types";

const PERSONA_MAX_TOKENS = 320;
const PERSONA_MAX_TOKENS_WITH_SEARCH = 800;

const DEBATE_CONDUCT_RULES = `
Rules for every turn:
- Reason honestly and stay intellectually calibrated. Your job is to add insight through your lens, not to "win" the argument or play a caricature.
- You may concede good points raised by other panelists and revise your estimate accordingly.
- Always state your current probability estimate (0-100%) for the question somewhere in your turn.
- Keep your turn tight: roughly 3-5 sentences. No meta-commentary like "as an AI" or stage directions.
- Speak in first person, directly, like a sharp analyst in a live panel discussion.`.trim();

const WEB_SEARCH_RULE = `
- You have a live web search tool. Use it when you need a current fact, a specific statistic, or recent news to back up your argument — don't rely on memory alone for anything time-sensitive.`;

function personaSystemPrompt(persona: Persona, enableWebSearch: boolean): string {
  const rules = enableWebSearch ? `${DEBATE_CONDUCT_RULES}\n${WEB_SEARCH_RULE}` : DEBATE_CONDUCT_RULES;
  return `You are "${persona.name}", one voice on a live panel debating a forecasting question.\n\nYour analytical lens: ${persona.lens}\n\n${rules}`;
}

function rotateOrder(personas: Persona[], round: number): Persona[] {
  const offset = (round - 1) % personas.length;
  return [...personas.slice(offset), ...personas.slice(0, offset)];
}

function formatTranscript(turns: TranscriptTurn[]): string {
  return turns.map((t) => `[Round ${t.round}] ${t.personaName}: ${t.text}`).join("\n\n");
}

function openingPrompt(question: string): string {
  return `DEBATE QUESTION: "${question}"\n\nThis is the opening round. Give your initial take: your probability estimate and your top 2-3 reasons through your lens.`;
}

function rebuttalPrompt(question: string, turns: TranscriptTurn[], round: number, totalRounds: number): string {
  return `DEBATE QUESTION: "${question}"\n\nTRANSCRIPT SO FAR:\n${formatTranscript(turns)}\n\nThis is round ${round} of ${totalRounds}. Respond to the strongest points made so far — agree, rebut, or update your view — and give your current probability estimate.`;
}

const MODERATOR_SYSTEM_PROMPT = `You are an impartial, calibrated forecasting moderator. You just watched a panel debate the question below. Synthesize their strongest arguments into a balanced, decision-useful report.

Do not simply average the panelists' numbers. Reason about which arguments actually carry weight, using sound forecasting judgment (base rates, decisive mechanisms, what would actually have to happen). "Pros" are the strongest reasons favoring the event happening / the answer being yes. "Cons" are the strongest reasons against. Be concrete and concise — avoid hedging filler and avoid repeating the same point across multiple pros or cons. If the transcript looks incomplete or cut short, synthesize from whatever is there rather than refusing.`;

const ReportSchema = z.object({
  summary: z.string().describe("2-4 sentence executive summary of the debate and the final judgment"),
  pros: z.array(z.string()).min(2).max(6).describe("Strongest distinct arguments favoring the event happening"),
  cons: z.array(z.string()).min(2).max(6).describe("Strongest distinct arguments against the event happening"),
  probability: z.number().min(0).max(100).describe("Calibrated probability (0-100) that the event occurs"),
  confidence: z.enum(["low", "medium", "high"]).describe("How confident the panel's reasoning supports this estimate"),
  keyUncertainties: z
    .array(z.string())
    .min(1)
    .max(4)
    .describe("The main open questions or swing factors that could move this estimate"),
});

async function runPersonaTurn(params: {
  model: LanguageModel;
  persona: Persona;
  round: number;
  prompt: string;
  enableWebSearch: boolean;
  tools: ReturnType<typeof buildWebSearchTools>;
  emit: (event: DebateEvent) => void;
  abortSignal?: AbortSignal;
}): Promise<TranscriptTurn> {
  const { model, persona, round, prompt, enableWebSearch, tools, emit, abortSignal } = params;
  emit({ type: "agent_start", personaId: persona.id, round });

  let streamError: unknown = null;
  const result = streamText({
    model,
    system: personaSystemPrompt(persona, enableWebSearch),
    prompt,
    tools,
    maxOutputTokens: enableWebSearch ? PERSONA_MAX_TOKENS_WITH_SEARCH : PERSONA_MAX_TOKENS,
    abortSignal,
    onError: ({ error }) => {
      streamError = error;
    },
  });

  let full = "";
  for await (const delta of result.textStream) {
    full += delta;
    emit({ type: "agent_delta", personaId: persona.id, text: delta });
  }

  // streamText does not throw provider errors through textStream (they're
  // only surfaced via onError or the full event stream), so re-throw here.
  if (streamError) {
    throw streamError instanceof Error ? streamError : new Error(String(streamError));
  }

  emit({ type: "agent_end", personaId: persona.id, fullText: full });
  return { personaName: persona.name, round, text: full };
}

async function generateReportObject(
  model: LanguageModel,
  question: string,
  turns: TranscriptTurn[],
  abortSignal?: AbortSignal
): Promise<DebateReport> {
  const { object } = await generateObject({
    model,
    schema: ReportSchema,
    system: MODERATOR_SYSTEM_PROMPT,
    prompt: `QUESTION: "${question}"\n\nFULL TRANSCRIPT:\n${formatTranscript(turns)}\n\nProduce the final report.`,
    abortSignal,
  });
  return object as DebateReport;
}

export async function runDebate(
  request: DebateRequest,
  emit: (event: DebateEvent) => void,
  abortSignal?: AbortSignal
): Promise<void> {
  const model = buildModel(request.provider, request.apiKey, request.modelId);
  const tools = request.enableWebSearch ? buildWebSearchTools(request.provider, request.apiKey) : undefined;
  const turns: TranscriptTurn[] = [];
  const totalRounds = request.rounds;

  for (let round = 1; round <= totalRounds; round++) {
    if (abortSignal?.aborted) return;
    emit({ type: "round_start", round, totalRounds });
    const order = rotateOrder(request.personas, round);

    // Personas in a round don't depend on each other, so run them concurrently —
    // only the *next* round's prompt needs this round's full transcript.
    const results = await Promise.allSettled(
      order.map((persona) =>
        runPersonaTurn({
          model,
          persona,
          round,
          prompt: round === 1 ? openingPrompt(request.question) : rebuttalPrompt(request.question, turns, round, totalRounds),
          enableWebSearch: request.enableWebSearch,
          tools,
          emit,
          abortSignal,
        })
      )
    );

    const rejected = results.find((r): r is PromiseRejectedResult => r.status === "rejected");
    if (rejected) {
      throw rejected.reason instanceof Error ? rejected.reason : new Error(String(rejected.reason));
    }

    for (const r of results) {
      if (r.status === "fulfilled") turns.push(r.value);
    }

    emit({ type: "round_end", round });
  }

  if (abortSignal?.aborted) return;

  emit({ type: "report_start" });
  const report = await generateReportObject(model, request.question, turns, abortSignal);
  emit({ type: "report", data: report });
  emit({ type: "done" });
}

export async function generateReportFromTranscript(
  provider: ProviderId,
  apiKey: string,
  modelId: string,
  question: string,
  transcript: TranscriptTurn[]
): Promise<DebateReport> {
  const model = buildModel(provider, apiKey, modelId);
  return generateReportObject(model, question, transcript);
}
