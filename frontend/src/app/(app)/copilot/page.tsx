"use client";

import { useEffect, useRef, useState } from "react";
import { SUGGESTIONS, metaAnswer, type CopilotAnswer } from "@/lib/copilot";
import { synthesize } from "@/lib/api";
import { Answer, AnswerError, Thinking, SYNTHESIS_ENABLED } from "./_components/answer-card";
import { Composer } from "./_components/composer";
import { cn } from "@/lib/utils";

interface Turn {
  id: number;
  query: string;
  asOf?: string;
  answer: CopilotAnswer | null;
  /** Set when retrieval or synthesis failed. The turn shows an error + retry —
   *  never a fabricated answer. */
  error?: string;
  /** Answer text streamed so far. PROVISIONAL — the safety gate can still replace the whole
   *  answer with a refusal, and safety-critical categories never stream at all. Held separately
   *  from `answer` so it is rendered as in-progress text and discarded once `answer` arrives. */
  streaming?: string;
}

function InfoPopover({ turnCount, asOf, onClose }: { turnCount: number; asOf: string; onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-50" onClick={onClose}>
      <div
        className="absolute right-4 top-[60px] w-72 rounded-2xl border border-line bg-surface p-5 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between">
          <p className="text-micro font-bold uppercase tracking-[0.1em] text-accent">Governed answers</p>
          <button
            onClick={onClose}
            aria-label="Close info"
            className="grid size-7 place-items-center rounded-lg text-muted transition-colors hover:bg-surface-2 hover:text-ink"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M18 6L6 18M6 6l12 12" />
            </svg>
          </button>
        </div>
        <h3 className="mt-1.5 text-title font-semibold">Evidence before prose</h3>
        <p className="mt-2 text-caption leading-relaxed text-muted">
          Kairos cites governed sources, exposes uncertainty, and refuses safety-critical answers when confidence is insufficient.
        </p>
        <div className="mt-4 space-y-3 border-t border-line pt-4">
          <div>
            <p className="text-micro font-semibold uppercase tracking-[0.1em] text-muted">Query scope</p>
            <p className="mt-1 text-caption font-medium text-ink">
              {asOf ? `Knowledge valid on ${asOf}` : "Current governed knowledge"}
            </p>
          </div>
          <div>
            <p className="text-micro font-semibold uppercase tracking-[0.1em] text-muted">Conversation</p>
            <p className="mt-1 text-caption tabular text-ink">
              {turnCount} {turnCount === 1 ? "question" : "questions"} in this session
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function CopilotPage() {
  const [turns, setTurns] = useState<Turn[]>([]);
  const [input, setInput] = useState("");
  const [asOf, setAsOf] = useState("");
  const [infoOpen, setInfoOpen] = useState(false);
  const endRef = useRef<HTMLDivElement>(null);
  const nextId = useRef(0);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [turns]);

  function run(id: number, q: string, at?: string) {
    setTurns((t) => t.map((turn) => (turn.id === id ? { ...turn, answer: null, error: undefined } : turn)));

    // "hello" / "what can you do?" are about the assistant, not the plant. Answering them
    // locally avoids a ~40 s synthesis call that would retrieve nothing relevant and come back
    // with a refusal or an answer stitched from unrelated documents. Plant questions are
    // untouched — metaAnswer returns null for anything it does not explicitly recognise.
    const meta = metaAnswer(q);
    if (meta) {
      setTurns((t) => t.map((turn) => (turn.id === id ? { ...turn, answer: meta } : turn)));
      return;
    }

    synthesize(
      q,
      at,
      (partial) => {
        setTurns((t) => t.map((turn) => (turn.id === id ? { ...turn, answer: partial } : turn)));
      },
      // Progressive render. p95 synthesis is ~65 s against NVIDIA's shared endpoint, so without
      // this the operator watches a spinner for over a minute.
      //
      // `streaming_text` is held on the turn, NOT merged into `answer`: the backend can still
      // convert a finished answer into a refusal (and withholds text entirely for safety-critical
      // categories), so this text is provisional until the promise resolves. Rendering it as the
      // answer would show a claim the safety gate is about to retract.
      (accumulated) => {
        setTurns((t) => t.map((turn) => (turn.id === id ? { ...turn, streaming: accumulated } : turn)));
      },
    )
      .then((answer) => {
        setTurns((t) => t.map((turn) => (turn.id === id ? { ...turn, answer } : turn)));
      })
      .catch((e: unknown) => {
        const message = e instanceof Error ? e.message : "Live data is unavailable.";
        setTurns((t) => t.map((turn) => (turn.id === id ? { ...turn, error: message } : turn)));
      });
  }

  function ask(query: string) {
    const q = query.trim();
    if (!q) return;
    const id = nextId.current++;
    const at = asOf || undefined;
    setInput("");
    setTurns((t) => [...t, { id, query: q, asOf: at, answer: null }]);
    run(id, q, at);
  }

  const empty = turns.length === 0;

  return (
    <div data-testid="copilot-workspace" className="relative flex flex-col h-[calc(100dvh-56px)] md:h-[calc(100dvh-64px)] w-full">
      {/* ⓘ absolute top-right inside the workspace */}
      <button
        id="copilot-info-btn"
        onClick={() => setInfoOpen((v) => !v)}
        aria-label="About governed answers"
        aria-expanded={infoOpen}
        className={cn(
          "absolute right-4 top-4 z-40 grid size-8 place-items-center rounded-full border text-muted transition-colors",
          infoOpen
            ? "border-accent bg-accent-soft text-accent"
            : "border-transparent hover:border-line hover:text-ink hover:bg-surface-2"
        )}
      >
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <circle cx="12" cy="12" r="10" />
          <path d="M12 16v-4M12 8h.01" />
        </svg>
      </button>

      {infoOpen && (
        <InfoPopover turnCount={turns.length} asOf={asOf} onClose={() => setInfoOpen(false)} />
      )}

      {/* Conversation scrollable area */}
      <div data-testid="copilot-conversation" className="flex min-h-0 flex-1 flex-col overflow-y-auto">
          {empty ? (
            <div className="flex flex-1 flex-col items-center justify-center px-4 text-center sm:px-8">
              <div className="mb-5 grid size-16 place-items-center rounded-2xl bg-accent-soft">
                <svg className="size-8 text-accent" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
                </svg>
              </div>
              <h1 className="text-display font-semibold text-balance text-ink">
                Ask the knowledge base
              </h1>
              <p className="mt-2 max-w-md text-sm leading-relaxed text-muted text-pretty">
                Every answer is assembled from governed source documents with citations and confidence scores. On safety-critical parameters, it refuses rather than guess.
              </p>
              {!SYNTHESIS_ENABLED && (
                <div className="mt-3 inline-flex items-center gap-1.5 rounded-full border border-[color-mix(in_srgb,var(--caution)_35%,var(--line))] bg-[color-mix(in_srgb,var(--caution)_8%,transparent)] px-3 py-1.5 text-caption text-caution">
                  <span className="size-1.5 shrink-0 rounded-full bg-caution" aria-hidden="true" />
                  Phase 1 — retrieval only; synthesis unlocks in Phase 2
                </div>
              )}
              <div className="mt-7 flex max-w-2xl flex-wrap justify-center gap-2">
                {SUGGESTIONS.map((s) => (
                  <button
                    key={s}
                    onClick={() => ask(s)}
                    className="rounded-full border border-line bg-surface px-4 py-2 text-body text-ink transition-all hover:border-[color-mix(in_srgb,var(--accent)_50%,var(--line))] hover:bg-accent-soft hover:text-accent"
                  >
                    {s}
                  </button>
                ))}
              </div>
            </div>
          ) : (
            <div className="mx-auto w-full max-w-3xl flex-1 space-y-8 px-4 py-8 sm:px-6">
              {turns.map((t) => (
                <div key={t.id} className="flex flex-col gap-4">
                  {/* User bubble — right aligned */}
                  <div className="flex justify-end">
                    <div className="max-w-[80%] space-y-1">
                      <div className="rounded-2xl rounded-br-sm bg-accent px-4 py-3 text-sm leading-relaxed text-on-accent">
                        {t.query}
                      </div>
                      {t.asOf && (
                        <p className="text-right text-label text-muted">
                          as of {new Date(t.asOf).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" })}
                        </p>
                      )}
                    </div>
                  </div>

                  {/* Kairos avatar + answer */}
                  <div className="flex items-start gap-3">
                    <div className="mt-1 grid size-8 shrink-0 place-items-center rounded-full bg-accent-soft">
                      <svg className="size-4 text-accent" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                        <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
                      </svg>
                    </div>
                    <div className="min-w-0 flex-1">
                      {t.error ? (
                        <AnswerError message={t.error} onRetry={() => run(t.id, t.query, t.asOf)} />
                      ) : t.answer ? (
                        <Answer data={t.answer} query={t.query} streaming={t.streaming} />
                      ) : (
                        <Thinking />
                      )}
                    </div>
                  </div>
                </div>
              ))}
              <div ref={endRef} />
            </div>
          )}
        </div>

        {/* Composer — pinned to bottom */}
        <div className="shrink-0 border-t border-line bg-canvas px-4 pb-4 pt-3 sm:px-6">
          <div className="mx-auto max-w-3xl">
            <Composer
              value={input}
              onChange={setInput}
              onSubmit={() => ask(input)}
              asOf={asOf}
              onAsOfChange={setAsOf}
            />
            <p className="mt-2 text-center text-label text-muted">
              Answers cite sources and refuse on safety-critical parameters.
            </p>
          </div>
        </div>
      </div>
  );
}
