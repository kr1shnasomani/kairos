import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { VaultDocument } from "@/lib/types";
import DocumentsPage from "./page";

const mocks = vi.hoisted(() => ({ getDocuments: vi.fn(), push: vi.fn() }));

vi.mock("@/lib/api", () => ({ getDocuments: mocks.getDocuments }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: mocks.push }) }));

function doc(i: number, over: Partial<VaultDocument> = {}): VaultDocument {
  return {
    document_id: `DOC-${i}`, file_name: `file-${i}.pdf`, document_type: "oem_manual",
    authority_level: 2, source_system: "manual_upload", vault_url: null, status: "active",
    ingested_at: "2026-07-12T10:00:00Z", ingested_by: "admin", asset_links: [], ...over,
  };
}

function respond(items: VaultDocument[]) {
  mocks.getDocuments.mockResolvedValue({ data: { items, total: items.length, limit: 50, offset: 0 }, source: "live" });
}

describe("DocumentsPage", () => {
  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  it("paginates a 10k vault to at most 25 rendered rows", async () => {
    respond(Array.from({ length: 10_000 }, (_, i) => doc(i)));

    render(await DocumentsPage());

    expect(document.querySelectorAll("tbody tr").length).toBeLessThanOrEqual(25);
    expect(screen.getByText(/Showing 1–25 of 10000/)).toBeInTheDocument();
  });

  it("shows vault pills, filters by state, and routes row clicks to the document", async () => {
    respond([
      doc(1, { asset_links: ["P-101", "P-102"] }),
      doc(2, { status: "superseded", file_name: "old.pdf" }),
    ]);

    render(await DocumentsPage());

    expect(screen.getByTestId("documents-summary")).toHaveTextContent("Active");
    expect(screen.getByText("2 linked assets")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Ingest document" })).toHaveAttribute("href", "/documents/ingest");

    fireEvent.click(screen.getByRole("button", { name: /Superseded/ }));
    await waitFor(() => expect(screen.queryByText("file-1.pdf")).not.toBeInTheDocument());
    expect(screen.getByText("old.pdf")).toBeInTheDocument();

    fireEvent.click(screen.getByText("old.pdf").closest("tr")!);
    expect(mocks.push).toHaveBeenCalledWith("/documents/DOC-2");
  });

  it("shows the tailored empty state with an ingest CTA", async () => {
    respond([]);

    render(await DocumentsPage());

    expect(screen.getByText("No documents ingested")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Ingest a document" })).toHaveAttribute("href", "/documents/ingest");
  });
});
