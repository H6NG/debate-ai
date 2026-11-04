"use client";

import type { PersonaTurn } from "@/components/DebateStage";
import type { Persona } from "@/lib/types";
import { extractProbability } from "@/lib/probability";

interface ProbabilityTrackerProps {
  personas: Persona[];
  turnsByPersona: Record<string, PersonaTurn[]>;
  totalRounds: number;
}

export function ProbabilityTracker({ personas, turnsByPersona, totalRounds }: ProbabilityTrackerProps) {
  const rounds = Array.from({ length: totalRounds }, (_, i) => i + 1);

  const rows = personas.map((persona) => {
    const turns = turnsByPersona[persona.id] ?? [];
    return {
      persona,
      byRound: rounds.map((round) => {
        const turn = [...turns].reverse().find((t) => t.round === round);
        return turn ? extractProbability(turn.text) : null;
      }),
    };
  });

  if (!rows.some((row) => row.byRound.some((v) => v !== null))) return null;

  return (
    <section className="space-y-2">
      <h3 className="text-sm font-medium text-[var(--text-primary)]">Probability tracker</h3>
      <div className="overflow-x-auto rounded-lg border border-[var(--border-hairline)]">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-[var(--border-hairline)]">
              <th className="px-3 py-2 text-left text-xs font-medium text-[var(--text-muted)]">Persona</th>
              {rounds.map((round) => (
                <th
                  key={round}
                  className="px-3 py-2 text-right text-xs font-medium text-[var(--text-muted)]"
                >
                  R{round}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map(({ persona, byRound }) => (
              <tr key={persona.id} className="border-b border-[var(--border-hairline)] last:border-0">
                <td className="max-w-40 truncate px-3 py-2 text-[var(--text-primary)]">{persona.name}</td>
                {byRound.map((value, i) => (
                  <td key={i} className="px-3 py-2 text-right tabular-nums">
                    {value !== null ? (
                      <span className="text-[var(--text-secondary)]">{value}%</span>
                    ) : (
                      <span className="text-[var(--gridline)]">&mdash;</span>
                    )}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="text-xs text-[var(--text-muted)]">Auto-detected from each turn&apos;s stated estimate.</p>
    </section>
  );
}
