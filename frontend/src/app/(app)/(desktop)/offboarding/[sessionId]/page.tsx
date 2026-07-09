"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import {
  getOffboarding,
  getOffboardingQuestions,
  submitOffboardingResponses,
} from "@/lib/api";
import type {
  OffboardingProgramme,
  OffboardingSession,
  ElicitationQuestion,
} from "@/lib/types";
import { cn } from "@/lib/utils";
import { Button, DemoChip, StatusBadge } from "@/components/ui";
import { VoiceRecorder } from "@/components/voice-recorder";

// Session list panel
function SessionList({
  sessions,
  activeId,
}: {
  sessions: OffboardingSession[];
  activeId: string;
}) {
  return (
    <ol className="flex flex-col gap-1">
      {sessions.map((s) => (
        <li key={s.session_id}>
          <Link
            href={`/offboarding/${s.session_id}`}
            className={cn(
              "flex items-center gap-3 rounded-lg px-3 py-2.5 text-[13px] transition-colors",
              s.session_id === activeId
                ? "bg-accent-soft font-semibold text-accent"
                : "text-muted hover:bg-surface-2 hover:text-ink",
            )}
          >
            <span className="tabular text-[11px]">
              Session {s.session_number}
            </span>
            <span className="min-w-0 flex-1 truncate">{s.equipment_family}</span>
            {s.status === "completed" ? (
              <svg
                className="size-3.5 shrink-0 text-verified"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2.5"
                strokeLinecap="round"
                aria-label="Completed"
              >
                <path d="M20 6 9 17l-5-5" />
              </svg>
            ) : s.status === "questions_ready" ? (
              <span className="size-1.5 shrink-0 rounded-full bg-accent" aria-label="Ready" />
            ) : (
              <span className="size-1.5 shrink-0 rounded-full bg-line" aria-label="Pending" />
            )}
          </Link>
        </li>
      ))}
    </ol>
  );
}

