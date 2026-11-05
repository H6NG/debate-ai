"use client";

import { useEffect, useMemo, useState } from "react";
import { Globe, MessagesSquare, ShieldAlert, Users, Zap } from "lucide-react";
import { FALLBACK_SAMPLE_QUESTIONS, loadSampleQuestions, pickRandom } from "@/lib/sample-questions";
import { getProviderMeta } from "@/lib/provider-catalog";
import { BUILTIN_PERSONAS, makeCustomPersona } from "@/lib/personas";
import { PersonaPicker } from "@/components/PersonaPicker";
import { buildStartError } from "@/lib/start-validation";
import type { DebateRequest, DraftedPersona, Persona, ProviderId } from "@/lib/types";

const DEFAULT_PERSONA_IDS = ["optimist", "skeptic", "data-analyst", "pragmatist", "contrarian"];
const QUICK_PERSONA_IDS = ["optimist", "skeptic", "data-analyst"];


// Plain localStorage read/writes, not a parameterized-key hook: a hook whose
// internal useState is keyed by a *changing* string (e.g. per-provider) keeps
// the same state slot across renders, so a setter captured before a provider
// switch still points at the old provider's storage key. Reading and writing
// explicitly here avoids that stale-closure trap.
function readStored(key: string, fallback: string): string {
  if (typeof window === "undefined") return fallback;
  return window.localStorage.getItem(key) ?? fallback;
}

interface SetupFormProps {
  onStart: (request: DebateRequest) => void;
  onOpenSettings?: () => void;
}

