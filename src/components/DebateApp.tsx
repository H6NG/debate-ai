"use client";

import { useRef, useState, useSyncExternalStore } from "react";
import { SetupForm } from "@/components/SetupForm";
import { DebateStage, type PersonaTurn } from "@/components/DebateStage";
import { ReportCard } from "@/components/ReportCard";
import { readNdjsonStream } from "@/lib/ndjson";
import type { DebateEvent, DebateReport, DebateRequest, Persona, TranscriptTurn } from "@/lib/types";

type View = "setup" | "results";
type Tab = "debate" | "report";

// Used with useSyncExternalStore to detect the client-hydrated render without
// reading localStorage during SSR (which would mismatch and break hydration).
function subscribeNoop() {
  return () => {};
}
function getClientSnapshot() {
  return true;
}
function getServerSnapshot() {
  return false;
}

function buildTranscript(personas: Persona[], turnsByPersona: Record<string, PersonaTurn[]>): TranscriptTurn[] {
  const nameById = new Map(personas.map((p) => [p.id, p.name]));
  const flat: TranscriptTurn[] = [];
  for (const [personaId, turns] of Object.entries(turnsByPersona)) {
    const name = nameById.get(personaId) ?? personaId;
    for (const turn of turns) {
      if (turn.text.trim().length > 0) flat.push({ personaName: name, round: turn.round, text: turn.text });
    }
  }
  return flat.sort((a, b) => a.round - b.round);
}

