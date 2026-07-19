import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import CopilotPage from "./page";

vi.mock("@/lib/api", () => ({ synthesize: vi.fn(), createAnnotation: vi.fn() }));

describe("CopilotPage", () => {
  afterEach(cleanup);

  it("uses a full-height governed conversation workspace", () => {
    render(<CopilotPage />);

    expect(screen.getByTestId("copilot-workspace")).toHaveClass("flex", "flex-col");
    expect(screen.getByTestId("copilot-conversation")).toHaveClass("overflow-y-auto");
    expect(screen.getByTestId("copilot-composer")).toBeInTheDocument();
    expect(screen.getByLabelText("Ask the copilot")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Send" })).toBeInTheDocument();
  });
});
