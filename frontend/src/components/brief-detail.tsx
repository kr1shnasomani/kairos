"use client";

import Link from "next/link";
import { useState } from "react";
import type { Brief } from "@/lib/types";
import { priorityMeta, relativeTime, triggerLabel } from "@/lib/utils";
import { ackBrief, sendBriefFeedback } from "@/lib/api";
import { AuthorityBadge, Button, SourceChip, StatusBadge } from "./ui";

type FeedbackRating = "accurate" | "missing_context" | "incorrect";

export function BriefDetail({ brief }: { brief: Brief }) {
  const p = priorityMeta(brief.priority);
  const [acked, setAcked] = useState(false);
  const [signature, setSignature] = useState("");
  const [feedback, setFeedback] = useState<FeedbackRating | null>(null);

  const needsSig = brief.requires_countersignature;
  const canAck = !needsSig || signature.trim().length > 1;

  // Optimistic UI + real write. Falls through gracefully if the backend rejects.
  function ack() {
    if (!canAck) return;
    setAcked(true);
    ackBrief(brief.brief_id, { signature: signature || undefined }).catch(() => {});
  }

  function rate(r: FeedbackRating) {
    setFeedback(r);
    sendBriefFeedback(brief.brief_id, r).catch(() => {});
  }

  return (
    <div className="mx-auto max-w-3xl px-5 py-8 sm:px-8 sm:py-10">
      <Link href="/briefs" className="inline-flex items-center gap-1.5 text-[13px] text-muted hover:text-ink">
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
          <path d="M15 18l-6-6 6-6" />
        </svg>
        Briefs
      </Link>

      <header className="mt-4">
        <div className="flex items-center gap-2">
          <span className="inline-flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-[0.04em]" style={{ color: p.color }}>
            <span className="size-1.5 rounded-full bg-current" aria-hidden="true" />
            {p.label}
          </span>
          <span className="text-[11px] text-muted">· {triggerLabel(brief.trigger_event_type)}</span>
          <span className="tabular ml-auto text-[11px] text-muted">{relativeTime(brief.delivered_at)}</span>
        </div>
        <h1 className="mt-2 text-[24px] font-semibold leading-snug">{brief.headline}</h1>
      </header>

      <p className="mt-4 text-[14.5px] leading-relaxed text-ink/90">{brief.body}</p>

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
          <h2 className="text-xs font-bold uppercase tracking-[0.1em] text-muted">What to do</h2>
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

      <section className="mt-6">
        <h2 className="text-xs font-bold uppercase tracking-[0.1em] text-muted">Evidence</h2>
        <div className="mt-3 space-y-2.5">
          {brief.sources.map((s) => (
            <article key={s.document_id} className="rounded-xl border border-line bg-surface p-4">
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-[13.5px] font-semibold">{s.title}</span>
                <AuthorityBadge level={s.authority_level} />
                {s.is_quarantine && <StatusBadge tone="caution">Unverified field input</StatusBadge>}
              </div>
              <p className="mt-2 text-[13px] leading-relaxed text-muted">{s.relevant_excerpt}</p>
              <div className="mt-2.5 flex items-center gap-2">
                <SourceChip quarantine={s.is_quarantine}>{s.document_id}</SourceChip>
                {s.vault_url && (
                  <a href={s.vault_url} className="text-[12px] font-medium text-accent hover:underline">
                    Open in vault →
                  </a>
                )}
              </div>
            </article>
          ))}
        </div>
      </section>

      {/* Acknowledge — legal accountability stays with the human */}
      <section className="mt-7 rounded-xl border border-line bg-surface p-4">
        {acked ? (
          <div className="flex items-center gap-2 text-[13.5px] font-semibold text-verified">
            <svg className="size-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M20 6 9 17l-5-5" />
            </svg>
            Acknowledged{signature ? ` · signed ${signature}` : ""}
          </div>
        ) : (
          <>
            {needsSig && (
              <div className="mb-3">
                <p className="text-[12px] text-muted">
                  Safety-critical — a digital signature is logged with the evidence lineage.
                </p>
                <input
                  value={signature}
                  onChange={(e) => setSignature(e.target.value)}
                  placeholder="Type your name to sign"
                  className="mt-2 h-9 w-full max-w-xs rounded-lg border border-line bg-surface-2 px-3 text-[13px] outline-none focus:border-accent"
                />
              </div>
            )}
            <div className="flex flex-wrap items-center gap-2">
              <Button variant="primary" onClick={ack} disabled={!canAck}>
                Acknowledge
              </Button>
              <div className="ml-auto flex items-center gap-1.5">
                <span className="mr-1 text-[12px] text-muted">Accurate?</span>
                {(["accurate", "missing_context", "incorrect"] as FeedbackRating[]).map((r) => (
                  <button
                    key={r}
                    onClick={() => rate(r)}
                    className={`rounded-md border px-2 py-1 text-[11px] font-medium capitalize transition-colors ${
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
            {feedback && (
              <p className="mt-2 text-[12px] text-muted">
                Thanks — feedback recorded{feedback === "incorrect" ? "; confidence recheck queued." : "."}
              </p>
            )}
          </>
        )}
      </section>
    </div>
  );
}
