import { NextRequest } from "next/server";
import { z } from "zod";
import { generateText } from "ai";
import { buildModel } from "@/lib/providers";
import { getProviderMeta } from "@/lib/provider-catalog";

const TestKeyRequestSchema = z.object({
  provider: z.enum(["anthropic", "openai", "google", "perplexity", "groq", "meta"]),
  apiKey: z.string().min(1).max(400),
  modelId: z.string().min(1).max(200).optional(),
});

// Verifies a provider API key with a single minimal call (no web search, tiny
// output cap). Auth failures are a normal test result, so they return 200 with
// ok:false — only malformed requests get a 4xx.
export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);
  const parsed = TestKeyRequestSchema.safeParse(body);

  if (!parsed.success) {
    return new Response(JSON.stringify({ error: parsed.error.issues[0]?.message ?? "Invalid request" }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  const { provider, apiKey } = parsed.data;
  const modelId = parsed.data.modelId?.trim() || getProviderMeta(provider).quickModelId;
  const started = Date.now();
  try {
    await generateText({
      model: buildModel(provider, apiKey, modelId),
      prompt: "Reply with the single word OK.",
      maxOutputTokens: 10,
      abortSignal: AbortSignal.timeout(30000),
    });
    return new Response(JSON.stringify({ ok: true, latencyMs: Date.now() - started }), {
      headers: { "Content-Type": "application/json" },
    });
  } catch (err) {
    const message =
      err instanceof Error && err.message.length > 0 ? err.message : "Key verification failed.";
    return new Response(JSON.stringify({ ok: false, error: message }), {
      headers: { "Content-Type": "application/json" },
    });
  }
}
