import { NextRequest } from "next/server";
import { z } from "zod";
import { buildModel, providerSupportsStructuredOutput } from "@/lib/providers";
import { BUILTIN_PERSONAS } from "@/lib/personas";
import { generateObjectRobust } from "@/lib/structured";

const PickPersonasRequestSchema = z.object({
  question: z.string().min(10).max(500),
  provider: z.enum(["anthropic", "openai", "google", "perplexity", "groq", "meta"]),
  apiKey: z.string().min(1).max(400),
  modelId: z.string().min(1).max(200),
});

const PickPersonasResponseSchema = z.object({
  personaIds: z.array(z.string()).min(2).max(8),
});

const PANEL_CASTING_PROMPT = `You are casting a forecasting debate panel. Given a yes/no forecasting question and a catalog of analyst personas (id, name, tagline), pick the 4 to 6 personas whose lenses best cover the question from genuinely different angles.

Rules:
- Cover the question's key dimensions (technical, economic, operational, evidentiary, legal/regulatory, geopolitical, competitive) with as little overlap as possible.
- Prefer specialists over generalists when the question names a concrete domain.
- Return only the ids, in the order they should join the panel.`.trim();

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);
  const parsed = PickPersonasRequestSchema.safeParse(body);

  if (!parsed.success) {
    return new Response(JSON.stringify({ error: parsed.error.issues[0]?.message ?? "Invalid request" }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  try {
    const { question, provider, apiKey, modelId } = parsed.data;
    const catalog = BUILTIN_PERSONAS.map((p) => `- ${p.id}: ${p.name} — ${p.tagline}`).join("\n");
    const { object } = await generateObjectRobust({
      model: buildModel(provider, apiKey, modelId),
      schema: PickPersonasResponseSchema,
      system: PANEL_CASTING_PROMPT,
      prompt: `DEBATE QUESTION: "${question}"\n\nPERSONA CATALOG:\n${catalog}\n\nPick the panel.`,
      forceText: !providerSupportsStructuredOutput(provider),
    });
    const validIds = new Set(BUILTIN_PERSONAS.map((p) => p.id));
    const personaIds = object.personaIds.filter((id) => validIds.has(id));
    if (personaIds.length < 2) {
      throw new Error("The model did not return a usable panel — try again or pick manually.");
    }
    return new Response(JSON.stringify({ personaIds }), {
      headers: { "Content-Type": "application/json" },
    });
  } catch (err) {
    const message =
      err instanceof Error && err.message.length > 0 ? err.message : "Unknown error while picking the panel.";
    return new Response(JSON.stringify({ error: message }), {
      status: 502,
      headers: { "Content-Type": "application/json" },
    });
  }
}
