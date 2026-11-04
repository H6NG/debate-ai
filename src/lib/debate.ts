import { generateText, streamText, type LanguageModel } from "ai";
import { z } from "zod";
import { buildModel, buildWebSearchTools, providerSupportsStructuredOutput } from "./providers";
import { generateObjectRobust } from "./structured";
import type { DebateEvent, DebateRequest, DebateReport, Persona, ProviderId, TranscriptTurn } from "./types";

const PERSONA_MAX_TOKENS = 240;
const PERSONA_MAX_TOKENS_WITH_SEARCH = 600;

function personaMaxTokens(provider: ProviderId, withSearch: boolean): number {
  // Reasoning models (Meta) think before answering; a tight cap burns the
  // whole budget on thinking and returns an empty answer.
  if (provider === "meta") return withSearch ? 2000 : 1200;
  return withSearch ? PERSONA_MAX_TOKENS_WITH_SEARCH : PERSONA_MAX_TOKENS;
}

const DEBATE_CONDUCT_RULES = `
Rules for every turn:
- Reason honestly and stay intellectually calibrated. Your job is to add insight through your lens, not to "win" the argument or play a caricature.
- You may concede good points raised by other panelists and revise your estimate accordingly.
- Always state your current probability estimate (0-100%) for the question somewhere in your turn.
- Ground factual claims in checkable specifics — numbers, dates, named sources — not vibes. When you used web search, name the outlet or publication behind key facts. Clearly separate established fact from your estimate or judgment; never dress sentiment up as evidence.
- Keep your turn tight: roughly 2-4 sentences. No meta-commentary like "as an AI" or stage directions.
- Speak in first person, directly, like a sharp analyst in a live panel discussion.`.trim();

const WEB_SEARCH_RULE = `
- You have a live web search tool. Decide for yourself each turn whether searching is worthwhile: search when a key claim hinges on a current fact, a specific statistic, or recent news you don't reliably know — don't rely on memory alone for anything time-sensitive. Skip the search when nothing in your argument depends on fresh information.`;

function personaSystemPrompt(persona: Persona, enableWebSearch: boolean): string {
  const rules = enableWebSearch ? `${DEBATE_CONDUCT_RULES}\n${WEB_SEARCH_RULE}` : DEBATE_CONDUCT_RULES;
  return `You are "${persona.name}", one voice on a live panel debating a forecasting question.\n\nYour analytical lens: ${persona.lens}\n\n${rules}`;
}

function rotateOrder(personas: Persona[], round: number): Persona[] {
  const offset = (round - 1) % personas.length;
  return [...personas.slice(offset), ...personas.slice(0, offset)];
}

// Equal-time backstop: no single turn can dominate the context (or the
// moderator's reading) beyond this length. Normal 2-4 sentence turns never
// come close; only runaway outputs get clipped.
const MAX_TURN_CHARS = 1200;

function truncateTurn(text: string): string {
  if (text.length <= MAX_TURN_CHARS) return text;
  return `${text.slice(0, MAX_TURN_CHARS).trimEnd()}…`;
}

function formatTranscript(turns: TranscriptTurn[]): string {
  return turns.map((t) => `[Round ${t.round}] ${t.personaName}: ${truncateTurn(t.text)}`).join("\n\n");
}

// Rebuttal prompts only need recent context. Capping the window keeps prompts
// small (faster + cheaper) for big panels, while typical debates fit entirely
// and behave exactly as before.
const MAX_CONTEXT_TURNS = 16;

function selectContextTurns(turns: TranscriptTurn[]): TranscriptTurn[] {
  return turns.length > MAX_CONTEXT_TURNS ? turns.slice(-MAX_CONTEXT_TURNS) : turns;
}

function openingPrompt(question: string): string {
  return `DEBATE QUESTION: "${question}"\n\nThis is the opening round. Give your initial take: your probability estimate and your top 2-3 reasons through your lens.`;
}

function rebuttalPrompt(question: string, turns: TranscriptTurn[], round: number, totalRounds: number): string {
  return `DEBATE QUESTION: "${question}"\n\nTRANSCRIPT SO FAR:\n${formatTranscript(turns)}\n\nThis is round ${round} of ${totalRounds}. Respond to the strongest points made so far — agree, rebut, or update your view — and give your current probability estimate.`;
}

