"use client";

interface ProbabilityMeterProps {
  probability: number;
  confidence: "low" | "medium" | "high";
}

const CONFIDENCE_BARS: Record<ProbabilityMeterProps["confidence"], number> = {
  low: 1,
  medium: 2,
  high: 3,
};

export function ProbabilityMeter({ probability, confidence }: ProbabilityMeterProps) {
  const clamped = Math.max(0, Math.min(100, Math.round(probability)));
  const filledBars = CONFIDENCE_BARS[confidence];

  return (
    <div>
      <div className="flex items-end justify-between">
        <div className="font-sans text-[56px] font-semibold leading-none text-[var(--text-primary)]">{clamped}%</div>
        <div
          className="mb-1.5 flex items-center gap-1.5 rounded-full border border-[var(--border-hairline)] px-2.5 py-1 text-xs text-[var(--text-secondary)]"
          title={`${confidence} confidence`}
        >
          <span className="flex items-end gap-0.5" aria-hidden>
            {[1, 2, 3].map((bar) => (
              <span
                key={bar}
                className="w-1 rounded-sm"
                style={{
                  height: `${4 + bar * 3}px`,
                  backgroundColor: bar <= filledBars ? "var(--accent-fill)" : "var(--gridline)",
                }}
              />
            ))}
          </span>
          {confidence} confidence
        </div>
      </div>
      <p className="mt-1 text-xs text-[var(--text-muted)]">Estimated probability</p>

      <div className="mt-3 h-3 w-full overflow-hidden rounded-full" style={{ backgroundColor: "var(--accent-track)" }}>
        <div
          className="h-full rounded-full transition-all"
          style={{ width: `${clamped}%`, backgroundColor: "var(--accent-fill)" }}
        />
      </div>
    </div>
  );
}
