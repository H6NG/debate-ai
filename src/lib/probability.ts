// Personas state their estimate as a percentage each turn; the last one
// mentioned in a turn is taken as that turn's estimate.
export function extractProbability(text: string): number | null {
  const matches = text.match(/\d{1,3}\s*%/g);
  if (!matches || matches.length === 0) return null;
  const num = parseInt(matches[matches.length - 1].replace(/\D/g, ""), 10);
  if (Number.isNaN(num)) return null;
  return Math.max(0, Math.min(100, num));
}
