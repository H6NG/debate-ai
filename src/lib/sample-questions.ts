// Sample questions come from live prediction-market questions (Polymarket's
// public feed), cached for 2 days. Hardcoded questions are only a last-resort
// fallback so the setup form never renders empty offline.

const CACHE_KEY = "debate-ai:sample-questions";
export const SAMPLE_REFRESH_MS = 48 * 60 * 60 * 1000; // refresh every 2 days

export const FALLBACK_SAMPLE_QUESTIONS = [
  "Will NVIDIA maintain its AI GPU market dominance through 2030?",
  "Will a major AI lab release a new frontier model before January 2027?",
  "Will the Fed cut interest rates at its December 2026 meeting?",
  "Will Bitcoin be above $120,000 on December 31, 2026?",
  "Will SpaceX complete another Starship flight before the end of 2026?",
  "Will the S&P 500 set a new all-time high before year-end 2026?",
  "Will fully autonomous taxi services operate in 3+ US cities by 2028?",
  "Will global EV sales exceed 50% of new car sales by 2030?",
];

interface CachedSamples {
  questions: string[];
  fetchedAt: number;
}

export function pickRandom<T>(items: readonly T[], n: number): T[] {
  const pool = [...items];
  for (let i = pool.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    const tmp = pool[i];
    pool[i] = pool[j];
    pool[j] = tmp;
  }
  return pool.slice(0, n);
}

function readCache(): CachedSamples | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(CACHE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as CachedSamples;
    if (!Array.isArray(parsed.questions) || typeof parsed.fetchedAt !== "number") return null;
    return parsed;
  } catch {
    return null;
  }
}

function writeCache(questions: string[], fetchedAt: number): void {
  try {
    window.localStorage.setItem(CACHE_KEY, JSON.stringify({ questions, fetchedAt } satisfies CachedSamples));
  } catch {
    /* storage full/blocked — samples just refetch next visit */
  }
}

interface GammaMarket {
  question?: string;
  endDate?: string;
}

// Horizon window: far enough out to be debatable, near enough to feel like news.
const MIN_LEAD_MS = 3 * 24 * 60 * 60 * 1000;
const MAX_LEAD_MS = 180 * 24 * 60 * 60 * 1000;

export async function loadSampleQuestions(now: number = Date.now()): Promise<string[]> {
  const cached = readCache();
  if (cached && cached.questions.length >= 4 && now - cached.fetchedAt < SAMPLE_REFRESH_MS) {
    return cached.questions;
  }

  try {
    const res = await fetch(
      "https://gamma-api.polymarket.com/markets?active=true&closed=false&order=volume24hr&ascending=false&limit=100",
      { headers: { Accept: "application/json" } }
    );
    if (!res.ok) throw new Error(`sample feed ${res.status}`);
    const data = (await res.json()) as GammaMarket[];
    const seen = new Set<string>();
    const pool: string[] = [];
    for (const market of data) {
      const q = (market.question ?? "").trim();
      if (!q.startsWith("Will ") || !q.endsWith("?") || q.length > 110) continue;
      const end = market.endDate ? Date.parse(market.endDate) : NaN;
      if (!Number.isFinite(end) || end - now < MIN_LEAD_MS || end - now > MAX_LEAD_MS) continue;
      if (seen.has(q)) continue;
      seen.add(q);
      pool.push(q);
    }
    if (pool.length < 4) throw new Error("not enough fresh markets");
    const questions = pickRandom(pool, 4);
    writeCache(questions, now);
    return questions;
  } catch {
    if (cached && cached.questions.length > 0) return cached.questions;
    return pickRandom(FALLBACK_SAMPLE_QUESTIONS, 4);
  }
}
