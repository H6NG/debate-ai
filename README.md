<p align="center">
  <img src="public/logo.svg" alt="Debate AI logo" width="132" />
</p>

<h1 align="center">Debate AI</h1>

<p align="center">
  <strong>Ask the future. Argue about it.</strong><br />
  Ask a forecasting question, watch a panel of AI personas debate it live, and get
  back a report with the strongest pros/cons and a calibrated probability estimate.
</p>

<p align="center">
  <a href="https://github.com/H6NG/debate-ai/releases"><img src="https://img.shields.io/badge/version-1.1.0-2a78d6" alt="Version 1.1.0" /></a>
  <img src="https://img.shields.io/badge/Next.js-16-black" alt="Next.js 16" />
  <img src="https://img.shields.io/badge/React-19-61dafb" alt="React 19" />
  <img src="https://img.shields.io/badge/TypeScript-5-3178c6" alt="TypeScript 5" />
  <img src="https://img.shields.io/badge/providers-6-orange" alt="6 providers" />
  <a href="LICENSE"><img src="https://img.shields.io/badge/license-MIT-green" alt="MIT License" /></a>
</p>

<p align="center">
  <a href="#how-it-works">How it works</a> ·
  <a href="#supported-providers">Providers</a> ·
  <a href="#running-locally">Run locally</a> ·
  <a href="#desktop-app-macos">Desktop app</a> ·
  <a href="#privacy--api-keys">Privacy</a>
</p>

---

## How it works

1. Type a question, or tap a sample question to fill the field. Yes/no forecasts
   work best, e.g. "Will X happen by Y?" If you are new, try "Try a sample debate"
   first. It loads a canned question, transcript, and report offline, with no API
   key, so you can look through the Meeting tab, the graphs, and the report before
   you set anything up. The sample never touches your history. On your first run,
   a tutorial and a 2-step guide (1. Question, 2. Panel) walk you through the
   setup. The tutorial can be skipped, and you can replay it later from the
   sidebar. Provider keys and models live in Settings, behind the gear icon in
   the sidebar.
2. Pick a provider, paste in your own API key, and pick a model.
3. Pick as many of the 20 built-in personas as you want (minimum 2). You can add
   custom personas, let the AI pick a panel from the built-ins, or draft domain
   experts matched to your question. AI pick and drafting cost one extra model
   call each. The setup form estimates how many model calls a run will make as
   you build it. Bigger panels and more rounds cost more, and can trip a
   provider's rate limit. Personas in a round answer at the same time.
4. You can turn on live web search for providers that support it (see below).
   Personas then search the web for current facts. Search on or off, personas
   have to back claims with checkable specifics: numbers, dates, named sources.
   They also have to separate fact from judgment, and the moderator weighs
   sourced arguments over sentiment.
5. In each round, every persona answers at the same time and streams live to the
   screen. Only the next round's prompt waits for the full transcript, so a
   round finishes when its slowest response does. You can add direct rebuttals:
   one extra round where each persona challenges another head-on. That costs
   about one panel's worth of extra model calls, and it is off unless you turn
   it on. An autonomous research round can follow. The panel names its biggest
   knowledge gaps, researches them (this works best with web search on), and
   debates what it finds.
6. You can hit "Stop & report" at any point mid-debate. It cancels further
   generation and builds a report from the arguments made so far.
7. A moderator agent reads the full transcript and writes the final report: a
   summary, the strongest pros and cons, a probability estimate, a confidence
   level, and the main uncertainties that could move the estimate.
8. If a persona's call fails, it retries on its own. The debate continues with
   the rest of the panel, and the report is built from whoever responded.
9. The Meeting tab seats the panel around a table with you moderating at the
   center. Tap anyone to see who they are and what they argued. Below the table,
   a relationship graph shows who challenges, agrees with, or moves whom, round
   by round. The debate tab tracks each persona's stated probability round by
   round. The report tab adds an idea graph that links every pro, con, and open
   question back to the question.
10. Past reports stay in the browser. You can copy one as markdown or download
    it as a `.md` file. From the report tab you can also ask the panel a
    follow-up, which runs one more round and regenerates the report.
11. The report tab shows the panel's full probability distribution (mean,
    median, trimmed mean, spread) next to the moderator's final estimate, plus
    a checklist of checkable claims with their sources. When the outcome is
    known, mark a past forecast Yes or No. The app scores it with a Brier score
    and keeps a running track record with a calibration chart.
12. Cost controls. Every run reports exact token usage, stored with its report.
    You can send the moderator to a stronger model while the panel runs on a
    cheap one. Personas run at most 5 at a time to stay under rate limits.
    Reports can be shared as links or exported and imported as JSON. Forecasts
    older than 2 weeks get a nudge to resolve them.

## Speed tips

- Rounds and panel size matter most. Each round is one batch of concurrent
  calls, and more rounds means more batches.
- The "Quick debate" preset (1 round, 3 personas, fast model) is the cheapest
  way to scout a question before a full run.
- Each provider's "fast & cheap" model is noticeably quicker than its flagship.
- Web search adds latency, because the model pauses to search. Leave it off
  unless the question needs current facts.

## Supported providers

Bring your own API key for the provider you want to use:

