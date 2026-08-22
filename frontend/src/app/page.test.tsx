import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

// next/font/google is compiled away by the Next toolchain; under plain vitest
// it has no loader, so stand in with the shape the page consumes.
vi.mock("./landing-fonts", () => ({
  instrumentSans: { variable: "--font-instrument" },
  dmSans: { variable: "--font-dm" },
}));

import Home from "./page";

describe("Home", () => {
  afterEach(cleanup);

  it("shows the public Kairos landing page instead of redirecting visitors", () => {
    render(<Home />);

    expect(screen.getByRole("heading", { level: 1, name: /the plant already knows/i })).toBeInTheDocument();
    expect(screen.getAllByRole("link", { name: /sign in/i })[0]).toHaveAttribute("href", "/login");
    const workspaceLinks = screen.getAllByRole("link", { name: /open workspace/i });
    expect(workspaceLinks).toHaveLength(3);
    for (const link of workspaceLinks) expect(link).toHaveAttribute("href", "/login");
  });

  // Readers who did not already know the domain could not tell what Kairos was.
  // The problem and the worked scenario are the fix, so they are load-bearing:
  // if either is dropped the page goes back to answering a question nobody asked.
  it("states the problem and walks one scenario before it makes a product claim", () => {
    render(<Home />);

    const problem = document.getElementById("problem") as HTMLElement;
    expect(problem).toBeInTheDocument();
    // The stakes, plus at least one attributed figure behind them.
    expect(problem).toHaveTextContent(/it is a safety problem/i);
    expect(within(problem).getByText("35%")).toBeInTheDocument();
    expect(problem).toHaveTextContent(/mckinsey/i);

    const how = document.getElementById("how") as HTMLElement;
    expect(how).toBeInTheDocument();
    // Five numbered steps, ending on the refusal — the step people miss.
    expect(within(how).getAllByRole("listitem")).toHaveLength(5);
    expect(how).toHaveTextContent(/a work order is raised on pump p-101/i);
    expect(how).toHaveTextContent(/when the evidence is thin, it says so/i);

    // Both must precede the first capability claim in document order.
    const capabilities = document.getElementById("capabilities") as HTMLElement;
    expect(problem.compareDocumentPosition(how)).toBe(Node.DOCUMENT_POSITION_FOLLOWING);
    expect(how.compareDocumentPosition(capabilities)).toBe(Node.DOCUMENT_POSITION_FOLLOWING);
  });

  // The brief's five build targets are covered by the capability tabs, whose
  // eyebrows already speak the brief's own vocabulary. A separate coverage
  // section restated all of it, so it was removed — this guards the coverage
  // itself rather than the section that used to duplicate it.
  it("covers every build target the brief named, in the capabilities themselves", () => {
    render(<Home />);

    for (const tab of ["Ingestion", "Expert copilot", "Root cause", "Compliance", "Briefs"]) {
      expect(screen.getByRole("button", { name: tab })).toBeInTheDocument();
    }

    const panel = document.getElementById("capability-panel") as HTMLElement;

    fireEvent.click(screen.getByRole("button", { name: "Root cause" }));
    expect(panel).toHaveTextContent(/maintenance intelligence/i);

    fireEvent.click(screen.getByRole("button", { name: "Ingestion" }));
    expect(panel).toHaveTextContent(/universal ingestion/i);

    // The regulatory frameworks the brief names, stated where they apply.
    fireEvent.click(screen.getByRole("button", { name: "Compliance" }));
    expect(panel).toHaveTextContent(/quality and regulatory/i);
    expect(panel).toHaveTextContent(/OISD/);
    expect(panel).toHaveTextContent(/PESO/);
    expect(panel).toHaveTextContent(/Factories Act/i);

    // The suggested technologies and the unasked-for work are stated once each.
    const platform = document.getElementById("platform") as HTMLElement;
    expect(platform).toHaveTextContent(/computer vision for p&ids/i);
    expect(platform).toHaveTextContent(/management of change/i);
    expect(platform).toHaveTextContent(/DPDP Act 2023/);

    // And the section that duplicated the tabs is gone.
    expect(document.getElementById("scope")).toBeNull();
  });

  it("quotes the measured benchmark figures, including the answer-quality range", () => {
    render(<Home />);

    // benchmark/RESULTS.md is explicit that uncertainty must be quoted rather
    // than a single flattering number, and that grading is deterministic.
    // The chart shows a point estimate, so the interval must still be
    // disclosed in the caption rather than quietly dropped.
    expect(screen.getByText("89%")).toBeInTheDocument();
    expect(screen.getByText("33/37")).toBeInTheDocument();
    // Three: the retrieval and provenance chart bars, plus KG linkage in the
    // suite cards. The PS names linkage completeness as an evaluation focus, so
    // it is quoted as its own figure rather than left implied.
    expect(screen.getAllByText("100%")).toHaveLength(3);
    expect(screen.getByText("10 / 10")).toBeInTheDocument();
    expect(screen.getByText("6 / 6")).toBeInTheDocument();
    // Scoped to the <p>: a bare regex also matches every ancestor's textContent.
    expect(screen.getByText(/thirty-seven domain-expert questions/i, { selector: "p" })).toBeInTheDocument();
    // Stated twice: in the evals copy and in the opening FAQ answer.
    expect(screen.getAllByText(/graded deterministically/i, { selector: "p" })).toHaveLength(2);
    // The spread and the layer checks are stated, not rounded away.
    expect(screen.getByText(/33 of 37/i, { selector: "p" })).toBeInTheDocument();
    // The other harnesses are on the page too, with their real figures.
    expect(screen.getByText("13 / 13")).toBeInTheDocument();
    expect(screen.getByText("0 unsafe")).toBeInTheDocument();
    expect(screen.getByText("F1 0.912")).toBeInTheDocument();
    expect(screen.getByText("F1 0.805")).toBeInTheDocument();
    expect(screen.getByText("−9.5%")).toBeInTheDocument();
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
    expect(within(panel).getByRole("heading", { name: /told before you ask, but never spammed/i })).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Field capture" }));

    expect(within(panel).getByRole("heading", { name: /capture that survives a dead zone/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Field capture" })).toHaveAttribute("aria-pressed", "true");
  });

  it("swaps the audience panel when another audience is selected", () => {
    render(<Home />);

    const panel = document.getElementById("audience-panel") as HTMLElement;
    expect(panel).toHaveTextContent(/the plant on one screen/i);

    fireEvent.click(screen.getByRole("button", { name: "Compliance officers" }));

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
