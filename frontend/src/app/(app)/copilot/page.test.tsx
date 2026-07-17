import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import CopilotPage from "./page";

vi.mock("@/lib/api", () => ({ synthesize: vi.fn(), createAnnotation: vi.fn() }));

describe("CopilotPage", () => {
  afterEach(cleanup);

  it("uses a responsive governed conversation workspace", () => {
    render(<CopilotPage />);

    expect(screen.getByTestId("copilot-workspace")).toHaveClass("max-w-[1400px]");
    expect(screen.getByTestId("copilot-layout")).toHaveClass("lg:grid-cols-[minmax(0,1fr)_300px]");
    expect(screen.getByTestId("copilot-conversation")).toHaveTextContent("Ask the governed knowledge base");
    expect(screen.getByTestId("copilot-context")).toHaveTextContent("Governed answers");
    expect(screen.getByTestId("copilot-composer")).toHaveClass("min-h-11");
    expect(screen.getByRole("button", { name: "Send" })).toHaveClass("size-11");
  });
});