| Provider | Models used | Web search | Get a key |
|---|---|---|---|
| Claude (Anthropic) | Sonnet 5, Opus 4.8, Haiku 4.5 | Toggle-able | https://console.anthropic.com/settings/keys |
| OpenAI | GPT-5.1, GPT-5 mini, GPT-4.1 | Toggle-able | https://platform.openai.com/api-keys |
| Gemini (Google) | Gemini 2.5 Pro / Flash | Toggle-able | https://aistudio.google.com/app/apikey |
| Perplexity | Agent API presets (Medium, Fast) | Always on | https://www.perplexity.ai/settings/api |
| Groq | GPT-OSS 120B / 20B (search-capable), Llama 3.3 70B, Llama 3.1 8B | Toggle-able (GPT-OSS models only) | https://console.groq.com/keys |
| Meta (Muse) | Muse Wonder 1.0, Muse Spark 1.3 | Not available | https://dev.meta.ai/docs/authentication |

Model IDs can drift as providers ship new versions. The model field in the UI
is free text, with the current defaults offered as quick-pick chips.

For providers marked toggle-able, web search uses the provider's own search
tool: Anthropic's and OpenAI's web search tools, and Google's Search grounding.
The search runs as part of the model's own response generation. Our code does
not manage a separate search round trip. Perplexity models search by default,
so there is nothing to toggle.

## Running locally

```bash
npm install
npm run dev
```

Open http://localhost:3000.

No `.env` file or server-side API key is required. Each person enters their
own key in the browser. The app remembers it in `localStorage`, per provider,
so you do not have to paste it again every time.

## Desktop app (macOS)

The `software` branch wraps the app in Electron. You get a real `Debate AI.app`
with the server built in, so there is no Node to install, no terminal to open,
and no `localhost` to manage.

```bash
git checkout software
npm install
npm run desktop:dist   # builds Debate AI-*.dmg into release/
```

Open the `.dmg`, drag `Debate AI` to Applications, and launch it. On first
launch, right-click → Open. The build is unsigned, so Gatekeeper asks once.
API keys live in the in-app Settings screen (gear icon, top right) and stay on
your machine.

One-line download (once a release is published):

```bash
curl -sSL -o ~/Downloads/DebateAI.dmg https://github.com/H6NG/debate-ai/releases/latest/download/Debate-AI-1.1.0-arm64.dmg && open ~/Downloads/DebateAI.dmg
```

The installed app checks GitHub Releases on launch and offers a download when
a newer version exists. Unsigned builds cannot self-install on macOS. The
Settings screen (gear icon) has a Test button for each provider, so you can
verify an API key with one cheap call before a run.

Dev loop for the desktop shell: run `npm run dev` in one terminal and
`ELECTRON_DEV=1 npm run desktop:dev` in another. `npm run desktop:smoke`
checks the production server path without opening a window.

## Windows (localhost)

No installer yet. Run it in the browser instead:

```bash
npm install
npm run build
npm start
```

Then open http://localhost:3000 in Edge or Chrome. `npm run dev` works too,
for a live-reload dev session. Keys go in the Settings screen, same as on Mac.

## Privacy / API keys

Your API key stays in your browser's `localStorage`, scoped per provider. On
each debate request it goes only to this app's own `/api/debate` endpoint,
which forwards it over HTTPS to the provider you chose. The key is never
written to disk or logged, and nothing is persisted server-side.

Optional cloud sync works the same way. Paste your own Firebase project's
`firebaseConfig` into the Cloud sync section, and your history syncs to your
own Firestore (anonymous sign-in, your quota, your rules). No Firebase keys
are built into the app. Every user brings their own.

## Project structure

- `src/lib/types.ts`: shared types (requests, streamed events, report shape).
- `src/lib/personas.ts`: the built-in persona catalog, plus the custom persona helper.
- `src/lib/history.ts`: report history in the browser, plus markdown export.
- `src/lib/provider-catalog.ts`: provider and model metadata that is safe to ship to the client.
- `src/lib/providers.ts`: server-only factory that builds an AI SDK model instance from a provider id and API key.
- `src/lib/debate.ts`: the debate engine. Turn order, prompts, streaming, and final structured report generation.
- `src/app/api/debate/route.ts`: the streaming API route (NDJSON over HTTP).
- `src/app/api/report/route.ts`: generates a report from a partial transcript (used by "Stop & report").
- `src/app/api/followup/route.ts`: runs one extra round from a user follow-up, then regenerates the report.
- `src/app/api/draft-panel/route.ts`: recruits a tailored panel of domain experts from the debate question.
- `src/app/api/pick-personas/route.ts`: picks the best built-in personas for the debate question.
- `src/components/`: the UI. Setup form, persona picker, live debate stage, meeting-room view, relationship graph, probability tracker, forecast distribution, idea graph, calibration chart, cloud sync, theme toggle, and the final report card.
- `src/lib/probability.ts`, `src/lib/relationship.ts`, `src/lib/calibration.ts`: distribution stats (mean/median/trimmed mean/spread), agent-relation extraction, and Brier scoring with calibration buckets.
- `src/lib/structured.ts`: structured-output parsing with a plain-text JSON fallback for providers without JSON schema support.
- `src/lib/share.ts`, `src/lib/history.ts`: share-link encoding, plus report history in the browser and markdown export.
- `src/lib/firebase-sync.ts`: optional bring-your-own-Firebase sync to your own Firestore project (anonymous sign-in; local history stays the source of truth).
- `src/lib/sample-debate.ts`: the canned offline sample debate (never saved to history).
- `src/lib/ndjson.ts`: streaming NDJSON helpers shared by the API routes.
