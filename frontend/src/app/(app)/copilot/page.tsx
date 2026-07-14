"use client";

import { useEffect, useRef, useState } from "react";
import { SUGGESTIONS, type CopilotAnswer, type ExtractedEntity } from "@/lib/copilot";
import { synthesize, createAnnotation } from "@/lib/api";
import { AuthorityBadge, SourceChip, StatusBadge, ConfidenceMeter } from "@/components/ui";
import { cn } from "@/lib/utils";

// Web Speech API — not available in all browsers; typed as any to avoid lib conflicts.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type SpeechRecogAny = any;

interface Turn {
  id: number;
  query: string;
  asOf?: string;
  answer: CopilotAnswer | null; // null while thinking
}

// Phase 1 = retrieval only (no synthesized prose); 2+ = full synthesis.
const PHASE = process.env.NEXT_PUBLIC_KAIROS_PHASE ?? "3";
const SYNTHESIS_ENABLED = PHASE !== "1";

const ENTITY_TYPES = [
  "Asset", "Equipment", "Part", "Substance", "Parameter",
  "FailureMode", "Valve", "Instrument", "Person", "Organization",
  "Location", "Event", "Document", "Procedure",
];

export default function CopilotPage() {
  const [turns, setTurns] = useState<Turn[]>([]);
  const [input, setInput] = useState("");
  const [asOf, setAsOf] = useState("");
  const endRef = useRef<HTMLDivElement>(null);
  const nextId = useRef(0);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [turns]);

  function ask(query: string) {
    const q = query.trim();
    if (!q) return;
    const id = nextId.current++;
    setInput("");
    setTurns((t) => [...t, { id, query: q, asOf: asOf || undefined, answer: null }]);
    synthesize(q, asOf || undefined).then((answer) => {
      setTurns((t) => t.map((turn) => (turn.id === id ? { ...turn, answer } : turn)));
    });
  }

  const empty = turns.length === 0;

  return (
    <div className="mx-auto flex min-h-[calc(100dvh-1px)] max-w-3xl flex-col px-5 sm:px-8">
      <div className="flex-1 py-8">
        {empty ? (
          <div className="flex min-h-[60vh] flex-col items-center justify-center text-center">
            <p className="text-label font-bold uppercase tracking-[0.1em] text-accent">
              Expert copilot
            </p>
            <h1 className="mt-2 text-display font-semibold text-balance">
              Ask the governed knowledge base
            </h1>
            <p className="mt-2 max-w-md text-sm leading-relaxed text-muted text-pretty">
              Every answer is assembled from source documents with citations and confidence. On
              safety-critical parameters it refuses rather than guess.
            </p>
            {!SYNTHESIS_ENABLED && (
              <div className="mt-3 inline-flex items-center gap-1.5 rounded-full border border-[color-mix(in_srgb,var(--caution)_35%,var(--line))] bg-[color-mix(in_srgb,var(--caution)_8%,transparent)] px-3 py-1.5 text-caption text-caution">
                <span className="size-1.5 shrink-0 rounded-full bg-caution" aria-hidden="true" />
                Phase 1 — retrieval only; synthesis unlocks in Phase 2
              </div>
            )}
            <div className="mt-6 flex max-w-xl flex-wrap justify-center gap-2">
              {SUGGESTIONS.map((s) => (
                <button
                  key={s}
                  onClick={() => ask(s)}
                  className="rounded-full border border-line bg-surface px-3.5 py-2 text-body text-ink transition-colors hover:border-[color-mix(in_srgb,var(--accent)_40%,var(--line))] hover:text-accent"
                >
                  {s}
                </button>
              ))}
            </div>
          </div>
        ) : (
          <div className="flex flex-col gap-7">
            {turns.map((t) => (
              <div key={t.id} className="flex flex-col gap-4">
                <div className="flex flex-col items-end gap-0.5">
                  <p className="max-w-[80%] rounded-2xl rounded-br-sm bg-accent px-4 py-2.5 text-sm leading-relaxed text-on-accent">
                    {t.query}
                  </p>
                  {t.asOf && (
                    <span className="text-micro text-muted">
                      as of{" "}
                      {new Date(t.asOf).toLocaleDateString("en-IN", {
                        day: "numeric",
                        month: "short",
                        year: "numeric",
                      })}
                    </span>
                  )}
                </div>
                <div>{t.answer ? <Answer data={t.answer} /> : <Thinking />}</div>
              </div>
            ))}
            <div ref={endRef} />
          </div>
        )}
      </div>

      <div className="sticky bottom-0 -mx-5 bg-canvas px-5 pb-5 pt-3 sm:-mx-8 sm:px-8">
        <Composer
          value={input}
          onChange={setInput}
          onSubmit={() => ask(input)}
          asOf={asOf}
          onAsOfChange={setAsOf}
        />
        <p className="mt-2 text-center text-label text-muted">
          Answers cite sources and refuse on safety-critical parameters. Verify before acting.
        </p>
      </div>
    </div>
  );
}

