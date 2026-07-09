"use client";

import { useState } from "react";
import { postDeviationFlag } from "@/lib/api";
import { Button } from "@/components/ui";

type Stage = "form" | "submitting" | "done" | "error";

export default function DeviationPage() {
  const [stage, setStage] = useState<Stage>("form");
  const [assetId, setAssetId] = useState("");
  const [description, setDescription] = useState("");
  const [topology, setTopology] = useState("");
  const [eventId, setEventId] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!assetId.trim() || !description.trim()) return;
    setStage("submitting");
    try {
      const ev = await postDeviationFlag({
        asset_id: assetId.trim(),
        description: description.trim(),
        affected_topology_path: topology.trim() || undefined,
      });
      setEventId(ev.event_id);
      setStage("done");
    } catch {
      setStage("error");
    }
  }

  if (stage === "done") {
    return (
      <div className="mx-auto max-w-md px-5 py-16 text-center">
        <div className="mx-auto grid size-14 place-items-center rounded-full bg-[color-mix(in_srgb,var(--caution)_14%,transparent)]">
          <svg
            className="size-7 text-caution"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
          >
            <path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
            <line x1="12" y1="9" x2="12" y2="13" />
            <line x1="12" y1="17" x2="12.01" y2="17" />
          </svg>
        </div>
        <h1 className="mt-4 text-[20px] font-semibold">Deviation flag raised</h1>
        {eventId && (
          <p className="mt-1 text-[12px] text-muted">
            Event <span className="tabular font-medium text-ink">{eventId}</span>
          </p>
        )}
        <p className="mt-3 text-[13.5px] leading-relaxed text-muted">
          Briefs for asset{" "}
          <span className="font-semibold text-ink">{assetId}</span> are now frozen
          pending engineering review. An engineer must resolve this flag before normal brief
          delivery resumes.
        </p>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-md px-5 pb-8 pt-6">
      <header className="mb-6">
        <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-accent">
          Field capture
        </p>
        <h1 className="mt-0.5 text-[20px] font-semibold">Physical deviation flag</h1>
        <p className="mt-1.5 text-[13px] leading-relaxed text-muted">
          Flag a physical condition that deviates from the P&ID or procedure. Briefs for the
          affected asset will be frozen until an engineer reviews and resolves this flag.
        </p>
      </header>

      <form onSubmit={submit} className="flex flex-col gap-5" noValidate>
        <div>
          <label htmlFor="asset-id" className="block text-[13px] font-semibold">
            Asset / tag number <span aria-hidden="true" className="text-danger">*</span>
          </label>
          <input
            id="asset-id"
            type="text"
            value={assetId}
            onChange={(e) => setAssetId(e.target.value)}
            placeholder="e.g. P-101"
            required
            aria-required="true"
            className="mt-1.5 h-[52px] w-full rounded-xl border border-line bg-surface px-4 text-[14px] outline-none transition-colors focus-visible:border-accent"
          />
        </div>

        <div>
          <label htmlFor="description" className="block text-[13px] font-semibold">
            Description of deviation <span aria-hidden="true" className="text-danger">*</span>
          </label>
          <textarea
            id="description"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Describe what you observed that deviates from the expected state…"
            rows={4}
            required
            aria-required="true"
            className="mt-1.5 w-full resize-none rounded-xl border border-line bg-surface px-4 py-3 text-[14px] leading-relaxed outline-none transition-colors focus-visible:border-accent"
          />
        </div>

        <div>
          <label htmlFor="topology" className="block text-[13px] font-semibold">
            Affected topology path{" "}
            <span className="font-normal text-muted">(optional)</span>
          </label>
          <input
            id="topology"
            type="text"
            value={topology}
            onChange={(e) => setTopology(e.target.value)}
            placeholder="e.g. P-101 → suction valve → isolation boundary"
            className="mt-1.5 h-[52px] w-full rounded-xl border border-line bg-surface px-4 text-[14px] outline-none transition-colors focus-visible:border-accent"
          />
        </div>

        {stage === "error" && (
          <p role="alert" className="text-[13px] text-danger">
            Submission failed. Check your connection and try again.
          </p>
        )}

        <div className="mt-2">
          <Button
            type="submit"
            variant="danger"
            disabled={!assetId.trim() || !description.trim() || stage === "submitting"}
            className="h-[52px] w-full text-[15px]"
          >
            {stage === "submitting" ? "Raising flag…" : "Raise deviation flag"}
          </Button>
          <p className="mt-2 text-center text-[12px] text-muted">
            This action freezes briefs for the asset until engineering resolves the flag.
          </p>
        </div>
      </form>
    </div>
  );
}
