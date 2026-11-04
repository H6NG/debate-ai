"use client";

import { calibrationBuckets, recentBriers } from "@/lib/calibration";
import type { HistoryEntry } from "@/lib/history";

export function CalibrationChart({ entries }: { entries: HistoryEntry[] }) {
  const buckets = calibrationBuckets(entries);
  const briers = recentBriers(entries);
  const resolved = entries.filter((e) => e.resolution).length;
  if (resolved === 0) return null;

  return (
    <section className="space-y-2">
      <h3 className="text-sm font-medium text-[var(--text-primary)]">Calibration</h3>
      <div className="overflow-x-auto rounded-lg border border-[var(--border-hairline)]">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-[var(--border-hairline)]">
              <th className="px-3 py-2 text-left text-xs font-medium text-[var(--text-muted)]">Predicted</th>
              <th className="px-3 py-2 text-right text-xs font-medium text-[var(--text-muted)]">n</th>
              <th className="px-3 py-2 text-right text-xs font-medium text-[var(--text-muted)]">Avg forecast</th>
              <th className="px-3 py-2 text-right text-xs font-medium text-[var(--text-muted)]">Hit rate</th>
            </tr>
          </thead>
          <tbody>
            {buckets.map((b) => (
              <tr key={b.range} className="border-b border-[var(--border-hairline)] last:border-0">
                <td className="px-3 py-2 text-[var(--text-primary)]">{b.range}%</td>
                <td className="px-3 py-2 text-right tabular-nums text-[var(--text-secondary)]">{b.count}</td>
                <td className="px-3 py-2 text-right tabular-nums text-[var(--text-secondary)]">
                  {b.avgPredicted === null ? "—" : `${Math.round(b.avgPredicted)}%`}
                </td>
                <td className="px-3 py-2 text-right tabular-nums text-[var(--text-secondary)]">
                  {b.hitRate === null ? "—" : `${Math.round(b.hitRate)}%`}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {briers.length > 1 && (
        <div className="rounded-lg border border-[var(--border-hairline)] px-3.5 py-3">
          <p className="mb-2 text-xs text-[var(--text-muted)]">Recent Brier scores, oldest → newest (lower is better)</p>
          <div className="flex h-12 items-end gap-1">
            {briers.map((p) => (
              <div
                key={p.id}
                className="min-w-0 flex-1 rounded-sm bg-[var(--accent-track)]"
                style={{ height: `${Math.max(6, Math.min(100, p.brier * 400))}%` }}
                title={`Brier ${p.brier.toFixed(2)}`}
              />
            ))}
          </div>
        </div>
      )}
    </section>
  );
}
