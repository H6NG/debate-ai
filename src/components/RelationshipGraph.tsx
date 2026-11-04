"use client";

import { useState } from "react";
import type { PersonaTurn } from "@/components/DebateStage";
import type { Persona } from "@/lib/types";
import { relationsForRound, type Challenge, type RelationKind } from "@/lib/relationship";

function initials(name: string): string {
  const words = name.replace(/^the\s+/i, "").split(/\s+/).filter(Boolean);
  return words
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase() ?? "")
    .join("");
}

const KIND_META: Record<RelationKind, { name: string; color: string; dashed?: boolean; directed: boolean }> = {
  challenge: { name: "Challenged", color: "var(--accent-fill)", directed: true },
  agree: { name: "Agreeing", color: "var(--status-good-text)", directed: false },
  disagree: { name: "Disagreeing", color: "var(--status-critical)", directed: false },
  influence: { name: "Influencing", color: "var(--text-muted)", dashed: true, directed: true },
};

const WIDTH = 640;
const HEIGHT = 440;
const CX = WIDTH / 2;
const CY = WIDTH / 2 - 90;
const RX = 250;
const RY = 150;

interface RelationshipGraphProps {
  personas: Persona[];
  turnsByPersona: Record<string, PersonaTurn[]>;
  challenges: Challenge[];
  totalRounds: number;
}

