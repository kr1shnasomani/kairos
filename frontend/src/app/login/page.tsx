"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { ThemeToggle } from "@/components/theme-toggle";
import { login } from "@/lib/auth";
import { getToken } from "@/lib/api";

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  // Already signed in → skip the login page.
  useEffect(() => {
    if (getToken()) router.replace("/briefs");
  }, [router]);

  // Real login → POST /auth/login (Supabase). Stores tokens, then routes in.
  async function signIn(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      await login(email, password);
      router.push("/briefs");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Sign-in failed.");
      setBusy(false);
    }
  }

  return (
    <main className="grid min-h-dvh place-items-center px-5">
      <div className="absolute right-5 top-5">
        <ThemeToggle />
      </div>

      <div className="w-full max-w-sm">
        <div className="flex flex-col items-center text-center">
          <span className="grid size-12 place-items-center rounded-xl bg-accent" aria-hidden="true">
            <svg width="26" height="26" viewBox="0 0 26 26" fill="none">
              <path d="M4 15.5 L9 20 L22 5" stroke="var(--on-accent)" strokeWidth="3.4" strokeLinecap="square" />
              <path d="M13 20 L18.5 8 L21.5 20 Z" fill="var(--on-accent)" />
            </svg>
          </span>
          <h1 className="mt-4 text-display font-semibold">Sign in to Kairos</h1>
          <p className="mt-1.5 text-body text-muted">The right knowledge, at the moment of action.</p>
        </div>

        <form onSubmit={signIn} className="mt-7 flex flex-col gap-3">
          <label className="flex flex-col gap-1.5">
            <span className="text-caption font-medium text-muted">Email</span>
            <input
              type="email"
              name="email"
              autoComplete="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="engineer@kairos.local"
              className="h-11 rounded-lg border border-line bg-surface px-3.5 text-sm outline-none focus-visible:border-accent focus-visible:outline-2 focus-visible:outline-offset-0 focus-visible:outline-accent"
            />
          </label>
          <label className="flex flex-col gap-1.5">
            <span className="text-caption font-medium text-muted">Password</span>
            <input
              type="password"
              name="password"
              autoComplete="current-password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
              className="h-11 rounded-lg border border-line bg-surface px-3.5 text-sm outline-none focus-visible:border-accent focus-visible:outline-2 focus-visible:outline-offset-0 focus-visible:outline-accent"
            />
          </label>
          {error && (
            <p className="rounded-lg border border-[color-mix(in_srgb,var(--danger)_35%,var(--line))] bg-[color-mix(in_srgb,var(--danger)_8%,var(--surface))] px-3 py-2 text-caption text-danger">
              {error}
            </p>
          )}
          <button type="submit" disabled={busy}
            className="mt-1 h-11 rounded-lg bg-ink text-sm font-semibold text-canvas transition-opacity hover:opacity-90 disabled:opacity-60">
            {busy ? "Signing in…" : "Sign in"}
          </button>
        </form>

        <p className="mt-5 text-center text-label text-muted">
          Seeded users: admin · engineer · field_worker.
        </p>
      </div>
    </main>
  );
}
