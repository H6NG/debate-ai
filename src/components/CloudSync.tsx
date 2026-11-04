"use client";

import { useState } from "react";
import { Cloud, CloudOff } from "lucide-react";
import { replaceHistory, type HistoryEntry } from "@/lib/history";
import {
  disconnectCloud,
  isCloudConfigured,
  loadFirebaseConfig,
  mergeHistories,
  pullHistory,
  saveFirebaseConfig,
  testFirebaseConnection,
  type FirebaseConfig,
} from "@/lib/firebase-sync";

interface CloudSyncProps {
  history: HistoryEntry[];
  onHistoryChange: (entries: HistoryEntry[]) => void;
}

function parseConfig(text: string): FirebaseConfig {
  const parsed: unknown = JSON.parse(text);
  if (typeof parsed !== "object" || parsed === null) throw new Error("Paste the firebaseConfig JSON object.");
  const cfg = parsed as Partial<FirebaseConfig>;
  if (typeof cfg.apiKey !== "string" || typeof cfg.authDomain !== "string" || typeof cfg.projectId !== "string") {
    throw new Error("Config needs at least apiKey, authDomain, and projectId.");
  }
  return cfg as FirebaseConfig;
}

export function CloudSync({ history, onHistoryChange }: CloudSyncProps) {
  const [configText, setConfigText] = useState(() => {
    const stored = loadFirebaseConfig();
    return stored ? JSON.stringify(stored, null, 2) : "";
  });
  const [connected, setConnected] = useState(() => isCloudConfigured());
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [isError, setIsError] = useState(false);

  async function handleConnect() {
    setBusy(true);
    setMessage(null);
    setIsError(false);
    try {
      const config = parseConfig(configText);
      saveFirebaseConfig(config);
      const projectId = await testFirebaseConnection(config);
      const remote = await pullHistory();
      onHistoryChange(replaceHistory(mergeHistories(history, remote)));
      setConnected(true);
      setMessage(`Connected to ${projectId} — pulled ${remote.length} remote report${remote.length === 1 ? "" : "s"}. New reports sync automatically.`);
    } catch (err) {
      setIsError(true);
      setMessage(err instanceof Error ? err.message : "Could not connect.");
    } finally {
      setBusy(false);
    }
  }

  async function handleDisconnect() {
    await disconnectCloud();
    setConnected(false);
    setConfigText("");
    setMessage("Disconnected. Local history is untouched.");
    setIsError(false);
  }

  return (
    <section className="space-y-2">
      <div className="flex items-center gap-2">
        {connected ? <Cloud size={14} className="text-[var(--accent-fill)]" /> : <CloudOff size={14} className="text-[var(--text-muted)]" />}
        <h2 className="text-sm font-medium text-[var(--text-primary)]">
          Cloud sync {connected ? <span className="font-normal text-[var(--text-muted)]">(your own Firebase)</span> : "(optional)"}
        </h2>
      </div>
      {!connected ? (
        <>
          <textarea
            value={configText}
            onChange={(e) => setConfigText(e.target.value)}
            placeholder={'Paste your firebaseConfig JSON, e.g. {"apiKey": "AIza…", "authDomain": "….firebaseapp.com", "projectId": "…"}'}
            rows={3}
            spellCheck={false}
            aria-label="Your Firebase config JSON"
            className="w-full resize-y rounded-lg border border-[var(--border-hairline)] bg-[var(--surface-1)] px-3 py-2.5 font-mono text-xs text-[var(--text-primary)] outline-none focus:border-[var(--accent-fill)]"
          />
          <p className="text-xs text-[var(--text-muted)]">
            From your Firebase console: project settings → your web app → config. Stored only in this browser, used
            only to sync with your own project.
          </p>
          <button
            type="button"
            onClick={handleConnect}
            disabled={busy || configText.trim().length === 0}
            className="rounded-md bg-[var(--accent-fill)] px-3 py-1.5 text-xs font-medium text-white disabled:opacity-40"
          >
            {busy ? "Connecting…" : "Connect & sync"}
          </button>
        </>
      ) : (
        <>
          <p className="text-xs text-[var(--text-muted)]">
            Reports sync to your Firebase project automatically. Local history stays as the offline copy.
          </p>
          <button
            type="button"
            onClick={handleDisconnect}
            className="rounded-md border border-[var(--border-hairline)] px-3 py-1.5 text-xs font-medium text-[var(--text-secondary)] hover:bg-[var(--surface-1)]"
          >
            Disconnect
          </button>
        </>
      )}
      {message && (
        <p className={`text-xs ${isError ? "text-[var(--status-critical)]" : "text-[var(--text-secondary)]"}`} role={isError ? "alert" : "status"}>
          {message}
        </p>
      )}
    </section>
  );
}
