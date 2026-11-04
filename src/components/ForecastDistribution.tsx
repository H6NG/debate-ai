"use client";

import type { PersonaTurn } from "@/components/DebateStage";
import type { Persona } from "@/lib/types";
import { extractProbability } from "@/lib/probability";

const BUCKETS = 10;

interface ForecastDistributionProps {
  personas: Persona[];
  turnsByPersona: Record<string, PersonaTurn[]>;
  moderatorProbability: number;
}

export function ForecastDistribution({ personas, turnsByPersona, moderatorProbability }: ForecastDistributionProps) {
  const estimates = personas
    .map((persona) => {
      const turns = turnsByPersona[persona.id] ?? [];
      const last = [...turns].reverse()[0];
      const value = last ? extractProbability(last.text) : null;
      return value === null ? null : { persona, value };
    })
    .filter((e): e is { persona: Persona; value: number } => e !== null);

  if (estimates.length < 2) return null;

  const values = estimates.map((e) => e.value);
  const mean = values.reduce((a, b) => a + b, 0) / values.length;
  const sorted = [...values].sort((a, b) => a - b);
  const median = sorted.length % 2 === 1 ? sorted[(sorted.length - 1) / 2] : (sorted[sorted.length / 2 - 1] + sorted[sorted.length / 2]) / 2;
  const spread = Math.max(...values) - Math.min(...values);
  const trimmed =
    sorted.length >= 3
      ? sorted.slice(1, -1).reduce((a, b) => a + b, 0) / (sorted.length - 2)
      : mean;

  const counts = new Array<number>(BUCKETS).fill(0);
  for (const v of values) {
    counts[Math.min(BUCKETS - 1, Math.floor(v / (100 / BUCKETS)))] += 1;
  }
  const peak = Math.max(...counts);

  return (
    <section className="space-y-3">
      <div>
        <h3 className="text-sm font-medium text-[var(--text-primary)]">Panel distribution</h3>
        <p className="text-xs text-[var(--text-muted)]">
          Where each persona landed, against the moderator&apos;s final estimate.
        </p>
      </div>

      <div className="rounded-lg border border-[var(--border-hairline)] px-3.5 py-3">
        <div className="flex h-28 items-end gap-1.5" role="img" aria-label={`Panel estimates spread from ${Math.min(...values)} to ${Math.max(...values)} percent`}>
          {counts.map((count, i) => (
            <div key={i} className="flex min-w-0 flex-1 flex-col items-center gap-1" title={`${i * 10}-${i * 10 + 10}%: ${count}`}>
              <div
                className="w-full rounded-sm bg-[var(--accent-track)]"
                style={{ height: `${peak === 0 ? 0 : Math.max(count > 0 ? 8 : 2, (count / peak) * 100)}%` }}
              />
              <span className="text-[10px] text-[var(--text-muted)]">{i * 10}</span>
            </div>
          ))}
        </div>
        <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-[var(--text-secondary)]">
          <span>
            Panel mean <span className="font-semibold text-[var(--text-primary)]">{Math.round(mean)}%</span>
          </span>
          <span>
            Median <span className="font-semibold text-[var(--text-primary)]">{Math.round(median)}%</span>
          </span>
          <span>
            Trimmed mean <span className="font-semibold text-[var(--text-primary)]">{Math.round(trimmed)}%</span>
          </span>
          <span>
            Spread <span className="font-semibold text-[var(--text-primary)]">{spread} pts</span>
          </span>
          <span>
            Moderator <span className="font-semibold text-[var(--text-primary)]">{Math.round(moderatorProbability)}%</span>
          </span>
        </div>
      </div>
    </section>
  );
}
