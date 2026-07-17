import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { AssetSummary } from "@/lib/types";
import AssetsPage from "./page";
import AssetsError from "./error";

const mocks = vi.hoisted(() => ({ getAssets: vi.fn(), push: vi.fn() }));

vi.mock("@/lib/api", () => ({ getAssets: mocks.getAssets }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: mocks.push }) }));

function asset(i: number, over: Partial<AssetSummary> = {}): AssetSummary {
  return {
    asset_id: `A-${i}`, name: `Asset ${i}`, equipment_class: "Rotating equipment",
    criticality: "critical", site_id: "SITE-A", ...over,
  };
}

function respond(items: AssetSummary[]) {
  mocks.getAssets.mockResolvedValue({ data: { items, total: items.length, limit: 100, offset: 0 }, source: "live" });
}

describe("AssetsPage", () => {
  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  it("paginates a 10k registry to at most 25 rendered rows with class pills", async () => {
    respond(Array.from({ length: 10_000 }, (_, i) => asset(i)));

    render(await AssetsPage());

    expect(document.querySelectorAll("tbody tr").length).toBeLessThanOrEqual(25);
    expect(screen.getByText(/Showing 1–25 of 10000/)).toBeInTheDocument();
    expect(screen.getByTestId("assets-summary")).toHaveTextContent("Rotating equipment");
  });

  it("filters the registry and routes row clicks to the asset detail", async () => {
    respond([
      asset(1, { asset_id: "P-101", name: "Feed pump", criticality: "safety_critical" }),
      asset(2, { asset_id: "V-247", name: "Isolation valve", equipment_class: "Valve" }),
    ]);

    render(await AssetsPage());

    fireEvent.change(screen.getByRole("searchbox", { name: "Search assets" }), { target: { value: "valve" } });
    await waitFor(() => expect(screen.queryByText("Feed pump")).not.toBeInTheDocument());
    expect(screen.getByText("Isolation valve")).toBeInTheDocument();
    expect(screen.getByText("1 of 2 assets")).toBeInTheDocument();

    fireEvent.click(screen.getByText("Isolation valve").closest("tr")!);
    expect(mocks.push).toHaveBeenCalledWith("/assets/V-247");
  });

  it("shows the tailored empty state and a route error surface with retry", async () => {
    respond([]);
    render(await AssetsPage());
    expect(screen.getByText("No assets bootstrapped")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Bootstrap assets" })).toHaveAttribute("href", "/assets/bootstrap");
    cleanup();

    const reset = vi.fn();
    render(<AssetsError error={new Error("boom")} reset={reset} />);
    fireEvent.click(screen.getByRole("button", { name: "Retry" }));
    expect(reset).toHaveBeenCalled();
  });
});
