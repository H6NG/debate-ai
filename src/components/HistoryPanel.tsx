"use client";

import type { ChangeEvent, RefObject } from "react";
import { Trash2 } from "lucide-react";
import { CalibrationChart } from "@/components/CalibrationChart";
import { brierScore, formatTokens, type HistoryEntry } from "@/lib/history";

interface HistoryPanelProps {
  entries: HistoryEntry[];
  allEntries: HistoryEntry[];
  resolvedCount: number;
  meanBrier: number | null;
  staleIds: Set<string>;
  query: string;
  onQueryChange: (query: string) => void;
  error: string | null;
  onExport: () => void;
  fileInputRef: RefObject<HTMLInputElement | null>;
  onImportClick: () => void;
  onImportFile: (event: ChangeEvent<HTMLInputElement>) => void;
  onOpen: (entry: HistoryEntry) => void;
  onDelete: (entry: HistoryEntry) => void;
}

export function HistoryPanel({
  entries,
  allEntries,
  resolvedCount,
  meanBrier,
  staleIds,
  query,
  onQueryChange,
  error,
  onExport,
  fileInputRef,
  onImportClick,
  onImportFile,
  onOpen,
  onDelete,
}: HistoryPanelProps) {
  return (
    <section className="flex min-h-0 flex-1 flex-col space-y-3">
      <div className="flex items-baseline justify-between gap-2">
        <h2 className="text-sm font-medium text-[var(--text-primary)]">Past reports</h2>
        {resolvedCount > 0 && meanBrier !== null && (
          <span className="text-right text-xs text-[var(--text-muted)]">
            {resolvedCount} resolved · Brier {meanBrier.toFixed(2)}
          </span>
        )}
      </div>

      {allEntries.length === 0 ? (
        <p className="text-xs text-[var(--text-muted)]">
          No past reports yet — finished debates save here automatically, no account or sync needed.
        </p>
      ) : (
        <>
          {staleIds.size > 0 && (
            <p className="text-xs text-[var(--text-secondary)]">
              {staleIds.size} forecast{staleIds.size === 1 ? " is" : "s are"} older than 2 weeks and
              still unresolved — open {staleIds.size === 1 ? "it" : "them"} to record the outcome.
            </p>
          )}
          <div className="flex gap-2">
            <input
              value={query}
              onChange={(e) => onQueryChange(e.target.value)}
              placeholder="Search past reports…"
              aria-label="Search past reports"
              className="min-w-0 flex-1 rounded-lg border border-[var(--border-hairline)] bg-[var(--surface-1)] px-3 py-2 text-sm text-[var(--text-primary)] outline-none focus:border-[var(--accent-fill)]"
            />
            <button
              type="button"
              onClick={onExport}
              className="shrink-0 rounded-lg border border-[var(--border-hairline)] px-3 py-2 text-xs font-medium text-[var(--text-secondary)] hover:bg-[var(--surface-1)]"
            >
              Export
            </button>
            <button
              type="button"
              onClick={onImportClick}
              className="shrink-0 rounded-lg border border-[var(--border-hairline)] px-3 py-2 text-xs font-medium text-[var(--text-secondary)] hover:bg-[var(--surface-1)]"
            >
              Import
            </button>
            <input
              ref={fileInputRef}
              type="file"
              accept="application/json,.json"
              onChange={onImportFile}
              className="hidden"
              aria-hidden
              tabIndex={-1}
            />
          </div>
          {error && (
            <p className="text-xs text-[var(--status-critical)]" role="alert">
              {error}
            </p>
          )}
          <ul className="nice-scroll min-h-0 flex-1 space-y-2 overflow-y-auto pr-1">
            {entries.map((entry) => (
              <li
                key={entry.id}
                className="flex items-center gap-2 rounded-lg border border-[var(--border-hairline)] px-3 py-2.5"
              >
                <button type="button" onClick={() => onOpen(entry)} className="min-w-0 flex-1 text-left">
                  <span className="block truncate text-sm font-medium text-[var(--text-primary)]">
                    {entry.question}
                  </span>
                  <span className="block text-xs text-[var(--text-muted)]">
                    {new Date(entry.savedAt).toLocaleDateString()} · {Math.round(entry.probability)}% ·{" "}
                    {entry.provider}
                    {entry.usage && entry.usage.inputTokens + entry.usage.outputTokens > 0
                      ? ` · ${formatTokens(entry.usage.inputTokens + entry.usage.outputTokens)} tok`
                      : ""}
                    {entry.resolution
                      ? ` · Resolved ${entry.resolution.outcome === "yes" ? "Yes" : "No"} · Brier ${brierScore(entry.probability, entry.resolution.outcome).toFixed(2)}`
                      : ""}
                  </span>
                </button>
                {staleIds.has(entry.id) && (
                  <span className="shrink-0 rounded-sm border border-[var(--accent-fill)] px-1.5 py-0.5 text-[10px] font-medium text-[var(--accent-fill)]">
                    Due
                  </span>
                )}
                <button
                  type="button"
                  onClick={() => onDelete(entry)}
                  aria-label={`Delete report: ${entry.question}`}
                  className="shrink-0 rounded-md p-1.5 text-[var(--text-muted)] hover:bg-[var(--surface-1)] hover:text-[var(--text-primary)]"
                >
                  <Trash2 size={14} />
                </button>
              </li>
            ))}
          </ul>
          {entries.length === 0 && (
            <p className="text-xs text-[var(--text-muted)]">No past reports match that search.</p>
          )}
          <CalibrationChart entries={allEntries} />
        </>
      )}
    </section>
  );
}
