"use client";

import { useState } from "react";
import { Plus, X } from "lucide-react";
import { BUILTIN_PERSONAS, makeCustomPersona } from "@/lib/personas";
import type { Persona } from "@/lib/types";

const MIN_PERSONAS = 2;

interface PersonaPickerProps {
  selected: Persona[];
  onChange: (personas: Persona[]) => void;
  onAiPick?: () => void;
  aiPicking?: boolean;
  aiPickDisabled?: boolean;
}

export function PersonaPicker({ selected, onChange, onAiPick, aiPicking, aiPickDisabled }: PersonaPickerProps) {
  const [customOpen, setCustomOpen] = useState(false);
  const [customName, setCustomName] = useState("");
  const [customLens, setCustomLens] = useState("");

  const customPersonas = selected.filter((p) => p.custom);
  const selectedIds = new Set(selected.map((p) => p.id));

  function toggle(persona: Persona) {
    const isSelected = selectedIds.has(persona.id);
    if (isSelected) {
      if (selected.length <= MIN_PERSONAS) return;
      onChange(selected.filter((p) => p.id !== persona.id));
    } else {
      onChange([...selected, persona]);
    }
  }

  function removeCustom(id: string) {
    onChange(selected.filter((p) => p.id !== id));
  }

  function addCustom() {
    if (!customName.trim() || !customLens.trim()) return;
    const persona = makeCustomPersona(customName.trim(), customLens.trim());
    onChange([...selected, persona]);
    setCustomName("");
    setCustomLens("");
    setCustomOpen(false);
  }

  function selectAll() {
    onChange([...BUILTIN_PERSONAS, ...selected.filter((p) => p.custom)]);
  }

  function clearAll() {
    onChange(selected.slice(0, MIN_PERSONAS));
  }

  return (
    <div className="space-y-3">
      <div className="flex items-baseline justify-between">
        <label className="text-sm font-medium text-[var(--text-primary)]">Debate panel</label>
        <span className="text-xs text-[var(--text-muted)]">{selected.length} selected &middot; minimum {MIN_PERSONAS}</span>
      </div>
      <div className="flex gap-2">
        <button
          type="button"
          onClick={selectAll}
          className="rounded-md border border-[var(--border-hairline)] px-2.5 py-1 text-xs text-[var(--text-secondary)] hover:bg-[var(--surface-1)]"
        >
          Select all
        </button>
        {onAiPick && (
          <button
            type="button"
            onClick={onAiPick}
            disabled={aiPickDisabled || aiPicking}
            className="rounded-md border border-[var(--accent-fill)] px-2.5 py-1 text-xs font-medium text-[var(--accent-fill)] disabled:opacity-40"
          >
            {aiPicking ? "AI picking…" : "AI pick"}
          </button>
        )}
        <button
          type="button"
          onClick={clearAll}
          disabled={selected.length <= MIN_PERSONAS}
          className="rounded-md border border-[var(--border-hairline)] px-2.5 py-1 text-xs text-[var(--text-secondary)] hover:bg-[var(--surface-1)] disabled:opacity-40"
        >
          Clear
        </button>
      </div>

      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
        {BUILTIN_PERSONAS.map((persona) => {
          const isSelected = selectedIds.has(persona.id);
          return (
            <button
              key={persona.id}
              type="button"
              onClick={() => toggle(persona)}
              aria-pressed={isSelected}
              className={`rounded-lg border px-3 py-2.5 text-left transition-colors ${
                isSelected
                  ? "border-[var(--accent-fill)] bg-[var(--accent-track)]/20"
                  : "border-[var(--border-hairline)] hover:bg-[var(--surface-1)]"
              }`}
            >
              <div className="text-sm font-medium text-[var(--text-primary)]">{persona.name}</div>
              <div className="text-xs text-[var(--text-secondary)]">{persona.tagline}</div>
            </button>
          );
        })}

        {customPersonas.map((persona) => (
          <div
            key={persona.id}
            className="flex items-start justify-between gap-2 rounded-lg border border-[var(--accent-fill)] bg-[var(--accent-track)]/20 px-3 py-2.5 text-left"
          >
            <div>
              <div className="text-sm font-medium text-[var(--text-primary)]">{persona.name}</div>
              <div className="text-xs text-[var(--text-secondary)] line-clamp-2">{persona.lens}</div>
            </div>
            <button
              type="button"
              onClick={() => removeCustom(persona.id)}
              aria-label={`Remove ${persona.name}`}
              className="shrink-0 text-[var(--text-muted)] hover:text-[var(--text-primary)]"
            >
              <X size={14} />
            </button>
          </div>
        ))}
      </div>

      {customOpen ? (
        <div className="space-y-2 rounded-lg border border-[var(--border-hairline)] p-3">
          <input
            value={customName}
            onChange={(e) => setCustomName(e.target.value)}
            placeholder="Persona name, e.g. The Regulator"
            maxLength={60}
            className="w-full rounded-md border border-[var(--border-hairline)] bg-[var(--surface-1)] px-2.5 py-1.5 text-sm text-[var(--text-primary)] outline-none focus:border-[var(--accent-fill)]"
          />
          <textarea
            value={customLens}
            onChange={(e) => setCustomLens(e.target.value)}
            placeholder="How should this persona reason? e.g. 'You focus on legal and regulatory constraints...'"
            maxLength={500}
            rows={2}
            className="w-full resize-none rounded-md border border-[var(--border-hairline)] bg-[var(--surface-1)] px-2.5 py-1.5 text-sm text-[var(--text-primary)] outline-none focus:border-[var(--accent-fill)]"
          />
          <div className="flex gap-2">
            <button
              type="button"
              onClick={addCustom}
              disabled={!customName.trim() || !customLens.trim()}
              className="rounded-md bg-[var(--accent-fill)] px-3 py-1.5 text-xs font-medium text-white disabled:opacity-40"
            >
              Add persona
            </button>
            <button
              type="button"
              onClick={() => setCustomOpen(false)}
              className="rounded-md px-3 py-1.5 text-xs font-medium text-[var(--text-secondary)] hover:bg-[var(--surface-1)]"
            >
              Cancel
            </button>
          </div>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => setCustomOpen(true)}
          className="flex items-center gap-1.5 text-xs font-medium text-[var(--accent-fill)] disabled:opacity-40"
        >
          <Plus size={14} /> Add a custom persona
        </button>
      )}
    </div>
  );
}
