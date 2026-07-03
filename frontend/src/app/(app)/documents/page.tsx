import { Stub } from "@/components/stub";

export const metadata = { title: "Documents — Kairos" };

export default function DocumentsPage() {
  return (
    <Stub
      eyebrow="Immutable vault"
      title="Documents"
      description="The document registry over the immutable evidence vault — ingestion, extraction, drawing topology, revision chains, and supersession."
      endpoints={["GET /documents/", "/{id}/extraction", "/{id}/topology"]}
    />
  );
}
