"use client";

import { useMemo, useState } from "react";
import { ExternalLink, Globe } from "lucide-react";
import { PROVIDER_CATALOG, getProviderMeta } from "@/lib/provider-catalog";
import { BUILTIN_PERSONAS } from "@/lib/personas";
import { PersonaPicker } from "@/components/PersonaPicker";
import type { DebateRequest, Persona, ProviderId } from "@/lib/types";

const DEFAULT_PERSONA_IDS = ["optimist", "skeptic", "data-analyst", "pragmatist", "contrarian"];

// Plain localStorage read/writes, not a parameterized-key hook: a hook whose
// internal useState is keyed by a *changing* string (e.g. per-provider) keeps
// the same state slot across renders, so a setter captured before a provider
// switch still points at the old provider's storage key. Reading and writing
// explicitly here avoids that stale-closure trap.
function readStored(key: string, fallback: string): string {
  if (typeof window === "undefined") return fallback;
  return window.localStorage.getItem(key) ?? fallback;
}

interface SetupFormProps {
  onStart: (request: DebateRequest) => void;
}

export function SetupForm({ onStart }: SetupFormProps) {
  const [question, setQuestion] = useState("");
  const [providerId, setProviderId] = useState<ProviderId>(() => readStored("debate-ai:provider", "anthropic") as ProviderId);
  const meta = getProviderMeta(providerId);

  const [apiKey, setApiKeyState] = useState(() => readStored(`debate-ai:apiKey:${providerId}`, ""));
  const [modelId, setModelIdState] = useState(() => readStored(`debate-ai:modelId:${providerId}`, meta.models[0].id));
  const [rounds, setRounds] = useState(2);
  const [enableWebSearch, setEnableWebSearch] = useState(false);
  const [personas, setPersonas] = useState<Persona[]>(() =>
    BUILTIN_PERSONAS.filter((p) => DEFAULT_PERSONA_IDS.includes(p.id))
  );

  const canStart = useMemo(
    () => question.trim().length >= 10 && apiKey.trim().length > 0 && modelId.trim().length > 0 && personas.length >= 2,
    [question, apiKey, modelId, personas]
  );

  function setApiKey(next: string) {
    setApiKeyState(next);
    window.localStorage.setItem(`debate-ai:apiKey:${providerId}`, next);
  }

  function setModelId(next: string) {
    setModelIdState(next);
    window.localStorage.setItem(`debate-ai:modelId:${providerId}`, next);
  }

  function handleProviderChange(next: ProviderId) {
    window.localStorage.setItem("debate-ai:provider", next);
    setProviderId(next);
    const nextMeta = getProviderMeta(next);
    setModelIdState(readStored(`debate-ai:modelId:${next}`, nextMeta.models[0].id));
    setApiKeyState(readStored(`debate-ai:apiKey:${next}`, ""));
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!canStart) return;
    onStart({
      question: question.trim(),
      provider: providerId,
      apiKey: apiKey.trim(),
      modelId: modelId.trim(),
      personas,
      rounds,
      enableWebSearch: meta.webSearch === "native" ? enableWebSearch : false,
    });
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      <div className="space-y-2">
        <label htmlFor="question" className="text-sm font-medium text-[var(--text-primary)]">
          Question to debate
        </label>
        <textarea
          id="question"
          value={question}
          onChange={(e) => setQuestion(e.target.value)}
          placeholder="e.g. Will the Fed cut interest rates at its next meeting?"
          rows={3}
          maxLength={500}
          className="w-full resize-none rounded-lg border border-[var(--border-hairline)] bg-[var(--surface-1)] px-3 py-2.5 text-sm text-[var(--text-primary)] outline-none focus:border-[var(--accent-fill)]"
        />
        <p className="text-xs text-[var(--text-muted)]">
          Frame it as a yes/no forecasting question for the clearest probability estimate.
        </p>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div className="space-y-2">
          <label className="text-sm font-medium text-[var(--text-primary)]">Model provider</label>
          <select
            value={providerId}
            onChange={(e) => handleProviderChange(e.target.value as ProviderId)}
            className="w-full rounded-lg border border-[var(--border-hairline)] bg-[var(--surface-1)] px-3 py-2.5 text-sm text-[var(--text-primary)] outline-none focus:border-[var(--accent-fill)]"
          >
            {PROVIDER_CATALOG.map((p) => (
              <option key={p.id} value={p.id}>
                {p.label}
              </option>
            ))}
          </select>
        </div>

        <div className="space-y-2">
          <label className="text-sm font-medium text-[var(--text-primary)]">Model</label>
          <input
            value={modelId}
            onChange={(e) => setModelId(e.target.value)}
            placeholder="Model ID"
            className="w-full rounded-lg border border-[var(--border-hairline)] bg-[var(--surface-1)] px-3 py-2.5 text-sm text-[var(--text-primary)] outline-none focus:border-[var(--accent-fill)]"
          />
          <div className="flex flex-wrap gap-1.5">
            {meta.models.map((m) => (
              <button
                key={m.id}
                type="button"
                onClick={() => setModelId(m.id)}
                className={`rounded-full border px-2.5 py-1 text-xs ${
                  modelId === m.id
                    ? "border-[var(--accent-fill)] text-[var(--accent-fill)]"
                    : "border-[var(--border-hairline)] text-[var(--text-secondary)]"
                }`}
              >
                {m.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="space-y-2">
        <label htmlFor="apiKey" className="text-sm font-medium text-[var(--text-primary)]">
          {meta.label} API key
        </label>
        <input
          id="apiKey"
          type="password"
          value={apiKey}
          onChange={(e) => setApiKey(e.target.value)}
          placeholder={meta.keyPlaceholder}
          autoComplete="off"
          className="w-full rounded-lg border border-[var(--border-hairline)] bg-[var(--surface-1)] px-3 py-2.5 font-mono text-sm text-[var(--text-primary)] outline-none focus:border-[var(--accent-fill)]"
        />
        <p className="flex items-center gap-1.5 text-xs text-[var(--text-muted)]">
          Stored only in your browser and sent only to this app&apos;s server to call {meta.label}. Never logged or stored
          server-side.
          <a
            href={meta.helpUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-0.5 text-[var(--accent-fill)]"
          >
            Get a key <ExternalLink size={11} />
          </a>
        </p>
      </div>

      <div className="space-y-2">
        <label className="text-sm font-medium text-[var(--text-primary)]">Rounds</label>
        <div className="flex gap-1.5">
          {[1, 2, 3].map((r) => (
            <button
              key={r}
              type="button"
              onClick={() => setRounds(r)}
              className={`rounded-md border px-3 py-1.5 text-sm ${
                rounds === r
                  ? "border-[var(--accent-fill)] bg-[var(--accent-track)]/20 text-[var(--accent-fill)]"
                  : "border-[var(--border-hairline)] text-[var(--text-secondary)]"
              }`}
            >
              {r}
            </button>
          ))}
        </div>
      </div>

      <div className="space-y-2">
        <label className="text-sm font-medium text-[var(--text-primary)]">Research</label>
        {meta.webSearch === "native" && (
          <button
            type="button"
            onClick={() => setEnableWebSearch((v) => !v)}
            aria-pressed={enableWebSearch}
            className={`flex w-full items-start gap-2.5 rounded-lg border px-3 py-2.5 text-left ${
              enableWebSearch ? "border-[var(--accent-fill)] bg-[var(--accent-track)]/20" : "border-[var(--border-hairline)]"
            }`}
          >
            <Globe size={16} className="mt-0.5 shrink-0 text-[var(--accent-fill)]" />
            <span>
              <span className="block text-sm font-medium text-[var(--text-primary)]">Ground arguments in live web search</span>
              <span className="block text-xs text-[var(--text-muted)]">
                Personas can search the web for current facts instead of relying on memory alone. Slower and uses more tokens.
              </span>
            </span>
          </button>
        )}
        {meta.webSearch === "always" && (
          <div className="flex items-start gap-2.5 rounded-lg border border-[var(--border-hairline)] px-3 py-2.5">
            <Globe size={16} className="mt-0.5 shrink-0 text-[var(--text-muted)]" />
            <span className="text-xs text-[var(--text-muted)]">{meta.label} models search the web automatically for every answer — no toggle needed.</span>
          </div>
        )}
        {meta.webSearch === "none" && (
          <div className="flex items-start gap-2.5 rounded-lg border border-[var(--border-hairline)] px-3 py-2.5 opacity-60">
            <Globe size={16} className="mt-0.5 shrink-0 text-[var(--text-muted)]" />
            <span className="text-xs text-[var(--text-muted)]">Live web search isn&apos;t available for {meta.label} yet.</span>
          </div>
        )}
      </div>

      <PersonaPicker selected={personas} onChange={setPersonas} />

      <p className="text-center text-xs text-[var(--text-muted)]">
        ~{personas.length * rounds + 1} model calls this run ({personas.length} personas &times; {rounds} round
        {rounds > 1 ? "s" : ""}, plus 1 for the report). More personas and rounds use more tokens and take longer —
        and personas in a round run concurrently, so a big panel can also trip a provider&apos;s rate limit.
      </p>

      <button
        type="submit"
        disabled={!canStart}
        className="w-full rounded-lg bg-[var(--accent-fill)] px-4 py-3 text-sm font-semibold text-white transition-opacity disabled:opacity-40"
      >
        Start debate
      </button>
    </form>
  );
}
