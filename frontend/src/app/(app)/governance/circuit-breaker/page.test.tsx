import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import CircuitBreakerPage from "./page";

const mocks = vi.hoisted(() => ({ getCircuitBreaker: vi.fn() }));

vi.mock("@/lib/api", () => ({ getCircuitBreaker: mocks.getCircuitBreaker }));

describe("CircuitBreakerPage", () => {
  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  it("presents asset-class safeguards as metric strip, ranked chart, and table", async () => {
    mocks.getCircuitBreaker.mockResolvedValue({ data: null, source: "live" });

    render(<CircuitBreakerPage />);

    await waitFor(() => expect(screen.getByText("Separator")).toBeInTheDocument());
    expect(screen.getByTestId("circuit-workspace")).toHaveClass("max-w-[1400px]");
    expect(screen.getByTestId("circuit-summary")).toHaveClass("lg:grid-cols-4");
    expect(screen.getByTestId("circuit-layout")).toHaveClass("lg:grid-cols-[minmax(0,1fr)_300px]");
    expect(screen.getByTestId("circuit-monitor")).toHaveTextContent("Valve");
    expect(screen.getByTestId("circuit-context")).toHaveTextContent("What triggers a halt?");
    // Halted classes are visually distinct (danger badges) and z-scores never render NaN.
    expect(screen.getAllByText("halted").length).toBeGreaterThanOrEqual(2);
    expect(screen.getByTestId("circuit-workspace")).not.toHaveTextContent("NaN");
    // Max z-score from the fixture, formatted via fmtNum.
    expect(screen.getAllByText("4.1σ").length).toBeGreaterThanOrEqual(1);
  });

  it("shows an error banner with retry when the fetcher rejects", async () => {
    mocks.getCircuitBreaker.mockRejectedValue(new Error("backend down"));

    render(<CircuitBreakerPage />);

    await waitFor(() => expect(screen.getByRole("button", { name: "Retry" })).toBeInTheDocument());
    expect(screen.getByTestId("circuit-workspace")).toHaveTextContent("Couldn’t load circuit-breaker state.");
  });
});
