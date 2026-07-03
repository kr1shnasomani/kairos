import { API_BASE } from "./api";
import type { User } from "./types";

// Real auth against POST /auth/login (Supabase-backed). Tokens live in localStorage;
// client-side writes attach the access token via api.ts. Server reads use dev-bypass.

const TOKEN_KEY = "kairos-token";
const REFRESH_KEY = "kairos-refresh";

interface LoginResponse {
  access_token: string;
  refresh_token: string;
  token_type: string;
  user_id: string;
}

export async function login(email: string, password: string): Promise<void> {
  const res = await fetch(`${API_BASE}/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify({ email, password }),
  });
  if (!res.ok) throw new Error(res.status === 401 ? "Invalid email or password." : `Sign-in failed (${res.status}).`);
  const data = (await res.json()) as LoginResponse;
  try {
    localStorage.setItem(TOKEN_KEY, data.access_token);
    localStorage.setItem(REFRESH_KEY, data.refresh_token);
  } catch {
    /* storage unavailable — session-only */
  }
}

export async function getMe(): Promise<User | null> {
  const token = typeof window !== "undefined" ? localStorage.getItem(TOKEN_KEY) : null;
  if (!token) return null;
  try {
    const res = await fetch(`${API_BASE}/auth/me`, { headers: { Authorization: `Bearer ${token}` } });
    if (!res.ok) return null;
    return (await res.json()) as User;
  } catch {
    return null;
  }
}

export function logout(): void {
  try {
    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(REFRESH_KEY);
  } catch {
    /* no-op */
  }
}
