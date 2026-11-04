"use client";

import type { Persona } from "@/lib/types";

export interface PersonaTurn {
  round: number;
  text: string;
}

interface DebateStageProps {
  personas: Persona[];
  turnsByPersona: Record<string, PersonaTurn[]>;
  activePersonaIds: Set<string>;
  currentRound: number;
  totalRounds: number;
  generatingReport: boolean;
}

export function DebateStage({
  personas,
  turnsByPersona,
  activePersonaIds,
  currentRound,
  totalRounds,
  generatingReport,
}: DebateStageProps) {
  const gridCols = personas.length <= 2 ? "sm:grid-cols-2" : personas.length <= 4 ? "sm:grid-cols-2" : "sm:grid-cols-3";

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <span className="text-xs font-medium uppercase tracking-wide text-[var(--text-muted)]">
          {generatingReport ? "Debate complete" : `Round ${currentRound} of ${totalRounds}`}
        </span>
        {generatingReport && (
          <span className="flex items-center gap-1.5 text-xs text-[var(--text-secondary)]">
            <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-[var(--accent-fill)]" />
            Generating final report&hellip;
          </span>
        )}
      </div>

      <div className={`grid grid-cols-1 gap-3 ${gridCols}`}>
        {personas.map((persona) => {
          const turns = turnsByPersona[persona.id] ?? [];
          const isActive = activePersonaIds.has(persona.id);
          return (
            <div
              key={persona.id}
              className={`rounded-lg border p-3.5 transition-colors ${
                isActive ? "border-[var(--accent-fill)]" : "border-[var(--border-hairline)]"
              }`}
            >
              <div className="mb-2 flex items-center gap-2">
                <span
                  className={`h-2 w-2 shrink-0 rounded-full ${
                    isActive ? "animate-pulse bg-[var(--accent-fill)]" : "bg-[var(--gridline)]"
                  }`}
                />
                <div>
                  <div className="text-sm font-semibold text-[var(--text-primary)]">{persona.name}</div>
                  <div className="text-[11px] text-[var(--text-muted)]">{persona.tagline}</div>
                </div>
              </div>

              <div className="space-y-2.5">
                {turns.length === 0 && (
                  <p className="text-xs text-[var(--text-muted)]">Waiting to speak&hellip;</p>
                )}
                {turns.map((turn, i) => (
                  <div key={i}>
                    {totalRounds > 1 && (
                      <div className="mb-0.5 text-[10px] font-medium uppercase tracking-wide text-[var(--text-muted)]">
                        Round {turn.round}
                      </div>
                    )}
                    <p className="text-sm leading-relaxed text-[var(--text-secondary)]">
                      {turn.text}
                      {isActive && i === turns.length - 1 && (
                        <span className="ml-0.5 inline-block h-3.5 w-1.5 translate-y-0.5 animate-pulse bg-[var(--accent-fill)]" />
                      )}
                    </p>
                  </div>
                ))}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
