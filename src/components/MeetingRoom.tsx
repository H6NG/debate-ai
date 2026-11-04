"use client";

import { useState } from "react";
import type { PersonaTurn } from "@/components/DebateStage";
import type { Persona } from "@/lib/types";

function initials(name: string): string {
  const words = name.replace(/^the\s+/i, "").split(/\s+/).filter(Boolean);
  return words
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase() ?? "")
    .join("");
}

interface MeetingRoomProps {
  personas: Persona[];
  turnsByPersona: Record<string, PersonaTurn[]>;
  activePersonaIds: Set<string>;
  totalRounds: number;
  errorsByPersona: Record<string, string>;
}

export function MeetingRoom({
  personas,
  turnsByPersona,
  activePersonaIds,
  totalRounds,
  errorsByPersona,
}: MeetingRoomProps) {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const selected = personas.find((p) => p.id === selectedId) ?? null;
  const selectedTurns = selected ? turnsByPersona[selected.id] ?? [] : [];
  const selectedError = selected ? errorsByPersona[selected.id] : undefined;

  const n = personas.length;
  const radius = n > 10 ? 45 : 41;
  const nodeSize = n > 12 ? 44 : n > 6 ? 54 : 62;

  return (
    <div className="space-y-4">
      <div className="relative mx-auto aspect-square w-full max-w-md" role="group" aria-label="Meeting table">
        <div className="absolute inset-[20%] rounded-full border border-[var(--border-hairline)] bg-[var(--surface-1)]" />

        <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 text-center">
          <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-[var(--accent-fill)] text-sm font-semibold text-white">
            You
          </div>
          <div className="mt-1 text-[11px] text-[var(--text-muted)]">Moderator</div>
        </div>

        {personas.map((persona, i) => {
          const angle = (2 * Math.PI * i) / Math.max(n, 1) - Math.PI / 2;
          const x = 50 + radius * Math.cos(angle);
          const y = 50 + radius * Math.sin(angle);
          const isActive = activePersonaIds.has(persona.id);
          const isSelected = persona.id === selectedId;
          return (
            <button
              key={persona.id}
              type="button"
              onClick={() => setSelectedId(isSelected ? null : persona.id)}
              aria-pressed={isSelected}
              aria-label={`${persona.name}${isActive ? ", speaking now" : ""}`}
              className="absolute flex -translate-x-1/2 -translate-y-1/2 flex-col items-center gap-1"
              style={{ left: `${x}%`, top: `${y}%` }}
            >
              <span
                className={`flex items-center justify-center rounded-full text-xs font-semibold transition-colors ${
                  isSelected
                    ? "bg-[var(--accent-fill)] text-white"
                    : "bg-[var(--surface-1)] text-[var(--text-secondary)]"
                } ${
                  isActive
                    ? "motion-safe:animate-pulse ring-2 ring-[var(--accent-fill)] ring-offset-2 ring-offset-[var(--background)]"
                    : "border border-[var(--border-hairline)]"
                }`}
                style={{ width: nodeSize, height: nodeSize }}
              >
                {initials(persona.name)}
              </span>
              <span className="max-w-20 truncate text-[11px] text-[var(--text-secondary)]">
                {persona.name}
              </span>
            </button>
          );
        })}
      </div>

      {selected ? (
        <div className="space-y-3 rounded-lg border border-[var(--accent-fill)] bg-[var(--accent-track)]/10 px-3.5 py-3">
          <div>
            <div className="text-sm font-semibold text-[var(--text-primary)]">{selected.name}</div>
            <div className="text-xs text-[var(--text-muted)]">{selected.tagline}</div>
          </div>
          <p className="text-sm leading-relaxed text-[var(--text-secondary)]">{selected.lens}</p>
          <div className="space-y-2 border-t border-[var(--border-hairline)] pt-2.5">
            <div className="text-xs font-medium uppercase tracking-wide text-[var(--text-muted)]">
              What they argued
            </div>
            {selectedTurns.length === 0 && !selectedError && (
              <p className="text-sm text-[var(--text-muted)]">Hasn&apos;t spoken yet.</p>
            )}
            {selectedTurns.map((turn, i) => (
              <div key={i}>
                {totalRounds > 1 && (
                  <div className="mb-0.5 text-[10px] font-medium uppercase tracking-wide text-[var(--text-muted)]">
                    Round {turn.round}
                  </div>
                )}
                <p className="text-sm leading-relaxed text-[var(--text-secondary)]">
                  {turn.text.length === 0 ? (
                    <span className="text-[var(--text-muted)]">No response captured.</span>
                  ) : (
                    turn.text
                  )}
                </p>
              </div>
            ))}
            {selectedError && (
              <p className="text-xs text-[var(--status-critical)]" role="alert">
                Couldn&apos;t respond this round: {selectedError}
              </p>
            )}
          </div>
        </div>
      ) : (
        <p className="text-center text-xs text-[var(--text-muted)]">
          Tap anyone around the table to see who they are and what they argued.
        </p>
      )}
    </div>
  );
}
