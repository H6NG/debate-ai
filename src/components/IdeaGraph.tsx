"use client";

import { useState } from "react";
import type { DebateReport } from "@/lib/types";

type NodeKind = "pro" | "con" | "uncertainty";

interface GraphNode {
  id: string;
  kind: NodeKind;
  label: string;
  full: string;
}

const KIND_META: Record<NodeKind, { name: string; color: string; dashed?: boolean }> = {
  pro: { name: "Pro", color: "var(--status-good-text)" },
  con: { name: "Con", color: "var(--status-critical)" },
  uncertainty: { name: "Open question", color: "var(--text-muted)", dashed: true },
};

function shortLabel(text: string): string {
  const clean = text.replace(/\s+/g, " ").trim();
  return clean.length > 36 ? `${clean.slice(0, 36).trimEnd()}…` : clean;
}

function buildNodes(report: DebateReport): GraphNode[] {
  return [
    ...report.pros.map((p, i) => ({ id: `pro-${i}`, kind: "pro" as NodeKind, label: shortLabel(p), full: p })),
    ...report.cons.map((c, i) => ({ id: `con-${i}`, kind: "con" as NodeKind, label: shortLabel(c), full: c })),
    ...report.keyUncertainties.map((u, i) => ({
      id: `unc-${i}`,
      kind: "uncertainty" as NodeKind,
      label: shortLabel(u),
      full: u,
    })),
  ];
}

const WIDTH = 640;
const HEIGHT = 440;
const CX = WIDTH / 2;
const CY = HEIGHT / 2;
const RX = 250;
const RY = 160;

export function IdeaGraph({ question, report }: { question: string; report: DebateReport }) {
  const nodes = buildNodes(report);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const selected = nodes.find((n) => n.id === selectedId) ?? null;

  return (
    <section className="space-y-3">
      <div>
        <h3 className="text-sm font-medium text-[var(--text-primary)]">Idea graph</h3>
        <p className="text-xs text-[var(--text-muted)]">
          Every argument raised in this debate, linked to the question. Tap a node to read it.
        </p>
      </div>

      <div className="overflow-x-auto rounded-lg border border-[var(--border-hairline)] px-2 py-1">
        <svg
          viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
          className="mx-auto block w-full min-w-130"
          role="img"
          aria-label="Graph of debate ideas linked to the question"
        >
          {nodes.map((node, i) => {
            const angle = (2 * Math.PI * i) / nodes.length - Math.PI / 2;
            const x = CX + RX * Math.cos(angle);
            const y = CY + RY * Math.sin(angle);
            return (
              <line
                key={`edge-${node.id}`}
                x1={CX}
                y1={CY}
                x2={x}
                y2={y}
                stroke="var(--gridline)"
                strokeWidth={1}
                strokeDasharray={KIND_META[node.kind].dashed ? "4 3" : undefined}
              />
            );
          })}

          <g>
            <circle cx={CX} cy={CY} r={16} fill="var(--accent-fill)" />
            <text x={CX} y={CY + 4} textAnchor="middle" fontSize={11} fontWeight={700} fill="#fff">
              ?
            </text>
          </g>

          {nodes.map((node, i) => {
            const angle = (2 * Math.PI * i) / nodes.length - Math.PI / 2;
            const x = CX + RX * Math.cos(angle);
            const y = CY + RY * Math.sin(angle);
            const isSelected = node.id === selectedId;
            const anchor = x < CX - 40 ? "end" : x > CX + 40 ? "start" : "middle";
            const labelX = x < CX - 40 ? x - 16 : x > CX + 40 ? x + 16 : x;
            const labelY = x < CX - 40 || x > CX + 40 ? y + 4 : y > CY ? y + 22 : y - 14;
            return (
              <g
                key={node.id}
                onClick={() => setSelectedId(isSelected ? null : node.id)}
                className="cursor-pointer"
              >
                <title>{node.full}</title>
                <circle
                  cx={x}
                  cy={y}
                  r={isSelected ? 13 : 10}
                  fill="var(--surface-1)"
                  stroke={KIND_META[node.kind].color}
                  strokeWidth={isSelected ? 3 : 2}
                  strokeDasharray={KIND_META[node.kind].dashed ? "4 2" : undefined}
                />
                <text x={labelX} y={labelY} textAnchor={anchor} fontSize={11} fill="var(--text-secondary)">
                  {node.label}
                </text>
              </g>
            );
          })}
        </svg>
      </div>

      <div className="flex flex-wrap gap-3 text-xs text-[var(--text-muted)]">
        {(Object.keys(KIND_META) as NodeKind[]).map((kind) => (
          <span key={kind} className="flex items-center gap-1.5">
            <span
              className="inline-block h-2.5 w-2.5 rounded-full border-2"
              style={{ borderColor: KIND_META[kind].color }}
            />
            {KIND_META[kind].name}
          </span>
        ))}
      </div>

      {selected && (
        <div className="rounded-lg border border-[var(--border-hairline)] px-3.5 py-2.5">
          <div className="mb-1 text-xs font-medium uppercase tracking-wide text-[var(--text-muted)]">
            {KIND_META[selected.kind].name}
          </div>
          <p className="text-sm leading-relaxed text-[var(--text-primary)]">{selected.full}</p>
        </div>
      )}

      <p className="sr-only">Debate question: {question}</p>
    </section>
  );
}
