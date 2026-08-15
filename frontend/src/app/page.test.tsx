import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const push = vi.fn();
const replace = vi.fn();

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push, replace }),
}));

vi.mock("@/lib/auth", () => ({
  getMe: vi.fn().mockResolvedValue(null),
}));

// next/font/google is compiled away by the Next toolchain; under plain vitest
// it has no loader, so stand in with the shape the page consumes.
vi.mock("./landing-fonts", () => ({
  instrumentSans: { variable: "--font-instrument" },
  dmSans: { variable: "--font-dm" },
}));

import Home from "./page";

describe("Home", () => {
  afterEach(cleanup);

  beforeEach(() => {
    push.mockClear();
    replace.mockClear();
  });

  it("shows the public Kairos landing page instead of redirecting visitors", () => {
    render(<Home />);

    expect(screen.getByRole("heading", { level: 1, name: /plant knowledge, at the moment of action/i })).toBeInTheDocument();
    expect(screen.getAllByRole("link", { name: /sign in/i })[0]).toHaveAttribute("href", "/login");
    expect(replace).not.toHaveBeenCalled();
    expect(push).not.toHaveBeenCalled();
  });

  it("quotes the measured benchmark figures, including the answer-quality range", () => {
    render(<Home />);

    // benchmark/RESULTS.md is explicit that the range must be quoted rather
    // than a single flattering number, and that grading is deterministic.
    // The chart shows a single figure, but the real spread must still be
    // disclosed in the caption rather than quietly dropped.
    expect(screen.getByText("92%")).toBeInTheDocument();
    expect(screen.getByText("23/25")).toBeInTheDocument();
    expect(screen.getAllByText("100%")).toHaveLength(2);
    // Scoped to the <p>: a bare regex also matches every ancestor's textContent.
    expect(screen.getByText(/twenty-five domain-expert questions/i, { selector: "p" })).toBeInTheDocument();
    // Stated twice: in the evals copy and in the opening FAQ answer.
    expect(screen.getAllByText(/graded deterministically/i, { selector: "p" })).toHaveLength(2);
    // The spread and the layer checks are stated, not rounded away.
    expect(screen.getByText(/22 to 24 of 25/i, { selector: "p" })).toBeInTheDocument();
    // The other five harnesses are on the page too, with their real figures.
    expect(screen.getByText("13 / 13")).toBeInTheDocument();
    expect(screen.getByText("F1 0.986")).toBeInTheDocument();
    expect(screen.getByText("F1 0.857")).toBeInTheDocument();
    expect(screen.getByText("−25.6%")).toBeInTheDocument();
    expect(screen.getByText("0% errors")).toBeInTheDocument();
    // …and so are the limits, which is the point of stating them.
    expect(screen.getByText(/soak and sustained load/i)).toBeInTheDocument();

    // No invented operational metrics.
    expect(screen.queryByText("98.4%")).not.toBeInTheDocument();
    expect(screen.queryByText("99.9%")).not.toBeInTheDocument();
  });

  it("names all six knowledge-edge properties that make an answer checkable", () => {
    render(<Home />);

    // Scoped to <code>: "confidence" also appears as a gate label in the
    // architecture diagram, and this test is about the property list.
    for (const property of ["valid_from", "valid_to", "authority_level", "document_id", "confidence", "verification_status"]) {
      expect(screen.getByText(property, { selector: "code" })).toBeInTheDocument();
    }
  });

  it("swaps the capability panel when another capability is selected", () => {
    render(<Home />);

    const panel = document.getElementById("capability-panel") as HTMLElement;
    expect(within(panel).getByRole("heading", { name: /the right brief, rate-governed/i })).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Field capture" }));

    expect(within(panel).getByRole("heading", { name: /capture that survives a dead zone/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Field capture" })).toHaveAttribute("aria-pressed", "true");
  });

  it("swaps the audience panel when another audience is selected", () => {
    render(<Home />);

    const panel = document.getElementById("audience-panel") as HTMLElement;
    expect(panel).toHaveTextContent(/the plant on one screen/i);

    fireEvent.click(screen.getByRole("button", { name: "Compliance" }));

    expect(panel).toHaveTextContent(/coverage you can export/i);
  });

  it("renders the FAQ as native disclosure elements so it works without JS", () => {
    const { container } = render(<Home />);

    // One category's questions at a time; the first answer starts open.
    const disclosures = container.querySelectorAll("details");
    expect(disclosures).toHaveLength(3);
    expect(disclosures[0].querySelector("summary")).toHaveTextContent(/what does kairos actually do/i);
    expect(disclosures[0]).toHaveAttribute("open");
  });

  it("switches the FAQ answers when another category is chosen", () => {
    render(<Home />);

    const answers = document.getElementById("faq-answers") as HTMLElement;
    expect(answers).toHaveTextContent(/what does kairos actually do/i);

    fireEvent.click(screen.getByRole("button", { name: "Evidence" }));

    expect(answers).toHaveTextContent(/how was it evaluated/i);
    expect(answers).not.toHaveTextContent(/what does kairos actually do/i);
  });

  it("keeps every footer link pointed at a real destination", () => {
    const { container } = render(<Home />);

    const hrefs = [...container.querySelectorAll("footer a")].map((a) => a.getAttribute("href"));
    expect(hrefs.length).toBeGreaterThan(0);
    const allowedExternal = [
      "https://github.com/kr1shnasomani/kairos",
      "https://drive.google.com/file/d/18ZO95MckNtESg-Z2ruRBNnKq6JyB57rP/view?usp=drive_link",
    ];
    for (const href of hrefs) {
      const ok = href === "/login" || href === "/" || href?.startsWith("#") || allowedExternal.includes(href ?? "");
      expect(ok, `unexpected footer href: ${href}`).toBe(true);
    }
    // Every external link opens safely.
    for (const a of container.querySelectorAll('footer a[target="_blank"]')) {
      expect(a.getAttribute("rel")).toMatch(/noreferrer/);
    }
  });
});
