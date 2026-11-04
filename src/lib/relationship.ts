import { extractProbability } from "./probability";

export interface TurnLike {
  round: number;
  text: string;
}

export interface Challenge {
  round: number;
  fromId: string;
  toId: string;
}

export type RelationKind = "challenge" | "agree" | "disagree" | "influence";

export interface Relation {
  fromId: string;
  toId: string;
  kind: RelationKind;
  // Challenge edges come from actual rebuttals in the debate; the rest are
  // estimated from stated probabilities.
  factual: boolean;
  detail: string;
}

const AGREE_GAP = 10;
const DISAGREE_GAP = 30;
const INFLUENCE_SHIFT = 5;

function lastProbability(turns: TurnLike[] | undefined, round: number): number | null {
  if (!turns) return null;
  const turn = [...turns].reverse().find((t) => t.round === round);
  return turn ? extractProbability(turn.text) : null;
}

/**
 * Relationships between panel members for one round.
 * - challenge: persona A directly rebutted persona B (recorded live).
 * - agree/disagree: both stated estimates within 10 / at least 30 points apart.
 * - influence: A moved toward B's previous-round estimate by 5+ points.
 */
export function relationsForRound(
  personaIds: string[],
  turnsByPersona: Record<string, TurnLike[]>,
  challenges: Challenge[],
  round: number
): Relation[] {
  const relations: Relation[] = [];

  for (const c of challenges) {
    if (c.round !== round) continue;
    if (!personaIds.includes(c.fromId) || !personaIds.includes(c.toId)) continue;
    relations.push({
      fromId: c.fromId,
      toId: c.toId,
      kind: "challenge",
      factual: true,
      detail: "Directly rebutted this round",
    });
  }

  const probs = new Map<string, number>();
  for (const id of personaIds) {
    const p = lastProbability(turnsByPersona[id], round);
    if (p !== null) probs.set(id, p);
  }

  const ids = [...probs.keys()];
  for (let a = 0; a < ids.length; a++) {
    for (let b = a + 1; b < ids.length; b++) {
      const gap = Math.abs(probs.get(ids[a])! - probs.get(ids[b])!);
      if (gap <= AGREE_GAP) {
        relations.push({
          fromId: ids[a],
          toId: ids[b],
          kind: "agree",
          factual: false,
          detail: `Both near ${probs.get(ids[a])}%`,
        });
      } else if (gap >= DISAGREE_GAP) {
        relations.push({
          fromId: ids[a],
          toId: ids[b],
          kind: "disagree",
          factual: false,
          detail: `${probs.get(ids[a])}% vs ${probs.get(ids[b])}%`,
        });
      }
    }
  }

  if (round > 1) {
    for (const id of ids) {
      const prev = lastProbability(turnsByPersona[id], round - 1);
      const cur = probs.get(id)!;
      if (prev === null || cur === prev) continue;
      for (const other of ids) {
        if (other === id) continue;
        const prevOther = lastProbability(turnsByPersona[other], round - 1);
        if (prevOther === null) continue;
        if (Math.abs(cur - prevOther) + INFLUENCE_SHIFT < Math.abs(prev - prevOther)) {
          relations.push({
            fromId: other,
            toId: id,
            kind: "influence",
            factual: false,
            detail: `Moved ${prev}% → ${cur}%, toward ${prevOther}%`,
          });
        }
      }
    }
  }

  return relations;
}
