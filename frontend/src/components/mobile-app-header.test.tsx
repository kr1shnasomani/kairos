import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { MobileAppHeader } from "./mobile-app-header";

describe("MobileAppHeader", () => {
  it("routes every template-style mobile header action without persistent branding", () => {
    const onOpenMenu = vi.fn();
    const onOpenSearch = vi.fn();
    const onOpenCalendar = vi.fn();
    const onCreate = vi.fn();
    const onOpenBriefs = vi.fn();
    const onOpenUser = vi.fn();
    render(<MobileAppHeader onOpenMenu={onOpenMenu} onOpenSearch={onOpenSearch} onOpenCalendar={onOpenCalendar} calendarOpen={false} onCreate={onCreate} onOpenBriefs={onOpenBriefs} onOpenUser={onOpenUser} userInitial="A" />);

    fireEvent.click(screen.getByRole("button", { name: /open menu/i }));
    fireEvent.click(screen.getByRole("button", { name: /search workspace/i }));
    fireEvent.click(screen.getByRole("button", { name: /open calendar/i }));
    fireEvent.click(screen.getByRole("button", { name: /ingest document/i }));
    fireEvent.click(screen.getByRole("button", { name: /open briefs/i }));
    fireEvent.click(screen.getByRole("button", { name: /open user menu/i }));

    expect(onOpenMenu).toHaveBeenCalledOnce();
    expect(onOpenSearch).toHaveBeenCalledOnce();
    expect(onOpenCalendar).toHaveBeenCalledOnce();
    expect(onCreate).toHaveBeenCalledOnce();
    expect(onOpenBriefs).toHaveBeenCalledOnce();
    expect(onOpenUser).toHaveBeenCalledOnce();
    expect(screen.queryByText("Kairos")).not.toBeInTheDocument();
    expect(screen.getByRole("banner")).toHaveClass("gap-1.5", "px-2", "sm:gap-3", "sm:px-4");
    expect(screen.getByText("Search…")).toHaveClass("min-w-0", "truncate");
    expect(screen.getByText("Search…")).not.toHaveClass("hidden");
    expect(screen.getByRole("button", { name: /search workspace/i })).toHaveClass("min-w-10", "flex-1");
    expect(screen.getByRole("button", { name: /open calendar/i })).toHaveClass("size-10", "sm:size-11");
  });
});
