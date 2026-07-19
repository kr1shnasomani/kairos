"use client";

import { useEffect, useState } from "react";
import type { Fetched } from "@/lib/api";

// Client-side wrapper over the existing api.ts fetchers ({ data, source }
// envelope). api.ts is frozen — this hook only consumes it.

export type FetchState<T> =
  | { status: "loading" }
  | { status: "live"; data: T }
  | { status: "demo"; data: T }
  | { status: "error"; error: Error; retry: () => void };

/** Drives a `Fetched<T>` fetcher through loading → live/demo/error. `retry`
 *  re-runs the fetcher; a generation counter ignores out-of-date resolutions
 *  (StrictMode double-invoke, rapid dep changes). */
export function useFetch<T>(fn: () => Promise<Fetched<T>>, deps: React.DependencyList = []): FetchState<T> {
  const [state, setState] = useState<FetchState<T>>({ status: "loading" });
  const [generation, setGeneration] = useState(0);

  useEffect(() => {
    let stale = false;
    const load = async () => {
      setState({ status: "loading" });
      try {
        const { data, source } = await fn();
        if (!stale) {
          // Live-only policy: a "demo" result means the real fetch fell back to a
          // fixture — we never render fabricated data. Treat it as a retryable
          // failure so the page shows its error+retry state instead. (Pages keep
          // their now-unreachable "demo" branches; harmless dead code.)
          if (source === "live") {
            setState({ status: "live", data });
          } else {
            setState({
              status: "error",
              error: new Error("Live data is unavailable — the backend did not respond in time."),
              retry: () => setGeneration((g) => g + 1),
            });
          }
        }
      } catch (e) {
        if (!stale) {
          setState({
            status: "error",
            error: e instanceof Error ? e : new Error(String(e)),
            retry: () => setGeneration((g) => g + 1),
          });
        }
      }
    };
    void load();
    return () => {
      stale = true;
    };
    // `fn` is intentionally excluded: callers pass inline closures; `deps` is
    // the caller-declared dependency list (useEffect semantics).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [generation, ...deps]);

  return state;
}
