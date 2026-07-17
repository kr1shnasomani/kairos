import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const replace = vi.fn();

vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace }),
}));

vi.mock("@/lib/auth", () => ({
  getMe: vi.fn().mockResolvedValue(null),
}));

import Home from "./page";

describe("Home", () => {
  afterEach(cleanup);

  beforeEach(() => {
    replace.mockClear();
  });

  it("shows the public Kairos landing page instead of redirecting visitors", () => {
    render(<Home />);

    expect(screen.getByRole("heading", { name: /make plant knowledge usable/i })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /sign in/i })).toHaveAttribute("href", "/login");
    expect(replace).not.toHaveBeenCalled();
  });

  it("links both platform entry points to the platform section", () => {
    const view = render(<Home />);

    expect(view.getAllByRole("link", { name: /platform/i })).toHaveLength(2);
  });

  it("shows finalized product-shaped snapshots without invented operational values", () => {
    render(<Home />);

    expect(screen.getByTestId("landing-product-snapshots")).toHaveClass("lg:grid-cols-3");
    expect(screen.getAllByTestId(/^product-snapshot-/)).toHaveLength(3);
    expect(screen.getByTestId("product-snapshot-overview")).toHaveTextContent("Needs attention");
    expect(screen.getByTestId("product-snapshot-copilot")).toHaveTextContent("Governed answer");
    expect(screen.getByTestId("product-snapshot-field")).toHaveTextContent("Field capture");
    expect(screen.queryByText("98.4%")).not.toBeInTheDocument();
  });
});