export function DebateApp() {
  const mounted = useSyncExternalStore(subscribeNoop, getClientSnapshot, getServerSnapshot);
  const [view, setView] = useState<View>("setup");
  const [tab, setTab] = useState<Tab>("debate");
  const [isStreaming, setIsStreaming] = useState(false);

  const [question, setQuestion] = useState("");
  const [personas, setPersonas] = useState<Persona[]>([]);
  const [turnsByPersona, setTurnsByPersona] = useState<Record<string, PersonaTurn[]>>({});
  const [activePersonaIds, setActivePersonaIds] = useState<Set<string>>(new Set());
  const [currentRound, setCurrentRound] = useState(1);
  const [totalRounds, setTotalRounds] = useState(1);
  const [generatingReport, setGeneratingReport] = useState(false);
  const [report, setReport] = useState<DebateReport | null>(null);
  const [error, setError] = useState<string | null>(null);

  const abortRef = useRef<AbortController | null>(null);
  const requestRef = useRef<DebateRequest | null>(null);

  function applyEvent(event: DebateEvent) {
    switch (event.type) {
      case "round_start":
        setCurrentRound(event.round);
        setTotalRounds(event.totalRounds);
        break;
      case "agent_start":
        setActivePersonaIds((prev) => new Set(prev).add(event.personaId));
        setTurnsByPersona((prev) => {
          const existing = prev[event.personaId] ?? [];
          return { ...prev, [event.personaId]: [...existing, { round: event.round, text: "" }] };
        });
        break;
      case "agent_delta":
        setTurnsByPersona((prev) => {
          const existing = prev[event.personaId] ?? [];
          if (existing.length === 0) return prev;
          const updated = [...existing];
          const last = updated[updated.length - 1];
          updated[updated.length - 1] = { ...last, text: last.text + event.text };
          return { ...prev, [event.personaId]: updated };
        });
        break;
      case "agent_end":
        setActivePersonaIds((prev) => {
          const next = new Set(prev);
          next.delete(event.personaId);
          return next;
        });
        break;
      case "report_start":
        setGeneratingReport(true);
        break;
      case "report":
        setReport(event.data);
        setGeneratingReport(false);
        setTab("report");
        break;
      case "error":
        setError(event.message);
        setGeneratingReport(false);
        setActivePersonaIds(new Set());
        break;
      case "done":
        break;
    }
  }

  async function handleStart(request: DebateRequest) {
    setView("results");
    setTab("debate");
    setIsStreaming(true);
    setQuestion(request.question);
    setPersonas(request.personas);
    setTurnsByPersona({});
    setActivePersonaIds(new Set());
    setCurrentRound(1);
    setTotalRounds(request.rounds);
    setGeneratingReport(false);
    setReport(null);
    setError(null);
    requestRef.current = request;

    const controller = new AbortController();
    abortRef.current = controller;

    try {
      const res = await fetch("/api/debate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(request),
        signal: controller.signal,
      });

      if (!res.ok || !res.body) {
        const data = await res.json().catch(() => null);
        throw new Error(data?.error ?? `Request failed (${res.status})`);
      }

      for await (const raw of readNdjsonStream(res.body)) {
        applyEvent(raw as DebateEvent);
      }
    } catch (err) {
      if (err instanceof DOMException && err.name === "AbortError") {
        // handled by handleStop, which generates a report from what we have
      } else {
        setError(err instanceof Error ? err.message : "Something went wrong.");
      }
    } finally {
      setIsStreaming(false);
    }
  }

  async function handleStop() {
    abortRef.current?.abort();
    setActivePersonaIds(new Set());

    const original = requestRef.current;
    const transcript = buildTranscript(personas, turnsByPersona);

    if (!original || transcript.length === 0) {
      setError("Stopped before any arguments were made — nothing to report.");
      return;
    }

    setGeneratingReport(true);
    setError(null);

    try {
      const res = await fetch("/api/report", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          question: original.question,
          provider: original.provider,
          apiKey: original.apiKey,
          modelId: original.modelId,
          transcript,
        }),
      });

      const data = await res.json().catch(() => null);
      if (!res.ok) throw new Error(data?.error ?? `Request failed (${res.status})`);

      setReport(data.report);
      setTab("report");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not generate a report from the partial debate.");
    } finally {
      setGeneratingReport(false);
    }
  }

  function handleReset() {
    setView("setup");
  }

  const busy = isStreaming || generatingReport;

  return (
    <div className="mx-auto w-full max-w-3xl px-4 py-10">
      <header className="mb-8">
        <h1 className="text-xl font-semibold text-[var(--text-primary)]">Debate AI</h1>
        <p className="text-sm text-[var(--text-secondary)]">
          Ask a forecasting question, watch an AI panel debate it live, get a calibrated probability report.
        </p>
      </header>

      {view === "setup" ? (
        mounted ? <SetupForm onStart={handleStart} /> : null
      ) : (
        <div className="space-y-5">
          <div className="flex items-center justify-between">
            <div className="flex gap-1 rounded-lg border border-[var(--border-hairline)] p-1">
              <button
                onClick={() => setTab("debate")}
                className={`rounded-md px-3 py-1.5 text-sm font-medium ${
                  tab === "debate" ? "bg-[var(--accent-fill)] text-white" : "text-[var(--text-secondary)]"
                }`}
              >
                Live debate
              </button>
              <button
                onClick={() => setTab("report")}
                disabled={!report}
                className={`rounded-md px-3 py-1.5 text-sm font-medium disabled:opacity-40 ${
                  tab === "report" ? "bg-[var(--accent-fill)] text-white" : "text-[var(--text-secondary)]"
                }`}
              >
                Report
              </button>
            </div>

            {isStreaming ? (
              <button
                onClick={handleStop}
                className="rounded-md border border-[var(--border-hairline)] px-3 py-1.5 text-sm text-[var(--text-secondary)]"
              >
                Stop &amp; report
              </button>
            ) : generatingReport ? (
              <span className="rounded-md border border-[var(--border-hairline)] px-3 py-1.5 text-sm text-[var(--text-muted)]">
                Generating report&hellip;
              </span>
            ) : (
              <button
                onClick={handleReset}
                className="rounded-md border border-[var(--border-hairline)] px-3 py-1.5 text-sm text-[var(--text-secondary)]"
              >
                New debate
              </button>
            )}
          </div>

          {error && (
            <div className="rounded-lg border border-[var(--status-critical)] bg-[var(--status-critical)]/10 px-3.5 py-2.5 text-sm text-[var(--text-primary)]">
              {error}
            </div>
          )}

          {tab === "debate" ? (
            <DebateStage
              personas={personas}
              turnsByPersona={turnsByPersona}
              activePersonaIds={activePersonaIds}
              currentRound={currentRound}
              totalRounds={totalRounds}
              generatingReport={generatingReport}
            />
          ) : report ? (
            <ReportCard question={question} report={report} />
          ) : null}

          {busy && !generatingReport && tab === "debate" && (
            <p className="text-center text-xs text-[var(--text-muted)]">
              Personas in each round answer concurrently, so cards update at the same time.
            </p>
          )}
        </div>
      )}
    </div>
  );
}
