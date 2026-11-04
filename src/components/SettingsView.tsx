"use client";

import { useState } from "react";
import { ArrowLeft, Check, ExternalLink, Eye, EyeOff, Trash2, X } from "lucide-react";
import { PROVIDER_CATALOG } from "@/lib/provider-catalog";
import { BUILTIN_PERSONAS } from "@/lib/personas";
import { CloudSync } from "@/components/CloudSync";
import pkg from "../../package.json";
import type { HistoryEntry } from "@/lib/history";
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
  history: HistoryEntry[];
  onHistoryChange: (entries: HistoryEntry[]) => void;
}

export function SettingsView({ onBack, history, onHistoryChange }: SettingsViewProps) {
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
  const [moderatorModelId, setModeratorModelId] = useState(() =>
    readStored("debate-ai:moderatorModelId", "")
  );
  const [runtimeLabel] = useState(() => {
    if (typeof window === "undefined") return "Browser";
    const desktop = (
      window as unknown as { desktop?: { isDesktop?: boolean; platform?: string } }
    ).desktop;
    if (desktop?.isDesktop) {
      return `Desktop app (${desktop.platform === "darwin" ? "macOS" : (desktop.platform ?? "desktop")})`;
    }
    return "Browser (localhost)";
  });
  const [savedFlash, setSavedFlash] = useState<string | null>(null);
  const [tests, setTests] = useState<Record<string, { status: "testing" | "ok" | "fail"; message: string }>>(
    {}
  );

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

  function updateModeratorModelId(value: string): void {
    setModeratorModelId(value);
    writeStored("debate-ai:moderatorModelId", value);
    flash("moderator");
  }

  async function testKey(id: string): Promise<void> {
    const apiKey = (keys[id] ?? "").trim();
    if (apiKey === "") {
      setTests((prev) => ({ ...prev, [id]: { status: "fail", message: "Enter a key first." } }));
      return;
    }
    setTests((prev) => ({ ...prev, [id]: { status: "testing", message: "Testing…" } }));
    try {
      const res = await fetch("/api/test-key", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          provider: id,
          apiKey,
          modelId: (models[id] ?? "").trim() || undefined,
        }),
      });
      const data = (await res.json().catch(() => null)) as {
        ok?: boolean;
        latencyMs?: number;
        error?: string;
      } | null;
      if (res.ok && data?.ok) {
        setTests((prev) => ({
          ...prev,
          [id]: {
            status: "ok",
            message: `Key works${typeof data.latencyMs === "number" ? ` (${data.latencyMs} ms)` : ""}.`,
          },
        }));
      } else {
        const raw = data?.error ?? `Request failed (${res.status}).`;
        setTests((prev) => ({
          ...prev,
          [id]: { status: "fail", message: raw.length > 160 ? `${raw.slice(0, 160)}…` : raw },
        }));
      }
    } catch {
      setTests((prev) => ({ ...prev, [id]: { status: "fail", message: "Network error." } }));
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
    <div className="w-full">
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

        <section className="space-y-2">
          <div className="flex items-baseline justify-between">
            <h2 className="text-sm font-medium text-[var(--text-primary)]">
              Moderator model <span className="font-normal text-[var(--text-muted)]">(optional)</span>
            </h2>
            {savedFlash === "moderator" && (
              <span className="flex items-center gap-1 text-xs text-[var(--status-good-text)]">
                <Check size={12} /> Saved
              </span>
            )}
          </div>
          <input
            value={moderatorModelId}
            onChange={(e) => updateModeratorModelId(e.target.value)}
            placeholder="Defaults to the panel model"
            aria-label="Moderator model"
            spellCheck={false}
            className="w-full rounded-lg border border-[var(--border-hairline)] bg-[var(--surface-1)] px-3 py-2 text-sm text-[var(--text-primary)] outline-none focus:border-[var(--accent-fill)]"
          />
          <p className="text-xs text-[var(--text-muted)]">
            Routes the final report (and gap detection) to a stronger model while the panel runs cheap.
          </p>
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
                <button
                  type="button"
                  onClick={() => testKey(p.id)}
                  disabled={tests[p.id]?.status === "testing"}
                  className="shrink-0 rounded-lg border border-[var(--border-hairline)] px-3 text-xs font-medium text-[var(--text-secondary)] hover:bg-[var(--surface-1)] disabled:opacity-50"
                >
                  {tests[p.id]?.status === "testing" ? "Testing…" : "Test"}
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
              {tests[p.id] && tests[p.id].status !== "testing" && (
                <p
                  role="status"
                  className={`flex items-center gap-1 text-xs ${
                    tests[p.id].status === "ok"
                      ? "text-[var(--status-good-text)]"
                      : "text-[var(--status-critical)]"
                  }`}
                >
                  {tests[p.id].status === "ok" ? <Check size={12} /> : <X size={12} />}
                  {tests[p.id].message}
                </p>
              )}
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
          <h2 className="text-sm font-medium text-[var(--text-primary)]">
            Cloud sync <span className="font-normal text-[var(--text-muted)]">(optional)</span>
          </h2>
          <CloudSync history={history} onHistoryChange={onHistoryChange} />
        </section>

        <section className="space-y-2">
          <h2 className="text-sm font-medium text-[var(--text-primary)]">About</h2>
          <dl className="divide-y divide-[var(--border-hairline)] rounded-lg border border-[var(--border-hairline)]">
            {[
              ["Version", pkg.version],
              ["Runtime", runtimeLabel],
              ["Next.js", pkg.dependencies.next],
              ["Bundler", "Turbopack"],
              ["Cache Components", "Enabled"],
              ["Personas", `${BUILTIN_PERSONAS.length} built-in`],
              ["Providers", `${PROVIDER_CATALOG.length}`],
            ].map(([label, value]) => (
              <div key={label} className="flex items-center justify-between px-3.5 py-2.5 text-sm">
                <dt className="text-[var(--text-secondary)]">{label}</dt>
                <dd className="font-medium text-[var(--text-primary)]">{value}</dd>
              </div>
            ))}
          </dl>
          <p className="text-xs text-[var(--text-muted)]">
            The diagnostics that used to float in the corner during development.
          </p>
        </section>
      </div>
    </div>
  );
}
