import { brierScore, type HistoryEntry } from "./history";

export interface CalibrationBucket {
  range: string;
  count: number;
  avgPredicted: number | null;
  hitRate: number | null;
}

const RANGES: [number, number][] = [
  [0, 20],
  [20, 40],
  [40, 60],
  [60, 80],
  [80, 100],
];

export function calibrationBuckets(entries: HistoryEntry[]): CalibrationBucket[] {
  return RANGES.map(([lo, hi]) => {
    const inBucket = entries.filter(
      (e) => e.resolution && e.probability >= lo && (e.probability < hi || (hi === 100 && e.probability <= 100))
    );
    if (inBucket.length === 0) {
      return { range: `${lo}–${hi}`, count: 0, avgPredicted: null, hitRate: null };
    }
    const avgPredicted = inBucket.reduce((a, e) => a + e.probability, 0) / inBucket.length;
    const hits = inBucket.filter((e) => e.resolution!.outcome === "yes").length;
    return { range: `${lo}–${hi}`, count: inBucket.length, avgPredicted, hitRate: (hits / inBucket.length) * 100 };
  });
}

export interface BrierPoint {
  id: string;
  brier: number;
}

export function recentBriers(entries: HistoryEntry[], limit = 10): BrierPoint[] {
  return entries
    .filter((e) => e.resolution)
    .sort((a, b) => (a.resolution!.resolvedAt < b.resolution!.resolvedAt ? 1 : -1))
    .slice(0, limit)
    .reverse()
    .map((e) => ({ id: e.id, brier: brierScore(e.probability, e.resolution!.outcome) }));
}

const RESOLVE_AFTER_MS = 14 * 24 * 60 * 60 * 1000;

export function staleUnresolved(entries: HistoryEntry[], now: number): HistoryEntry[] {
  return entries.filter((e) => !e.resolution && now - new Date(e.savedAt).getTime() > RESOLVE_AFTER_MS);
}
