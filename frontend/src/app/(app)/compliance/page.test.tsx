import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { complianceFixture } from "@/lib/compliance";
import CompliancePage from "./page";

vi.mock("@/lib/api", () => ({
  getComplianceGaps: vi.fn().mockResolvedValue({ data: complianceFixture, source: "live" }),
  getComplianceDashboard: vi.fn().mockResolvedValue({
    data: {
      total_gaps: { critical: 3, major: 3, minor: 2 },
      by_framework: { OISD_117: { critical: 2, major: 2 }, ISO_45001: { critical: 1, major: 1, minor: 2 } },
      by_asset_class: {},
      last_updated: "2026-07-14T00:00:00Z",
    },
    source: "live",
  }),
}));

// jsdom has no matchMedia; useReducedMotion (charts) needs it.
window.matchMedia = ((query: string) => ({
  matches: false, media: query, addEventListener: () => {}, removeEventListener: () => {},
})) as unknown as typeof window.matchMedia;

describe("CompliancePage", () => {
  afterEach(cleanup);

  it("renders KPIs, charts, gap table, and workflow link cards", async () => {
    render(<CompliancePage />);

    // Table row lands after fetch resolves.
    await screen.findByText("Relief-device set pressure documented and current");

    expect(screen.getByTestId("compliance-kpis")).toBeInTheDocument();
    expect(screen.getByText("Gaps by framework")).toBeInTheDocument();
    expect(screen.getByText("Severity mix")).toBeInTheDocument();

    // Nullable remediation cells render an em dash, never "undefined".
    expect(screen.getAllByText("—").length).toBeGreaterThan(0);

    expect(screen.getByRole("link", { name: /Assemble audit pack/ })).toHaveAttribute("href", "/compliance/audit-pack");
    expect(screen.getByRole("link", { name: /Non-conformance register/ })).toHaveAttribute("href", "/compliance/nonconformance");
  });

  it("filters the gap register by severity", async () => {
    render(<CompliancePage />);
    await screen.findByText("Relief-device set pressure documented and current");

    fireEvent.click(screen.getByRole("button", { name: /Minor/ }));
    await waitFor(() =>
      expect(screen.queryByText("Relief-device set pressure documented and current")).not.toBeInTheDocument(),
    );
    expect(screen.getByText("Documented information controlled and versioned")).toBeInTheDocument();
  });
});
