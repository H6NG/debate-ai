import { NextRequest } from "next/server";
import { z } from "zod";
import { buildModel, providerSupportsStructuredOutput } from "@/lib/providers";
import { generateObjectRobust } from "@/lib/structured";

const DraftPanelRequestSchema = z.object({
  question: z.string().min(10).max(500),
  provider: z.enum(["anthropic", "openai", "google", "perplexity", "groq", "meta"]),
  apiKey: z.string().min(1).max(400),
  modelId: z.string().min(1).max(200),
});

const DraftedPersonaSchema = z.object({
  name: z.string().min(1).max(60).describe("Short persona name, e.g. The Semiconductor Engineer"),
  tagline: z.string().min(1).max(120).describe("One-line description of this expert's angle"),
  lens: z
    .string()
    .min(1)
    .max(800)
    .describe(
      "Second-person reasoning instructions for this expert, in the same style as: You reason like a practitioner embedded in whatever field the question touches. You focus on the concrete mechanism by which the outcome would actually occur."
    ),
});

const DraftPanelResponseSchema = z.object({
  personas: z.array(DraftedPersonaSchema).min(4).max(6),
});

const CASTING_DIRECTOR_PROMPT = `You are a panel casting director for a forecasting debate. Given a yes/no forecasting question, recruit 5 or 6 domain experts whose professional lenses together cover the question from genuinely different angles.

Cover the relevant domains: the core technical field, money and markets, operations and supply chains, research and evidence, law and regulation, geopolitics, and competition. Pick only the domains that matter for THIS question — skip irrelevant ones rather than padding.

Rules:
- Every expert must be distinct: no overlapping lenses, no generic optimist/skeptic roles.
- Each lens must be concrete and domain-specific, naming the mechanisms, data, or actors that expert would actually examine.
- Write each lens in the second person ("You reason like..."), 2-4 sentences.`.trim();

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);
  const parsed = DraftPanelRequestSchema.safeParse(body);

  if (!parsed.success) {
    return new Response(JSON.stringify({ error: parsed.error.issues[0]?.message ?? "Invalid request" }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  try {
    const { question, provider, apiKey, modelId } = parsed.data;
    const { object } = await generateObjectRobust({
      model: buildModel(provider, apiKey, modelId),
      schema: DraftPanelResponseSchema,
      system: CASTING_DIRECTOR_PROMPT,
      prompt: `DEBATE QUESTION: "${question}"\n\nRecruit the panel.`,
      forceText: !providerSupportsStructuredOutput(provider),
    });
    return new Response(JSON.stringify(object), {
      headers: { "Content-Type": "application/json" },
    });
  } catch (err) {
    const message =
      err instanceof Error && err.message.length > 0
        ? err.message
        : "Unknown error while drafting the panel.";
    return new Response(JSON.stringify({ error: message }), {
      status: 502,
      headers: { "Content-Type": "application/json" },
    });
  }
}
