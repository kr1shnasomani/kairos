import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import BootstrapPage from "./page";

const mocks = vi.hoisted(() => ({
  confirmAssetIdentity: vi.fn(),
  getMe: vi.fn(),
}));

vi.mock("@/lib/api", () => ({ confirmAssetIdentity: mocks.confirmAssetIdentity }));
vi.mock("@/lib/auth", () => ({ getMe: mocks.getMe }));

describe("BootstrapPage", () => {
  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  it("presents identity work as two responsive review queues", async () => {
    mocks.getMe.mockResolvedValue({ user_id: "u-1", role: "admin", site_id: "SITE-A" });

    render(<BootstrapPage />);

    expect(await screen.findByRole("heading", { name: "Asset identity confirmation" })).toBeInTheDocument();
    expect(screen.getByTestId("identity-workspace")).toHaveClass("max-w-5xl");
    expect(screen.getByTestId("identity-guardrail")).toHaveClass("rounded-xl", "bg-surface");
    expect(screen.getByTestId("provisional-queue")).toHaveClass("rounded-xl", "bg-surface");
    expect(screen.getByTestId("alias-queue")).toHaveClass("rounded-xl", "bg-surface");
    expect(screen.getByTestId("provisional-P-207")).toHaveClass("grid", "md:grid-cols-[minmax(0,1fr)_minmax(150px,0.55fr)_auto]");
  });

  it("keeps the existing confirmation contract and removes a confirmed record", async () => {
    mocks.getMe.mockResolvedValue({ user_id: "u-1", role: "admin", site_id: "SITE-A" });
    mocks.confirmAssetIdentity.mockResolvedValue({});

    render(<BootstrapPage />);

    await screen.findByText("Provisional pump (EAM import)");
    fireEvent.click(screen.getAllByRole("button", { name: "Confirm identity" })[0]);

    await waitFor(() => expect(mocks.confirmAssetIdentity).toHaveBeenCalledWith({
      asset_id: "P-207",
      tag_number: "P-207",
      name: "Provisional pump (EAM import)",
      equipment_class: "centrifugal_pump",
      criticality: "critical",
      site_id: "SITE-A",
      facility_id: "SITE-A",
      confirmed_by_user_id: "u-1",
    }));
    await waitFor(() => expect(screen.queryByTestId("provisional-P-207")).not.toBeInTheDocument());
  });
});
