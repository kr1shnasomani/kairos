"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { getElicitationQuestions, submitElicitationResponses } from "@/lib/api";
import { enqueueWrite } from "@/lib/idb";
import type { ElicitationQuestion, ElicitationSession } from "@/lib/types";
import { cn } from "@/lib/utils";
import { Button, DemoChip } from "@/components/ui";

const DEMO: ElicitationSession = {
  session_id: "demo-session",
  work_order_id: "WO-DEMO",
  questions: [
    {
      question_id: "q1",
      question_text: "What lubrication type was used at last service?",
      context: "Previous 2 failures on this asset attributed to lubrication degradation.",
      options: ["ISO VG 46", "ISO VG 68", "ISO VG 100", "Other / Unknown"],
      question_type: "multiple_choice",
    },
    {
      question_id: "q2",
      question_text: "Was there abnormal noise or vibration before shutdown?",
      context: "Bearing failure pattern detected in similar assets over last 90 days.",
      options: ["Yes — noise", "Yes — vibration", "Both", "None observed"],
      question_type: "multiple_choice",
    },
    {
      question_id: "q3",
      question_text: "Describe any other observations not in the work order.",
      context: "Field observations often reveal failure precursors not captured in structured logs.",
      options: null,
      question_type: "free_text",
    },
  ],
  status: "in_progress",
  created_at: new Date().toISOString(),
};

function QuestionCard({
  question,
  answer,
  onChange,
}: {
  question: ElicitationQuestion;
  answer: string;
  onChange: (v: string) => void;
}) {
  if (question.question_type === "multiple_choice" && question.options) {
    return (
      <div className="flex flex-col gap-2.5" role="group" aria-label={question.question_text}>
        {question.options.map((opt) => (
          <label
            key={opt}
            className={cn(
              "flex min-h-[56px] cursor-pointer items-center gap-3 rounded-xl border px-4 py-3 text-[14px] transition-colors",
              answer === opt
                ? "border-accent bg-[color-mix(in_srgb,var(--accent)_8%,transparent)] font-semibold text-accent"
                : "border-line bg-surface hover:border-[color-mix(in_srgb,var(--accent)_35%,var(--line))]",
            )}
          >
            <input
              type="radio"
              name={`q-${question.question_id}`}
              value={opt}
              checked={answer === opt}
              onChange={() => onChange(opt)}
              className="sr-only"
            />
            <span
              className={cn(
                "grid size-5 shrink-0 place-items-center rounded-full border-2 transition-colors",
                answer === opt ? "border-accent bg-accent" : "border-line bg-surface",
              )}
              aria-hidden="true"
            >
              {answer === opt && <span className="size-2 rounded-full bg-on-accent" />}
            </span>
            {opt}
          </label>
        ))}
      </div>
    );
  }

  return (
    <textarea
      value={answer}
      onChange={(e) => onChange(e.target.value)}
      placeholder="Describe your observation…"
      rows={5}
      aria-label={question.question_text}
      className="w-full resize-none rounded-xl border border-line bg-surface px-4 py-3 text-[14px] leading-relaxed outline-none transition-colors focus-visible:border-accent"
    />
  );
}

export default function ElicitationPage() {
  const { workOrderId } = useParams<{ workOrderId: string }>();
  const [session, setSession] = useState<ElicitationSession | null>(null);
  const [source, setSource] = useState<"live" | "demo">("demo");
  const [step, setStep] = useState(0);
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [submitted, setSubmitted] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [queued, setQueued] = useState(false);

  useEffect(() => {
    getElicitationQuestions(workOrderId).then((r) => {
      setSession(r.data ?? DEMO);
      setSource(r.data ? r.source : "demo");
    });
  }, [workOrderId]);

  if (!session) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center" aria-label="Loading questions">
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

  const questions = session.questions;
  const current = questions[step]!;
  const isLast = step === questions.length - 1;
  const currentAnswer = answers[current.question_id] ?? "";

  async function advance() {
    if (!isLast) {
      setStep((s) => s + 1);
      return;
    }
    setSubmitting(true);
    const responses = Object.entries(answers).map(([question_id, answer]) => ({
      question_id,
      answer,
    }));
    try {
      await submitElicitationResponses(workOrderId, responses);
      setSubmitted(true);
    } catch {
      // Offline — queue for replay
      await enqueueWrite(
        `/elicitation/${workOrderId}/responses`,
        "POST",
        { responses },
      ).catch(() => {});
      setQueued(true);
      setSubmitted(true);
    } finally {
      setSubmitting(false);
    }
  }

  if (submitted) {
    return (
      <div className="mx-auto max-w-md px-5 py-16 text-center">
        <div className="mx-auto grid size-14 place-items-center rounded-full bg-[color-mix(in_srgb,var(--verified)_12%,transparent)]">
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
        <h1 className="mt-4 text-[20px] font-semibold">
          {queued ? "Responses queued" : "Responses submitted"}
        </h1>
        <p className="mt-2 text-[13.5px] leading-relaxed text-muted">
          {queued
            ? "You're offline — responses saved locally and will sync automatically when connected."
            : "Your field observations entered the knowledge quarantine and will be reviewed by engineering authority."}
        </p>
        {source === "demo" && (
          <div className="mt-4 flex justify-center">
            <DemoChip />
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-md px-5 pb-8 pt-6">
      <header className="mb-6 flex items-start justify-between gap-3">
        <div>
          <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-accent">
            Work order {workOrderId}
          </p>
          <h1 className="mt-0.5 text-[18px] font-semibold">Knowledge capture</h1>
        </div>
        {source === "demo" && <DemoChip />}
      </header>

      {/* Progress */}
      <div
        className="mb-8 flex items-center gap-2"
        role="progressbar"
        aria-valuenow={step + 1}
        aria-valuemin={1}
        aria-valuemax={questions.length}
        aria-label={`Question ${step + 1} of ${questions.length}`}
      >
        {questions.map((_, i) => (
          <span
            key={i}
            className={cn(
              "rounded-full transition-all",
              i === step
                ? "size-3 bg-accent"
                : i < step
                  ? "size-2 bg-verified"
                  : "size-2 bg-line",
            )}
          />
        ))}
        <span className="ml-1 text-[12px] text-muted">
          {step + 1} / {questions.length}
        </span>
      </div>

      <div className="min-h-[320px]">
        {current.context && (
          <div className="mb-4 rounded-lg border border-line bg-surface-2 px-3 py-2.5">
            <p className="text-[12px] leading-relaxed text-muted">
              <span className="font-semibold text-ink">Context: </span>
              {current.context}
            </p>
          </div>
        )}

        <h2 className="text-[18px] font-semibold leading-snug">{current.question_text}</h2>

        <div className="mt-5">
          <QuestionCard
            question={current}
            answer={currentAnswer}
            onChange={(v) =>
              setAnswers((a) => ({ ...a, [current.question_id]: v }))
            }
          />
        </div>
      </div>

      <div className="mt-6">
        <Button
          variant="primary"
          onClick={advance}
          disabled={!currentAnswer.trim() || submitting}
          className="h-[52px] w-full text-[15px]"
        >
          {isLast
            ? submitting
              ? "Submitting…"
              : "Submit responses"
            : "Next →"}
        </Button>
      </div>
    </div>
  );
}
