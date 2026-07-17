import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import type { BriefsResponse } from "@/lib/types";
import { BriefInbox } from "./brief-inbox";

const response: BriefsResponse = {
  briefs: [],
  total_pending: 4,
  suppressed_count: 0,
  governor_state: { push_count_last_hour: 2, ceiling: 8, state: "normal" },
  next_delivery_allowed_at: null,
};

describe("BriefInbox", () => {
  afterEach(cleanup);

  it("uses one compact toolbar with relevant status signals", () => {
    render(<BriefInbox response={response} />);

    expect(screen.getByTestId("brief-toolbar")).toHaveClass("md:flex-row");
    expect(screen.getByText("4 pending")).toBeInTheDocument();
    expect(screen.getByText("2/8 governor")).toBeInTheDocument();
  });

  it("reserves warning colors for status that needs action", () => {
    render(<BriefInbox response={{
      ...response,
      total_pending: 0,
      suppressed_count: 2,
      governor_state: { ...response.governor_state, state: "suppressed" },
    }} />);

    expect(screen.getByText("0 pending").parentElement).toHaveClass("text-verified");
    expect(screen.getByText("2/8 governor").parentElement).toHaveClass("text-danger");
  });
});
