"use client";

import { useEffect, useState } from "react";

type Theme = "light" | "dark";

/** Flips the single Kairos UI between its light and dark palettes. */
export function ThemeToggle({ className = "" }: { className?: string }) {
  const [theme, setTheme] = useState<Theme>("light");

  useEffect(() => {
    // Mount-once sync of the pre-hydration <html data-theme> into React state.
    const current = document.documentElement.getAttribute("data-theme");
    // eslint-disable-next-line react-hooks/set-state-in-effect -- reading external DOM state on mount is what effects are for
    if (current === "dark" || current === "light") setTheme(current);
  }, []);

  function toggle() {
    const next: Theme = theme === "dark" ? "light" : "dark";
    setTheme(next);
    document.documentElement.setAttribute("data-theme", next);
    try { localStorage.setItem("kairos-theme", next); } catch { /* no-op */ }
  }

  const isDark = theme === "dark";

  return (
    <button
      type="button"
      onClick={toggle}
      role="switch"
      aria-checked={isDark}
      aria-label={`Switch to ${isDark ? "light" : "dark"} mode`}
      title={`Switch to ${isDark ? "light" : "dark"} mode`}
      className={`grid size-8 place-items-center rounded-lg text-muted transition-colors hover:bg-surface-2 hover:text-ink ${className}`}
    >
      {isDark ? (
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <circle cx="12" cy="12" r="4" />
          <path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" />
        </svg>
      ) : (
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z" />
        </svg>
      )}
    </button>
  );
}

/** Sunlight / high-contrast toggle — third palette for outdoor legibility. */
export function ContrastToggle({ className = "" }: { className?: string }) {
  const [high, setHigh] = useState(false);

  useEffect(() => {
    // Mount-once sync of the pre-hydration <html data-contrast> into React state.
    // eslint-disable-next-line react-hooks/set-state-in-effect -- reading external DOM state on mount is what effects are for
    setHigh(document.documentElement.getAttribute("data-contrast") === "high");
  }, []);

  function toggle() {
    const next = !high;
    setHigh(next);
    if (next) {
      document.documentElement.setAttribute("data-contrast", "high");
    } else {
      document.documentElement.removeAttribute("data-contrast");
    }
    try { localStorage.setItem("kairos-contrast", next ? "high" : ""); } catch { /* no-op */ }
  }

  return (
    <button
      type="button"
      onClick={toggle}
      role="switch"
      aria-checked={high}
      aria-label={high ? "Disable sunlight mode" : "Enable sunlight mode"}
      title={high ? "Disable sunlight mode" : "Sunlight / high-contrast mode"}
      className={`grid size-8 place-items-center rounded-lg text-muted transition-colors hover:bg-surface-2 ${high ? "text-caution" : "hover:text-ink"} ${className}`}
    >
      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <circle cx="12" cy="12" r="5" />
        <path d="M12 1v2M12 21v2M4.2 4.2l1.4 1.4M18.4 18.4l1.4 1.4M1 12h2M21 12h2M4.2 19.8l1.4-1.4M18.4 5.6l1.4-1.4" />
      </svg>
    </button>
  );
}
