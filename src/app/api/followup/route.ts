import { NextRequest } from "next/server";
import { z } from "zod";
import { runFollowUp } from "@/lib/debate";
import type { DebateEvent } from "@/lib/types";

const PersonaSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1).max(60),
  tagline: z.string().max(120),
  lens: z.string().min(1).max(800),
  custom: z.boolean().optional(),
});

const TranscriptTurnSchema = z.object({
  personaName: z.string().min(1),
  round: z.number().int().min(1),
  text: z.string(),
});

const FollowUpRequestSchema = z.object({
  question: z.string().min(10).max(500),
  provider: z.enum(["anthropic", "openai", "google", "perplexity", "groq", "meta"]),
  apiKey: z.string().min(1).max(400),
  modelId: z.string().min(1).max(200),
  personas: z.array(PersonaSchema).min(2).max(60),
  transcript: z.array(TranscriptTurnSchema).min(1).max(500),
  followUp: z.string().min(4).max(500),
  baseRound: z.number().int().min(1).max(20),
  enableWebSearch: z.boolean(),
  moderatorModelId: z.string().min(1).max(200).optional(),
});

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);
  const parsed = FollowUpRequestSchema.safeParse(body);

  if (!parsed.success) {
    return new Response(JSON.stringify({ error: parsed.error.issues[0]?.message ?? "Invalid request" }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  const followUpRequest = parsed.data;
  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    async start(controller) {
      let closed = false;
      const emit = (event: DebateEvent) => {
        if (closed) return;
        try {
          controller.enqueue(encoder.encode(JSON.stringify(event) + "\n"));
        } catch {
          closed = true;
        }
      };

      try {
        await runFollowUp(followUpRequest, emit, req.signal);
      } catch (err) {
        if (!req.signal.aborted) emit({ type: "error", message: toErrorMessage(err) });
      } finally {
        if (!closed) {
          closed = true;
          try {
            controller.close();
          } catch {
            // client already disconnected
          }
        }
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "application/x-ndjson; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
    },
  });
}

function toErrorMessage(err: unknown): string {
  if (err instanceof Error) {
    return err.message.length > 0 ? err.message : "Unknown error while talking to the model provider.";
  }
  return "Unknown error while talking to the model provider.";
}
