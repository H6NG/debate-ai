import { NextRequest } from "next/server";
import { z } from "zod";
import { generateReportFromTranscript } from "@/lib/debate";

const RequestSchema = z.object({
  question: z.string().min(10).max(500),
  provider: z.enum(["anthropic", "openai", "google", "perplexity", "groq", "meta"]),
  apiKey: z.string().min(1).max(400),
  modelId: z.string().min(1).max(200),
  transcript: z
    .array(
      z.object({
        personaName: z.string().min(1),
        round: z.number().int().min(1),
        text: z.string(),
      })
    )
    .min(1),
});

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);
  const parsed = RequestSchema.safeParse(body);

  if (!parsed.success) {
    return Response.json({ error: parsed.error.issues[0]?.message ?? "Invalid request" }, { status: 400 });
  }

  const { question, provider, apiKey, modelId, transcript } = parsed.data;

  try {
    const report = await generateReportFromTranscript(provider, apiKey, modelId, question, transcript);
    return Response.json({ report });
  } catch (err) {
    const message = err instanceof Error && err.message.length > 0 ? err.message : "Unknown error while talking to the model provider.";
    return Response.json({ error: message }, { status: 502 });
  }
}
