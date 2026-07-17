import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import OffboardingPage from "./page";

vi.mock("@/lib/api", () => ({
  getOffboardingList: vi.fn().mockResolvedValue({
    data: [
      { id: "P-1", personnel_id: "U-1", personnel_email: "priya.sharma@plant.in", retirement_date: "2026-09-30", total_sessions: 5, sessions_completed: 3, status: "active", created_at: "2026-01-01" },
      { id: "P-2", personnel_id: "U-2", personnel_email: "ramesh@plant.in", retirement_date: "2026-11-15", total_sessions: 3, sessions_completed: 1, status: "active", created_at: "2026-01-01" },
      { id: "P-3", personnel_id: "U-3", personnel_email: "neha.patel@plant.in", retirement_date: "2026-08-01", total_sessions: 2, sessions_completed: 2, status: "completed", created_at: "2026-01-01" },
    ],
    source: "api",
  }),
}));

describe("OffboardingPage", () => {
  afterEach(cleanup);

  it("renders a data-driven expert handover overview", async () => {
    render(await OffboardingPage());

    expect(screen.getByTestId("offboarding-workspace")).toHaveClass("max-w-[1200px]");
    expect(screen.getByTestId("offboarding-summary")).toHaveTextContent(/2\s*active programmes/);
    expect(screen.getByTestId("offboarding-summary")).toHaveTextContent(/1\s*complete/);
    expect(screen.getByTestId("offboarding-summary")).toHaveTextContent(/6\s*of 10 sessions/);
    expect(screen.getByTestId("offboarding-programmes")).toHaveClass("md:grid-cols-2");

    const priya = screen.getByTestId("offboarding-programme-P-1");
    expect(priya).toHaveTextContent("PS");
    expect(priya).toHaveTextContent("priya.sharma@plant.in");
    expect(priya).toHaveTextContent("60%");
    expect(priya).toHaveAttribute("href", "/offboarding/P-1");
  });
});
