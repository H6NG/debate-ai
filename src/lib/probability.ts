// Personas state their estimate as a percentage each turn, but a turn can
// mention many other percentages (market share, base rates, residual doubt)
// that are NOT the persona's estimate. Extraction is therefore picky:
//  1. Percentages parse as decimals — "99.9%" is 99.9, never 9.
//  2. A percentage explicitly framed as the speaker's own estimate
//     ("I put it at 72%", "I'm holding at 60%", "takes me to 61%") wins;
//     the last such mention is used, so in-turn revisions count.
//  3. Otherwise the last percentage in the turn is used, matching how
//     personas restate their estimate at the end of a turn.

interface Mention {
  value: number;
  index: number;
  end: number;
}

const PERCENT_RE = /(\d{1,3}(?:\.\d+)?|\.\d+)\s*%/g;

// Cues in the same sentence before the percentage that mark it as the
// speaker's own estimate rather than a fact being cited.
const SPEAKER_CUES: RegExp[] = [
  /\bi\s+(?:now\s+)?(?:put|place|set|peg|rate|estimate)\b/i,
  /\bi'd\s+(?:say|put|estimate)\b/i,
  /\bi(?:'m| am)\s+(?:now\s+)?(?:holding|staying|remaining|sitting|at)\b/i,
  /\bmy\s+(?:current\s+)?(?:estimate|probability|number|view)\b/i,
];

// Cues that must sit immediately before the percentage (modulo markdown).
const IMMEDIATE_CUES =
  /(?:holding|staying|remaining|moving|trimming|dropping|raising|lowering|revising|updating|landing|land|takes\s+me|brings\s+me|puts\s+me)\s+(?:up\s+|down\s+)?(?:to|at)?$|(?:estimate|probability|likelihood|chance)\s*(?:is|at|of|:)?$/i;

// A percentage framed as the chance of being wrong / of the opposite
// outcome is the complement of the estimate, never the estimate itself.
const COMPLEMENT_CUE = /\b(?:chance|risk|probability|likelihood)\s+of\s+(?:being\s+)?(?:wrong|false|failure|failing|error|a\s+no)\b/i;

function sentenceStart(text: string, index: number): number {
  const before = text.slice(0, index);
  let start = 0;
  for (const sep of ["\n", ". ", "! ", "? ", "; "]) {
    const idx = before.lastIndexOf(sep);
    if (idx !== -1) start = Math.max(start, idx + (sep === "\n" ? 1 : sep.length));
  }
  return start;
}

function isEstimateMention(text: string, mention: Mention, prevMentionEnd: number): boolean {
  // A cue only governs the first percentage after it: the search window
  // starts at the previous percentage, so "I put it at 99.9% — a 0.1%
  // chance of error" does not lend its "I put" to the 0.1%.
  const start = Math.max(sentenceStart(text, mention.index), prevMentionEnd);
  const before = text.slice(start, mention.index);
  if (COMPLEMENT_CUE.test(before)) return false;
  const tail = before.slice(-64).replace(/[\s*_]+$/, "");
  if (SPEAKER_CUES.some((cue) => cue.test(before.slice(-64)))) return true;
  if (IMMEDIATE_CUES.test(tail)) return true;
  const after = text.slice(mention.end, mention.end + 32);
  // "98% probability on yes", "99.9% — yes"
  if (/^\s*\*{0,2}\s*(?:probability|likelihood)\s+(?:on\s+)?yes\b/i.test(after)) return true;
  if (/^\s*\*{0,2}\s*(?:[-—–,:]\s*)?yes\b/i.test(after)) return true;
  // "40% feels right"
  if (/^\s*\*{0,2}\s*(?:feels|seems)\s+right\b/i.test(after)) return true;
  return false;
}

export function extractProbability(text: string): number | null {
  const mentions: Mention[] = [];
  for (const match of text.matchAll(PERCENT_RE)) {
    const parsed = parseFloat(match[1]);
    if (Number.isNaN(parsed)) continue;
    // One decimal place is all a persona ever means; it also keeps
    // 99.99 from surviving as a distinct value.
    const value = Math.max(0, Math.min(100, Math.round(parsed * 10) / 10));
    mentions.push({ value, index: match.index, end: match.index + match[0].length });
  }
  if (mentions.length === 0) return null;

  const estimates = mentions.filter((m, i) => isEstimateMention(text, m, i === 0 ? 0 : mentions[i - 1].end));
  if (estimates.length > 0) return estimates[estimates.length - 1].value;
  return mentions[mentions.length - 1].value;
}

export interface RoundSpread {
  round: number;
  estimates: number[];
  // Max minus min estimate that round; null when fewer than 2 personas
  // stated one, so a lone estimate never reads as "full agreement".
  spread: number | null;
}

interface TurnLike {
  round: number;
  text: string;
}

// Panel spread per round — the convergence signal: a debate that narrows
// this number is adding information; one that doesn't is just spending tokens.
export function roundSpreads(
  turnsByPersona: Record<string, readonly TurnLike[]>,
  totalRounds: number,
): RoundSpread[] {
  return Array.from({ length: totalRounds }, (_, i) => {
    const round = i + 1;
    const estimates = Object.values(turnsByPersona)
      .map((turns) => {
        const turn = [...turns].reverse().find((t) => t.round === round);
        return turn ? extractProbability(turn.text) : null;
      })
      .filter((v): v is number => v !== null);
    return {
      round,
      estimates,
      spread:
        estimates.length >= 2
          ? Math.round((Math.max(...estimates) - Math.min(...estimates)) * 10) / 10
          : null,
    };
  });
}

// First-to-last spread change in points: positive means the panel converged.
export function spreadChange(spreads: RoundSpread[]): number | null {
  const valid = spreads.filter((s) => s.spread !== null);
  if (valid.length < 2) return null;
  return Math.round((valid[0].spread! - valid[valid.length - 1].spread!) * 10) / 10;
}
