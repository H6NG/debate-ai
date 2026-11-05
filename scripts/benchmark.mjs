#!/usr/bin/env node
// Live benchmark harness — generates the resume-grade numbers (cost per
// debate, end-to-end latency) from REAL debates against a running app.
//
// This spends real API credits. It refuses to run without a key, and it
// never invents numbers: every figure below comes from a completed debate's
// own usage events and wall-clock time.
//
// Usage:
//   1. Start the app:            npm run dev
//   2. Run with your own key:    BENCH_API_KEY=sk-... BENCH_MODEL=claude-haiku-4-5-20251001 npm run benchmark
//
// Optional env:
//   BENCH_BASE_URL           default http://localhost:3000
//   BENCH_PROVIDER           default anthropic (anthropic|openai|google|perplexity|groq|meta)
//   BENCH_QUICK_MODEL        model for the quick config (defaults to BENCH_MODEL)
//   BENCH_QUESTIONS          number of questions per config, 1-5 (default 3)
//   BENCH_PRICE_IN_PER_MTOK  your model's input price per 1M tokens, for $ estimates
//   BENCH_PRICE_OUT_PER_MTOK your model's output price per 1M tokens
//
// What it does NOT measure:
//   - Sequential-vs-parallel latency: the concurrency cap (5) is a constant
//     in src/lib/debate.ts, so there is no cap-1 mode to compare against
//     without a code change. Latency here is the shipped configuration.
//   - Forecast accuracy: that needs forecasts resolved against real
//     outcomes over time (see History → track record in the app).

import { BUILTIN_PERSONAS } from "../src/lib/personas.ts";

const apiKey = process.env.BENCH_API_KEY ?? "";
const modelId = process.env.BENCH_MODEL ?? "";
if (!apiKey || !modelId) {
  console.error("NOT RUN: set BENCH_API_KEY and BENCH_MODEL (your own provider key and model id).");
  console.error("Example: BENCH_API_KEY=sk-... BENCH_MODEL=claude-haiku-4-5-20251001 npm run benchmark");
  process.exit(2);
}

const baseUrl = (process.env.BENCH_BASE_URL ?? "http://localhost:3000").replace(/\/$/, "");
const provider = process.env.BENCH_PROVIDER ?? "anthropic";
const quickModel = process.env.BENCH_QUICK_MODEL ?? modelId;
const questionCount = Math.min(5, Math.max(1, Number(process.env.BENCH_QUESTIONS ?? 3) || 3));
const priceIn = Number(process.env.BENCH_PRICE_IN_PER_MTOK ?? NaN);
const priceOut = Number(process.env.BENCH_PRICE_OUT_PER_MTOK ?? NaN);

const QUESTIONS = [
  "Will the Fed cut interest rates at its next meeting?",
  "Will NVIDIA maintain its AI GPU market dominance through 2030?",
  "Will a humanoid robot be sold to consumers for under $20,000 before 2028?",
  "Will global EV sales exceed 50% of new car sales before 2030?",
  "Will an AI system win a major international mathematics competition before 2027?",
];

const pick = (ids) => ids.map((id) => BUILTIN_PERSONAS.find((p) => p.id === id)).filter(Boolean);

const CONFIGS = [
  {
    name: "quick (1 round, 3 personas, quick model)",
    modelId: quickModel,
    rounds: 1,
    personas: pick(["optimist", "skeptic", "data-analyst"]),
  },
  {
    name: "full (2 rounds, 5 personas)",
    modelId,
    rounds: 2,
    personas: pick(["optimist", "skeptic", "data-analyst", "pragmatist", "contrarian"]),
  },
];

function median(values) {
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 1 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

async function runDebate(config, question) {
  const started = performance.now();
  const res = await fetch(`${baseUrl}/api/debate`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      question,
      provider,
      apiKey,
      modelId: config.modelId,
      personas: config.personas,
      rounds: config.rounds,
      enableWebSearch: false,
      crossExamine: false,
      redTeam: false,
      autonomousResearch: false,
    }),
  });
  if (!res.ok || !res.body) {
    const data = await res.json().catch(() => null);
    throw new Error(data?.error ?? `Request failed (${res.status}) — is the app running at ${baseUrl}?`);
  }
  let inputTokens = 0;
  let outputTokens = 0;
  let sawReport = false;
  const decoder = new TextDecoder();
  let buffer = "";
  for await (const chunk of res.body) {
    buffer += decoder.decode(chunk, { stream: true });
    const lines = buffer.split("\n");
    buffer = lines.pop() ?? "";
    for (const line of lines) {
      if (!line.trim()) continue;
      const event = JSON.parse(line);
      if (event.type === "usage") {
        inputTokens += event.inputTokens ?? 0;
        outputTokens += event.outputTokens ?? 0;
      }
      if (event.type === "report") sawReport = true;
      if (event.type === "error") throw new Error(event.message);
    }
  }
  if (!sawReport) throw new Error("Debate stream ended without a report.");
  return { ms: performance.now() - started, inputTokens, outputTokens };
}

console.log(`Benchmarking against ${baseUrl} — this spends real API credits.\n`);
try {
  await runConfigs();
} catch (err) {
  console.error(`\nBenchmark failed: ${err instanceof Error ? err.message : String(err)}`);
  console.error("No numbers were produced — fix the cause above and rerun.");
  process.exit(1);
}

async function runConfigs() {
  for (const config of CONFIGS) {
  const runs = [];
  for (const question of QUESTIONS.slice(0, questionCount)) {
    process.stdout.write(`  [${config.name}] ${question.slice(0, 52)}… `);
    const run = await runDebate(config, question);
    runs.push(run);
    console.log(`${(run.ms / 1000).toFixed(1)}s, ${run.inputTokens + run.outputTokens} tokens`);
  }
  const medMs = median(runs.map((r) => r.ms));
  const medIn = median(runs.map((r) => r.inputTokens));
  const medOut = median(runs.map((r) => r.outputTokens));
  let cost = "";
  if (Number.isFinite(priceIn) && Number.isFinite(priceOut)) {
    cost = `, median cost $${((medIn / 1e6) * priceIn + (medOut / 1e6) * priceOut).toFixed(4)}`;
  }
    console.log(
      `MEDIAN [${config.name}]: ${(medMs / 1000).toFixed(1)}s per debate, ${Math.round(medIn)} in / ${Math.round(medOut)} out tokens${cost}\n`,
    );
  }
  console.log("Done. Report medians, not best runs — and note the model and date alongside them.");
}
