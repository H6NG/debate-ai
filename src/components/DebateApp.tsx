"use client";

import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { PanelLeftClose, PanelLeftOpen, Plus, Settings as SettingsIcon } from "lucide-react";
import { SettingsView } from "@/components/SettingsView";
import { SetupForm } from "@/components/SetupForm";
import { DebateStage, type PersonaTurn } from "@/components/DebateStage";
import { ForecastDistribution } from "@/components/ForecastDistribution";
import { HistoryPanel } from "@/components/HistoryPanel";
import { IdeaGraph } from "@/components/IdeaGraph";
import { MeetingRoom } from "@/components/MeetingRoom";
import { ProbabilityTracker } from "@/components/ProbabilityTracker";
import { RelationshipGraph } from "@/components/RelationshipGraph";
import { ReportCard } from "@/components/ReportCard";
import { ThemeToggle } from "@/components/ThemeToggle";
import { decodeShare } from "@/lib/share";
import { getSampleDebate } from "@/lib/sample-debate";
import { readNdjsonStream } from "@/lib/ndjson";
import { getProviderMeta } from "@/lib/provider-catalog";
import {
  brierScore,
  deleteHistoryEntry,
  exportHistoryJson,
  formatTokens,
  importHistoryJson,
  loadHistory,
  resolveHistoryEntry,
  saveHistoryEntry,
  trackRecord,
  type ForecastOutcome,
  type HistoryEntry,
} from "@/lib/history";
import type { Challenge } from "@/lib/relationship";
import { staleUnresolved } from "@/lib/calibration";
import { deleteRemoteEntry, isCloudConfigured, pushHistory } from "@/lib/firebase-sync";
import { friendlyErrorMessage } from "@/lib/friendly-errors";
import type { DebateEvent, DebateReport, DebateRequest, Persona, TranscriptTurn, UsageInfo } from "@/lib/types";

