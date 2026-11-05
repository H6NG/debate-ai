import assert from "node:assert/strict";
import test from "node:test";

import { soleKeyedProviderId } from "./provider-catalog.ts";
import { buildStartError } from "./start-validation.ts";

test("sole keyed provider becomes the default", () => {
  assert.equal(soleKeyedProviderId({}), null);
  assert.equal(soleKeyedProviderId({ anthropic: "", openai: "" }), null);
  assert.equal(soleKeyedProviderId({ openai: "sk-test" }), "openai");
  assert.equal(soleKeyedProviderId({ anthropic: "  ", groq: "gsk_x" }), "groq");
});

test("two or more keys leave the default to the user", () => {
  assert.equal(soleKeyedProviderId({ openai: "sk-a", google: "AIza-b" }), null);
  assert.equal(
    soleKeyedProviderId({ anthropic: "sk-ant", openai: "sk-a", meta: "LLM_x" }),
    null
  );
});

test("clearing down to one key follows the remaining provider", () => {
  assert.equal(soleKeyedProviderId({ openai: "", google: "AIza-b" }), "google");
});

test("start is allowed when question, key, model and panel are ready", () => {
  assert.equal(
    buildStartError({
      question: "Will the Fed cut rates this year?",
      hasApiKey: true,
      providerLabel: "Claude (Anthropic)",
      hasModel: true,
      personaCount: 3,
    }),
    null
  );
});

test("missing API key names the default provider and points to Settings", () => {
  const error = buildStartError({
    question: "Will the Fed cut rates this year?",
    hasApiKey: false,
    providerLabel: "Claude (Anthropic)",
    hasModel: true,
    personaCount: 3,
  });
  assert.ok(error !== null);
  assert.match(error, /API key/);
  assert.match(error, /Claude \(Anthropic\)/);
  assert.match(error, /Settings/);
});

test("other blockers are reported alongside a missing key", () => {
  const error = buildStartError({
    question: "short",
    hasApiKey: false,
    providerLabel: "OpenAI (GPT)",
    hasModel: false,
    personaCount: 1,
  });
  assert.ok(error !== null);
  assert.match(error, /API key/);
  assert.match(error, /question/);
  assert.match(error, /personas/);
});
