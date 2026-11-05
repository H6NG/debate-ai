import assert from "node:assert/strict";
import { readdirSync } from "node:fs";
import test from "node:test";

import { brierScore, trackRecord } from "./history.ts";
import { BUILTIN_PERSONAS } from "./personas.ts";
import { PROVIDER_CATALOG } from "./provider-catalog.ts";
import { roundSpreads, spreadChange } from "./probability.ts";

// NOTE on scope: these tests verify the *measurement machinery* (formulas,
// aggregation, counting) against known values. They do not measure the
// panel's real forecast accuracy — that needs 20+ live forecasts resolved
// against real outcomes, which only time and real debates can produce.

test("brier score matches known values", () => {
  assert.equal(brierScore(100, "yes"), 0); // certain and right: perfect
  assert.equal(brierScore(0, "yes"), 1); // certain and wrong: worst
  assert.equal(brierScore(50, "yes"), 0.25); // coin flip
  assert.equal(brierScore(50, "no"), 0.25);
  assert.ok(Math.abs(brierScore(80, "no") - 0.64) < 1e-9);
  assert.equal(brierScore(150, "yes"), 0); // out-of-range clamps to 100
});

test("track record averages resolved forecasts only", () => {
  const entries = [
    { probability: 80, resolution: { outcome: "yes", resolvedAt: "2026-01-01" } },
    { probability: 20, resolution: { outcome: "yes", resolvedAt: "2026-01-02" } },
    { probability: 50, resolution: { outcome: "no", resolvedAt: "2026-01-03" } },
    { probability: 90 }, // unresolved: must be ignored
  ];
  const record = trackRecord(entries);
  assert.equal(record.resolved, 3);
  // (0.04 + 0.64 + 0.25) / 3
  assert.ok(Math.abs(record.meanBrier - 0.31) < 1e-9);
  assert.deepEqual(trackRecord([]), { resolved: 0, meanBrier: null });
  assert.deepEqual(trackRecord([{ probability: 90 }]), { resolved: 0, meanBrier: null });
});

// Turns copied from the built-in sample debate (src/lib/sample-debate.ts):
// round 1 estimates 72/55/38/58/66, round 2 estimates 68/62/40/60/61.
const SAMPLE_TURNS = {
  economist: [
    { round: 1, text: "NVIDIA holds roughly 80% of the AI accelerator market. I put continued dominance through 2030 at 72%." },
    { round: 2, text: "NVIDIA's networking stack still has no peer. Trimming to 68%." },
  ],
  engineer: [
    { round: 1, text: "TPUs run most workloads within 20% on perf-per-dollar. I'd say 55% they stay dominant." },
    { round: 2, text: "The software stack matters more than the chips. Moving up to 62%." },
  ],
  skeptic: [
    { round: 1, text: "Every dominant chipmaker eventually gets commoditized. Only 38% they hold through 2030." },
    { round: 2, text: "How often does an 80% share survive five years? Staying at 40%." },
  ],
  strategist: [
    { round: 1, text: "Export controls cut both ways and fund a parallel supply chain. 58%." },
    { round: 2, text: "Markets already discount China risk. Holding at 60%." },
  ],
  trader: [
    { round: 1, text: "The street prices continued dominance around 65-70%. Backlogs still show 12-month lead times. 66%." },
    { round: 2, text: "Backlogs are shortening. That plus the capex point takes me to 61%." },
  ],
};

test("convergence: sample panel spread narrows from round 1 to round 2", () => {
  const spreads = roundSpreads(SAMPLE_TURNS, 2);
  assert.equal(spreads[0].spread, 34); // 72 - 38
  assert.equal(spreads[1].spread, 28); // 68 - 40
  assert.equal(spreadChange(spreads), 6); // narrowed by 6 points
});

test("convergence: edge cases do not fake agreement", () => {
  assert.equal(roundSpreads({}, 2)[0].spread, null); // nobody spoke
  const oneVoice = { a: [{ round: 1, text: "I put it at 60%." }] };
  assert.equal(roundSpreads(oneVoice, 1)[0].spread, null); // lone estimate
  assert.equal(spreadChange(roundSpreads(oneVoice, 1)), null); // needs 2 rounds
  const widening = {
    a: [
      { round: 1, text: "I put it at 50%." },
      { round: 2, text: "I put it at 90%." },
    ],
    b: [
      { round: 1, text: "I put it at 55%." },
      { round: 2, text: "I put it at 20%." },
    ],
  };
  assert.equal(spreadChange(roundSpreads(widening, 2)), -65); // diverged
});

test("scale facts: personas, providers, API routes", () => {
  assert.equal(BUILTIN_PERSONAS.length, 21);
  assert.equal(new Set(BUILTIN_PERSONAS.map((p) => p.id)).size, 21); // ids unique
  assert.equal(PROVIDER_CATALOG.length, 6);
  const routes = readdirSync(new URL("../app/api/", import.meta.url), { withFileTypes: true })
    .filter((d) => d.isDirectory())
    .map((d) => d.name)
    .sort();
  assert.deepEqual(routes, ["debate", "draft-panel", "followup", "pick-personas", "report", "test-key"]);
});
