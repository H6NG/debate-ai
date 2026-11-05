"use client";

import { useState } from "react";
import { Monitor, Moon, Sun } from "lucide-react";

type Theme = "auto" | "light" | "dark";

const STORAGE_KEY = "debate-ai:theme";

function readTheme(): Theme {
  if (typeof window === "undefined") return "auto";
  const stored = window.localStorage.getItem(STORAGE_KEY);
  return stored === "light" || stored === "dark" ? stored : "auto";
}

const ORDER: Theme[] = ["auto", "light", "dark"];

export function ThemeToggle() {
  const [theme, setTheme] = useState<Theme>(() => readTheme());

  function cycle() {
    const next = ORDER[(ORDER.indexOf(theme) + 1) % ORDER.length];
    setTheme(next);
    if (next === "auto") {
      document.documentElement.removeAttribute("data-theme");
      window.localStorage.removeItem(STORAGE_KEY);
    } else {
      document.documentElement.dataset.theme = next;
      window.localStorage.setItem(STORAGE_KEY, next);
    }
  }

  return (
    <button
      type="button"
      onClick={cycle}
      aria-label={`Theme: ${theme}. Activate to change.`}
      className="flex h-10 shrink-0 items-center gap-1.5 rounded-lg border border-[var(--border-hairline)] px-2.5 text-xs text-[var(--text-secondary)] transition-colors hover:bg-[var(--surface-1)]"
    >
      {theme === "light" ? <Sun size={13} /> : theme === "dark" ? <Moon size={13} /> : <Monitor size={13} />}
      {theme === "auto" ? "Auto" : theme === "light" ? "Light" : "Dark"}
    </button>
  );
}
