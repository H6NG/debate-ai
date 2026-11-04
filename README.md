# Debate AI

Ask a forecasting question, watch a panel of AI personas debate it live, and get
back a report with the strongest pros/cons and a calibrated probability estimate.

## How it works

1. You type a question (framed as a yes/no forecast works best, e.g. "Will X
   happen by Y?").
2. You pick a model provider and paste in your own API key, and pick a model.
3. You pick as many of the 14 built-in personas as you want (minimum 2), or add
   your own custom ones. The setup form shows a live estimate of how many
   model calls a run will make, since bigger panels and more rounds cost more
   and can trip a provider's rate limit (personas in a round run concurrently).
4. Optionally turn on live web search grounding, for providers that support it
   (see below) — personas can search the web for current facts instead of
   relying on memory alone.
5. Each round, all personas answer concurrently (not one-at-a-time) and stream
   live to the screen — only the next round's prompt waits on the full
   transcript, so rounds are as fast as the slowest single response rather
   than the sum of every persona's response.
6. You can hit "Stop & report" at any point mid-debate — it cancels further
   generation and produces a report from whatever arguments were made so far.
7. A moderator agent reads the full transcript and produces a final report:
   a summary, the strongest pros and cons, a probability estimate, a confidence
   level, and the key uncertainties that could move the estimate.

## Speed tips

- Fewer rounds and fewer personas are the biggest levers (each round is one
  concurrent batch of calls, not sequential, but more rounds still means more
  batches).
- The "fast & cheap" model chip for each provider is noticeably quicker than
  the flagship model.
- Web search grounding adds real latency (the model pauses to search) — leave
  it off unless the question needs current facts.

## Supported providers

Bring your own API key for whichever provider you want to use:

| Provider | Models used | Web search | Get a key |
|---|---|---|---|
| Claude (Anthropic) | Sonnet 5, Opus 4.8, Haiku 4.5 | Toggle-able | https://console.anthropic.com/settings/keys |
| OpenAI | GPT-5.1, GPT-5 mini, GPT-4.1 | Toggle-able | https://platform.openai.com/api-keys |
| Gemini (Google) | Gemini 2.5 Pro / Flash | Toggle-able | https://aistudio.google.com/app/apikey |
| Perplexity | Agent API presets (Medium, Fast) | Always on | https://www.perplexity.ai/settings/api |
| Llama (via Groq) | Llama 3.3 70B, Llama 3.1 8B | Not available | https://console.groq.com/keys |
| Meta (Muse) | Muse Wonder 1.0, Muse Spark 1.3 | Not available | https://dev.meta.ai/docs/authentication |

Model IDs can drift as providers ship new versions — the model field in the UI
is editable free text, with the current defaults offered as quick-pick chips.

For the "toggle-able" providers, web search uses each provider's own
provider-executed search tool (Anthropic's and OpenAI's web search tools,
Google's Search grounding) — the search runs as part of the model's own
response generation, not a separate round trip we manage. Perplexity's models
are search-grounded by default, so there's nothing to toggle.

## Running locally

```bash
npm install
npm run dev
```

Open http://localhost:3000.

No `.env` file or server-side API key is required — each person using the app
enters their own key directly in the browser, and it's remembered in
`localStorage` per provider so you don't have to repaste it every time.

## Privacy / API keys

Your API key is stored only in your browser's `localStorage` (scoped per
provider) and is sent only to this app's own `/api/debate` endpoint on each
debate request, which forwards it directly to the provider you chose over
HTTPS. It is never written to disk, logged, or persisted anywhere server-side.

## Project structure

- `src/lib/types.ts` — shared types (requests, streamed events, report shape).
- `src/lib/personas.ts` — the built-in persona catalog + custom persona helper.
- `src/lib/provider-catalog.ts` — client-safe provider/model metadata.
- `src/lib/providers.ts` — server-only factory that builds an AI SDK model
  instance from a provider id + API key.
- `src/lib/debate.ts` — the debate orchestration engine: turn order, prompts,
  streaming, and the final structured report generation.
- `src/app/api/debate/route.ts` — the streaming API route (NDJSON over HTTP).
- `src/app/api/report/route.ts` — generates a report from a partial transcript
  (used by "Stop & report").
- `src/components/` — the UI: setup form, persona picker, live debate stage,
  probability meter, and the final report card.
