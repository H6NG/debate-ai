import assert from "node:assert/strict";
import test from "node:test";

import { extractProbability } from "./probability.ts";

// Cases taken verbatim from a real debate on "1+1=2" where the tracker
// displayed 9% / 5% / 1% for personas who had actually said ~99%.
test("decimal estimates are not truncated to their fractional digit", () => {
  assert.equal(extractProbability("I put this at 99.9% — yes, 1+1 equals 2 in standard arithmetic."), 99.9);
  assert.equal(extractProbability("I put it at 99.9% that yes, 1+1 equals 2 under standard arithmetic."), 99.9);
  assert.equal(extractProbability("I'm holding at **99.9%** yes, and the IEEE 754 point closes the loophole."), 99.9);
  assert.equal(extractProbability("I put **98%** probability on yes, under the intended interpretation."), 98);
});

test("the speaker's own estimate wins over percentages mentioned afterwards", () => {
  // Residual doubt stated after the estimate is not the estimate.
  assert.equal(extractProbability("I put it at 99.9% yes — only a 0.1% chance this is false."), 99.9);
  assert.equal(extractProbability("I put it at 95% yes, with maybe 5% residual doubt about the framing."), 95);
  // An in-turn revision supersedes the first estimate.
  assert.equal(extractProbability("I put it at 60% initially. Actually, revising to 55% after that point."), 55);
});

test("non-estimate percentages earlier in a turn do not win", () => {
  // Market share is a fact about the world, not the persona's estimate.
  assert.equal(
    extractProbability("NVIDIA holds roughly 80% of the AI accelerator market. I put continued dominance through 2030 at 72%."),
    72,
  );
  // A quoted market range is not the estimate stated after it.
  assert.equal(extractProbability("Markets price this around 65-70%. Backlogs still show 12-month lead times. 66%."), 66);
});

test("sample-debate phrasings resolve to the stated estimate", () => {
  assert.equal(extractProbability("The networking stack still has no peer. Trimming to 68%."), 68);
  assert.equal(extractProbability("I'd say 55% they stay dominant."), 55);
  assert.equal(extractProbability("The software stack matters more than the chips. Moving up to 62%."), 62);
  assert.equal(extractProbability("How often does an 80% share survive five years? Staying at 40%."), 40);
  assert.equal(extractProbability("The pricing argument resonates. Holding at 60%."), 60);
  assert.equal(extractProbability("That plus the capex point takes me to 61%."), 61);
});

// Broader accuracy set: realistic persona turns in varied phrasings, each
// with decoy percentages (shares, polls, market quotes, complements).
// Grow this from real debate transcripts whenever extraction misses.
test("accuracy set: varied real-world phrasings", () => {
  const cases = [
    ["The base rate is sobering: only about 12% of these launches succeed, but this team has distribution, so I land at 35%.", 35],
    ["Markets imply 70% here. My own estimate is 58% after adjusting for liquidity.", 58],
    ["I'm at 44% — the 80% headline figure counts a much broader market than this one.", 44],
    ["There's a 90% chance the demo works and still only a 30% chance it ships this year; I put shipping at 28%.", 28],
    ["I estimate a 67% probability that the bill passes, though a 20% chance of a filibuster remains.", 67],
    ["Staying at 51%: the poll moved from 48% to 49% this week, inside the margin of error.", 51],
    ["Call it 25%.", 25],
    ["I now put it at 73%, up from 64% last round.", 73],
    ["Roughly 40% feels right; the often-quoted 85% figure uses a different definition.", 40],
    ["My number: 36%.", 36],
    ["The chance of a recession is 45%, and I put a hard recession at 22%.", 22],
    ["I'd put this closer to 61% than the market's 70%.", 61],
    ["Adoption is at 18% of households and growing 30% a year. I put majority adoption by 2030 at 47%.", 47],
    ["Unemployment would need to rise past 6% to change my mind. Holding at 33%.", 33],
    ["Last round I was at 70% — the earnings miss revises me down to 52%.", 52],
    ["A 95% confidence interval is not a probability of success. I put success at 41%.", 41],
  ];
  for (const [text, expected] of cases) {
    assert.equal(extractProbability(text), expected, text);
  }
});

test("plain cases keep working", () => {
  assert.equal(extractProbability("No percentage mentioned in this turn."), null);
  assert.equal(extractProbability("Only 38% they hold through 2030."), 38);
  assert.equal(extractProbability("Export controls cut both ways and fund a parallel supply chain. 58%."), 58);
  assert.equal(extractProbability("I put it at 150% — completely certain."), 100);
});