function Thinking() {
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

function Answer({ data }: { data: CopilotAnswer }) {
  const [feedback, setFeedback] = useState<string | null>(null);

  const hasQuarantine = data.sources.some((s) => s.is_quarantine);
  // Non-safety, non-refused, low confidence — show uncertainty block.
  const uncertain = !data.refused && data.confidence < 0.7;

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

/** Inline entity annotation chips. Low-confidence entities get confirm / correct / delete. */
function EntityAnnotations({ entities }: { entities: ExtractedEntity[] }) {
  const [actions, setActions] = useState<Record<string, "confirmed" | "deleted" | "corrected">>({});
  const [editing, setEditing] = useState<string | null>(null);
  const [correctedTypes, setCorrectedTypes] = useState<Record<string, string>>({});

  function entityKey(e: ExtractedEntity) {
    return `${e.document_id}::${e.entity_text}`;
  }

  function annotate(e: ExtractedEntity, isCorrect: boolean, correctedType?: string) {
    const k = entityKey(e);
    // optimistic update
    setActions((a) => ({
      ...a,
      [k]: isCorrect ? "confirmed" : correctedType ? "corrected" : "deleted",
    }));
    setEditing(null);
    createAnnotation({
      document_id: e.document_id,
      entity_text: e.entity_text,
      entity_type: e.entity_type,
      corrected_type: correctedType,
      is_correct: isCorrect,
    }).catch(() => {}); // fire-and-forget; optimistic stays
  }

  const visible = entities.filter((e) => actions[entityKey(e)] !== "deleted");
  if (visible.length === 0) return null;

  return (
    <div>
      <p className="mb-2 text-micro font-bold uppercase tracking-[0.1em] text-muted">
        Extracted entities
      </p>
      <div className="flex flex-wrap gap-2">
        {visible.map((e) => {
          const k = entityKey(e);
          const action = actions[k];
          const lowConf = e.confidence < 0.7;
          const isEditing = editing === k;

          return (
            <div key={k} className="flex flex-col gap-1">
              <div
                className={cn(
                  "flex items-center gap-1 rounded-full border px-2.5 py-1 text-label",
                  action === "confirmed"
                    ? "border-[color-mix(in_srgb,var(--verified)_40%,var(--line))] bg-[color-mix(in_srgb,var(--verified)_8%,transparent)]"
                    : action === "corrected"
                    ? "border-[color-mix(in_srgb,var(--accent)_40%,var(--line))] bg-accent-soft"
                    : lowConf
                    ? "border-[color-mix(in_srgb,var(--caution)_40%,var(--line))] bg-[color-mix(in_srgb,var(--caution)_6%,transparent)]"
                    : "border-line bg-surface-2"
                )}
              >
                {lowConf && !action && (
                  <span
                    className="mr-0.5 size-1.5 shrink-0 rounded-full bg-caution"
                    aria-hidden="true"
                  />
                )}
                <span
                  className={cn(
                    "font-medium",
                    action === "confirmed"
                      ? "text-verified"
                      : action === "corrected"
                      ? "text-accent"
                      : "text-ink"
                  )}
                >
                  {e.entity_text}
                </span>
                <span className="ml-0.5 text-micro text-muted">
                  {action === "corrected" ? correctedTypes[k] : e.entity_type}
                </span>

                {lowConf && !action && !isEditing && (
                  <span className="ml-1 flex items-center gap-0.5">
                    <button
                      onClick={() => annotate(e, true)}
                      aria-label={`Confirm ${e.entity_text} as ${e.entity_type}`}
                      className="grid size-6 shrink-0 place-items-center rounded-full text-label text-muted transition-colors hover:bg-[color-mix(in_srgb,var(--verified)_15%,transparent)] hover:text-verified"
                    >
                      ✓
                    </button>
                    <button
                      onClick={() => {
                        setCorrectedTypes((c) => ({ ...c, [k]: e.entity_type }));
                        setEditing(k);
                      }}
                      aria-label={`Correct type for ${e.entity_text}`}
                      className="grid size-6 shrink-0 place-items-center rounded-full text-label text-muted transition-colors hover:bg-accent-soft hover:text-accent"
                    >
                      ✎
                    </button>
                    <button
                      onClick={() => annotate(e, false)}
                      aria-label={`Remove entity ${e.entity_text}`}
                      className="grid size-6 shrink-0 place-items-center rounded-full text-label text-muted transition-colors hover:bg-[color-mix(in_srgb,var(--danger)_15%,transparent)] hover:text-danger"
                    >
                      ✕
                    </button>
                  </span>
                )}

                {action === "confirmed" && (
                  <span className="ml-0.5 text-micro text-verified" aria-label="Confirmed">✓</span>
                )}
              </div>

              {isEditing && (
                <div className="ml-1 flex items-center gap-1.5 pl-1">
                  <select
                    value={correctedTypes[k]}
                    onChange={(ev) =>
                      setCorrectedTypes((c) => ({ ...c, [k]: ev.target.value }))
                    }
                    className="rounded border border-line bg-surface-2 px-1.5 py-0.5 text-label outline-none focus-visible:border-accent"
                    aria-label={`Select corrected type for ${e.entity_text}`}
                  >
                    {ENTITY_TYPES.map((t) => (
                      <option key={t} value={t}>
                        {t}
                      </option>
                    ))}
                  </select>
                  <button
                    onClick={() => annotate(e, false, correctedTypes[k])}
                    className="rounded border border-accent bg-accent-soft px-2 py-0.5 text-label font-medium text-accent transition-colors hover:bg-[color-mix(in_srgb,var(--accent)_15%,transparent)]"
                  >
                    Save
                  </button>
                  <button
                    onClick={() => setEditing(null)}
                    className="rounded border border-line px-2 py-0.5 text-label text-muted transition-colors hover:text-ink"
                  >
                    Cancel
                  </button>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function Composer({
  value,
  onChange,
  onSubmit,
  asOf,
  onAsOfChange,
}: {
  value: string;
  onChange: (v: string) => void;
  onSubmit: () => void;
  asOf: string;
  onAsOfChange: (v: string) => void;
}) {
  const [listening, setListening] = useState(false);
  const [showAsOf, setShowAsOf] = useState(false);
  const recogRef = useRef<SpeechRecogAny>(null);
  const hasSpeech =
    typeof window !== "undefined" &&
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    ((window as any).SpeechRecognition || (window as any).webkitSpeechRecognition);

  const today =
    typeof window !== "undefined" ? new Date().toISOString().split("T")[0] : undefined;

  function toggleVoice() {
    if (listening) {
      recogRef.current?.stop();
      setListening(false);
      return;
    }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const win = window as any;
    const SR = win.SpeechRecognition ?? win.webkitSpeechRecognition;
    const r = new SR();
    r.lang = "en-IN";
    r.interimResults = false;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    r.onresult = (e: any) => {
      const transcript = e.results[0]?.[0]?.transcript ?? "";
      if (transcript) onChange((value ? value + " " : "") + transcript);
    };
    r.onend = () => setListening(false);
    r.onerror = () => setListening(false);
    r.start();
    recogRef.current = r;
    setListening(true);
  }

  return (
    <div className="flex flex-col gap-2">
      {/* Time-travel date picker — shown when toggled or when a date is set */}
      {(showAsOf || asOf) && (
        <div className="flex items-center gap-2 text-label">
          <label htmlFor="copilot-asof" className="font-medium text-muted">
            As of
          </label>
          <input
            id="copilot-asof"
            type="date"
            value={asOf}
            onChange={(e) => onAsOfChange(e.target.value)}
            max={today}
            className="rounded-md border border-line bg-surface px-2 py-1 text-label outline-none focus-visible:border-accent"
          />
          {asOf && (
            <button
              type="button"
              onClick={() => {
                onAsOfChange("");
                setShowAsOf(false);
              }}
              className="text-muted transition-colors hover:text-ink"
              aria-label="Clear time travel date"
            >
              Clear
            </button>
          )}
        </div>
      )}

      <form
        onSubmit={(e) => {
          e.preventDefault();
          onSubmit();
        }}
        className="flex items-center gap-2 rounded-2xl border border-line bg-surface py-2 pl-4 pr-2 focus-within:border-[color-mix(in_srgb,var(--accent)_45%,var(--line))]"
      >
        <input
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder="Ask about an asset, failure, procedure, or requirement…"
          className="min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:text-muted"
          aria-label="Ask the copilot"
        />

        {/* Time-travel toggle */}
        <button
          type="button"
          onClick={() => setShowAsOf((v) => !v)}
          aria-label={asOf ? `Time travel set: ${asOf}` : "Set time travel date"}
          aria-pressed={showAsOf || !!asOf}
          title="Query as of a past date"
          className={cn(
            "grid size-9 shrink-0 place-items-center rounded-xl transition-colors",
            asOf
              ? "bg-accent-soft text-accent"
              : "text-muted hover:bg-surface-2 hover:text-ink"
          )}
        >
          <svg
            width="16"
            height="16"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.8"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
          >
            <circle cx="12" cy="12" r="10" />
            <polyline points="12 6 12 12 16 14" />
          </svg>
        </button>

        {hasSpeech && (
          <button
            type="button"
            onClick={toggleVoice}
            aria-label={listening ? "Stop listening" : "Speak your question"}
            aria-pressed={listening}
            className={cn(
              "grid size-9 shrink-0 place-items-center rounded-xl transition-colors",
              listening
                ? "bg-[color-mix(in_srgb,var(--danger)_15%,transparent)] text-danger"
                : "text-muted hover:bg-surface-2 hover:text-ink"
            )}
          >
            <svg
              width="17"
              height="17"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.8"
              strokeLinecap="round"
              aria-hidden="true"
            >
              <path d="M12 1a4 4 0 0 0-4 4v7a4 4 0 0 0 8 0V5a4 4 0 0 0-4-4z" />
              <path d="M19 11a7 7 0 0 1-14 0M12 18v3M9 21h6" />
            </svg>
          </button>
        )}

        <button
          type="submit"
          disabled={!value.trim()}
          aria-label="Send"
          className="grid size-9 shrink-0 place-items-center rounded-xl bg-accent text-on-accent transition-opacity disabled:opacity-40"
        >
          <svg
            width="17"
            height="17"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
          >
            <path d="M22 2 11 13M22 2l-7 20-4-9-9-4z" />
          </svg>
        </button>
      </form>
    </div>
  );
}