export function RelationshipGraph({ personas, turnsByPersona, challenges, totalRounds }: RelationshipGraphProps) {
  const maxRound = Math.max(
    totalRounds,
    ...Object.values(turnsByPersona).flatMap((turns) => turns.map((t) => t.round)),
    1
  );
  const rounds = Array.from({ length: maxRound }, (_, i) => i + 1);

  const latestWithData = [...rounds]
    .reverse()
    .find((r) => relationsForRound(personas.map((p) => p.id), turnsByPersona, challenges, r).length > 0);

  const [pinnedRound, setPinnedRound] = useState<number | null>(null);
  const round = pinnedRound ?? latestWithData ?? maxRound;
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const ids = personas.map((p) => p.id);
  const nameById = new Map(personas.map((p) => [p.id, p.name]));
  const relations = relationsForRound(ids, turnsByPersona, challenges, round);
  const selected = personas.find((p) => p.id === selectedId) ?? null;
  const selectedRelations = selected ? relations.filter((r) => r.fromId === selected.id || r.toId === selected.id) : [];

  const pos = new Map<string, { x: number; y: number }>();
  personas.forEach((persona, i) => {
    const angle = (2 * Math.PI * i) / Math.max(personas.length, 1) - Math.PI / 2;
    pos.set(persona.id, { x: CX + RX * Math.cos(angle), y: CY + RY * Math.sin(angle) });
  });

  const pairGroups = new Map<string, typeof relations>();
  for (const r of relations) {
    const key = [r.fromId, r.toId].sort().join("|");
    const group = pairGroups.get(key) ?? [];
    group.push(r);
    pairGroups.set(key, group);
  }

  function edgePath(fromId: string, toId: string, offset: number): string {
    const a = pos.get(fromId)!;
    const b = pos.get(toId)!;
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const len = Math.hypot(dx, dy) || 1;
    const mx = (a.x + b.x) / 2 + (-dy / len) * offset;
    const my = (a.y + b.y) / 2 + (dx / len) * offset;
    return `M ${a.x} ${a.y} Q ${mx} ${my} ${b.x} ${b.y}`;
  }

  return (
    <section className="space-y-3">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-sm font-medium text-[var(--text-primary)]">Relationship graph</h3>
          <p className="text-xs text-[var(--text-muted)]">
            Who challenges, agrees with, or moves whom — round by round.
          </p>
        </div>
        <div className="flex items-center gap-1.5">
          <button
            type="button"
            onClick={() => setPinnedRound(Math.max(1, round - 1))}
            disabled={round <= 1}
            aria-label="Previous round"
            className="rounded-md border border-[var(--border-hairline)] px-2 py-1 text-xs text-[var(--text-secondary)] disabled:opacity-40"
          >
            &lsaquo;
          </button>
          <span className="min-w-20 text-center text-xs text-[var(--text-secondary)]">
            Round {round} of {maxRound}
          </span>
          <button
            type="button"
            onClick={() => setPinnedRound(Math.min(maxRound, round + 1))}
            disabled={round >= maxRound}
            aria-label="Next round"
            className="rounded-md border border-[var(--border-hairline)] px-2 py-1 text-xs text-[var(--text-secondary)] disabled:opacity-40"
          >
            &rsaquo;
          </button>
        </div>
      </div>

      <div className="overflow-x-auto rounded-lg border border-[var(--border-hairline)] px-2 py-1">
        <svg
          viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
          className="mx-auto block w-full min-w-130"
          role="img"
          aria-label={`Persona relationship graph for round ${round}`}
        >
          <defs>
            {(Object.keys(KIND_META) as RelationKind[]).map((kind) =>
              KIND_META[kind].directed ? (
                <marker
                  key={kind}
                  id={`arrow-${kind}`}
                  viewBox="0 0 10 10"
                  refX="9"
                  refY="5"
                  markerWidth="7"
                  markerHeight="7"
                  orient="auto-start-reverse"
                >
                  <path d="M 0 1 L 9 5 L 0 9 z" fill="context-stroke" />
                </marker>
              ) : null
            )}
          </defs>

          {[...pairGroups.values()].flatMap((group) =>
            group.map((rel, k) => {
              const offset = (k - (group.length - 1) / 2) * 18;
              const meta = KIND_META[rel.kind];
              return (
                <path
                  key={`${rel.fromId}-${rel.toId}-${rel.kind}`}
                  d={edgePath(rel.fromId, rel.toId, offset)}
                  fill="none"
                  stroke={meta.color}
                  strokeWidth={2}
                  strokeDasharray={meta.dashed ? "5 4" : undefined}
                  markerEnd={meta.directed ? `url(#arrow-${rel.kind})` : undefined}
                >
                  <title>{`${nameById.get(rel.fromId)} ${meta.name.toLowerCase()} ${nameById.get(rel.toId)} — ${rel.detail}`}</title>
                </path>
              );
            })
          )}

          {personas.map((persona) => {
            const p = pos.get(persona.id)!;
            const isSelected = persona.id === selectedId;
            const anchor = p.x < CX - 40 ? "end" : p.x > CX + 40 ? "start" : "middle";
            const labelX = p.x < CX - 40 ? p.x - 20 : p.x > CX + 40 ? p.x + 20 : p.x;
            const labelY = p.x < CX - 40 || p.x > CX + 40 ? p.y + 4 : p.y > CY ? p.y + 30 : p.y - 18;
            return (
              <g
                key={persona.id}
                onClick={() => setSelectedId(isSelected ? null : persona.id)}
                className="cursor-pointer"
              >
                <title>{persona.name}</title>
                <circle
                  cx={p.x}
                  cy={p.y}
                  r={isSelected ? 22 : 18}
                  fill={isSelected ? "var(--accent-fill)" : "var(--surface-1)"}
                  stroke="var(--accent-fill)"
                  strokeWidth={isSelected ? 3 : 1.5}
                />
                <text
                  x={p.x}
                  y={p.y + 4}
                  textAnchor="middle"
                  fontSize={11}
                  fontWeight={700}
                  fill={isSelected ? "#fff" : "var(--text-secondary)"}
                >
                  {initials(persona.name)}
                </text>
                <text x={labelX} y={labelY} textAnchor={anchor} fontSize={11} fill="var(--text-secondary)">
                  {persona.name}
                </text>
              </g>
            );
          })}
        </svg>
      </div>

      <div className="flex flex-wrap gap-3 text-xs text-[var(--text-muted)]">
        {(Object.keys(KIND_META) as RelationKind[]).map((kind) => (
          <span key={kind} className="flex items-center gap-1.5">
            <span
              className="inline-block h-0 w-5 border-t-2"
              style={{
                borderColor: KIND_META[kind].color,
                borderTopStyle: KIND_META[kind].dashed ? "dashed" : "solid",
              }}
            />
            {KIND_META[kind].name}
          </span>
        ))}
      </div>

      {relations.length === 0 && (
        <p className="text-xs text-[var(--text-muted)]">
          No relationships readable for this round yet — check back once estimates are stated.
        </p>
      )}

      {selected && selectedRelations.length > 0 && (
        <div className="rounded-lg border border-[var(--border-hairline)] px-3.5 py-2.5">
          <div className="mb-1 text-xs font-medium uppercase tracking-wide text-[var(--text-muted)]">
            {selected.name} — round {round}
          </div>
          <ul className="space-y-1">
            {selectedRelations.map((rel, i) => {
              const otherId = rel.fromId === selected.id ? rel.toId : rel.fromId;
              const verb =
                rel.kind === "challenge"
                  ? rel.fromId === selected.id
                    ? "challenged"
                    : "was challenged by"
                  : rel.kind === "influence"
                    ? rel.fromId === selected.id
                      ? "moved"
                      : "was moved by"
                    : rel.kind === "agree"
                      ? "agrees with"
                      : "disagrees with";
              return (
                <li key={i} className="text-sm text-[var(--text-secondary)]">
                  {verb} <span className="font-medium text-[var(--text-primary)]">{nameById.get(otherId)}</span>{" "}
                  <span className="text-[var(--text-muted)]">({KIND_META[rel.kind].name.toLowerCase()}, {rel.detail})</span>
                </li>
              );
            })}
          </ul>
        </div>
      )}

      <p className="text-xs text-[var(--text-muted)]">
        Challenges come from actual rebuttals in the debate; agreement and influence are estimated from stated
        probabilities.
      </p>
    </section>
  );
}
