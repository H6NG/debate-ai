import { generateObject, generateText, NoObjectGeneratedError, type LanguageModel } from "ai";
import { z } from "zod";
import type { UsageInfo } from "./types";

// Some providers (e.g. Meta via the OpenAI-compatible API) don't support
// structured JSON output, so generateObject fails on them with
// "No object generated". This helper retries those cases as plain text and
// parses the JSON itself. Other failures (auth, rate limits, aborts) are
// rethrown untouched so they keep their real error messages.
function isNoObjectError(err: unknown): boolean {
  if (err instanceof NoObjectGeneratedError) return true;
  return err instanceof Error && /no object generated|did not match schema/i.test(err.message);
}

type UsageLike = { inputTokens?: number; outputTokens?: number } | undefined;

async function safeUsage(usage: UsageLike | Promise<UsageLike>): Promise<UsageInfo> {
  try {
    const u = await usage;
    return { inputTokens: u?.inputTokens ?? 0, outputTokens: u?.outputTokens ?? 0 };
  } catch {
    return { inputTokens: 0, outputTokens: 0 };
  }
}

function extractJson(text: string): unknown {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const candidate = (fenced ? fenced[1] : text).trim();
  const start = candidate.indexOf("{");
  const end = candidate.lastIndexOf("}");
  if (start === -1 || end <= start) throw new Error("The model did not return valid JSON.");
  return JSON.parse(candidate.slice(start, end + 1));
}

export async function generateObjectRobust<T extends z.ZodTypeAny>(params: {
  model: LanguageModel;
  schema: T;
  system: string;
  prompt: string;
  abortSignal?: AbortSignal;
  // Set when the provider is known not to support structured output: skips
  // the doomed generateObject attempt instead of waiting for it to fail.
  forceText?: boolean;
}): Promise<{ object: z.infer<T>; usage: UsageInfo }> {
  const { model, schema, system, prompt, abortSignal, forceText } = params;

  if (!forceText) {
    try {
      const { object, usage } = await generateObject({ model, schema, system, prompt, abortSignal });
      return { object: object as z.infer<T>, usage: await safeUsage(usage) };
    } catch (err) {
      if (!isNoObjectError(err)) throw err;
    }
  }

  const jsonSchema = JSON.stringify(z.toJSONSchema(schema));
  const { text, usage } = await generateText({
    model,
    system: `${system}\n\nRespond with ONLY a single JSON object matching the schema below. No markdown fences, no commentary, no extra text.`,
    prompt: `${prompt}\n\nJSON schema:\n${jsonSchema}`,
    abortSignal,
  });
  const object = schema.parse(extractJson(text)) as z.infer<T>;
  return { object, usage: await safeUsage(usage) };
}
