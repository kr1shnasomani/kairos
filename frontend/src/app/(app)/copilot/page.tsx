"use client";

import { useEffect, useRef, useState } from "react";
import { answerFor, SUGGESTIONS, type CopilotAnswer } from "@/lib/copilot";
import { AuthorityBadge, SourceChip, StatusBadge } from "@/components/ui";

interface Turn {
  id: number;
  query: string;
  answer: CopilotAnswer | null; // null while thinking
}

export default function CopilotPage() {
  const [turns, setTurns] = useState<Turn[]>([]);
  const [input, setInput] = useState("");
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [turns]);

  function ask(query: string) {
    const q = query.trim();
    if (!q) return;
    const id = Date.now();
    setInput("");
    setTurns((t) => [...t, { id, query: q, answer: null }]);
    // Fixture stand-in for /search + /search/synthesize while backend is offline.
    setTimeout(() => {
      setTurns((t) => t.map((turn) => (turn.id === id ? { ...turn, answer: answerFor(q) } : turn)));
    }, 650);
  }

  const empty = turns.length === 0;

  return (
    <div className="mx-auto flex min-h-[calc(100dvh-1px)] max-w-3xl flex-col px-5 sm:px-8">
      <div className="flex-1 py-8">
        {empty ? (
          <div className="flex min-h-[60vh] flex-col items-center justify-center text-center">
            <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-accent">
              Expert copilot
            </p>
            <h1 className="mt-2 text-[26px] font-semibold">Ask the governed knowledge base</h1>
            <p className="mt-2 max-w-md text-[14px] leading-relaxed text-muted">
              Every answer is assembled from source documents with citations and confidence. On
              safety-critical parameters it refuses rather than guess.
            </p>
            <div className="mt-6 flex max-w-xl flex-wrap justify-center gap-2">
              {SUGGESTIONS.map((s) => (
                <button
                  key={s}
                  onClick={() => ask(s)}
                  className="rounded-full border border-line bg-surface px-3.5 py-2 text-[13px] text-ink transition-colors hover:border-[color-mix(in_srgb,var(--accent)_40%,var(--line))] hover:text-accent"
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
                <div className="flex justify-end">
                  <p className="max-w-[80%] rounded-2xl rounded-br-sm bg-accent px-4 py-2.5 text-[14px] leading-relaxed text-on-accent">
                    {t.query}
                  </p>
                </div>
                <div>{t.answer ? <Answer data={t.answer} /> : <Thinking />}</div>
              </div>
            ))}
            <div ref={endRef} />
          </div>
        )}
      </div>

      <div className="sticky bottom-0 -mx-5 bg-canvas px-5 pb-5 pt-3 sm:-mx-8 sm:px-8">
        <Composer value={input} onChange={setInput} onSubmit={() => ask(input)} />
        <p className="mt-2 text-center text-[11px] text-muted">
          Answers cite sources and refuse on safety-critical parameters. Verify before acting.
        </p>
      </div>
    </div>
  );
}

function Thinking() {
  return (
    <div className="flex items-center gap-2 text-[13px] text-muted">
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

  return (
    <div className="rounded-2xl rounded-bl-sm border border-line bg-surface p-4">
      {data.refused ? (
        <div className="rounded-lg border border-[color-mix(in_srgb,var(--danger)_35%,var(--line))] bg-[color-mix(in_srgb,var(--danger)_8%,var(--surface))] p-3.5">
          <div className="flex items-center gap-2">
            <StatusBadge tone="danger">Refused · safety-critical</StatusBadge>
          </div>
          <p className="mt-2 text-[13.5px] leading-relaxed text-ink">{data.refusal_reason}</p>
        </div>
      ) : (
        <p className="text-[14.5px] leading-relaxed text-ink">{data.answer}</p>
      )}

      {data.sources.length > 0 && (
        <div className="mt-3.5">
          <p className="text-[10.5px] font-bold uppercase tracking-[0.1em] text-muted">
            {data.refused ? "Sources — verify directly" : "Sources"}
          </p>
          <div className="mt-2 space-y-2">
            {data.sources.map((s) => (
              <div key={s.document_id} className="flex flex-col gap-1.5 rounded-lg border border-line bg-surface-2 p-3">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-[13px] font-semibold">{s.title}</span>
                  <AuthorityBadge level={s.authority_level} />
                  {s.is_quarantine && <StatusBadge tone="caution">Unverified</StatusBadge>}
                </div>
                <p className="text-[12.5px] leading-relaxed text-muted">{s.excerpt}</p>
                <SourceChip quarantine={s.is_quarantine}>{s.document_id}</SourceChip>
              </div>
            ))}
          </div>
        </div>
      )}

      {!data.refused && (
        <div className="mt-3 flex items-center gap-3 border-t border-line pt-3 text-[11px] text-muted">
          <span className="tabular">confidence {data.confidence.toFixed(2)}</span>
          {data.model && <span className="tabular truncate">· {data.model}</span>}
          <div className="ml-auto flex items-center gap-1.5">
            {["accurate", "missing_context", "incorrect"].map((r) => (
              <button
                key={r}
                onClick={() => setFeedback(r)}
                className={`rounded-md border px-2 py-1 text-[11px] font-medium capitalize transition-colors ${
                  feedback === r ? "border-accent text-accent" : "border-line hover:text-ink"
                }`}
              >
                {r.replace("_", " ")}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function Composer({
  value,
  onChange,
  onSubmit,
}: {
  value: string;
  onChange: (v: string) => void;
  onSubmit: () => void;
}) {
  return (
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
        className="min-w-0 flex-1 bg-transparent text-[14px] outline-none placeholder:text-muted"
        aria-label="Ask the copilot"
      />
      <button
        type="submit"
        disabled={!value.trim()}
        aria-label="Send"
        className="grid size-9 shrink-0 place-items-center rounded-xl bg-accent text-on-accent transition-opacity disabled:opacity-40"
      >
        <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M22 2 11 13M22 2l-7 20-4-9-9-4z" />
        </svg>
      </button>
    </form>
  );
}
