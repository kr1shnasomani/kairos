import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { CopilotAnswer } from "@/lib/copilot";
import { Answer } from "./answer-card";

vi.mock("@/lib/api", () => ({ submitAnswerFeedback: vi.fn().mockResolvedValue(true) }));

const base: CopilotAnswer = {
  answer: null,
  sources: [],
  confidence: 0,
  refused: false,
  safety_critical: false,
};

describe("streamed answer text", () => {
  afterEach(cleanup);

  it("renders streamed text while synthesis is still running", () => {
    render(<Answer data={{ ...base, is_synthesizing: true }} streaming="The pump was last" />);

    expect(screen.getByText(/The pump was last/)).toBeInTheDocument();
    // Marked as in-progress, so it cannot be mistaken for a finished, sourced answer.
    expect(screen.getByText(/sources and confidence are attached once/i)).toBeInTheDocument();
  });

  it("falls back to the spinner when synthesizing with no text yet", () => {
    render(<Answer data={{ ...base, is_synthesizing: true }} />);

    expect(screen.getByText(/Assembling evidence/i)).toBeInTheDocument();
  });

  it("never shows streamed text once a refusal has arrived", () => {
    /* The safety gate can convert a completed answer into a refusal. If stale streamed text
       survived that transition the operator would read a claim the system just retracted —
       the exact 'hedged partial answer' the architecture forbids. */
    render(
      <Answer
        data={{ ...base, refused: true, safety_critical: true, refusal_reason: "insufficient evidence" }}
        streaming="probably about 16 bar"
      />,
    );

    expect(screen.queryByText(/probably about 16 bar/)).not.toBeInTheDocument();
    expect(screen.getByText(/Safety-critical query — refused/i)).toBeInTheDocument();
  });

  it("does not show streamed text alongside a completed answer", () => {
    render(
      <Answer
        data={{ ...base, answer: "Final governed answer.", confidence: 0.9 }}
        streaming="Final governed ans"
      />,
    );

    expect(screen.queryByText("Final governed ans")).not.toBeInTheDocument();
  });
});
