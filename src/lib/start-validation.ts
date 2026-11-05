export interface StartValidationInput {
  question: string;
  hasApiKey: boolean;
  providerLabel: string;
  hasModel: boolean;
  personaCount: number;
}

// Why a debate cannot start yet, as one sentence for the red text under the
// Start button; null when it can start. A missing key names the default
// provider so the user knows which key to add.
export function buildStartError(input: StartValidationInput): string | null {
  const blockers: string[] = [];
  if (!input.hasApiKey) {
    blockers.push(`No API key for ${input.providerLabel} — add one in Settings`);
  }
  if (!input.hasModel) blockers.push("pick a model in Settings");
  if (input.question.trim().length < 10) blockers.push("write a question (10+ characters)");
  if (input.personaCount < 2) blockers.push("pick at least 2 personas");
  if (blockers.length === 0) return null;
  return `${blockers.join(" · ")}.`;
}
