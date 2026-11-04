import type { DebateReport } from "./types";

export interface SharedReport {
  question: string;
  report: DebateReport;
  provider?: string;
  modelId?: string;
}

function toBase64Url(json: string): string {
  const bytes = new TextEncoder().encode(json);
  let bin = "";
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function fromBase64Url(b64: string): string {
  let padded = b64.replace(/-/g, "+").replace(/_/g, "/");
  while (padded.length % 4) padded += "=";
  const bin = atob(padded);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return new TextDecoder().decode(bytes);
}

export function encodeShare(data: SharedReport): string {
  return `#r=${toBase64Url(JSON.stringify(data))}`;
}

export function decodeShare(hash: string): SharedReport | null {
  try {
    const match = hash.match(/^#r=([A-Za-z0-9\-_]+)$/);
    if (!match) return null;
    const data: unknown = JSON.parse(fromBase64Url(match[1]));
    if (
      typeof data !== "object" ||
      data === null ||
      typeof (data as SharedReport).question !== "string" ||
      typeof (data as SharedReport).report !== "object"
    ) {
      return null;
    }
    return data as SharedReport;
  } catch {
    return null;
  }
}