export function SetupForm({ onStart, onOpenSettings }: SetupFormProps) {
  const [question, setQuestion] = useState("");
  const [visibleSamples, setVisibleSamples] = useState<string[]>(() =>
    pickRandom(FALLBACK_SAMPLE_QUESTIONS, 4)
  );
  useEffect(() => {
    let live = true;
    loadSampleQuestions()
      .then((questions) => {
        if (live) setVisibleSamples(questions);
      })
      .catch(() => {});
    return () => {
      live = false;
    };
  }, []);
  const [providerId] = useState<ProviderId>(() => readStored("debate-ai:provider", "anthropic") as ProviderId);
  const meta = getProviderMeta(providerId);

  const [apiKey] = useState(() => readStored(`debate-ai:apiKey:${providerId}`, ""));
  const [modelId, setModelIdState] = useState(() => readStored(`debate-ai:modelId:${providerId}`, meta.models[0].id));
  const [rounds, setRounds] = useState(2);
  const [enableWebSearch, setEnableWebSearch] = useState(false);
  const [crossExamine, setCrossExamine] = useState(false);
  const [redTeam, setRedTeam] = useState(false);
  const [autonomousResearch, setAutonomousResearch] = useState(false);
  const [guided, setGuided] = useState(
    () => typeof window !== "undefined" && window.localStorage.getItem("debate-ai:guided-seen") !== "1"
  );
  const [step, setStep] = useState(1);
  const show = (n: number) => !guided || step === n;

  function skipGuide() {
    window.localStorage.setItem("debate-ai:guided-seen", "1");
    setGuided(false);
  }
  const [personas, setPersonas] = useState<Persona[]>(() =>
    BUILTIN_PERSONAS.filter((p) => DEFAULT_PERSONA_IDS.includes(p.id))
  );

  const canStart = useMemo(
    () => question.trim().length >= 10 && apiKey.trim().length > 0 && modelId.trim().length > 0 && personas.length >= 2,
    [question, apiKey, modelId, personas]
  );
  const canDraft = question.trim().length >= 10 && apiKey.trim().length > 0 && modelId.trim().length > 0;
  const stepValid = step === 1 ? question.trim().length >= 10 : personas.length >= 2;
  // The Start button stays clickable: a blocked attempt explains itself in
  // red under the button instead of the button silently refusing clicks.
  // The message is derived live, so it updates (and clears) as the user
  // fixes each blocker.
  const [startAttempted, setStartAttempted] = useState(false);
  const startError = startAttempted
    ? buildStartError({
        question,
        hasApiKey: apiKey.trim().length > 0,
        providerLabel: meta.label,
        hasModel: modelId.trim().length > 0,
        personaCount: personas.length,
      })
    : null;

  const [drafts, setDrafts] = useState<DraftedPersona[]>([]);
  const [draftSelected, setDraftSelected] = useState<Set<number>>(new Set());
  const [drafting, setDrafting] = useState(false);
  const [draftError, setDraftError] = useState<string | null>(null);
  const [aiPicking, setAiPicking] = useState(false);

  async function handleAiPick() {
    if (!canDraft || aiPicking) return;
    setAiPicking(true);
    setDraftError(null);
    try {
      const res = await fetch("/api/pick-personas", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          question: question.trim(),
          provider: providerId,
          apiKey: apiKey.trim(),
          modelId: modelId.trim(),
        }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) throw new Error(data?.error ?? `Request failed (${res.status})`);
      const ids: string[] = Array.isArray(data?.personaIds) ? data.personaIds : [];
      const picked = BUILTIN_PERSONAS.filter((p) => ids.includes(p.id));
      if (picked.length < 2) throw new Error("The model did not return a usable panel — try again or pick manually.");
      setPersonas([...picked, ...personas.filter((p) => p.custom)]);
    } catch (err) {
      setDraftError(err instanceof Error ? err.message : "Could not pick a panel.");
    } finally {
      setAiPicking(false);
    }
  }

  async function handleDraft() {
    if (!canDraft || drafting) return;
    setDrafting(true);
    setDraftError(null);
    try {
      const res = await fetch("/api/draft-panel", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          question: question.trim(),
          provider: providerId,
          apiKey: apiKey.trim(),
          modelId: modelId.trim(),
        }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) throw new Error(data?.error ?? `Request failed (${res.status})`);
      const suggested: DraftedPersona[] = Array.isArray(data?.personas) ? data.personas : [];
      setDrafts(suggested);
      setDraftSelected(new Set(suggested.map((_, i) => i)));
    } catch (err) {
      setDraftError(err instanceof Error ? err.message : "Could not draft a panel.");
    } finally {
      setDrafting(false);
    }
  }

  function toggleDraft(index: number) {
    setDraftSelected((prev) => {
      const next = new Set(prev);
      if (next.has(index)) next.delete(index);
      else next.add(index);
      return next;
    });
  }

  // Recruited experts that are ticked but not yet added to the panel.
  // Starting the debate must include them: the separate "Add selected"
  // button is easy to miss, and a user who recruited experts and pressed
  // Start expects them in the room, not left behind in this preview list.
  function collectPendingDrafts(): DraftedPersona[] {
    const names = new Set(personas.map((p) => p.name.toLowerCase()));
    const pending: DraftedPersona[] = [];
    drafts.forEach((d, i) => {
      const key = d.name.toLowerCase();
      if (!draftSelected.has(i) || names.has(key)) return;
      names.add(key);
      pending.push(d);
    });
    return pending;
  }

  function addDraftsToPanel() {
    const added = collectPendingDrafts().map((d) => makeCustomPersona(d.name, d.lens, d.tagline));
    if (added.length > 0) setPersonas([...personas, ...added]);
    setDrafts([]);
    setDraftSelected(new Set());
  }

  function setModelId(next: string) {
    setModelIdState(next);
    window.localStorage.setItem(`debate-ai:modelId:${providerId}`, next);
  }

  function applyQuickMode() {
    setRounds(1);
    setCrossExamine(false);
    setRedTeam(false);
    setAutonomousResearch(false);
    setModelId(meta.quickModelId);
    window.localStorage.setItem(`debate-ai:modelId:${providerId}`, meta.quickModelId);
    setPersonas(BUILTIN_PERSONAS.filter((p) => QUICK_PERSONA_IDS.includes(p.id)));
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!canStart) {
      setStartAttempted(true);
      return;
    }
    setStartAttempted(false);
    window.localStorage.setItem("debate-ai:guided-seen", "1");
    // Recruited experts ticked in the preview join the debate even when the
    // user never pressed "Add selected to panel".
    const panel = [
      ...personas,
      ...collectPendingDrafts().map((d) => makeCustomPersona(d.name, d.lens, d.tagline)),
    ];
    onStart({
      question: question.trim(),
      provider: providerId,
      apiKey: apiKey.trim(),
      modelId: modelId.trim(),
      personas: panel,
      rounds,
      enableWebSearch: meta.webSearch === "native" ? enableWebSearch : false,
      crossExamine,
      redTeam,
      autonomousResearch,
      ...(readStored("debate-ai:moderatorModelId", "").trim().length > 0
        ? { moderatorModelId: readStored("debate-ai:moderatorModelId", "").trim() }
        : {}),
    });
  }

  // Panel size the next run will actually have, recruited experts included.
  const panelCount = personas.length + collectPendingDrafts().length;

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      {guided && (
        <div className="flex items-center justify-between">
          <p className="text-sm font-medium text-[var(--text-primary)]">
            Step {step} of 2: {step === 1 ? "Ask a question" : "Pick a panel"}
          </p>
          <button type="button" onClick={skipGuide} className="text-xs text-[var(--accent-fill)]">
            Skip guide
          </button>
        </div>
      )}
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-[var(--text-muted)]" role="status">
        <span>
          Using <span className="font-medium text-[var(--text-secondary)]">{meta.label}</span>
          <span className="font-mono"> · {modelId || "no model picked"}</span>
          {apiKey.trim().length === 0 && <span> · no API key yet</span>}
        </span>
        {onOpenSettings && (
          <button
            type="button"
            onClick={onOpenSettings}
            className="font-medium text-[var(--accent-fill)] hover:underline"
          >
            Change in Settings
          </button>
        )}
      </div>
      {show(1) && (
      <div className="space-y-2">
        <label htmlFor="question" className="text-sm font-medium text-[var(--text-primary)]">
          Question to debate
        </label>
        <textarea
          id="question"
          value={question}
          onChange={(e) => setQuestion(e.target.value)}
          placeholder="e.g. Will the Fed cut interest rates at its next meeting?"
          rows={3}
          maxLength={500}
          className="w-full resize-none rounded-lg border border-[var(--border-hairline)] bg-[var(--surface-1)] px-3 py-2.5 text-sm text-[var(--text-primary)] outline-none focus:border-[var(--accent-fill)]"
        />
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="text-xs text-[var(--text-muted)]">Try:</span>
          {visibleSamples.map((q) => (
            <button
              key={q}
              type="button"
              onClick={() => setQuestion(q)}
              className="max-w-full truncate rounded-full border border-[var(--border-hairline)] px-2.5 py-1 text-left text-xs text-[var(--text-secondary)] hover:bg-[var(--surface-1)]"
              title={q}
            >
              {q.length > 44 ? `${q.slice(0, 44).trimEnd()}…` : q}
            </button>
          ))}
        </div>
        <p className="text-xs text-[var(--text-muted)]">
          Frame it as a yes/no forecasting question for the clearest probability estimate.
        </p>
      </div>
      )}

      {!guided && (
      <>
      <div className="space-y-2">
        <label className="text-sm font-medium text-[var(--text-primary)]">Rounds</label>
        <div className="flex gap-1.5">
          {[1, 2, 3].map((r) => (
            <button
              key={r}
              type="button"
              onClick={() => setRounds(r)}
              className={`rounded-md border px-3 py-1.5 text-sm ${
                rounds === r
                  ? "border-[var(--accent-fill)] bg-[var(--accent-track)]/20 text-[var(--accent-fill)]"
                  : "border-[var(--border-hairline)] text-[var(--text-secondary)]"
              }`}
            >
              {r}
            </button>
          ))}
        </div>
      </div>

      <div className="space-y-2">
        <span className="text-sm font-medium text-[var(--text-primary)]">Extra rounds & presets</span>
        <button
          type="button"
          onClick={() => setCrossExamine((v) => !v)}
          aria-pressed={crossExamine}
          className={`flex w-full items-start gap-2.5 rounded-lg border px-3 py-2.5 text-left ${
            crossExamine ? "border-[var(--accent-fill)] bg-[var(--accent-track)]/20" : "border-[var(--border-hairline)]"
          }`}
        >
          <MessagesSquare size={16} className="mt-0.5 shrink-0 text-[var(--accent-fill)]" />
          <span>
            <span className="block text-sm font-medium text-[var(--text-primary)]">
              Direct rebuttals between personas
            </span>
            <span className="block text-xs text-[var(--text-muted)]">
              One extra round where each persona challenges another head-on. Uses about {panelCount} more
              model calls.
            </span>
          </span>
        </button>

        <button
          type="button"
          onClick={() => setRedTeam((v) => !v)}
          aria-pressed={redTeam}
          className={`flex w-full items-start gap-2.5 rounded-lg border px-3 py-2.5 text-left ${
            redTeam ? "border-[var(--accent-fill)] bg-[var(--accent-track)]/20" : "border-[var(--border-hairline)]"
          }`}
        >
          <ShieldAlert size={16} className="mt-0.5 shrink-0 text-[var(--accent-fill)]" />
          <span>
            <span className="block text-sm font-medium text-[var(--text-primary)]">Red-team round</span>
            <span className="block text-xs text-[var(--text-muted)]">
              The whole panel attacks the consensus at once in one extra round. Uses about {panelCount} more
              model calls.
            </span>
          </span>
        </button>

        <button
          type="button"
          onClick={() => setAutonomousResearch((v) => !v)}
          aria-pressed={autonomousResearch}
          className={`flex w-full items-start gap-2.5 rounded-lg border px-3 py-2.5 text-left ${
            autonomousResearch
              ? "border-[var(--accent-fill)] bg-[var(--accent-track)]/20"
              : "border-[var(--border-hairline)]"
          }`}
        >
          <Globe size={16} className="mt-0.5 shrink-0 text-[var(--accent-fill)]" />
          <span>
            <span className="block text-sm font-medium text-[var(--text-primary)]">
              Autonomous research round
            </span>
            <span className="block text-xs text-[var(--text-muted)]">
              The panel names its biggest knowledge gaps, researches them, and debates the findings. Uses about{" "}
              {panelCount + 1} more model calls. Works best with web search on.
            </span>
          </span>
        </button>

        <button
          type="button"
          onClick={applyQuickMode}
          className="flex w-full items-center gap-2 rounded-lg border border-dashed border-[var(--border-hairline)] px-3 py-2.5 text-left hover:bg-[var(--surface-1)]"
        >
          <Zap size={16} className="shrink-0 text-[var(--accent-fill)]" />
          <span>
            <span className="block text-sm font-medium text-[var(--text-primary)]">Quick debate</span>
            <span className="block text-xs text-[var(--text-muted)]">
              1 round, 3 personas, fast model — cheapest way to scout a question.
            </span>
          </span>
        </button>
      </div>

      <div className="space-y-2">
        <label className="text-sm font-medium text-[var(--text-primary)]">Research</label>
        {meta.webSearch === "native" && (
          <button
            type="button"
            onClick={() => setEnableWebSearch((v) => !v)}
            aria-pressed={enableWebSearch}
            className={`flex w-full items-start gap-2.5 rounded-lg border px-3 py-2.5 text-left ${
              enableWebSearch ? "border-[var(--accent-fill)] bg-[var(--accent-track)]/20" : "border-[var(--border-hairline)]"
            }`}
          >
            <Globe size={16} className="mt-0.5 shrink-0 text-[var(--accent-fill)]" />
            <span>
              <span className="block text-sm font-medium text-[var(--text-primary)]">Ground arguments in live web search</span>
              <span className="block text-xs text-[var(--text-muted)]">
                Personas can search the web for current facts instead of relying on memory alone. Slower and uses more tokens.
              </span>
            </span>
          </button>
        )}
        {meta.webSearch === "always" && (
          <div className="flex items-start gap-2.5 rounded-lg border border-[var(--border-hairline)] px-3 py-2.5">
            <Globe size={16} className="mt-0.5 shrink-0 text-[var(--text-muted)]" />
            <span className="text-xs text-[var(--text-muted)]">{meta.label} models search the web automatically for every answer — no toggle needed.</span>
          </div>
        )}
        {meta.webSearch === "none" && (
          <div className="flex items-start gap-2.5 rounded-lg border border-[var(--border-hairline)] px-3 py-2.5 opacity-60">
            <Globe size={16} className="mt-0.5 shrink-0 text-[var(--text-muted)]" />
            <span className="text-xs text-[var(--text-muted)]">Live web search isn&apos;t available for {meta.label} yet.</span>
          </div>
        )}
      </div>
      </>
      )}

      {show(2) && (
      <div className="space-y-2">
        <button
          type="button"
          onClick={handleDraft}
          disabled={!canDraft || drafting}
          className="flex w-full items-center gap-2.5 rounded-lg border border-[var(--border-hairline)] px-3 py-2.5 text-left disabled:opacity-40"
        >
          <Users size={16} className="mt-0.5 shrink-0 text-[var(--accent-fill)]" />
          <span>
            <span className="block text-sm font-medium text-[var(--text-primary)]">
              {drafting ? "Recruiting experts…" : "Draft a panel from the question"}
            </span>
            <span className="block text-xs text-[var(--text-muted)]">
              Recruits domain experts tailored to this question (engineers, analysts, strategists…). One extra
              model call.
            </span>
          </span>
        </button>
        {draftError && (
          <p className="text-xs text-[var(--status-critical)]" role="alert">
            {draftError}
          </p>
        )}
        {drafts.length > 0 && (
          <div className="space-y-2 rounded-lg border border-[var(--border-hairline)] p-3">
            {drafts.map((d, i) => {
              const isSelected = draftSelected.has(i);
              return (
                <button
                  key={`${d.name}-${i}`}
                  type="button"
                  onClick={() => toggleDraft(i)}
                  aria-pressed={isSelected}
                  className={`w-full rounded-lg border px-3 py-2.5 text-left transition-colors ${
                    isSelected
                      ? "border-[var(--accent-fill)] bg-[var(--accent-track)]/20"
                      : "border-[var(--border-hairline)] hover:bg-[var(--surface-1)]"
                  }`}
                >
                  <div className="text-sm font-medium text-[var(--text-primary)]">{d.name}</div>
                  <div className="text-xs text-[var(--text-secondary)]">{d.tagline}</div>
                </button>
              );
            })}
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={addDraftsToPanel}
                disabled={draftSelected.size === 0}
                className="rounded-md bg-[var(--accent-fill)] px-3 py-1.5 text-xs font-medium text-white disabled:opacity-40"
              >
                Add selected to panel
              </button>
              <button
                type="button"
                onClick={() => setDraftSelected(new Set(drafts.map((_, i) => i)))}
                className="rounded-md px-2 py-1.5 text-xs font-medium text-[var(--text-secondary)] hover:bg-[var(--surface-1)]"
              >
                Select all
              </button>
              <button
                type="button"
                onClick={() => setDraftSelected(new Set())}
                className="rounded-md px-2 py-1.5 text-xs font-medium text-[var(--text-secondary)] hover:bg-[var(--surface-1)]"
              >
                Select none
              </button>
            </div>
            <p className="text-xs text-[var(--text-muted)]">
              Ticked experts join the live debate when you press Start debate — adding them to the panel first is
              optional, and only needed if you want to rearrange or remove them below.
            </p>
          </div>
        )}
      </div>
      )}

      {show(2) && (
      <PersonaPicker
        selected={personas}
        onChange={setPersonas}
        onAiPick={handleAiPick}
        aiPicking={aiPicking}
        aiPickDisabled={!canDraft}
      />
      )}

      <p className="text-center text-xs text-[var(--text-muted)]">
        ~
        {panelCount * rounds +
          (crossExamine ? panelCount : 0) +
          (redTeam ? panelCount : 0) +
          (autonomousResearch ? panelCount + 1 : 0) +
          1}{" "}
        model calls this run ({panelCount} personas &times; {rounds} round{rounds > 1 ? "s" : ""}
        {crossExamine ? " + direct rebuttals" : ""}
        {redTeam ? " + red team" : ""}
        {autonomousResearch ? " + research round" : ""}, plus 1 for the report). More personas and rounds use more
        tokens and take longer — and personas in a round run concurrently (at most 5 at a time), so a big panel can
        also trip a provider&apos;s rate limit.
      </p>

      {guided ? (
        <>
        <div className="flex gap-2">
          {step > 1 && (
            <button
              type="button"
              onClick={() => setStep(step - 1)}
              className="rounded-lg border border-[var(--border-hairline)] px-4 py-3 text-sm font-medium text-[var(--text-secondary)]"
            >
              Back
            </button>
          )}
          {step < 2 ? (
            <button
              type="button"
              onClick={() => setStep(step + 1)}
              disabled={!stepValid}
              className="flex-1 rounded-lg bg-[var(--accent-fill)] px-4 py-3 text-sm font-semibold text-white transition-opacity disabled:opacity-40"
            >
              Continue
            </button>
          ) : (
            <button
              type="submit"
              className="flex-1 rounded-lg bg-[var(--accent-fill)] px-4 py-3 text-sm font-semibold text-white transition-opacity hover:bg-[var(--accent-fill-strong)]"
            >
              Start debate
            </button>
          )}
        </div>
        {step === 1 && !stepValid && (
          <p className="text-xs text-[var(--text-muted)]">Write a question (10+ characters) to continue.</p>
        )}
        </>
      ) : (
        <button
          type="submit"
          className="w-full rounded-lg bg-[var(--accent-fill)] px-4 py-3 text-sm font-semibold text-white transition-opacity hover:bg-[var(--accent-fill-strong)]"
        >
          Start debate
        </button>
      )}
      {startError && (
        <p role="alert" className="-mt-3 text-sm font-medium text-[var(--status-critical)]">
          {startError}
        </p>
      )}
    </form>
  );
}
