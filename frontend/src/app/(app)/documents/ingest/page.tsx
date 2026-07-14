"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import type { DocumentPipelineStage, DocumentStatus } from "@/lib/types";
import { ingestDocument, getDocumentStatus, type DocumentIngestResponse } from "@/lib/api";
import { useRole, RESOLVE_ROLES } from "@/components/use-role";
import { Button, StatusBadge, Timeline } from "@/components/ui";
import { triggerLabel } from "@/lib/utils";

const DOC_TYPES = [
  "oem_manual", "procedure", "inspection_report", "ptw",
  "shift_log", "regulation", "pid_drawing",
] as const;

const STAGE_ORDER: DocumentPipelineStage[] = ["queued", "ocr", "ner", "graph_linking", "indexing", "complete"];
const STAGE_LABEL: Record<DocumentPipelineStage, string> = {
  queued: "Queued", ocr: "OCR extraction", ner: "Entity extraction",
  graph_linking: "Graph linking", indexing: "Vector + text indexing",
  complete: "Complete", review_required: "Review required", failed: "Failed",
};

export default function IngestPage() {
  const role = useRole();
  const fileRef = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [docType, setDocType] = useState<string>("procedure");
  const [assetId, setAssetId] = useState("");
  const [sourceSystem, setSourceSystem] = useState("manual_upload");
  const [authority, setAuthority] = useState("3");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<DocumentIngestResponse | null>(null);
  const [status, setStatus] = useState<DocumentStatus | null>(null);

  const canIngest = RESOLVE_ROLES.includes(role);

  // Poll the pipeline status until it reaches a terminal stage.
  useEffect(() => {
    if (!result?.document_id) return;
    let alive = true;
    const id = result.document_id;
    const tick = async () => {
      const { data } = await getDocumentStatus(id);
      if (!alive || !data) return;
      setStatus(data);
      if (data.stage !== "complete" && data.stage !== "failed" && data.stage !== "review_required") {
        setTimeout(tick, 2000);
      }
    };
    tick();
    return () => { alive = false; };
  }, [result]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!file) return;
    setBusy(true);
    setError(null);
    setStatus(null);
    try {
      const fd = new FormData();
      fd.append("file", file);
      fd.append("document_type", docType);
      fd.append("source_system", sourceSystem);
      fd.append("authority_level", authority);
      if (assetId.trim()) fd.append("asset_id", assetId.trim());
      const res = await ingestDocument(fd);
      setResult(res);
    } catch {
      setError("Ingestion failed — backend offline or upload rejected.");
    } finally {
      setBusy(false);
    }
  }

  const timelineEvents = status
    ? STAGE_ORDER.map((s) => {
        const reached = STAGE_ORDER.indexOf(status.stage) >= STAGE_ORDER.indexOf(s) || status.stage === "complete";
        const isCurrent = status.stage === s;
        return {
          id: s,
          timestamp: isCurrent ? "in progress" : reached ? "done" : "pending",
          label: STAGE_LABEL[s],
          tone: (isCurrent ? "info" : reached ? "verified" : "neutral") as "info" | "verified" | "neutral",
        };
      })
    : [];

  return (
    <div className="mx-auto max-w-2xl px-5 py-8 sm:px-8 sm:py-10">
      <Link href="/documents" className="inline-flex items-center gap-1.5 text-body text-muted hover:text-ink">
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
          <path d="M15 18l-6-6 6-6" />
        </svg>
        Documents
      </Link>

      <header className="mt-4">
        <p className="text-label font-bold uppercase tracking-[0.1em] text-accent">Flow C · Universal document ingestion</p>
        <h1 className="mt-1 text-display font-semibold leading-tight">Ingest a document</h1>
        <p className="mt-1.5 text-body text-muted text-pretty">
          The entry point of the platform. Files are stored byte-for-byte in the immutable vault and
          run through the extraction pipeline. Identical files (same SHA-256) are de-duplicated, never re-stored.
        </p>
      </header>

      {!canIngest && (
        <div className="mt-5 rounded-xl border border-line bg-surface p-5 text-body text-muted">
          Document ingestion requires the <span className="font-semibold text-ink">engineer</span> or{" "}
          <span className="font-semibold text-ink">admin</span> role.
        </div>
      )}

      {canIngest && !result && (
        <form onSubmit={handleSubmit} className="mt-5 space-y-4">
          <button
            type="button"
            onClick={() => fileRef.current?.click()}
            className="flex w-full flex-col items-center gap-2 rounded-xl border border-dashed border-line bg-surface py-10 text-center transition-colors hover:border-[color-mix(in_srgb,var(--accent)_40%,var(--line))]"
          >
            <svg className="size-7 text-muted" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M17 8l-5-5-5 5M12 3v12" />
            </svg>
            <span className="text-body font-semibold text-ink">{file ? file.name : "Choose a file or drag it here"}</span>
            <span className="text-label text-muted">{file ? `${(file.size / 1024).toFixed(0)} KB` : "PDF, image, or scanned form"}</span>
          </button>
          <input
            ref={fileRef}
            type="file"
            className="hidden"
            aria-label="Document file"
            onChange={(e) => setFile(e.target.files?.[0] ?? null)}
          />

          <div className="grid gap-4 sm:grid-cols-2">
            <label className="block text-caption">
              <span className="font-semibold text-ink">Document type</span>
              <select value={docType} onChange={(e) => setDocType(e.target.value)}
                className="mt-1 h-9 w-full rounded-lg border border-line bg-surface px-2.5 text-body">
                {DOC_TYPES.map((t) => <option key={t} value={t}>{triggerLabel(t)}</option>)}
              </select>
            </label>
            <label className="block text-caption">
              <span className="font-semibold text-ink">Authority level</span>
              <select value={authority} onChange={(e) => setAuthority(e.target.value)}
                className="mt-1 h-9 w-full rounded-lg border border-line bg-surface px-2.5 text-body">
                {[1, 2, 3, 4, 5].map((l) => <option key={l} value={l}>L{l}</option>)}
              </select>
            </label>
            <label className="block text-caption">
              <span className="font-semibold text-ink">Asset link <span className="font-normal text-muted">(optional)</span></span>
              <input value={assetId} onChange={(e) => setAssetId(e.target.value)} placeholder="P-101"
                className="mt-1 h-9 w-full rounded-lg border border-line bg-surface px-2.5 text-body" />
            </label>
            <label className="block text-caption">
              <span className="font-semibold text-ink">Source system</span>
              <input value={sourceSystem} onChange={(e) => setSourceSystem(e.target.value)}
                className="mt-1 h-9 w-full rounded-lg border border-line bg-surface px-2.5 text-body" />
            </label>
          </div>

          <div className="flex items-center gap-3">
            <Button type="submit" variant="primary" disabled={!file || busy}>
              {busy ? "Uploading…" : "Ingest document"}
            </Button>
            {error && <span className="text-body text-danger">{error}</span>}
          </div>
        </form>
      )}

      {result && (
        <section className="mt-5 space-y-4">
          <div className="rounded-xl border border-line bg-surface p-5">
            <div className="flex flex-wrap items-center gap-3">
              {result.status === "duplicate"
                ? <StatusBadge tone="caution">Already ingested</StatusBadge>
                : <StatusBadge tone="verified">Stored in vault</StatusBadge>}
              <span className="tabular text-body font-semibold text-accent">{result.document_id}</span>
            </div>
            <p className="mt-2 text-caption text-muted">
              {result.message}
            </p>
            <div className="mt-3 flex flex-wrap gap-2">
              <Link href={`/documents/${result.document_id}`} className="text-caption text-accent underline hover:no-underline">Open document ↗</Link>
              {docType === "pid_drawing" && (
                <Link href={`/documents/${result.document_id}/topology`} className="text-caption text-accent underline hover:no-underline">View topology ↗</Link>
              )}
            </div>
          </div>

          <div className="rounded-xl border border-line bg-surface p-5">
            <div className="flex items-center justify-between">
              <p className="text-label font-bold uppercase tracking-[0.1em] text-muted">Pipeline status</p>
              {status?.stage === "review_required" && <StatusBadge tone="caution">Review required</StatusBadge>}
              {status?.stage === "failed" && <StatusBadge tone="danger">Failed</StatusBadge>}
            </div>
            <div className="mt-4">
              {timelineEvents.length > 0
                ? <Timeline events={timelineEvents} />
                : <p className="text-body text-muted">Waiting for the first pipeline update…</p>}
            </div>
            {status?.stage === "review_required" && (
              <Link href="/governance/quarantine" className="mt-2 inline-block text-caption text-accent underline hover:no-underline">
                Low-confidence extraction — review in quarantine ↗
              </Link>
            )}
          </div>

          <Button variant="ghost" onClick={() => { setResult(null); setStatus(null); setFile(null); }}>
            Ingest another
          </Button>
        </section>
      )}
    </div>
  );
}
