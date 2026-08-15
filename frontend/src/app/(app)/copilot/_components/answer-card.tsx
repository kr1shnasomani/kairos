"use client";

import { useState } from "react";
import { META_MODEL, type CopilotAnswer } from "@/lib/copilot";
import { AuthorityBadge, SourceChip, StatusBadge, ConfidenceMeter } from "@/components/ui";
import { cn } from "@/lib/utils";
import { EntityAnnotations } from "./entity-annotations";

// Phase 1 = retrieval only (no synthesized prose); 2+ = full synthesis.
const PHASE = process.env.NEXT_PUBLIC_KAIROS_PHASE ?? "3";
export const SYNTHESIS_ENABLED = PHASE !== "1";

export function Thinking() {
  return (
    <div className="flex items-center gap-2 text-body text-muted">
      <span className="inline-flex gap-1" aria-hidden="true">
        <span className="size-1.5 animate-bounce rounded-full bg-muted [animation-delay:-0.3s]" />
        <span className="size-1.5 animate-bounce rounded-full bg-muted [animation-delay:-0.15s]" />
        <span className="size-1.5 animate-bounce rounded-full bg-muted" />
      </span>
      Assembling evidence…
    </div>
  );
}

/** Retrieval or synthesis failed. Shown instead of an answer — the copilot never
 *  substitutes fixture content for governed evidence. */
export function AnswerError({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <div data-testid="copilot-answer-error" role="alert" className="rounded-xl border border-line bg-surface p-4">
      <p className="text-body font-medium text-ink">No governed answer available.</p>
      <p className="mt-1 text-caption text-muted">{message}</p>
      <button
        type="button"
        onClick={onRetry}
        className="mt-3 inline-flex min-h-11 items-center rounded-lg border border-line bg-surface-2 px-4 text-caption font-medium text-ink transition-colors hover:bg-canvas"
      >
        Retry
      </button>
    </div>
  );
}