type View = "setup" | "results";
type Tab = "debate" | "meeting" | "report";

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
  const [showSettings, setShowSettings] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState<boolean>(
    () => typeof window !== "undefined" && window.localStorage.getItem("debate-ai:sidebar-collapsed") === "1"
  );
  const [tutorialOpen, setTutorialOpen] = useState<boolean>(
    () =>
      typeof window !== "undefined" && window.localStorage.getItem("debate-ai:tutorial-seen") !== "1"
  );

  function toggleSidebar() {
    setSidebarCollapsed((prev) => {
      const next = !prev;
      window.localStorage.setItem("debate-ai:sidebar-collapsed", next ? "1" : "0");
      return next;
    });
  }

  function dismissTutorial() {
    window.localStorage.setItem("debate-ai:tutorial-seen", "1");
    setTutorialOpen(false);
  }
  const [tab, setTab] = useState<Tab>("debate");
  const [isStreaming, setIsStreaming] = useState(false);

  const [question, setQuestion] = useState("");
  const [personas, setPersonas] = useState<Persona[]>([]);
  const [turnsByPersona, setTurnsByPersona] = useState<Record<string, PersonaTurn[]>>({});
  const [activePersonaIds, setActivePersonaIds] = useState<Set<string>>(new Set());
  const [currentRound, setCurrentRound] = useState(1);
  const [totalRounds, setTotalRounds] = useState(1);
  const [errorsByPersona, setErrorsByPersona] = useState<Record<string, string>>({});
  const [challenges, setChallenges] = useState<Challenge[]>([]);
  const [researchGaps, setResearchGaps] = useState<string[]>([]);
  const [usageTotals, setUsageTotals] = useState<UsageInfo>({ inputTokens: 0, outputTokens: 0 });
  const usageRef = useRef<UsageInfo>({ inputTokens: 0, outputTokens: 0 });
  const [generatingReport, setGeneratingReport] = useState(false);
  const [report, setReport] = useState<DebateReport | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [history, setHistory] = useState<HistoryEntry[]>(() => loadHistory());
  const [demoMode, setDemoMode] = useState(false);

  function loadSample() {
    const sample = getSampleDebate();
    requestRef.current = null;
    setQuestion(sample.question);
    setPersonas(sample.personas);
    setTurnsByPersona(sample.turnsByPersona);
    setChallenges(sample.challenges);
    setCurrentRound(sample.totalRounds);
    setTotalRounds(sample.totalRounds);
    setActivePersonaIds(new Set());
    setErrorsByPersona({});
    setResearchGaps([]);
    setUsageTotals({ inputTokens: 0, outputTokens: 0 });
    setReport(sample.report);
    setRunMeta({ providerLabel: sample.providerLabel, modelId: sample.modelId });
    setError(null);
    setIsStreaming(false);
    setGeneratingReport(false);
    setHistoryView(null);
    setDemoMode(true);
    setTab("debate");
    setView("results");
  }
  const [historyQuery, setHistoryQuery] = useState("");
  const [historyError, setHistoryError] = useState<string | null>(null);
  const [dismissedShare, setDismissedShare] = useState(false);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const sharedView = useMemo(
    () => (!mounted || dismissedShare ? null : decodeShare(window.location.hash)),
    [mounted, dismissedShare]
  );
  const filteredHistory = history.filter((e) =>
    e.question.toLowerCase().includes(historyQuery.trim().toLowerCase())
  );

  function dismissShare() {
    window.history.replaceState(null, "", window.location.pathname);
    setDismissedShare(true);
  }

  function handleExportHistory() {
    const blob = new Blob([exportHistoryJson(history)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "debate-history.json";
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  }

  function handleImportFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    setHistoryError(null);
    file.text().then(
      (text) => {
        try {
          setHistory(importHistoryJson(text));
        } catch (err) {
          setHistoryError(err instanceof Error ? err.message : "Could not import that file.");
        }
      },
      () => setHistoryError("Could not read that file.")
    );
  }
  const [historyView, setHistoryView] = useState<HistoryEntry | null>(null);
  const [runMeta, setRunMeta] = useState<{ providerLabel: string; modelId: string } | null>(null);
  const [followUp, setFollowUp] = useState("");

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
        setErrorsByPersona((prev) => {
          if (!(event.personaId in prev)) return prev;
          const next = { ...prev };
          delete next[event.personaId];
          return next;
        });
        setTurnsByPersona((prev) => {
          const existing = prev[event.personaId] ?? [];
          return { ...prev, [event.personaId]: [...existing, { round: event.round, text: "" }] };
        });
        break;
      case "agent_error":
        setActivePersonaIds((prev) => {
          const next = new Set(prev);
          next.delete(event.personaId);
          return next;
        });
        setErrorsByPersona((prev) => ({ ...prev, [event.personaId]: friendlyErrorMessage(event.message) }));
        break;
      case "challenge":
        setChallenges((prev) => [...prev, { round: event.round, fromId: event.fromPersonaId, toId: event.toPersonaId }]);
        break;
      case "research_gaps":
        setResearchGaps(event.gaps);
        break;
      case "usage":
        usageRef.current = {
          inputTokens: usageRef.current.inputTokens + event.inputTokens,
          outputTokens: usageRef.current.outputTokens + event.outputTokens,
        };
        setUsageTotals({ ...usageRef.current });
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
        {
          const original = requestRef.current;
          if (original) {
            const meta = getProviderMeta(original.provider);
            setRunMeta({ providerLabel: meta.label, modelId: original.modelId });
            setHistory(
              saveHistoryEntry({
                question: original.question,
                provider: meta.label,
                modelId: original.modelId,
                probability: event.data.probability,
                report: event.data,
                usage: { ...usageRef.current },
                inputs: {
                  personas: original.personas.map((p) => ({ id: p.id, name: p.name })),
                  rounds: original.rounds,
                  enableWebSearch: original.enableWebSearch,
                  crossExamine: original.crossExamine,
                  redTeam: original.redTeam,
                  autonomousResearch: original.autonomousResearch,
                  ...(original.moderatorModelId ? { moderatorModelId: original.moderatorModelId } : {}),
                },
              })
            );
          }
        }
        break;
      case "error":
        setError(friendlyErrorMessage(event.message));
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
    setDemoMode(false);
    setHistoryView(null);
    setRunMeta(null);
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
    setErrorsByPersona({});
    setChallenges([]);
    setResearchGaps([]);
    usageRef.current = { inputTokens: 0, outputTokens: 0 };
    setUsageTotals({ inputTokens: 0, outputTokens: 0 });
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
        setError(friendlyErrorMessage(err));
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
      setError(
        err instanceof Error ? friendlyErrorMessage(err) : "Could not generate a report from the partial debate."
      );
    } finally {
      setGeneratingReport(false);
    }
  }

  function handleReset() {
    setView("setup");
    setHistoryView(null);
    setDemoMode(false);
  }

  async function handleFollowUp(e: React.FormEvent) {
    e.preventDefault();
    const text = followUp.trim();
    const original = requestRef.current;
    if (!text || busy || historyView || !original || personas.length === 0) return;
    const transcript = buildTranscript(personas, turnsByPersona);
    if (transcript.length === 0) return;

    setFollowUp("");
    setError(null);
    setTab("debate");
    setIsStreaming(true);

    const controller = new AbortController();
    abortRef.current = controller;

    try {
      const res = await fetch("/api/followup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          question: original.question,
          provider: original.provider,
          apiKey: original.apiKey,
          modelId: original.modelId,
          personas,
          transcript,
          followUp: text,
          baseRound: totalRounds,
          enableWebSearch: original.enableWebSearch,
          ...(original.moderatorModelId ? { moderatorModelId: original.moderatorModelId } : {}),
        }),
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
      if (!(err instanceof DOMException && err.name === "AbortError")) {
        setError(friendlyErrorMessage(err));
      }
    } finally {
      setIsStreaming(false);
    }
  }

  function openHistoryEntry(entry: HistoryEntry) {
    setHistoryView(entry);
    setView("results");
    setTab("report");
    setError(null);
  }

  function handleResolve(outcome: ForecastOutcome) {
    if (!historyView) return;
    const entries = resolveHistoryEntry(historyView.id, outcome);
    setHistory(entries);
    setHistoryView(entries.find((e) => e.id === historyView.id) ?? null);
  }

  const busy = isStreaming || generatingReport;
  const failedNames = personas
    .filter((p) => errorsByPersona[p.id])
    .map((p) => p.name);
  const shownQuestion = historyView?.question ?? question;
  const shownReport = historyView?.report ?? report;
  const shownMeta = historyView
    ? { providerLabel: historyView.provider, modelId: historyView.modelId }
    : runMeta;
  const record = trackRecord(history);
  const staleIds = useMemo(
    // eslint-disable-next-line react-hooks/purity -- "now" must be read at view time; gated on mounted so SSR stays deterministic
    () => (mounted ? new Set(staleUnresolved(history, Date.now()).map((e) => e.id)) : new Set<string>()),
    [mounted, history]
  );

  // Push local history to the user's own Firebase whenever it changes.
  // No state writes here: failures stay silent and local remains the source of truth.
  useEffect(() => {
    if (!mounted || history.length === 0 || !isCloudConfigured()) return;
    pushHistory(history).catch(() => {});
  }, [mounted, history]);

  if (sharedView) {
    return (
      <div className="mx-auto w-full max-w-3xl px-4 py-10">
        <header className="mb-8 flex items-start justify-between gap-4">
          <div>
            <h1 className="text-xl font-semibold text-[var(--text-primary)]">Shared debate report</h1>
            <p className="text-sm text-[var(--text-secondary)]">Read-only link — no live transcript.</p>
          </div>
          <div className="flex shrink-0 gap-2">
            <ThemeToggle />
            <button
              type="button"
              onClick={dismissShare}
              className="rounded-md border border-[var(--border-hairline)] px-2.5 py-1.5 text-xs text-[var(--text-secondary)] hover:bg-[var(--surface-1)]"
            >
              Start your own
            </button>
          </div>
        </header>
        <div className="space-y-5">
          <ReportCard
            question={sharedView.question}
            report={sharedView.report}
            providerLabel={sharedView.provider}
            modelId={sharedView.modelId}
          />
          <IdeaGraph question={sharedView.question} report={sharedView.report} />
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-8 px-4 py-10 lg:flex-row">
      <aside
        className={`order-2 w-full shrink-0 overflow-hidden transition-[width] duration-300 ease-in-out lg:order-1 ${sidebarCollapsed ? "lg:w-16" : "lg:w-72"}`}
      >
        <div
          className={`flex flex-col space-y-5 rounded-xl border border-[var(--border-hairline)] bg-[var(--surface-1)] transition-[padding] duration-300 ease-in-out lg:sticky lg:top-10 lg:max-h-[calc(100vh-5rem)] ${sidebarCollapsed ? "p-2" : "p-4"}`}
        >
          {!sidebarCollapsed && (
            <div className="animate-sidebar-in">
              <h1 className="text-xl font-semibold text-[var(--text-primary)]">Debate AI</h1>
              <p className="text-sm text-[var(--text-secondary)]">Ask the future. Argue about it.</p>
            </div>
          )}
          <div className={`flex gap-2 ${sidebarCollapsed ? "flex-col items-center" : "items-center"}`}>
            {sidebarCollapsed ? (
              <button
                type="button"
                onClick={handleReset}
                aria-label="New debate"
                title="New debate"
                className="rounded-md bg-[var(--accent-fill)] p-2 text-white"
              >
                <Plus size={15} />
              </button>
            ) : (
              <button
                type="button"
                onClick={handleReset}
                className="flex-1 rounded-md bg-[var(--accent-fill)] px-3 py-2 text-center text-sm font-medium whitespace-nowrap text-white"
              >
                New debate
              </button>
            )}
            <button
              type="button"
              onClick={() => setShowSettings(true)}
              aria-label="Open settings"
              title="Settings"
              className="rounded-md border border-[var(--border-hairline)] p-2 text-[var(--text-secondary)] hover:bg-[var(--surface-1)]"
            >
              <SettingsIcon size={15} />
            </button>
            {!sidebarCollapsed && <ThemeToggle />}
            <button
              type="button"
              onClick={toggleSidebar}
              aria-label={sidebarCollapsed ? "Expand sidebar" : "Collapse sidebar"}
              title={sidebarCollapsed ? "Expand sidebar" : "Collapse sidebar"}
              className="rounded-md border border-[var(--border-hairline)] p-2 text-[var(--text-secondary)] hover:bg-[var(--surface-1)]"
            >
              {sidebarCollapsed ? <PanelLeftOpen size={15} /> : <PanelLeftClose size={15} />}
            </button>
          </div>
          {mounted && !sidebarCollapsed && (
            <div className="animate-sidebar-in flex min-h-0 flex-1 flex-col">
            <HistoryPanel
              entries={filteredHistory}
              allEntries={history}
              resolvedCount={record.resolved}
              meanBrier={record.meanBrier}
              staleIds={staleIds}
              query={historyQuery}
              onQueryChange={setHistoryQuery}
              error={historyError}
              onExport={handleExportHistory}
              fileInputRef={fileInputRef}
              onImportClick={() => fileInputRef.current?.click()}
              onImportFile={handleImportFile}
              onOpen={openHistoryEntry}
              onDelete={(entry) => {
                setHistory(deleteHistoryEntry(entry.id));
                deleteRemoteEntry(entry.id).catch(() => {});
              }}
            />
            </div>
          )}
          {!sidebarCollapsed && (
            <button
              type="button"
              onClick={() => setTutorialOpen(true)}
              className="animate-sidebar-in text-left text-xs text-[var(--text-muted)] underline hover:text-[var(--text-secondary)]"
            >
              Replay tutorial
            </button>
          )}
        </div>
      </aside>

      <main className="order-1 min-w-0 flex-1 lg:order-2">
      {showSettings ? (
        <SettingsView
          onBack={() => setShowSettings(false)}
          history={history}
          onHistoryChange={setHistory}
        />
      ) : view === "setup" ? (
        mounted ? (
          <div className="space-y-8">
            <button
              type="button"
              onClick={loadSample}
              className="w-full rounded-lg border border-dashed border-[var(--accent-fill)] px-3 py-2.5 text-sm font-medium text-[var(--accent-fill)] hover:bg-[var(--accent-track)]/10"
            >
              Try a sample debate — no API key needed
            </button>
            <SetupForm onStart={handleStart} onOpenSettings={() => setShowSettings(true)} />
          </div>
        ) : null
      ) : (
        <div className="space-y-5">
          <div className="flex items-center justify-between">
            <div className="flex gap-1 rounded-lg border border-[var(--border-hairline)] p-1">
              <button
                onClick={() => setTab("debate")}
                disabled={historyView !== null}
                className={`rounded-md px-3 py-1.5 text-sm font-medium disabled:opacity-40 ${
                  tab === "debate" ? "bg-[var(--accent-fill)] text-white" : "text-[var(--text-secondary)]"
                }`}
              >
                Live debate
              </button>
              <button
                onClick={() => setTab("meeting")}
                disabled={historyView !== null || personas.length === 0}
                className={`rounded-md px-3 py-1.5 text-sm font-medium disabled:opacity-40 ${
                  tab === "meeting" ? "bg-[var(--accent-fill)] text-white" : "text-[var(--text-secondary)]"
                }`}
              >
                Meeting
              </button>
              <button
                onClick={() => setTab("report")}
                disabled={!shownReport}
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
                {historyView ? "Back to setup" : "New debate"}
              </button>
            )}
          </div>

          {error && (
            <div className="rounded-lg border border-[var(--status-critical)] bg-[var(--status-critical)]/10 px-3.5 py-2.5 text-sm text-[var(--text-primary)]">
              {error}
            </div>
          )}

          {demoMode && (
            <p className="rounded-lg border border-[var(--accent-fill)] bg-[var(--accent-track)]/10 px-3.5 py-2.5 text-xs text-[var(--text-secondary)]">
              Sample debate with canned results.{" "}
              <button type="button" onClick={handleReset} className="font-medium text-[var(--accent-fill)]">
                Start your own with an API key
              </button>
            </p>
          )}

          {failedNames.length > 0 && (
            <p className="rounded-lg border border-[var(--border-hairline)] px-3.5 py-2.5 text-xs text-[var(--text-secondary)]">
              {failedNames.join(", ")} couldn&apos;t respond after retries — the debate continued without them and
              the report is built from the rest.
            </p>
          )}

          {researchGaps.length > 0 && (
            <div className="rounded-lg border border-[var(--border-hairline)] px-3.5 py-2.5">
              <p className="mb-1 text-xs font-medium uppercase tracking-wide text-[var(--text-muted)]">
                Researching knowledge gaps
              </p>
              <ul className="space-y-1">
                {researchGaps.map((gap, i) => (
                  <li key={i} className="text-xs text-[var(--text-secondary)]">
                    {gap}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {tab === "debate" ? (
            <>
              <DebateStage
                personas={personas}
                turnsByPersona={turnsByPersona}
                activePersonaIds={activePersonaIds}
                currentRound={currentRound}
                totalRounds={totalRounds}
                generatingReport={generatingReport}
                errorsByPersona={errorsByPersona}
              />
              <ProbabilityTracker
                personas={personas}
                turnsByPersona={turnsByPersona}
                totalRounds={totalRounds}
              />
            </>
          ) : tab === "meeting" ? (
            <>
              <MeetingRoom
                personas={personas}
                turnsByPersona={turnsByPersona}
                activePersonaIds={activePersonaIds}
                totalRounds={totalRounds}
                errorsByPersona={errorsByPersona}
              />
              <RelationshipGraph
                personas={personas}
                turnsByPersona={turnsByPersona}
                challenges={challenges}
                totalRounds={totalRounds}
              />
            </>
          ) : shownReport ? (
            <>
              <ReportCard
                question={shownQuestion}
                report={shownReport}
                providerLabel={shownMeta?.providerLabel}
                modelId={shownMeta?.modelId}
                usage={historyView?.usage ?? usageTotals}
              />
              {!historyView && (
                <ForecastDistribution
                  personas={personas}
                  turnsByPersona={turnsByPersona}
                  moderatorProbability={shownReport.probability}
                />
              )}
              <IdeaGraph question={shownQuestion} report={shownReport} />
              {historyView?.inputs && (
                <section className="space-y-1 rounded-lg border border-[var(--border-hairline)] px-3.5 py-3">
                  <h3 className="text-sm font-medium text-[var(--text-primary)]">Setup</h3>
                  <p className="text-xs text-[var(--text-secondary)]">
                    Panel: {historyView.inputs.personas.map((p) => p.name).join(", ")}
                  </p>
                  <p className="text-xs text-[var(--text-muted)]">
                    {historyView.inputs.rounds} round{historyView.inputs.rounds === 1 ? "" : "s"}
                    {historyView.inputs.enableWebSearch ? " · web search" : ""}
                    {historyView.inputs.crossExamine ? " · rebuttals" : ""}
                    {historyView.inputs.redTeam ? " · red team" : ""}
                    {historyView.inputs.autonomousResearch ? " · research" : ""}
                    {historyView.inputs.moderatorModelId
                      ? ` · moderator: ${historyView.inputs.moderatorModelId}`
                      : ""}
                  </p>
                </section>
              )}
              {historyView && (
                <section className="space-y-2 rounded-lg border border-[var(--border-hairline)] px-3.5 py-3">
                  <h3 className="text-sm font-medium text-[var(--text-primary)]">Outcome</h3>
                  {historyView.resolution ? (
                    <p className="text-sm text-[var(--text-secondary)]">
                      Resolved{" "}
                      <span className="font-semibold text-[var(--text-primary)]">
                        {historyView.resolution.outcome === "yes" ? "Yes" : "No"}
                      </span>{" "}
                      · Brier {brierScore(historyView.probability, historyView.resolution.outcome).toFixed(2)}{" "}
                      <span className="text-[var(--text-muted)]">(0 is perfect, 0.25 is a coin flip)</span>
                    </p>
                  ) : (
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-[var(--text-muted)]">Did it happen?</span>
                      <button
                        type="button"
                        onClick={() => handleResolve("yes")}
                        className="rounded-sm bg-[var(--accent-fill)] px-3 py-1.5 text-xs font-medium text-white"
                      >
                        Yes
                      </button>
                      <button
                        type="button"
                        onClick={() => handleResolve("no")}
                        className="rounded-sm border border-[var(--border-hairline)] px-3 py-1.5 text-xs font-medium text-[var(--text-secondary)]"
                      >
                        No
                      </button>
                    </div>
                  )}
                </section>
              )}
            </>
          ) : null}

          {shownReport && !busy && !historyView && !demoMode && tab === "report" && (
            <form onSubmit={handleFollowUp} className="flex gap-2">
              <input
                value={followUp}
                onChange={(e) => setFollowUp(e.target.value)}
                placeholder="Ask the panel a follow-up…"
                maxLength={500}
                aria-label="Ask the panel a follow-up question"
                className="min-w-0 flex-1 rounded-lg border border-[var(--border-hairline)] bg-[var(--surface-1)] px-3 py-2.5 text-sm text-[var(--text-primary)] outline-none focus:border-[var(--accent-fill)]"
              />
              <button
                type="submit"
                disabled={!followUp.trim()}
                className="shrink-0 rounded-lg bg-[var(--accent-fill)] px-4 py-2.5 text-sm font-semibold text-white transition-opacity disabled:opacity-40"
              >
                Ask
              </button>
            </form>
          )}

          {busy && !generatingReport && (tab === "debate" || tab === "meeting") && (
            <p className="text-center text-xs text-[var(--text-muted)]">
              Personas in each round answer concurrently, so cards update at the same time.
            </p>
          )}

          {usageTotals.inputTokens + usageTotals.outputTokens > 0 && (
            <p className="text-center text-xs text-[var(--text-muted)]">
              ≈{formatTokens(usageTotals.inputTokens)} tokens in · ≈{formatTokens(usageTotals.outputTokens)} out
              this run
            </p>
          )}
        </div>
      )}
      </main>

      {mounted && tutorialOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
          role="dialog"
          aria-modal="true"
          aria-label="Welcome to Debate AI"
        >
          <div className="w-full max-w-md rounded-xl border border-[var(--border-hairline)] bg-[var(--surface-1)] p-6 shadow-2xl">
            <h2 className="text-lg font-semibold text-[var(--text-primary)]">Welcome to Debate AI</h2>
            <p className="mt-1 text-sm text-[var(--text-secondary)]">Four steps to your first forecast:</p>
            <ol className="mt-4 space-y-3 text-sm text-[var(--text-secondary)]">
              <li>
                <span className="font-medium text-[var(--text-primary)]">1. Add a key.</span> Paste a
                provider API key in Settings (gear icon, left) — or skip this entirely and try the
                sample debate, no key needed.
              </li>
              <li>
                <span className="font-medium text-[var(--text-primary)]">2. Ask.</span> Frame a yes/no
                question with a deadline, e.g. &ldquo;Will X happen before 2028?&rdquo;
              </li>
              <li>
                <span className="font-medium text-[var(--text-primary)]">3. Pick a panel.</span> Choose
                personas yourself, or let AI pick and draft specialists for your question.
              </li>
              <li>
                <span className="font-medium text-[var(--text-primary)]">4. Watch, then resolve.</span>{" "}
                Follow the live debate and the final probability — when the outcome is known, resolve
                it from Past reports to build your calibration track record.
              </li>
            </ol>
            <div className="mt-6 flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={() => {
                  dismissTutorial();
                  loadSample();
                }}
                className="rounded-md bg-[var(--accent-fill)] px-3.5 py-2 text-sm font-medium text-white"
              >
                Try the sample debate
              </button>
              <button
                type="button"
                onClick={dismissTutorial}
                className="rounded-md border border-[var(--border-hairline)] px-3.5 py-2 text-sm text-[var(--text-secondary)] hover:bg-[var(--surface-1)]"
              >
                Get started
              </button>
              <button
                type="button"
                onClick={dismissTutorial}
                className="ml-auto text-xs text-[var(--text-muted)] underline hover:text-[var(--text-secondary)]"
              >
                Skip tutorial
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
