// Translates raw provider/SDK errors into plain language with a next step.
// Order matters: auth and quota problems are the most common dead ends.

export function friendlyErrorMessage(input: unknown): string {
  const raw = input instanceof Error ? input.message : typeof input === "string" ? input : "";
  const text = raw.toLowerCase();

  if (/401|403|unauthorized|forbidden|invalid[^.]*key|authentication|api key/.test(text)) {
    return "Your API key was rejected by the provider. Check it in Settings (gear icon, top left) — the Test button verifies a key instantly.";
  }
  if (/429|rate.?limit|too many requests/.test(text)) {
    return "Rate limited by the provider. Wait a minute, or retry with fewer personas and rounds.";
  }
  if (/insufficient|quota|billing|credit|payment/.test(text)) {
    return "That provider account is out of credits or quota. Top it up there, or switch providers in step 1.";
  }
  if (/404|not_found|model[^.]*not found/.test(text)) {
    return "That model wasn't found for your key. Pick a different model in step 1 or in Settings.";
  }
  if (/timeout|timed out|abort|deadline/.test(text)) {
    return "The provider took too long to respond. Try the fast & cheap model, or the Quick debate preset.";
  }
  if (/fetch failed|network|econnrefused|enotfound|socket|connection/.test(text)) {
    return "Couldn't reach the provider. Check your internet connection and try again.";
  }
  if (raw.trim().length === 0) {
    return "Something went wrong. Try again.";
  }
  return raw.length > 220 ? `${raw.slice(0, 220).trimEnd()}…` : raw;
}