export function Answer({ data }: { data: CopilotAnswer }) {
  const [feedback, setFeedback] = useState<string | null>(null);

  const hasQuarantine = data.sources.some((s) => s.is_quarantine);
  // Non-safety, non-refused, low confidence — show uncertainty block.
  const uncertain = !data.refused && data.confidence < 0.7;
  // A locally-answered meta question ("what can you do?"). It has no sources because it is
  // not retrieved knowledge, which would otherwise make it the one answer in the app without
  // provenance. Rendered as a labelled system reply so it cannot be read as a governed claim,
  // and without the feedback control — there is no retrieval quality to rate.
  const isMeta = data.model === META_MODEL;

  if (isMeta) {
    return (
      <div className="space-y-3 rounded-2xl rounded-bl-sm border border-line bg-surface-2 p-4">
        <div className="flex items-center gap-2">
          <StatusBadge tone="neutral">About Kairos</StatusBadge>
          <span className="text-caption text-muted">Not a knowledge answer — no sources cited</span>
        </div>
        <div className="space-y-2 text-sm leading-relaxed text-ink">
          {(data.answer ?? "").split("\n").map((line, i) =>
            line.trim() === "" ? null : (
              <p key={i} className={line.startsWith("**") ? "font-semibold text-ink" : "text-pretty"}>
                {line.replace(/\*\*/g, "")}
              </p>
            ),
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-3.5 rounded-2xl rounded-bl-sm border border-line bg-surface p-4">
      {/* Quarantine dependency banner */}
      {hasQuarantine && (
        <div className="flex items-center gap-2 rounded-lg border border-[color-mix(in_srgb,var(--caution)_35%,var(--line))] bg-[color-mix(in_srgb,var(--caution)_8%,var(--surface))] px-3 py-2 text-caption text-caution">
          <svg
            className="size-3.5 shrink-0"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            aria-hidden="true"
          >
            <circle cx="12" cy="12" r="10" />
            <line x1="12" y1="8" x2="12" y2="12" />
            <line x1="12" y1="16" x2="12.01" y2="16" />
          </svg>
          Draws on unverified field input — treat with additional caution
        </div>
      )}

      {/* Safety-critical refusal — no synthesized prose, sources returned directly */}
      {data.refused ? (
        <div
          role="alert"
          className="rounded-lg border border-[color-mix(in_srgb,var(--danger)_35%,var(--line))] bg-[color-mix(in_srgb,var(--danger)_8%,var(--surface))] p-3.5"
        >
          <div className="flex items-start gap-2.5">
            <svg
              className="mt-0.5 size-4 shrink-0 text-danger"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
            >
              <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
              <line x1="12" y1="9" x2="12" y2="13" />
              <line x1="12" y1="17" x2="12.01" y2="17" />
            </svg>
            <div>
              <p className="text-body font-semibold text-danger">
                Safety-critical query — refused
              </p>
              {data.refusal_reason && (
                <p className="mt-1 text-caption leading-relaxed text-muted">
                  {data.refusal_reason}
                </p>
              )}
              <p className="mt-2 text-caption text-muted">
                Confirm the value directly with the responsible engineer before acting.
              </p>
            </div>
          </div>
        </div>
      ) : uncertain ? (
        /* Non-safety uncertainty: show answer but call out low evidence */
        <div className="rounded-lg border border-[color-mix(in_srgb,var(--caution)_35%,var(--line))] bg-[color-mix(in_srgb,var(--caution)_6%,var(--surface))] p-3.5">
          <div className="mb-2 flex items-center gap-2">
            <StatusBadge tone="caution">
              Low confidence · {Math.round(data.confidence * 100)}%
            </StatusBadge>
          </div>
          {SYNTHESIS_ENABLED && data.answer && (
            <p className="text-sm leading-relaxed text-ink text-pretty">{data.answer}</p>
          )}
          <p className="mt-2 border-t border-[color-mix(in_srgb,var(--caution)_20%,var(--line))] pt-2 text-caption leading-relaxed text-muted">
            Evidence below 70% threshold — verify directly against the sources below before acting.
            Escalate to the responsible engineer for any safety-affecting decision.
          </p>
        </div>
      ) : SYNTHESIS_ENABLED ? (
        <p className="text-sm leading-relaxed text-ink text-pretty">{data.answer}</p>
      ) : (
        /* Phase 1 gate — retrieval only */
        <div className="flex items-center gap-2 rounded-lg border border-[color-mix(in_srgb,var(--caution)_30%,var(--line))] bg-[color-mix(in_srgb,var(--caution)_6%,var(--surface))] px-3 py-2.5 text-caption text-caution">
          <span className="size-1.5 shrink-0 rounded-full bg-caution" aria-hidden="true" />
          Phase 1 — source documents returned directly. Synthesis activates in Phase 2.
        </div>
      )}

      {/* Sources with authority + quarantine badges */}
      {data.sources.length > 0 && (
        <div>
          <p className="text-micro font-bold uppercase tracking-[0.1em] text-muted">
            {data.refused ? "Sources — verify directly" : "Sources"}
          </p>
          <div className="mt-2 space-y-2">
            {data.sources.map((s) => (
              <div
                key={s.document_id}
                className="flex flex-col gap-1.5 rounded-lg border border-line bg-surface-2 p-3"
              >
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-body font-semibold">{s.title}</span>
                  <AuthorityBadge level={s.authority_level} />
                  {s.is_quarantine && <StatusBadge tone="caution">Unverified</StatusBadge>}
                </div>
                {s.excerpt && (
                  <p className="text-caption leading-relaxed text-muted">{s.excerpt}</p>
                )}
                <SourceChip quarantine={s.is_quarantine}>{s.document_id}</SourceChip>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Entity annotation chips */}
      {data.entities && data.entities.length > 0 && (
        <EntityAnnotations entities={data.entities} />
      )}

      {/* Footer: confidence meter + model + feedback */}
      {!data.refused && (
        <div className="space-y-2.5 border-t border-line pt-3">
          <ConfidenceMeter value={data.confidence} />
          <div className="flex items-center gap-3 text-label text-muted">
            {data.model && (
              <span className="max-w-[200px] truncate tabular">{data.model}</span>
            )}
            <div className="ml-auto flex items-center gap-1.5">
              {(["accurate", "missing_context", "incorrect"] as const).map((r) => (
                <button
                  key={r}
                  onClick={() => setFeedback(r)}
                  aria-pressed={feedback === r}
                  className={cn(
                    "rounded-md border px-2 py-1 text-label font-medium capitalize transition-colors",
                    feedback === r ? "border-accent text-accent" : "border-line hover:text-ink"
                  )}
                >
                  {r.replace("_", " ")}
                </button>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