const MODERATOR_SYSTEM_PROMPT = `You are an impartial, calibrated forecasting moderator. You just watched a panel debate the question below. Synthesize their strongest arguments into a balanced, decision-useful report.

Do not simply average the panelists' numbers. Reason about which arguments actually carry weight, using sound forecasting judgment (base rates, decisive mechanisms, what would actually have to happen). Favor arguments backed by specific facts and named sources over pure sentiment, and note where the panel's key claims rest on thin evidence. Also extract up to 6 checkable factual claims the debate relied on, each with the outlet or source behind it ("unstated" when no source was given). "Pros" are the strongest reasons favoring the event happening / the answer being yes. "Cons" are the strongest reasons against. Be concrete and concise — avoid hedging filler and avoid repeating the same point across multiple pros or cons. If the transcript looks incomplete or cut short, synthesize from whatever is there rather than refusing.`;

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
  keyClaims: z
    .array(
      z.object({
        claim: z.string().describe("One checkable factual claim the debate relied on"),
        source: z.string().describe("Outlet or source backing it, or 'unstated' when none was given"),
      })
    )
    .max(6)
    .describe("Checkable claims with their sources for follow-up verification"),
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
  emitStart?: boolean;
  provider: ProviderId;
}): Promise<TranscriptTurn> {
  const { model, persona, round, prompt, enableWebSearch, tools, emit, abortSignal, emitStart = true, provider } = params;
  if (emitStart) {
    emit({ type: "agent_start", personaId: persona.id, round });
  }

  let streamError: unknown = null;
  const result = streamText({
    model,
    system: personaSystemPrompt(persona, enableWebSearch),
    prompt,
    tools,
    maxOutputTokens: personaMaxTokens(provider, enableWebSearch),
    // Meta reasons before answering and bills it as output; keep thinking
    // small so the answer fits. Other providers ignore this.
    ...(provider === "meta" ? { providerOptions: { meta: { reasoningEffort: "low" } } } : {}),
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

  if (full.trim().length === 0) {
    // Some providers don't stream text deltas even on success; retry the turn
    // once without streaming before giving up on it.
    let finishReason = "unknown";
    try {
      finishReason = await result.finishReason;
    } catch {
      // ignore
    }
    console.warn(`[debate] empty streamed turn for "${persona.id}" (finish: ${finishReason}); retrying without streaming`);
    const fallback = await generateText({
      model,
      system: personaSystemPrompt(persona, enableWebSearch),
      prompt,
      tools,
      maxOutputTokens: personaMaxTokens(provider, enableWebSearch),
      ...(provider === "meta" ? { providerOptions: { meta: { reasoningEffort: "low" } } } : {}),
      abortSignal,
    });
    full = fallback.text;
    if (full.length > 0) {
      emit({ type: "agent_delta", personaId: persona.id, text: full });
    }
    try {
      emit({
        type: "usage",
        inputTokens: fallback.usage?.inputTokens ?? 0,
        outputTokens: fallback.usage?.outputTokens ?? 0,
      });
    } catch {
      // token usage unavailable from this provider
    }
  }

  if (full.trim().length === 0) {
    throw new Error(`The provider returned an empty response for ${persona.name}.`);
  }

  try {
    const usage = await result.usage;
    emit({ type: "usage", inputTokens: usage?.inputTokens ?? 0, outputTokens: usage?.outputTokens ?? 0 });
  } catch {
    // token usage unavailable from this provider; the turn itself still counts
  }

  emit({ type: "agent_end", personaId: persona.id, fullText: full });
  return { personaName: persona.name, round, text: full };
}

async function generateReportObject(
  model: LanguageModel,
  question: string,
  turns: TranscriptTurn[],
  emit?: (event: DebateEvent) => void,
  abortSignal?: AbortSignal,
  forceText?: boolean
): Promise<DebateReport> {
  const { object, usage } = await generateObjectRobust({
    model,
    schema: ReportSchema,
    system: MODERATOR_SYSTEM_PROMPT,
    prompt: `QUESTION: "${question}"\n\nFULL TRANSCRIPT:\n${formatTranscript(turns)}\n\nProduce the final report.`,
    abortSignal,
    forceText,
  });
  if (emit) {
    emit({ type: "usage", inputTokens: usage.inputTokens, outputTokens: usage.outputTokens });
  }
  return object as DebateReport;
}

const PERSONA_MAX_ATTEMPTS = 3;
const PERSONA_RETRY_BASE_DELAY_MS = 1000;

function toErrorMessage(err: unknown): string {
  return err instanceof Error && err.message.length > 0 ? err.message : "Unknown provider error.";
}

function isAbortError(err: unknown, abortSignal?: AbortSignal): boolean {
  if (abortSignal?.aborted) return true;
  return err instanceof Error && err.name === "AbortError";
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// Cap in-flight persona calls so big panels don't trip provider rate limits.
// Batches run sequentially; results keep input order.
const MAX_CONCURRENT_TURNS = 5;

async function runInBatches<T, R>(
  items: T[],
  fn: (item: T, index: number) => Promise<R>
): Promise<PromiseSettledResult<R>[]> {
  const settled: PromiseSettledResult<R>[] = [];
  for (let i = 0; i < items.length; i += MAX_CONCURRENT_TURNS) {
    const batch = items.slice(i, i + MAX_CONCURRENT_TURNS).map((item, j) => fn(item, i + j));
    settled.push(...(await Promise.allSettled(batch)));
  }
  return settled;
}

// One persona turn with retries. Returns the turn, or null when the persona
// definitively failed — the debate continues with the remaining panel instead
// of the whole run dying. Abort errors are never retried or swallowed.
async function runPersonaTurnWithRetry(params: {
  model: LanguageModel;
  persona: Persona;
  round: number;
  prompt: string;
  enableWebSearch: boolean;
  tools: ReturnType<typeof buildWebSearchTools>;
  emit: (event: DebateEvent) => void;
  abortSignal?: AbortSignal;
  provider: ProviderId;
}): Promise<TranscriptTurn | null> {
  const { persona, round, emit, abortSignal } = params;
  let lastError: unknown = null;

  for (let attempt = 1; attempt <= PERSONA_MAX_ATTEMPTS; attempt++) {
    if (abortSignal?.aborted) {
      throw new DOMException("Aborted", "AbortError");
    }
    try {
      return await runPersonaTurn({ ...params, emitStart: attempt === 1 });
    } catch (err) {
      if (isAbortError(err, abortSignal)) throw err;
      lastError = err;
      if (attempt < PERSONA_MAX_ATTEMPTS) {
        await sleep(PERSONA_RETRY_BASE_DELAY_MS * attempt);
      }
    }
  }

  emit({ type: "agent_error", personaId: persona.id, round, message: toErrorMessage(lastError) });
  return null;
}

export async function runDebate(
  request: DebateRequest,
  emit: (event: DebateEvent) => void,
  abortSignal?: AbortSignal
): Promise<void> {
  const model = buildModel(request.provider, request.apiKey, request.modelId);
  const judgeModel = request.moderatorModelId
    ? buildModel(request.provider, request.apiKey, request.moderatorModelId)
    : model;
  const tools = request.enableWebSearch ? buildWebSearchTools(request.provider, request.apiKey) : undefined;
  const turns: TranscriptTurn[] = [];
  const totalRounds = request.rounds;

  for (let round = 1; round <= totalRounds; round++) {
    if (abortSignal?.aborted) return;
    emit({ type: "round_start", round, totalRounds });
    const order = rotateOrder(request.personas, round);

    // Personas in a round don't depend on each other, so run them concurrently
    // in capped batches — only the *next* round's prompt needs this round's
    // full transcript. A persona that fails (even after retries) yields null
    // and the debate continues with the rest of the panel.
    const results = await runInBatches(order, (persona) =>
      runPersonaTurnWithRetry({
        model,
        persona,
        round,
        provider: request.provider,
        prompt: round === 1 ? openingPrompt(request.question) : rebuttalPrompt(request.question, selectContextTurns(turns), round, totalRounds),
        enableWebSearch: request.enableWebSearch,
        tools,
        emit,
        abortSignal,
      })
    );

    const rejected = results.find((r): r is PromiseRejectedResult => r.status === "rejected");
    if (rejected) {
      throw rejected.reason instanceof Error ? rejected.reason : new Error(String(rejected.reason));
    }

    for (const r of results) {
      if (r.status === "fulfilled" && r.value) turns.push(r.value);
    }

    emit({ type: "round_end", round });
  }

  if (abortSignal?.aborted) return;

  let completedRounds = totalRounds;

  // Optional direct-rebuttal round: each persona challenges one counterpart
  // head-on. Runs only with explicit opt-in since it costs one extra batch.
  if (request.crossExamine && turns.length > 0) {
    const round = ++completedRounds;
    emit({ type: "round_start", round, totalRounds: round });
    const order = rotateOrder(request.personas, round);

    const results = await runInBatches(order, (persona, i) => {
      const counterpart = order[(i + 1) % order.length];
      const counterpartTurn = [...turns].reverse().find((t) => t.personaName === counterpart.name);
      if (counterpartTurn) {
        emit({ type: "challenge", round, fromPersonaId: persona.id, toPersonaId: counterpart.id });
      }
      const prompt = counterpartTurn
        ? crossExaminePrompt(request.question, counterpart.name, counterpartTurn.text)
        : rebuttalPrompt(request.question, selectContextTurns(turns), round, completedRounds);
      return runPersonaTurnWithRetry({
        model,
        persona,
        round,
        provider: request.provider,
        prompt,
        enableWebSearch: request.enableWebSearch,
        tools,
        emit,
        abortSignal,
      });
    });

    const rejected = results.find((r): r is PromiseRejectedResult => r.status === "rejected");
    if (rejected) {
      throw rejected.reason instanceof Error ? rejected.reason : new Error(String(rejected.reason));
    }

    for (const r of results) {
      if (r.status === "fulfilled" && r.value) turns.push(r.value);
    }

    emit({ type: "round_end", round });
  }

  // Optional red-team round: the whole panel attacks the consensus at once.
  // Runs only with explicit opt-in since it costs one extra batch.
  if (request.redTeam && turns.length > 0 && !abortSignal?.aborted) {
    const round = ++completedRounds;
    emit({ type: "round_start", round, totalRounds: round });
    const order = rotateOrder(request.personas, round);

    const results = await runInBatches(order, (persona) =>
      runPersonaTurnWithRetry({
        model,
        persona,
        round,
        provider: request.provider,
        prompt: redTeamPrompt(request.question, selectContextTurns(turns)),
        enableWebSearch: request.enableWebSearch,
        tools,
        emit,
        abortSignal,
      })
    );

    const rejected = results.find((r): r is PromiseRejectedResult => r.status === "rejected");
    if (rejected) {
      throw rejected.reason instanceof Error ? rejected.reason : new Error(String(rejected.reason));
    }

    for (const r of results) {
      if (r.status === "fulfilled" && r.value) turns.push(r.value);
    }

    emit({ type: "round_end", round });
  }

  // Optional autonomous research: a research director names the biggest
  // knowledge gaps, then one extra round investigates them (with web search
  // when enabled). If gap identification fails, fall through to the report
  // with what the debate produced.
  if (request.autonomousResearch && turns.length > 0 && !abortSignal?.aborted) {
    try {
      const gaps = await identifyKnowledgeGaps(
        judgeModel,
        request.question,
        selectContextTurns(turns),
        emit,
        !providerSupportsStructuredOutput(request.provider)
      );
      if (gaps.length > 0) {
        emit({ type: "research_gaps", gaps });
        const round = ++completedRounds;
        emit({ type: "round_start", round, totalRounds: round });
        const order = rotateOrder(request.personas, round);

        const results = await runInBatches(order, (persona) =>
          runPersonaTurnWithRetry({
            model,
            persona,
            round,
            provider: request.provider,
            prompt: researchPrompt(request.question, selectContextTurns(turns), gaps, request.enableWebSearch),
            enableWebSearch: request.enableWebSearch,
            tools,
            emit,
            abortSignal,
          })
        );

        const rejected = results.find((r): r is PromiseRejectedResult => r.status === "rejected");
        if (rejected) {
          throw rejected.reason instanceof Error ? rejected.reason : new Error(String(rejected.reason));
        }

        for (const r of results) {
          if (r.status === "fulfilled" && r.value) turns.push(r.value);
        }

        emit({ type: "round_end", round });
      }
    } catch (err) {
      if (isAbortError(err, abortSignal)) throw err;
    }
  }

  if (abortSignal?.aborted) return;

  if (turns.length === 0) {
    throw new Error("Every persona failed to respond — nothing to report. Check your API key and provider status, then try again.");
  }

  emit({ type: "report_start" });
  const report = await generateReportObject(
    judgeModel,
    request.question,
    turns,
    emit,
    abortSignal,
    !providerSupportsStructuredOutput(request.provider)
  );
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

export interface FollowUpRequest {
  question: string;
  provider: ProviderId;
  apiKey: string;
  modelId: string;
  moderatorModelId?: string;
  personas: Persona[];
  transcript: TranscriptTurn[];
  followUp: string;
  baseRound: number;
  enableWebSearch: boolean;
}

function redTeamPrompt(question: string, turns: TranscriptTurn[]): string {
  return `DEBATE QUESTION: "${question}"\n\nTRANSCRIPT SO FAR:\n${formatTranscript(turns)}\n\nThis is a red-team round. Forget your earlier position for a moment: find the single strongest reason the current consensus could be WRONG, attack it as hard as you honestly can, and restate your probability estimate in 2-4 sentences.`;
}

function crossExaminePrompt(question: string, counterpartName: string, counterpartText: string): string {
  return `DEBATE QUESTION: "${question}"\n\n${counterpartName}'s latest argument:\n"${counterpartText}"\n\nThis is a direct cross-examination. Challenge ${counterpartName}'s argument head-on: name its weakest link, counter with your strongest fact or mechanism, and restate your updated probability estimate. Speak directly to them in 2-4 sentences.`;
}

const GapListSchema = z.object({
  gaps: z.array(z.string().min(4).max(300)).min(1).max(3),
});

const RESEARCH_DIRECTOR_PROMPT = `You are a research director reviewing a forecasting debate before it concludes. Read the question and the transcript so far, then list up to 3 concrete, checkable knowledge gaps that, if closed, would most move the panel's probability estimate.

Rules:
- Each gap must be a specific factual unknown (a number, a date, a decision, a capability), not a vague theme.
- Skip gaps the transcript already answered well.
- Phrase each gap as a research question a web search could plausibly answer.`.trim();

async function identifyKnowledgeGaps(
  model: LanguageModel,
  question: string,
  turns: TranscriptTurn[],
  emit?: (event: DebateEvent) => void,
  forceText?: boolean
): Promise<string[]> {
  const { object, usage } = await generateObjectRobust({
    model,
    schema: GapListSchema,
    system: RESEARCH_DIRECTOR_PROMPT,
    prompt: `DEBATE QUESTION: "${question}"\n\nTRANSCRIPT SO FAR:\n${formatTranscript(turns)}\n\nList the knowledge gaps.`,
    forceText,
  });
  if (emit) {
    emit({ type: "usage", inputTokens: usage.inputTokens, outputTokens: usage.outputTokens });
  }
  return object.gaps;
}

function researchPrompt(question: string, turns: TranscriptTurn[], gaps: string[], searchOn: boolean): string {
  const gapList = gaps.map((g) => `- ${g}`).join("\n");
  const method = searchOn
    ? "Use web search to investigate it now — verify the key facts with named sources before you argue from them."
    : "Reason carefully from what you reliably know, and clearly mark what remains unverified.";
  return `DEBATE QUESTION: "${question}"\n\nTRANSCRIPT SO FAR:\n${formatTranscript(turns)}\n\nKNOWLEDGE GAPS the research director wants closed:\n${gapList}\n\nPick the gap closest to your lens and investigate it. ${method} Report what you found and restate your updated probability estimate in 2-4 sentences.`;
}

function followUpPrompt(question: string, turns: TranscriptTurn[], followUp: string): string {
  return `DEBATE QUESTION: "${question}"\n\nTRANSCRIPT SO FAR:\n${formatTranscript(turns)}\n\nFOLLOW-UP QUESTION from the moderator: "${followUp}"\n\nRespond to the follow-up in light of the transcript — agree with, rebut, or update your earlier view — and give your current probability estimate.`;
}

// One extra round driven by a user follow-up, then a regenerated report.
// Reuses the same event shapes as runDebate so the UI needs no new handling.
export async function runFollowUp(
  request: FollowUpRequest,
  emit: (event: DebateEvent) => void,
  abortSignal?: AbortSignal
): Promise<void> {
  const model = buildModel(request.provider, request.apiKey, request.modelId);
  const judgeModel = request.moderatorModelId
    ? buildModel(request.provider, request.apiKey, request.moderatorModelId)
    : model;
  const tools = request.enableWebSearch ? buildWebSearchTools(request.provider, request.apiKey) : undefined;
  const round = request.baseRound + 1;

  if (abortSignal?.aborted) return;
  emit({ type: "round_start", round, totalRounds: round });

  const results = await runInBatches(request.personas, (persona) =>
    runPersonaTurnWithRetry({
      model,
      persona,
      round,
      provider: request.provider,
      prompt: followUpPrompt(request.question, selectContextTurns(request.transcript), request.followUp),
      enableWebSearch: request.enableWebSearch,
      tools,
      emit,
      abortSignal,
    })
  );

  const rejected = results.find((r): r is PromiseRejectedResult => r.status === "rejected");
  if (rejected) {
    throw rejected.reason instanceof Error ? rejected.reason : new Error(String(rejected.reason));
  }

  const newTurns: TranscriptTurn[] = [];
  for (const r of results) {
    if (r.status === "fulfilled" && r.value) newTurns.push(r.value);
  }

  emit({ type: "round_end", round });

  if (abortSignal?.aborted) return;

  const fullTranscript = [...request.transcript, ...newTurns];
  if (fullTranscript.length === 0) {
    throw new Error("Every persona failed to respond — nothing to report. Check your API key and provider status, then try again.");
  }

  emit({ type: "report_start" });
  const report = await generateReportObject(
    judgeModel,
    request.question,
    fullTranscript,
    emit,
    abortSignal,
    !providerSupportsStructuredOutput(request.provider)
  );
  emit({ type: "report", data: report });
  emit({ type: "done" });
}
