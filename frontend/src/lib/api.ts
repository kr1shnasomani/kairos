import type { Brief, BriefsResponse } from "./types";
import { fixtureBriefs } from "./fixtures";

// Live in dev mode: no Authorization header → backend treats the caller as
// dev-user / engineer (docs/API.md §Auth). When the backend is unreachable we
// fall back to fixtures so the UI is always demoable.

export const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";

const TOKEN_KEY = "kairos-token";

/** Client-side bearer token (set at login). Server reads use the dev-mode bypass. */
export function getToken(): string | null {
  if (typeof window === "undefined") return null;
  try {
    return localStorage.getItem(TOKEN_KEY);
  } catch {
    return null;
  }
}

/** Authenticated write from the browser. Returns parsed JSON or throws on non-2xx. */
export async function postJson<T>(path: string, body: unknown): Promise<T> {
  const token = getToken();
  const res = await fetch(`${API_BASE}${path}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`${path} → HTTP ${res.status}`);
  return (await res.json()) as T;
}

export function ackBrief(briefId: string, body: { signature?: string; notes?: string }) {
  return postJson<{ ack_status: string }>(`/briefs/${briefId}/ack`, { user_id: "dev-user", ...body });
}

export function sendBriefFeedback(briefId: string, rating: string, notes?: string) {
  return postJson<{ feedback_recorded: boolean }>(`/briefs/${briefId}/feedback`, { rating, notes });
}

export type DataSource = "live" | "demo";

export interface Fetched<T> {
  data: T;
  source: DataSource;
}

async function getJson<T>(path: string): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    cache: "no-store",
    headers: { Accept: "application/json" },
    // fail fast so a down backend falls back to fixtures quickly
    signal: AbortSignal.timeout(4000),
  });
  if (!res.ok) throw new Error(`${path} → HTTP ${res.status}`);
  return (await res.json()) as T;
}

export async function getBriefs(): Promise<Fetched<BriefsResponse>> {
  try {
    const data = await getJson<BriefsResponse>("/briefs/?unacknowledged_only=false&limit=20");
    // Governor suppression / empty backend → show the curated story instead of a blank inbox.
    if (!data.briefs || data.briefs.length === 0) return { data: fixtureBriefs, source: "demo" };
    return { data, source: "live" };
  } catch {
    return { data: fixtureBriefs, source: "demo" };
  }
}

export async function getBrief(briefId: string): Promise<Fetched<Brief | null>> {
  try {
    const data = await getJson<Brief>(`/briefs/${briefId}`);
    return { data, source: "live" };
  } catch {
    const found = fixtureBriefs.briefs.find((b) => b.brief_id === briefId) ?? null;
    return { data: found, source: "demo" };
  }
}
