import { NextRequest } from "next/server";
import { z } from "zod";
import { runDebate } from "@/lib/debate";
import type { DebateEvent } from "@/lib/types";

const PersonaSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1).max(60),
  tagline: z.string().max(120),
  lens: z.string().min(1).max(800),
  custom: z.boolean().optional(),
});

const RequestSchema = z.object({
  question: z.string().min(10).max(500),
  provider: z.enum(["anthropic", "openai", "google", "perplexity", "groq", "meta"]),
  apiKey: z.string().min(1).max(400),
  modelId: z.string().min(1).max(200),
  // No real product cap on panel size — 60 is just a sanity backstop against
  // malformed/abusive payloads, far above any panel a user would pick by hand.
  personas: z.array(PersonaSchema).min(2).max(60),
  rounds: z.number().int().min(1).max(3),
  enableWebSearch: z.boolean(),
});

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);
  const parsed = RequestSchema.safeParse(body);

  if (!parsed.success) {
    return new Response(JSON.stringify({ error: parsed.error.issues[0]?.message ?? "Invalid request" }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  const debateRequest = parsed.data;
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
        await runDebate(debateRequest, emit, req.signal);
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
