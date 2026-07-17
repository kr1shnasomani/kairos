import { act, renderHook, waitFor } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import type { Fetched } from "@/lib/api";
import { useFetch } from "./use-fetch";

describe("useFetch state transitions", () => {
  it("starts loading, resolves live source to 'live'", async () => {
    const fn = () => Promise.resolve<Fetched<number>>({ data: 42, source: "live" });
    const { result } = renderHook(() => useFetch(fn));

    expect(result.current.status).toBe("loading");
    await waitFor(() => expect(result.current.status).toBe("live"));
    if (result.current.status !== "live") throw new Error("unreachable");
    expect(result.current.data).toBe(42);
  });

  it("maps demo source to 'demo'", async () => {
    const fn = () => Promise.resolve<Fetched<string>>({ data: "fixture", source: "demo" });
    const { result } = renderHook(() => useFetch(fn));

    await waitFor(() => expect(result.current.status).toBe("demo"));
    if (result.current.status !== "demo") throw new Error("unreachable");
    expect(result.current.data).toBe("fixture");
  });

  it("catches a throw as 'error'; retry re-runs the fetcher", async () => {
    let calls = 0;
    const fn = (): Promise<Fetched<string>> => {
      calls += 1;
      return calls === 1 ? Promise.reject(new Error("boom")) : Promise.resolve({ data: "ok", source: "live" });
    };
    const { result } = renderHook(() => useFetch(fn));

    await waitFor(() => expect(result.current.status).toBe("error"));
    const state = result.current;
    if (state.status !== "error") throw new Error("unreachable");
    expect(state.error.message).toBe("boom");

    act(() => state.retry());
    await waitFor(() => expect(result.current.status).toBe("live"));
    expect(calls).toBe(2);
  });
});
