"use client";

import { useState } from "react";
import { Plus, Minus, CircleHelp, Copy, Check, Download, Link } from "lucide-react";
import { ProbabilityMeter } from "@/components/ProbabilityMeter";
import { reportToMarkdown } from "@/lib/history";
import { encodeShare } from "@/lib/share";
import type { DebateReport, UsageInfo } from "@/lib/types";

interface ReportCardProps {
  question: string;
  report: DebateReport;
  providerLabel?: string;
  modelId?: string;
  usage?: UsageInfo;
}

export function ReportCard({ question, report, providerLabel, modelId, usage }: ReportCardProps) {
  const [copied, setCopied] = useState(false);
  const [linkCopied, setLinkCopied] = useState(false);

  function markdown(): string {
    return reportToMarkdown(question, report, providerLabel, modelId, usage);
  }

  async function handleCopyLink() {
    const url = `${window.location.origin}${window.location.pathname}${encodeShare({ question, report, provider: providerLabel, modelId })}`;
    try {
      await navigator.clipboard.writeText(url);
    } catch {
      const area = document.createElement("textarea");
      area.value = url;
      document.body.appendChild(area);
      area.select();
      document.execCommand("copy");
      document.body.removeChild(area);
    }
    setLinkCopied(true);
    setTimeout(() => setLinkCopied(false), 2000);
  }

  async function handleCopy() {
    const text = markdown();
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      const area = document.createElement("textarea");
      area.value = text;
      document.body.appendChild(area);
      area.select();
      document.execCommand("copy");
      document.body.removeChild(area);
    }
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  function handleDownload() {
    const blob = new Blob([markdown()], { type: "text/markdown" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `debate-report-${Date.now()}.md`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-end gap-2">
        <button
          type="button"
          onClick={handleCopy}
          className="flex items-center gap-1.5 rounded-md border border-[var(--border-hairline)] px-2.5 py-1.5 text-xs text-[var(--text-secondary)] hover:bg-[var(--surface-1)]"
        >
          {copied ? <Check size={13} /> : <Copy size={13} />}
          {copied ? "Copied" : "Copy markdown"}
        </button>
        <button
          type="button"
          onClick={handleDownload}
          className="flex items-center gap-1.5 rounded-md border border-[var(--border-hairline)] px-2.5 py-1.5 text-xs text-[var(--text-secondary)] hover:bg-[var(--surface-1)]"
        >
          <Download size={13} />
          Download .md
        </button>
        <button
          type="button"
          onClick={handleCopyLink}
          className="flex items-center gap-1.5 rounded-md border border-[var(--border-hairline)] px-2.5 py-1.5 text-xs text-[var(--text-secondary)] hover:bg-[var(--surface-1)]"
        >
          {linkCopied ? <Check size={13} /> : <Link size={13} />}
          {linkCopied ? "Link copied" : "Copy link"}
        </button>
      </div>
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
              <li key={i} className="flex gap-2 text-sm text-[var(--text-muted)]">
                <span aria-hidden className="shrink-0 text-[var(--text-muted)]">
                  &ndash;
                </span>
                <span>{item}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {(report.keyClaims ?? []).length > 0 && (
        <div>
          <h3 className="mb-2 text-sm font-semibold text-[var(--text-primary)]">Key claims to verify</h3>
          <ul className="space-y-2">
            {(report.keyClaims ?? []).map((item, i) => (
              <li key={i} className="text-sm text-[var(--text-secondary)]">
                <span className="text-[var(--text-primary)]">{item.claim}</span>{" "}
                <span className="text-xs text-[var(--text-muted)]">— {item.source}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
