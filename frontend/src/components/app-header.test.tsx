import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { AppHeader } from "./app-header";

describe("AppHeader", () => {
  afterEach(cleanup);

  it("opens template-style desktop actions and shows the active user context", () => {
    const onOpenSearch = vi.fn();
    const onOpenCalendar = vi.fn();
    const onCreate = vi.fn();
    const onOpenBriefs = vi.fn();
    const onOpenUser = vi.fn();
    render(<AppHeader name="Avery Engineer" role="engineer" onOpenSearch={onOpenSearch} onOpenCalendar={onOpenCalendar} calendarOpen={false} onCreate={onCreate} onOpenBriefs={onOpenBriefs} onOpenUser={onOpenUser} userInitial="A" />);

    fireEvent.click(screen.getByRole("button", { name: /search workspace/i }));
    fireEvent.click(screen.getByRole("button", { name: /open calendar/i }));
    fireEvent.click(screen.getByRole("button", { name: /ingest document/i }));
    fireEvent.click(screen.getByRole("button", { name: /open briefs/i }));
    fireEvent.click(screen.getByRole("button", { name: /open user menu/i }));
    expect(onOpenSearch).toHaveBeenCalledOnce();
    expect(onOpenCalendar).toHaveBeenCalledOnce();
    expect(onCreate).toHaveBeenCalledOnce();
    expect(onOpenBriefs).toHaveBeenCalledOnce();
    expect(onOpenUser).toHaveBeenCalledOnce();
    expect(screen.getByText("Avery Engineer")).toBeInTheDocument();
    expect(screen.getByText("Engineer")).toBeInTheDocument();
    expect(screen.getByText("Ctrl K")).toBeInTheDocument();
  });

  it("keeps the compact template identity label for long source names", () => {
    render(<AppHeader name="avery-long-engineer-name" role="engineer" onOpenSearch={vi.fn()} onOpenCalendar={vi.fn()} calendarOpen={false} onCreate={vi.fn()} onOpenBriefs={vi.fn()} onOpenUser={vi.fn()} userInitial="AE" />);

    expect(screen.getByRole("button", { name: /open user menu/i })).toHaveTextContent("AE");
    expect(screen.getByText("avery-long-engineer-name")).toBeInTheDocument();
  });

  it("keeps a profile icon for wide headers and initials for tighter desktop headers", () => {
    render(<AppHeader name="Kairos user" role="engineer" onOpenSearch={vi.fn()} onOpenCalendar={vi.fn()} calendarOpen={false} onCreate={vi.fn()} onOpenBriefs={vi.fn()} onOpenUser={vi.fn()} userInitial="KU" />);

    expect(screen.getByTestId("account-profile-icon")).toHaveClass("hidden", "xl:grid");
    expect(screen.getByText("KU")).toHaveClass("xl:hidden");
    expect(screen.getByText("Kairos user").parentElement).toHaveClass("hidden", "xl:block");
  });
});
