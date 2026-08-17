import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { MiniCalendar } from "./app-shell";

describe("MiniCalendar", () => {
  it("renders the current month and closes on Escape", () => {
    const onClose = vi.fn();
    render(<MiniCalendar onClose={onClose} />);

    expect(screen.getByRole("dialog", { name: "Calendar" })).toBeInTheDocument();
    expect(screen.getByRole("table", { name: /calendar for/i })).toBeInTheDocument();
    expect(screen.getAllByRole("columnheader")).toHaveLength(7);
    expect(document.querySelector('[aria-current="date"]')).toBeInTheDocument();

    fireEvent.keyDown(document, { key: "Escape" });
    expect(onClose).toHaveBeenCalledOnce();
  });
});
