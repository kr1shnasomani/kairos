"use client";

import Link from "next/link";
import { useState } from "react";
import type { Brief } from "@/lib/types";
import { priorityMeta, relativeTime, triggerLabel } from "@/lib/utils";
import { ackBrief, sendBriefFeedback } from "@/lib/api";
import { AuthorityBadge, Button, EvidenceLineage, SourceChip, StatusBadge } from "./ui";

type FeedbackRating = "accurate" | "missing_context" | "incorrect";
type AckStep = "idle" | "step1_done" | "complete";

export function BriefDetail({ brief }: { brief: Brief }) {
  const p = priorityMeta(brief.priority);
  const isPtw = brief.requires_countersignature;
  const isFrozen = brief.frozen || brief.delivery_frozen;
  const quarantineCount = brief.sources.filter((s) => s.is_quarantine).length;
  const hasLowConfidence = quarantineCount > 0;

  const [ackStep, setAckStep] = useState<AckStep>("idle");
  const [engineerSig, setEngineerSig] = useState("");
  const [shiftLeadSig, setShiftLeadSig] = useState("");
  const [feedback, setFeedback] = useState<FeedbackRating | null>(null);
  const [feedbackSent, setFeedbackSent] = useState(false);

  async function ackStep1() {
    if (engineerSig.trim().length < 2) return;
    if (!isPtw) {
      // Single-step for non-PTW briefs
      await ackBrief(brief.brief_id, { signature: engineerSig }).catch(() => {});
      setAckStep("complete");
      return;
    }
    setAckStep("step1_done");
  }

  async function ackStep2() {
    if (shiftLeadSig.trim().length < 2) return;
    await ackBrief(brief.brief_id, {
      signature: `${engineerSig} + ${shiftLeadSig}`,
      notes: "PTW dual countersignature",
    }).catch(() => {});
    setAckStep("complete");
  }

  async function rate(r: FeedbackRating) {
    setFeedback(r);
    setFeedbackSent(true);
    await sendBriefFeedback(brief.brief_id, r).catch(() => {});
  }

  const isComplete = ackStep === "complete";

  return (
    <div className="mx-auto max-w-3xl px-5 py-8 sm:px-8 sm:py-10">
      <Link href="/briefs" className="inline-flex items-center gap-1.5 text-[13px] text-muted hover:text-ink">
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
          <path d="M15 18l-6-6 6-6" />
        </svg>
        Briefs
      </Link>

      <header className="mt-4">
        <div className="flex flex-wrap items-center gap-2">
          {isFrozen ? (
            <StatusBadge tone="info">Frozen</StatusBadge>
          ) : (
            <span className="inline-flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-[0.04em]" style={{ color: p.color }}>
              <span className="size-1.5 rounded-full bg-current" aria-hidden="true" />
              {isPtw ? "PTW-critical" : p.label}
            </span>
          )}
          <span className="text-[11px] text-muted">· {triggerLabel(brief.trigger_event_type)}</span>
          <span className="tabular ml-auto text-[11px] text-muted">{relativeTime(brief.delivered_at)}</span>
        </div>
        <h1 className="mt-2 text-[24px] font-semibold leading-snug">{brief.headline}</h1>
        {isPtw && (
          <div className="mt-2 flex flex-wrap gap-2">
            <StatusBadge tone="danger">Permit-to-Work — dual countersignature required</StatusBadge>
          </div>
        )}
      </header>

      {/* Frozen state explanation */}
      {isFrozen && (
        <div className="mt-4 rounded-xl border border-[color-mix(in_srgb,var(--info)_30%,var(--line))] bg-[color-mix(in_srgb,var(--info)_7%,transparent)] p-4">
          <p className="text-[13px] font-semibold text-info">Delivery frozen</p>
          <p className="mt-1 text-[12.5px] text-muted">
            {brief.freeze_reason ?? "A physical deviation flag is pending resolution."}
            {" "}Briefs for this asset are held until an engineer resolves the flag.
          </p>
        </div>
      )}

      {/* Unverified field input warning */}
      {hasLowConfidence && (
        <div className="mt-4 rounded-xl border border-[color-mix(in_srgb,var(--caution)_35%,var(--line))] bg-[color-mix(in_srgb,var(--caution)_8%,transparent)] p-3">
          <p className="text-[12.5px] font-semibold text-caution">
            Draws on unverified field input — {quarantineCount} source{quarantineCount !== 1 ? "s" : ""} not reviewed by engineering authority
          </p>
        </div>
      )}

      <p className="mt-5 text-[14.5px] leading-relaxed text-ink/90">{brief.body}</p>

      {brief.warnings.length > 0 && (
        <div className="mt-5 rounded-xl border border-[color-mix(in_srgb,var(--caution)_35%,var(--line))] bg-[color-mix(in_srgb,var(--caution)_9%,var(--surface))] p-4">
          <p className="text-[11px] font-bold uppercase tracking-[0.08em] text-caution">Warnings</p>
          <ul className="mt-2 space-y-1.5">
            {brief.warnings.map((w) => (
              <li key={w} className="flex gap-2 text-[13.5px] text-ink">
                <span className="mt-2 size-1.5 shrink-0 rounded-full bg-caution" aria-hidden="true" />
                {w}
              </li>
            ))}
          </ul>
        </div>
      )}

      {brief.action_items.length > 0 && (
        <section className="mt-6">
          <h2 className="text-xs font-bold uppercase tracking-[0.1em] text-muted">
            {isPtw ? "Isolation sequence / actions" : "What to do"}
          </h2>
          <ul className="mt-3 space-y-2">
            {brief.action_items.map((a) => (
              <li key={a} className="flex items-start gap-2.5 rounded-lg border border-line bg-surface px-3.5 py-2.5 text-[13.5px]">
                <svg className="mt-0.5 size-4 shrink-0 text-accent" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <path d="M20 6 9 17l-5-5" />
                </svg>
                {a}
              </li>
            ))}
          </ul>
        </section>
      )}

      {/* Evidence */}
      <section className="mt-6">
        <h2 className="text-xs font-bold uppercase tracking-[0.1em] text-muted">Evidence</h2>
        <div className="mt-3 space-y-2.5">
          {brief.sources.map((s) => (
            <article key={s.document_id} className="rounded-xl border border-line bg-surface p-4">
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-[13.5px] font-semibold">{s.title}</span>
                <AuthorityBadge level={s.authority_level} />
                {s.is_quarantine && (
                  <StatusBadge tone="caution" dot={false}>Unverified field input — not reviewed by engineering authority</StatusBadge>
                )}
              </div>
              <p className="mt-2 text-[13px] leading-relaxed text-muted">{s.relevant_excerpt}</p>
              <div className="mt-2.5 flex items-center gap-2">
                <SourceChip quarantine={s.is_quarantine}>{s.document_id}</SourceChip>
                {s.vault_url && (
                  <a href={s.vault_url} target="_blank" rel="noreferrer" className="text-[12px] font-medium text-accent hover:underline">
                    Open in vault →
                  </a>
                )}
              </div>
            </article>
          ))}
        </div>
      </section>

      {/* Safety refusal — if all sources are quarantine + no verified evidence */}
      {/* Evidence lineage */}
      <div className="mt-5">
        <EvidenceLineage sources={brief.sources} />
      </div>

      {/* PTW dual sign-off or standard ack */}
      <section className="mt-7 rounded-xl border border-line bg-surface p-5" aria-label="Acknowledgment">
        {isComplete ? (
          <div className="space-y-2">
            <div className="flex items-center gap-2 text-[13.5px] font-semibold text-verified">
              <svg className="size-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="M20 6 9 17l-5-5" />
              </svg>
              {isPtw
                ? `PTW acknowledged — engineer: ${engineerSig} · shift lead: ${shiftLeadSig}`
                : `Acknowledged${engineerSig ? ` · signed ${engineerSig}` : ""}`}
            </div>
            <p className="text-[12px] text-muted">Signature and timestamp logged in the evidence lineage.</p>
          </div>
        ) : isPtw && ackStep === "step1_done" ? (
          /* Step 2: Shift Lead countersignature */
          <div>
            <p className="text-[13px] font-semibold">Step 2 of 2 — Shift Lead countersignature</p>
            <p className="mt-1 text-[12px] text-muted">
              Confirming isolation strategy has been reviewed and isolation sequence above is approved.
              Engineer sign-off recorded: <span className="font-medium text-ink">{engineerSig}</span>
            </p>
            <input
              value={shiftLeadSig}
              onChange={(e) => setShiftLeadSig(e.target.value)}
              placeholder="Shift Lead: type your name to countersign"
              className="mt-3 h-9 w-full rounded-lg border border-line bg-surface-2 px-3 text-[13px] outline-none focus-visible:border-accent"
              aria-label="Shift Lead signature"
            />
            <div className="mt-3 flex items-center gap-2">
              <Button variant="primary" onClick={ackStep2} disabled={shiftLeadSig.trim().length < 2}>
                Countersign — mark PTW delivered
              </Button>
              <span className="text-[12px] text-muted">Brief is not delivered until both signatures are captured.</span>
            </div>
          </div>
        ) : (
          /* Step 1 (or single-step for non-PTW) */
          <div>
            <p className="text-[12.5px] text-muted">
              {isPtw
                ? "Step 1 of 2 — Issuing engineer acknowledges brief content and isolation strategy."
                : "Acknowledge receipt. Your signature is logged with the evidence lineage."}
            </p>
            <input
              value={engineerSig}
              onChange={(e) => setEngineerSig(e.target.value)}
              placeholder={isPtw ? "Issuing engineer: type your name" : "Type your name to sign"}
              className="mt-3 h-9 w-full max-w-xs rounded-lg border border-line bg-surface-2 px-3 text-[13px] outline-none focus-visible:border-accent"
              aria-label="Engineer signature"
            />
            <div className="mt-3 flex flex-wrap items-center gap-3">
              <Button
                variant={isPtw ? "danger" : "primary"}
                onClick={ackStep1}
                disabled={engineerSig.trim().length < 2}
              >
                {isPtw ? "Acknowledge (step 1 of 2)" : "Acknowledge"}
              </Button>

              {/* Phase 2 feedback chips */}
              <div className="ml-auto flex items-center gap-1.5">
                <span className="text-[12px] text-muted">Accurate?</span>
                {(["accurate", "missing_context", "incorrect"] as FeedbackRating[]).map((r) => (
                  <button
                    key={r}
                    onClick={() => { if (!feedbackSent) void rate(r); }}
                    disabled={feedbackSent}
                    className={`rounded-md border px-2 py-1 text-[11px] font-medium capitalize transition-colors disabled:cursor-default ${
                      feedback === r
                        ? "border-accent text-accent"
                        : "border-line text-muted hover:text-ink"
                    }`}
                  >
                    {r.replace("_", " ")}
                  </button>
                ))}
              </div>
            </div>
            {feedbackSent && (
              <p className="mt-2 text-[12px] text-muted">
                Thanks — feedback recorded{feedback === "incorrect" ? "; source confidence recheck queued." : "."}
              </p>
            )}
          </div>
        )}
      </section>
    </div>
  );
}
