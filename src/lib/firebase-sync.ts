import { deleteApp, getApps, initializeApp, type FirebaseApp } from "firebase/app";
import { getAuth, signInAnonymously } from "firebase/auth";
import { collection, deleteDoc, doc, getDocs, getFirestore, setDoc, type Firestore } from "firebase/firestore";
import type { HistoryEntry } from "./history";

export interface FirebaseConfig {
  apiKey: string;
  authDomain: string;
  projectId: string;
  [key: string]: unknown;
}

const CONFIG_KEY = "debate-ai:firebase";
const APP_NAME = "debate-ai-byo";

let app: FirebaseApp | null = null;
let db: Firestore | null = null;
let connectedProjectId: string | null = null;

export function loadFirebaseConfig(): FirebaseConfig | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(CONFIG_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<FirebaseConfig>;
    if (typeof parsed.apiKey !== "string" || typeof parsed.authDomain !== "string" || typeof parsed.projectId !== "string") {
      return null;
    }
    return parsed as FirebaseConfig;
  } catch {
    return null;
  }
}

export function saveFirebaseConfig(config: FirebaseConfig): void {
  window.localStorage.setItem(CONFIG_KEY, JSON.stringify(config));
}

export function clearFirebaseConfig(): void {
  window.localStorage.removeItem(CONFIG_KEY);
}

export function isCloudConfigured(): boolean {
  return loadFirebaseConfig() !== null;
}

export async function disconnectCloud(): Promise<void> {
  clearFirebaseConfig();
  if (app) {
    await deleteApp(app).catch(() => {});
    app = null;
    db = null;
    connectedProjectId = null;
  }
}

async function ensureConnection(config: FirebaseConfig): Promise<Firestore> {
  if (app && db && connectedProjectId === config.projectId) return db;
  if (app) {
    await deleteApp(app).catch(() => {});
    app = null;
    db = null;
    connectedProjectId = null;
  }
  const existing = getApps().find((a) => a.name === APP_NAME);
  if (existing) {
    await deleteApp(existing).catch(() => {});
  }
  try {
    app = initializeApp(
      { apiKey: config.apiKey, authDomain: config.authDomain, projectId: config.projectId },
      APP_NAME
    );
    await signInAnonymously(getAuth(app));
    db = getFirestore(app);
    connectedProjectId = config.projectId;
    return db;
  } catch (err) {
    app = null;
    db = null;
    throw new Error(friendlyError(err));
  }
}

export function friendlyError(err: unknown): string {
  const code = typeof err === "object" && err !== null && "code" in err ? String((err as { code: unknown }).code) : "";
  const message = err instanceof Error ? err.message : "";
  if (code.includes("api-key-not-valid") || code.includes("invalid-api-key")) {
    return "Firebase rejected the API key — check the pasted config.";
  }
  if (code.includes("auth/admin-restricted-operation") || code.includes("operation-not-allowed")) {
    return "Anonymous sign-in is disabled — enable the Anonymous provider under Authentication in your Firebase console.";
  }
  if (code.includes("permission-denied")) {
    return "Firestore rules rejected the request — paste the recommended rules (request.auth != null) in your console.";
  }
  if (code.includes("unavailable") || code.includes("failed-precondition")) {
    return "Couldn't reach Firestore — check the projectId and that a Firestore database exists.";
  }
  if (code.includes("not-found")) {
    return "Project not found — check the projectId in the pasted config.";
  }
  return message.length > 0 ? message : "Could not connect to Firebase.";
}

// Connects and proves read+write with a ping document. Resolves the
// projectId on success; throws a human-readable error otherwise.
export async function testFirebaseConnection(config: FirebaseConfig): Promise<string> {
  const firestore = await ensureConnection(config);
  try {
    const ping = doc(firestore, "_meta", "ping");
    await setDoc(ping, { at: new Date().toISOString() });
    await deleteDoc(ping);
    return config.projectId;
  } catch (err) {
    throw new Error(friendlyError(err));
  }
}

export async function pushHistoryEntry(entry: HistoryEntry): Promise<void> {
  const config = loadFirebaseConfig();
  if (!config) return;
  const firestore = await ensureConnection(config);
  await setDoc(doc(firestore, "history", entry.id), entry, { merge: true });
}

export async function pushHistory(entries: HistoryEntry[]): Promise<void> {
  if (!isCloudConfigured() || entries.length === 0) return;
  await Promise.allSettled(entries.map((e) => pushHistoryEntry(e)));
}

export async function deleteRemoteEntry(id: string): Promise<void> {
  const config = loadFirebaseConfig();
  if (!config) return;
  const firestore = await ensureConnection(config);
  await deleteDoc(doc(firestore, "history", id)).catch(() => {});
}

export async function pullHistory(): Promise<HistoryEntry[]> {
  const config = loadFirebaseConfig();
  if (!config) throw new Error("Cloud sync is not configured.");
  const firestore = await ensureConnection(config);
  const snap = await getDocs(collection(firestore, "history"));
  const entries: HistoryEntry[] = [];
  snap.forEach((d) => {
    const data = d.data() as HistoryEntry;
    if (data && typeof data.id === "string" && typeof data.question === "string") {
      entries.push(data);
    }
  });
  return entries;
}

// Union by id; the newer savedAt wins. Newest first, capped like local history.
export function mergeHistories(local: HistoryEntry[], remote: HistoryEntry[]): HistoryEntry[] {
  const byId = new Map<string, HistoryEntry>();
  for (const e of [...local, ...remote]) {
    const existing = byId.get(e.id);
    if (!existing || e.savedAt > existing.savedAt) byId.set(e.id, e);
  }
  return [...byId.values()].sort((a, b) => (a.savedAt < b.savedAt ? 1 : -1)).slice(0, 20);
}
