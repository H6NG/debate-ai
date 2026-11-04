"use client";

import { Plus, Minus, CircleHelp } from "lucide-react";
import { ProbabilityMeter } from "@/components/ProbabilityMeter";
import type { DebateReport } from "@/lib/types";

interface ReportCardProps {
  question: string;
  report: DebateReport;
}

export function ReportCard({ question, report }: ReportCardProps) {
  return (
    <div className="space-y-6">
      <div>
        <p className="text-xs font-medium uppercase tracking-wide text-[var(--text-muted)]">Question</p>
        <p className="text-base font-medium text-[var(--text-primary)]">{question}</p>
      </div>

      <ProbabilityMeter probability={report.probability} confidence={report.confidence} />

      <p className="text-sm leading-relaxed text-[var(--text-secondary)]">{report.summary}</p>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div>
          <h3 className="mb-2 text-sm font-semibold text-[var(--text-primary)]">Pros</h3>
          <ul className="space-y-2">
            {report.pros.map((item, i) => (
              <li key={i} className="flex gap-2 text-sm text-[var(--text-secondary)]">
                <Plus size={14} className="mt-0.5 shrink-0" style={{ color: "var(--status-good-text)" }} />
                <span>{item}</span>
              </li>
            ))}
          </ul>
        </div>

        <div>
          <h3 className="mb-2 text-sm font-semibold text-[var(--text-primary)]">Cons</h3>
          <ul className="space-y-2">
            {report.cons.map((item, i) => (
              <li key={i} className="flex gap-2 text-sm text-[var(--text-secondary)]">
                <Minus size={14} className="mt-0.5 shrink-0" style={{ color: "var(--status-critical)" }} />
                <span>{item}</span>
              </li>
            ))}
          </ul>
        </div>
      </div>

      {report.keyUncertainties.length > 0 && (
        <div>
          <h3 className="mb-2 flex items-center gap-1.5 text-sm font-semibold text-[var(--text-primary)]">
            <CircleHelp size={14} className="text-[var(--text-muted)]" />
            Key uncertainties
          </h3>
          <ul className="space-y-1.5">
            {report.keyUncertainties.map((item, i) => (
              <li key={i} className="text-sm text-[var(--text-muted)]">
                {item}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
