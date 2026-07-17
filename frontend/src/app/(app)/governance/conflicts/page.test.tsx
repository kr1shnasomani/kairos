import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { Conflict } from "@/lib/types";
import ConflictsPage from "./page";

const mocks = vi.hoisted(() => ({ getConflicts: vi.fn(), resolveConflict: vi.fn() }));

vi.mock("@/lib/api", () => ({
  getConflicts: mocks.getConflicts,
  resolveConflict: mocks.resolveConflict,
}));

function item(i: number, over: Partial<Conflict> = {}): Conflict {
  return {
    conflict_id: `CONF-${i}`, track: "administrative", asset_id: `P-${i}`,
    parameter: "operating_pressure", source_a: { value: "1" }, source_b: { value: "2" },
    authority_a: 1, authority_b: 2, severity: "major", status: "open",
    sla_due_at: null, is_overdue: false, created_at: "2026-07-01T00:00:00Z", ...over,
  };
}

function respond(items: Conflict[]) {
  mocks.getConflicts.mockResolvedValue({ data: { items, total: items.length, limit: 100, offset: 0 }, source: "live" });
}

describe("ConflictsPage", () => {
  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  it("paginates a 10k queue to at most 25 rendered rows with stat pills", async () => {
    respond(Array.from({ length: 10_000 }, (_, i) => item(i)));

    render(<ConflictsPage />);

    await waitFor(() => expect(screen.getByText("CONF-0")).toBeInTheDocument());
    expect(document.querySelectorAll("tbody tr").length).toBeLessThanOrEqual(25);
    expect(screen.getByText(/Showing 1–25 of 10000/)).toBeInTheDocument();
    expect(screen.getByTestId("conflicts-summary")).toHaveTextContent("Open");
  });

  it("resolves an administrative conflict optimistically and hides engineering resolve", async () => {
    mocks.resolveConflict.mockResolvedValue({});
    respond([item(1), item(2, { track: "engineering", status: "pending_moc" })]);

    render(<ConflictsPage />);

    await waitFor(() => expect(screen.getByText("CONF-1")).toBeInTheDocument());
    // Engineering row routes to MoC instead of exposing a resolve action.
    expect(screen.getByRole("link", { name: "MoC required →" })).toHaveAttribute("href", "/governance/moc");

    fireEvent.click(screen.getByRole("button", { name: "Resolve" }));
    await waitFor(() => expect(mocks.resolveConflict).toHaveBeenCalledWith("CONF-1", { decision: "accept_higher_authority" }));
    // Optimistic: still under the default "Open" tab the row drops out.
    await waitFor(() => expect(screen.queryByText("CONF-1")).not.toBeInTheDocument());
  });

  it("shows the tailored empty state and an error surface with retry", async () => {
    respond([]);
    render(<ConflictsPage />);
    await waitFor(() => expect(screen.getByText("No conflicts — knowledge is consistent ✓")).toBeInTheDocument());
    cleanup();

    mocks.getConflicts.mockRejectedValueOnce(new Error("offline"));
    respond([item(9)]);
    render(<ConflictsPage />);
    fireEvent.click(await screen.findByRole("button", { name: "Retry" }));
    await waitFor(() => expect(screen.getByText("CONF-9")).toBeInTheDocument());
  });
});
