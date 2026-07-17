import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { Brief } from "@/lib/types";
import { BriefDetail } from "./brief-detail";

vi.mock("@/lib/api", () => ({ ackBrief: vi.fn(), sendBriefFeedback: vi.fn() }));

const brief: Brief = {
  brief_id: "BRF-101",
  recipient_user_id: "user-1",
  priority: "high",
  trigger_event_type: "shift_handover",
  headline: "Verify P-101 seal condition before restart",
  body: "The latest inspection identified a seal condition that must be reviewed before restart.",
  action_items: ["Inspect seal housing", "Record vibration reading"],
  warnings: ["Do not restart above the governed envelope."],
  sources: [{ document_id: "DOC-1", document_type: "inspection_report", title: "P-101 inspection", authority_level: 2, relevant_excerpt: "Seal wear requires engineering review.", vault_url: null, is_quarantine: false }],
  requires_countersignature: false,
  delivery_frozen: false,
  delivered_at: "2026-07-15T08:00:00Z",
};

describe("BriefDetail", () => {
  afterEach(cleanup);

  it("uses a responsive reading and decision workspace", () => {
    render(<BriefDetail brief={brief} />);

    expect(screen.getByTestId("brief-detail-workspace")).toHaveClass("max-w-[1400px]");
    expect(screen.getByTestId("brief-detail-layout")).toHaveClass("lg:grid-cols-[minmax(0,1fr)_340px]");
    expect(screen.getByTestId("brief-content")).toHaveTextContent("What to do");
    expect(screen.getByTestId("brief-context")).toHaveTextContent("Evidence");
    expect(screen.getByTestId("brief-acknowledgment")).toHaveClass("lg:sticky");
    expect(screen.getByLabelText("Engineer signature")).toHaveClass("min-h-11");
  });
});
