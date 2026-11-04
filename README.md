# Debate AI

Ask a forecasting question, watch a panel of AI personas debate it live, and get
back a report with the strongest pros/cons and a calibrated probability estimate.

## How it works

1. You type a question (framed as a yes/no forecast works best, e.g. "Will X
   happen by Y?").
2. You pick a model provider and paste in your own API key, and pick a model.
3. You pick as many of the 20 built-in personas as you want (minimum 2), add
   your own custom ones, let the AI pick the panel from the built-ins, or draft
   a tailored panel of domain experts recruited from the question itself (AI
   pick and drafting each cost one extra model call). The setup form shows a live
   estimate of how many model calls a run will make, since bigger panels and
   more rounds cost more and can trip a provider's rate limit (personas in a
   round run concurrently).
4. Optionally turn on live web search grounding, for providers that support it
   (see below) — personas can search the web for current facts instead of
   relying on memory alone. Either way, personas must ground claims in
   checkable specifics (numbers, dates, named sources) and separate fact from
   judgment, and the moderator favors sourced arguments over sentiment.
5. Each round, all personas answer concurrently (not one-at-a-time) and stream
   live to the screen — only the next round's prompt waits on the full
   transcript, so rounds are as fast as the slowest single response rather
   than the sum of every persona's response. Optionally enable direct
   rebuttals: one extra round where each persona challenges another head-on
   (about one panel's worth of extra model calls, off unless you opt in). An
   autonomous research round can follow: the panel names its biggest knowledge
   gaps, researches them (best with web search on), and debates the findings.
6. You can hit "Stop & report" at any point mid-debate — it cancels further
   generation and produces a report from whatever arguments were made so far.
7. A moderator agent reads the full transcript and produces a final report:
   a summary, the strongest pros and cons, a probability estimate, a confidence
   level, and the key uncertainties that could move the estimate.
8. If a persona's call fails, it retries automatically — the debate continues
   with the rest of the panel and the report is built from whoever responded.
9. The Meeting tab seats the panel around a table with you moderating at the
   center — tap anyone to see who they are and what they argued — with a
   relationship graph below showing who challenges, agrees with, or moves whom,
   round by round. The debate tab tracks each persona's stated probability
   round by round, and the report tab adds an idea graph linking every pro, con,
   and open question to the question.
10. Past reports are kept in the browser (with copy-as-markdown and `.md`
    download), and you can ask the panel a follow-up from the report tab to run
    one more round and regenerate the report.
11. The report tab shows the panel's full probability distribution (mean,
    median, trimmed mean, spread) next to the moderator's final estimate, plus
    a checklist of checkable claims with their sources. When the outcome
    becomes known, resolve any past forecast as Yes/No — the app scores it
    with a Brier score and keeps a running track record with a calibration
    chart.
12. Cost controls: every run reports exact token usage (stored per report),
    you can route the moderator to a stronger model while the panel runs cheap,
    personas run at most 5 at a time to avoid rate limits, and reports can be
    shared as links or exported/imported as JSON. Forecasts older than 2 weeks
    nudge you to resolve them.

## Speed tips

- Fewer rounds and fewer personas are the biggest levers (each round is one
  concurrent batch of calls, not sequential, but more rounds still means more
  batches).
- The "Quick debate" preset (1 round, 3 personas, fast model) is the cheapest
  way to scout a question before a full run.
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
| Groq | GPT-OSS 120B / 20B (search-capable), Llama 3.3 70B, Llama 3.1 8B | Toggle-able (GPT-OSS models only) | https://console.groq.com/keys |
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

Optional cloud sync works the same way: paste your own Firebase project's
`firebaseConfig` into the Cloud sync section and history syncs to your own
Firestore (anonymous sign-in, your quota, your rules). No Firebase keys are
integrated into the app — every user brings their own.

## Project structure

- `src/lib/types.ts` — shared types (requests, streamed events, report shape).
- `src/lib/personas.ts` — the built-in persona catalog + custom persona helper.
- `src/lib/history.ts` — browser-local report history + markdown export.
- `src/lib/provider-catalog.ts` — client-safe provider/model metadata.
- `src/lib/providers.ts` — server-only factory that builds an AI SDK model
  instance from a provider id + API key.
- `src/lib/debate.ts` — the debate orchestration engine: turn order, prompts,
  streaming, and the final structured report generation.
- `src/app/api/debate/route.ts` — the streaming API route (NDJSON over HTTP).
- `src/app/api/report/route.ts` — generates a report from a partial transcript
  (used by "Stop & report").
- `src/app/api/followup/route.ts` — runs one extra round from a user follow-up,
  then regenerates the report.
- `src/app/api/draft-panel/route.ts` — recruits a tailored panel of domain
  experts from the debate question.
- `src/app/api/pick-personas/route.ts` — picks the best built-in personas for
  the debate question.
- `src/components/` — the UI: setup form, persona picker, live debate stage,
  meeting-room view, relationship graph, probability tracker, idea graph,
  and the final report card.
