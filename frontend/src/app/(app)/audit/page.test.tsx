import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { AuditLogEntry } from "@/lib/types";
import AuditPage from "./page";

const mocks = vi.hoisted(() => ({ getAuditLog: vi.fn() }));

vi.mock("@/lib/api", () => ({ getAuditLog: mocks.getAuditLog }));

function entry(i: number, over: Partial<AuditLogEntry> = {}): AuditLogEntry {
  return {
    log_id: `AL-${i}`, entity_type: "document", entity_id: `DOC-${i}`, action: "quarantine_promoted",
    performed_by: "engineer_kiran", timestamp: "2026-07-14T10:00:00.000Z", ...over,
  };
}

function respond(items: AuditLogEntry[]) {
  mocks.getAuditLog.mockResolvedValue({ data: { items, total: items.length }, source: "live" });
}

describe("AuditPage", () => {
  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  it("paginates a 10k trail to at most 25 rendered rows", async () => {
    respond(Array.from({ length: 10_000 }, (_, i) => entry(i)));

    render(<AuditPage />);

    await waitFor(() => expect(screen.getByText("AL-0")).toBeInTheDocument());
    expect(document.querySelectorAll("tbody tr").length).toBeLessThanOrEqual(25);
    expect(screen.getByText(/Showing 1–25 of 10000/)).toBeInTheDocument();
  });

  it("filters by entity type, exposes metadata via native disclosure, and exports JSON", async () => {
    respond([
      entry(1, { metadata: { authority_level: 2 } }),
      entry(2, { entity_type: "brief", entity_id: "BRIEF-1", action: "brief_acknowledged" }),
      entry(3, { entity_type: "asset", entity_id: "P-101", action: "sla_escalated", performed_by: "system" }),
    ]);

    render(<AuditPage />);

    await waitFor(() => expect(screen.getByText("AL-1")).toBeInTheDocument());
    expect(screen.getByTestId("audit-summary")).toHaveTextContent("Records");
    expect(screen.getByRole("link", { name: "Export JSON" })).toHaveAttribute("download", "kairos-audit-log.json");
    expect(screen.getByText(/authority_level/)).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /Documents/ }));
    await waitFor(() => expect(screen.queryByText("AL-2")).not.toBeInTheDocument());
    expect(screen.getByText("AL-1")).toBeInTheDocument();
  });

  it("shows the tailored empty state when a search matches nothing", async () => {
    respond([]);

    render(<AuditPage />);

    // Backend empty → fixture; a non-matching entity search empties it.
    await waitFor(() => expect(screen.getByText("AL-001")).toBeInTheDocument());
    fireEvent.change(screen.getByLabelText("Filter by entity ID"), { target: { value: "NO-SUCH-ENTITY" } });
    fireEvent.click(screen.getByRole("button", { name: "Search" }));
    await waitFor(() => expect(screen.getByText("No audit activity")).toBeInTheDocument());
  });
});
