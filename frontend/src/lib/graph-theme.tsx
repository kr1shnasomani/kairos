"use client";

// Shared color/marker helpers for the three ReactFlow canvases (knowledge-graph,
// blast-radius-panel, documents/[id]/topology). Canvas nodes/edges take concrete
// color strings, not CSS custom properties — ReactFlow's SVG/canvas layer doesn't
// live-track `var(--x)` the way DOM elements do. This resolves the Paper theme's
// tokens once per provider (not once per node) and re-resolves on theme/contrast
// toggle via a single shared MutationObserver.
import { createContext, useContext, useLayoutEffect, useState, type ReactNode } from "react";
import { MarkerType } from "@xyflow/react";

const TOKEN_NAMES = ["--accent", "--danger", "--caution", "--verified", "--info", "--muted", "--line"] as const;
export type CanvasTokenName = (typeof TOKEN_NAMES)[number];
export type CanvasTokens = Record<CanvasTokenName, string>;

const FALLBACK_TOKENS: CanvasTokens = {
  "--accent": "#e8501f",
  "--danger": "#d92d20",
  "--caution": "#f5a623",
  "--verified": "#2e7d46",
  "--info": "#2563eb",
  "--muted": "#6e6a62",
  "--line": "#e6e1d6",
};

function readTokens(): CanvasTokens {
  const style = getComputedStyle(document.documentElement);
  const out = { ...FALLBACK_TOKENS };
  for (const name of TOKEN_NAMES) {
    const v = style.getPropertyValue(name).trim();
    if (v) out[name] = v;
  }
  return out;
}

const CanvasTokensContext = createContext<CanvasTokens | null>(null);

export function CanvasTokensProvider({ children }: { children: ReactNode }) {
  const [tokens, setTokens] = useState<CanvasTokens>(FALLBACK_TOKENS);
  useLayoutEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- mount-once sync of computed CSS token values, an external system
    setTokens(readTokens());
    const observer = new MutationObserver(() => setTokens(readTokens()));
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme", "data-contrast"] });
    return () => observer.disconnect();
  }, []);
  return (
    <CanvasTokensContext.Provider value={tokens}>{children}</CanvasTokensContext.Provider>
  );
}

/** Concrete color strings for the current theme, for canvas (ReactFlow/SVG) consumers. */
export function useCanvasTokens(): CanvasTokens {
  return useContext(CanvasTokensContext) ?? FALLBACK_TOKENS;
}

export function arrowMarker(color: string, size = 14) {
  return { type: MarkerType.ArrowClosed, width: size, height: size, color } as const;
}
