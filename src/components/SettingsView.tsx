"use client";

import { useState } from "react";
import { ArrowLeft, Check, ExternalLink, Eye, EyeOff, Trash2 } from "lucide-react";
import { PROVIDER_CATALOG } from "@/lib/provider-catalog";
import {
  clearFirebaseConfig,
  loadFirebaseConfig,
  saveFirebaseConfig,
} from "@/lib/firebase-sync";
import type { ProviderId } from "@/lib/types";

function readStored(key: string, fallback: string): string {
  if (typeof window === "undefined") return fallback;
  return window.localStorage.getItem(key) ?? fallback;
}

function writeStored(key: string, value: string): void {
  window.localStorage.setItem(key, value);
}

interface SettingsViewProps {
  onBack: () => void;
}

export function SettingsView({ onBack }: SettingsViewProps) {
  const [keys, setKeys] = useState<Record<string, string>>(() =>
    Object.fromEntries(PROVIDER_CATALOG.map((p) => [p.id, readStored(`debate-ai:apiKey:${p.id}`, "")]))
  );
  const [models, setModels] = useState<Record<string, string>>(() =>
    Object.fromEntries(PROVIDER_CATALOG.map((p) => [p.id, readStored(`debate-ai:modelId:${p.id}`, "")]))
  );
  const [defaultProvider, setDefaultProvider] = useState<ProviderId>(
    () => readStored("debate-ai:provider", "anthropic") as ProviderId
  );
  const [shown, setShown] = useState<Record<string, boolean>>({});
  const [firebaseText, setFirebaseText] = useState(() => {
    if (typeof window === "undefined") return "";
    const cfg = loadFirebaseConfig();
    return cfg ? JSON.stringify(cfg) : "";
  });
  const [firebaseError, setFirebaseError] = useState<string | null>(null);
  const [savedFlash, setSavedFlash] = useState<string | null>(null);

  function flash(id: string): void {
    setSavedFlash(id);
    window.setTimeout(() => {
      setSavedFlash((cur) => (cur === id ? null : cur));
    }, 1500);
  }

  function updateKey(id: string, value: string): void {
    setKeys((prev) => ({ ...prev, [id]: value }));
    writeStored(`debate-ai:apiKey:${id}`, value);
    flash(`key-${id}`);
  }

  function updateModel(id: string, value: string): void {
    setModels((prev) => ({ ...prev, [id]: value }));
    writeStored(`debate-ai:modelId:${id}`, value);
    flash(`model-${id}`);
  }

  function updateDefaultProvider(id: ProviderId): void {
    setDefaultProvider(id);
    writeStored("debate-ai:provider", id);
    flash("provider");
  }

  function updateFirebaseText(value: string): void {
    setFirebaseText(value);
    if (value.trim() === "") {
      clearFirebaseConfig();
      setFirebaseError(null);
      flash("firebase");
      return;
    }
    try {
      saveFirebaseConfig(JSON.parse(value) as Parameters<typeof saveFirebaseConfig>[0]);
      setFirebaseError(null);
      flash("firebase");
    } catch {
      setFirebaseError("Not valid JSON — previous config kept.");
    }
  }

  function clearAllKeys(): void {
    if (!window.confirm("Remove all saved API keys from this browser?")) return;
    for (const p of PROVIDER_CATALOG) {
      window.localStorage.removeItem(`debate-ai:apiKey:${p.id}`);
    }
    setKeys(Object.fromEntries(PROVIDER_CATALOG.map((p) => [p.id, ""])));
  }

  return (
    <div className="mx-auto w-full max-w-3xl px-4 py-10">
      <header className="mb-8 flex items-center gap-3">
        <button
          type="button"
          onClick={onBack}
          className="flex items-center gap-1.5 rounded-md border border-[var(--border-hairline)] px-2.5 py-1.5 text-sm text-[var(--text-secondary)] hover:bg-[var(--surface-1)]"
        >
          <ArrowLeft size={14} />
          Back
        </button>
        <div>
          <h1 className="text-xl font-semibold text-[var(--text-primary)]">Settings</h1>
          <p className="text-sm text-[var(--text-secondary)]">
            Keys stay in this browser only — never logged or stored server-side.
          </p>
        </div>
      </header>

      <div className="space-y-8">
        <section className="space-y-3">
          <div className="flex items-baseline justify-between">
            <h2 className="text-sm font-medium text-[var(--text-primary)]">Default provider</h2>
            {savedFlash === "provider" && (
              <span className="flex items-center gap-1 text-xs text-[var(--status-good-text)]">
                <Check size={12} /> Saved
              </span>
            )}
          </div>
          <select
            value={defaultProvider}
            onChange={(e) => updateDefaultProvider(e.target.value as ProviderId)}
            aria-label="Default provider"
            className="w-full rounded-lg border border-[var(--border-hairline)] bg-[var(--surface-1)] px-3 py-2 text-sm text-[var(--text-primary)] outline-none focus:border-[var(--accent-fill)]"
          >
            {PROVIDER_CATALOG.map((p) => (
              <option key={p.id} value={p.id}>
                {p.label}
              </option>
            ))}
          </select>
        </section>

        <section className="space-y-4">
          <h2 className="text-sm font-medium text-[var(--text-primary)]">Provider API keys</h2>
          {PROVIDER_CATALOG.map((p) => (
            <div key={p.id} className="space-y-2 rounded-lg border border-[var(--border-hairline)] p-3.5">
              <div className="flex items-center justify-between gap-2">
                <label
                  htmlFor={`key-${p.id}`}
                  className="text-sm font-medium text-[var(--text-primary)]"
                >
                  {p.label}
                </label>
                <span className="flex items-center gap-2">
                  {savedFlash === `key-${p.id}` || savedFlash === `model-${p.id}` ? (
                    <span className="flex items-center gap-1 text-xs text-[var(--status-good-text)]">
                      <Check size={12} /> Saved
                    </span>
                  ) : null}
                  <a
                    href={p.helpUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="flex items-center gap-1 text-xs text-[var(--accent-fill)] hover:underline"
                  >
                    Get a key <ExternalLink size={12} />
                  </a>
                </span>
              </div>
              <div className="flex gap-2">
                <input
                  id={`key-${p.id}`}
                  type={shown[p.id] ? "text" : "password"}
                  value={keys[p.id] ?? ""}
                  onChange={(e) => updateKey(p.id, e.target.value)}
                  placeholder={p.keyPlaceholder}
                  autoComplete="off"
                  spellCheck={false}
                  className="min-w-0 flex-1 rounded-lg border border-[var(--border-hairline)] bg-[var(--surface-1)] px-3 py-2 text-sm text-[var(--text-primary)] outline-none focus:border-[var(--accent-fill)]"
                />
                <button
                  type="button"
                  onClick={() => setShown((prev) => ({ ...prev, [p.id]: !prev[p.id] }))}
                  aria-label={shown[p.id] ? `Hide ${p.label} key` : `Show ${p.label} key`}
                  className="shrink-0 rounded-lg border border-[var(--border-hairline)] px-2.5 text-[var(--text-secondary)] hover:bg-[var(--surface-1)]"
                >
                  {shown[p.id] ? <EyeOff size={14} /> : <Eye size={14} />}
                </button>
              </div>
              <input
                value={models[p.id] ?? ""}
                onChange={(e) => updateModel(p.id, e.target.value)}
                placeholder={`Default model (e.g. ${p.models[0]?.id ?? ""})`}
                aria-label={`${p.label} default model`}
                list={`models-${p.id}`}
                spellCheck={false}
                className="w-full rounded-lg border border-[var(--border-hairline)] bg-[var(--surface-1)] px-3 py-2 text-sm text-[var(--text-primary)] outline-none focus:border-[var(--accent-fill)]"
              />
              <datalist id={`models-${p.id}`}>
                {p.models.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.label}
                  </option>
                ))}
              </datalist>
            </div>
          ))}
          <button
            type="button"
            onClick={clearAllKeys}
            className="flex items-center gap-1.5 rounded-md border border-[var(--status-critical)]/40 px-2.5 py-1.5 text-xs text-[var(--status-critical)] hover:bg-[var(--status-critical)]/10"
          >
            <Trash2 size={13} />
            Remove all saved API keys
          </button>
        </section>

        <section className="space-y-2">
          <div className="flex items-baseline justify-between">
            <h2 className="text-sm font-medium text-[var(--text-primary)]">
              Firebase sync <span className="font-normal text-[var(--text-muted)]">(optional)</span>
            </h2>
            {savedFlash === "firebase" && (
              <span className="flex items-center gap-1 text-xs text-[var(--status-good-text)]">
                <Check size={12} /> Saved
              </span>
            )}
          </div>
          <textarea
            value={firebaseText}
            onChange={(e) => updateFirebaseText(e.target.value)}
            placeholder='Paste your firebaseConfig JSON, e.g. {"apiKey": "AIza…", …}'
            aria-label="Firebase config JSON"
            rows={3}
            spellCheck={false}
            className="w-full rounded-lg border border-[var(--border-hairline)] bg-[var(--surface-1)] px-3 py-2 font-mono text-xs text-[var(--text-primary)] outline-none focus:border-[var(--accent-fill)]"
          />
          {firebaseError ? (
            <p className="text-xs text-[var(--status-critical)]" role="alert">
              {firebaseError}
            </p>
          ) : (
            <p className="text-xs text-[var(--text-muted)]">
              Your own Firebase project — history syncs to your Firestore. Clear the field to
              disconnect.
            </p>
          )}
        </section>
      </div>
    </div>
  );
}
