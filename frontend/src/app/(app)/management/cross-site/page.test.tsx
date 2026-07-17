import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import CrossSiteAlertsPage from "./page";

describe("CrossSiteAlertsPage", () => {
  afterEach(cleanup);

  it("presents cross-site patterns as a responsive comparison board", () => {
    render(<CrossSiteAlertsPage />);

    expect(screen.getByTestId("cross-site-workspace")).toHaveClass("max-w-[1400px]");
    expect(screen.getByTestId("cross-site-summary")).toHaveClass("sm:grid-cols-3");
    expect(screen.getByTestId("cross-site-layout")).toHaveClass("lg:grid-cols-[minmax(0,1fr)_300px]");
    expect(screen.getByTestId("cross-site-register")).toHaveTextContent("Seal thermal-cycling pattern");
    expect(screen.getByTestId("cross-site-context")).toHaveTextContent("How to read these signals");
  });
});