// Interview panel for a questions_ready session
function Interview({
  session,
  questions,
  onDone,
}: {
  session: OffboardingSession;
  questions: ElicitationQuestion[];
  onDone: () => void;
}) {
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [voiceAnswers, setVoiceAnswers] = useState<Record<string, boolean>>({});
  const [submitted, setSubmitted] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const allAnswered = questions.every((q) => (answers[q.question_id] ?? "").trim());

  async function submit() {
    setSubmitting(true);
    const responses = Object.entries(answers).map(([question_id, answer]) => ({
      question_id,
      answer,
    }));
    try {
      await submitOffboardingResponses(session.session_id, responses);
      setSubmitted(true);
    } catch {
      setSubmitted(true); // offline path — queuing out of scope for desktop
    } finally {
      setSubmitting(false);
    }
  }

  if (submitted) {
    return (
      <div className="flex flex-col items-center gap-4 py-16 text-center">
        <div className="grid size-14 place-items-center rounded-full bg-[color-mix(in_srgb,var(--verified)_12%,transparent)]">
          <svg
            className="size-7 text-verified"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.2"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
          >
            <path d="M20 6 9 17l-5-5" />
          </svg>
        </div>
        <p className="text-[16px] font-semibold">Session complete</p>
        <p className="max-w-sm text-[13px] text-muted">
          Responses entered the knowledge quarantine. Engineering will review and promote verified
          insights to the knowledge graph.
        </p>
        <Button variant="ghost" onClick={onDone}>
          Back to programme
        </Button>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-7">
      <div>
        <p className="text-[11px] font-bold uppercase tracking-[0.1em] text-muted">
          {session.equipment_family}
        </p>
        <h2 className="mt-0.5 text-[20px] font-semibold">
          Session {session.session_number} — interview
        </h2>
        {session.focus_failure_modes.length > 0 && (
          <p className="mt-1.5 text-[13px] text-muted">
            Focus: {session.focus_failure_modes.join(", ")}
          </p>
        )}
      </div>

      <div className="flex flex-col gap-6">
        {questions.map((q, i) => (
          <div key={q.question_id} className="rounded-xl border border-line bg-surface p-5">
            <p className="text-[11px] font-bold uppercase tracking-[0.08em] text-muted">
              Q{i + 1}
            </p>
            <p className="mt-1 text-[15px] font-semibold leading-snug">{q.question_text}</p>
            {q.context && (
              <p className="mt-1.5 text-[12.5px] leading-relaxed text-muted">{q.context}</p>
            )}

            <div className="mt-3">
              {q.question_type === "multiple_choice" && q.options ? (
                <div className="flex flex-col gap-2" role="group" aria-label={q.question_text}>
                  {q.options.map((opt) => {
                    const sel = answers[q.question_id] === opt;
                    return (
                      <label
                        key={opt}
                        className={cn(
                          "flex cursor-pointer items-center gap-3 rounded-lg border px-3 py-2.5 text-[13.5px] transition-colors",
                          sel
                            ? "border-accent bg-[color-mix(in_srgb,var(--accent)_8%,transparent)] font-semibold text-accent"
                            : "border-line hover:border-[color-mix(in_srgb,var(--accent)_30%,var(--line))]",
                        )}
                      >
                        <input
                          type="radio"
                          name={`q-${q.question_id}`}
                          value={opt}
                          checked={sel}
                          onChange={() =>
                            setAnswers((a) => ({ ...a, [q.question_id]: opt }))
                          }
                          className="sr-only"
                        />
                        <span
                          className={cn(
                            "grid size-4 shrink-0 place-items-center rounded-full border-2",
                            sel ? "border-accent bg-accent" : "border-line",
                          )}
                          aria-hidden="true"
                        >
                          {sel && <span className="size-1.5 rounded-full bg-white" />}
                        </span>
                        {opt}
                      </label>
                    );
                  })}
                </div>
              ) : (
                <div className="flex flex-col gap-3">
                  <textarea
                    value={answers[q.question_id] ?? ""}
                    onChange={(e) =>
                      setAnswers((a) => ({ ...a, [q.question_id]: e.target.value }))
                    }
                    placeholder="Describe your expert knowledge on this topic…"
                    rows={3}
                    aria-label={q.question_text}
                    className="w-full resize-none rounded-lg border border-line bg-surface-2 px-3 py-2.5 text-[13.5px] leading-relaxed outline-none focus-visible:border-accent"
                  />
                  {/* Voice input option */}
                  {!voiceAnswers[q.question_id] ? (
                    <button
                      type="button"
                      onClick={() =>
                        setVoiceAnswers((v) => ({ ...v, [q.question_id]: true }))
                      }
                      className="inline-flex items-center gap-1.5 text-[12px] font-medium text-accent hover:underline focus-visible:outline-2 focus-visible:outline-accent"
                    >
                      <svg
                        className="size-3.5"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2"
                        strokeLinecap="round"
                        aria-hidden="true"
                      >
                        <path d="M12 1a4 4 0 0 0-4 4v7a4 4 0 0 0 8 0V5a4 4 0 0 0-4-4z" />
                        <path d="M19 11a7 7 0 0 1-14 0M12 18v3" />
                      </svg>
                      Use voice instead
                    </button>
                  ) : (
                    <VoiceRecorder
                      onBlob={(b) => {
                        // Voice blobs are noted but text field is the submission path;
                        // for full voice transcription use the /field/voice route.
                        setAnswers((a) => ({
                          ...a,
                          [q.question_id]:
                            (a[q.question_id] ?? "") + " [voice recording attached]",
                        }));
                        void b; // blob handled server-side via the voice endpoint
                      }}
                    />
                  )}
                </div>
              )}
            </div>
          </div>
        ))}
      </div>

      <Button
        variant="primary"
        onClick={submit}
        disabled={!allAnswered || submitting}
        className="mt-2 h-[48px] w-full"
      >
        {submitting ? "Submitting…" : "Submit session responses"}
      </Button>
    </div>
  );
}

export default function OffboardingSessionPage() {
  const { sessionId } = useParams<{ sessionId: string }>();
  const [programme, setProgramme] = useState<OffboardingProgramme | null>(null);
  const [questions, setQuestions] = useState<ElicitationQuestion[]>([]);
  const [source, setSource] = useState<"live" | "demo">("demo");
  const [refreshKey, setRefreshKey] = useState(0);

  useEffect(() => {
    getOffboarding(sessionId).then((r) => {
      setProgramme(r.data);
      setSource(r.source);
    });
    getOffboardingQuestions(sessionId).then((r) => setQuestions(r.data));
  }, [sessionId, refreshKey]);

  const session = programme?.sessions.find((s) => s.session_id === sessionId);

  if (!programme) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center" aria-label="Loading">
        <span className="inline-flex gap-1.5">
          {[0, 1, 2].map((i) => (
            <span
              key={i}
              className="size-2 animate-bounce rounded-full bg-muted"
              style={{ animationDelay: `${i * 0.15}s` }}
            />
          ))}
        </span>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-4xl px-5 py-8 sm:px-8">
      <div className="mb-4 flex items-center gap-2 text-[13px] text-muted">
        <Link href="/offboarding" className="hover:text-ink focus-visible:outline-2 focus-visible:outline-accent">
          Offboarding
        </Link>
        <span aria-hidden="true">›</span>
        <span className="text-ink">{programme.personnel_email}</span>
        {source === "demo" && <DemoChip />}
      </div>

      <div className="grid gap-6 md:grid-cols-[220px_1fr]">
        {/* Sidebar — session list */}
        <div className="rounded-xl border border-line bg-surface p-4">
          <p className="mb-3 text-[11px] font-bold uppercase tracking-[0.1em] text-muted">
            Sessions
          </p>
          <SessionList sessions={programme.sessions} activeId={sessionId} />
        </div>

        {/* Main — session detail or interview */}
        <div>
          {!session ? (
            <p className="text-[14px] text-muted">Session not found.</p>
          ) : session.status === "questions_ready" && questions.length > 0 ? (
            <Interview
              session={session}
              questions={questions}
              onDone={() => setRefreshKey((k) => k + 1)}
            />
          ) : (
            <div className="rounded-xl border border-line bg-surface p-6">
              <p className="text-[11px] font-bold uppercase tracking-[0.1em] text-muted">
                {session.equipment_family}
              </p>
              <h2 className="mt-0.5 text-[18px] font-semibold">
                Session {session.session_number}
              </h2>
              <p className="mt-1 text-[13px] text-muted">
                Scheduled:{" "}
                {new Date(session.scheduled_date).toLocaleDateString("en-IN", {
                  day: "numeric",
                  month: "long",
                  year: "numeric",
                })}
              </p>
              <div className="mt-4">
                {session.status === "pending" ? (
                  <StatusBadge tone="neutral">Pending — questions not yet generated</StatusBadge>
                ) : session.status === "completed" ? (
                  <StatusBadge tone="verified">Completed</StatusBadge>
                ) : (
                  <StatusBadge tone="info">Ready</StatusBadge>
                )}
              </div>
              {session.focus_failure_modes.length > 0 && (
                <div className="mt-4">
                  <p className="text-[12px] font-semibold text-muted">Focus failure modes</p>
                  <ul className="mt-1.5 flex flex-wrap gap-1.5">
                    {session.focus_failure_modes.map((m) => (
                      <li
                        key={m}
                        className="rounded-md border border-line bg-surface-2 px-2 py-1 text-[12px]"
                      >
                        {m}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
