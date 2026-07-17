"use client";

import { useEffect, useRef, useState } from "react";
import { SUGGESTIONS, type CopilotAnswer } from "@/lib/copilot";
import { synthesize } from "@/lib/api";
import { Answer, Thinking, SYNTHESIS_ENABLED } from "./_components/answer-card";
import { Composer } from "./_components/composer";

interface Turn {
  id: number;
  query: string;
  asOf?: string;
  answer: CopilotAnswer | null; // null while thinking
}

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
    <div data-testid="copilot-workspace" className="mx-auto min-h-[calc(100dvh-1px)] max-w-[1400px] px-5 sm:px-8">
      <div data-testid="copilot-layout" className="grid min-h-[calc(100dvh-1px)] items-start gap-5 lg:grid-cols-[minmax(0,1fr)_300px]">
        <main data-testid="copilot-conversation" className="flex min-h-[calc(100dvh-1px)] min-w-0 flex-col">
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
        </main>

        <aside data-testid="copilot-context" className="hidden rounded-xl border border-line bg-surface p-4 shadow-sm lg:sticky lg:top-20 lg:mt-8 lg:block">
          <p className="text-label font-bold uppercase tracking-[0.1em] text-accent">Governed answers</p>
          <h2 className="mt-1 text-title font-semibold">Evidence before prose</h2>
          <p className="mt-2 text-caption leading-relaxed text-muted">
            Kairos cites governed sources, exposes uncertainty, and refuses safety-critical answers when confidence is insufficient.
          </p>
          <div className="mt-4 border-t border-line pt-4">
            <p className="text-micro font-semibold uppercase tracking-[0.1em] text-muted">Query scope</p>
            <p className="mt-1.5 text-caption font-medium text-ink">{asOf ? `Knowledge valid on ${asOf}` : "Current governed knowledge"}</p>
          </div>
          <div className="mt-4 border-t border-line pt-4">
            <p className="text-micro font-semibold uppercase tracking-[0.1em] text-muted">Conversation</p>
            <p className="tabular mt-1.5 text-caption text-ink">{turns.length} {turns.length === 1 ? "question" : "questions"} in this session</p>
          </div>
        </aside>
      </div>
    </div>
  );
}
