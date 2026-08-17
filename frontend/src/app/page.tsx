"use client";

import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { getMe } from "@/lib/auth";
import { dmSans, instrumentSans } from "./landing-fonts";

const navLinks = [
  ["Capabilities", "#capabilities"],
  ["Platform", "#platform"],
  ["System", "#system"],
  ["Use cases", "#field"],
  ["Evals", "#evidence"],
  ["Provenance", "#provenance"],
] as const;

/**
 * Each capability drives the vertical tab list and a composite card: a gradient
 * media panel on top and a white text block underneath. Every capability gets
 * its OWN mock, because a shared template made the section read as one repeated card.
 */
const capabilities: {
  id: string;
  name: string;
  banner: string;
  Mock: () => React.JSX.Element;
  eyebrow: string;
  title: string;
  body: string;
}[] = [
  {
    id: "briefs",
    name: "Briefs",
    banner: "Six briefs an operator per hour, because an ignored brief is worse than no brief",
    Mock: BriefsMock,
    eyebrow: "Briefs",
    title: "The right brief, rate-governed",
    body: "EEMUA-191 alarm discipline applied to knowledge. The governor holds brief volume under the threshold where operators stop reading. Permit-to-work is always exempt.",
  },
  {
    id: "copilot",
    name: "Expert copilot",
    banner: "Every answer arrives with its sources, its authority and its confidence",
    Mock: CopilotMock,
    eyebrow: "Expert copilot",
    title: "Answers that carry their evidence",
    body: "Ask in plain language and get back a governed answer with its sources attached, its authority ranked and its confidence stated. Safety-critical questions with thin evidence get an honest refusal card, never a hedge.",
  },
  {
    id: "assets",
    name: "Assets",
    banner: "Ask what was true then, not only what is true now",
    Mock: AssetsMock,
    eyebrow: "Assets",
    title: "Live asset and document context",
    body: "Registry, knowledge graph, blast radius and drawing topology, all of it time-aware. Facts are superseded by closing their validity, never by deletion, so the record of what you knew survives.",
  },
  {
    id: "governance",
    name: "Governance",
    banner: "The quarantine gate opens one way, and only a human opens it",
    Mock: GovernanceMock,
    eyebrow: "Governance",
    title: "Nothing uncertain reaches the graph",
    body: "Extractions below 0.7 confidence go to quarantine and stay there. Promotion is a human decision. There is no auto-promote, and contradictions surface before the job starts.",
  },
  {
    id: "field",
    name: "Field capture",
    banner: "Capture at the point of work, send it when the radio comes back",
    Mock: FieldMock,
    eyebrow: "Field capture",
    title: "Capture that survives a dead zone",
    body: "Voice observations transcribed, tagged to an asset or work order, and queued on the device until there is signal. The technician never loses a finding to a dead zone.",
  },
];

const routing = [
  ["Low-confidence extraction?", "Quarantine", "Held for a human to promote. Never auto-merged."],
  ["Conflicting procedures?", "Conflict detection", "Surfaced before the job starts, not in the post-mortem."],
  ["Field observation?", "Attribution worker", "Transcribed, tagged and routed to engineering review."],
  ["Safety-critical question?", "Refusal card", "An honest refusal with its sources attached."],
] as const;



const audiences = [
  { name: "Supervisors", title: "The plant on one screen", shot: "workspace", body: "Live service state, open conflicts and quarantine depth, with the decisions that need a human ranked first." },
  { name: "Reliability", title: "Evidence, not recollection", shot: "reliability", body: "Blast radius and root-cause packs assembled from the graph's own recorded history rather than from memory." },
  { name: "Field techs", title: "Works when the signal doesn't", shot: "field", body: "Touch-first briefs, asset context and voice capture that queue on the device and sync when the radio returns." },
  { name: "Compliance", title: "Coverage you can export", shot: "compliance", body: "Regulation coverage and gap severity by criticality, with audit packs generated on demand." },
  { name: "Turnaround", title: "Short windows, no rate limit", shot: "turnaround", body: "Permit-to-work briefs bypass the alarm governor, because an outage window does not wait for an hourly quota." },
  { name: "Off-boarding", title: "Before the knowledge walks", shot: "offboarding", body: "Structured elicitation that captures what a leaver knows while they are still there to be asked." },
] as const;

// Measured 2026-07-25 on the live stack, per benchmark/RESULTS.md. Answer quality
// is a range because that file is explicit that run-to-run variance is real.
type EvalBar = {
  label: string;
  note: string;
  value: number;
  display: string;
  /** Raw count behind the percentage. */
  badge: string;
  /** Small qualifier under the headline number. */
  sub: string;
  hero: boolean;
};
const evalBars: EvalBar[] = [
  { label: "Retrieval", note: "Fact reaches context", value: 100, display: "100%", badge: "37/37", sub: "deterministic", hero: false },
  { label: "Provenance", note: "Sources cited", value: 100, display: "100%", badge: "37/37", sub: "every answer cited", hero: true },
  { label: "Answer quality", note: "Single VALID run", value: 91, display: "91%", badge: "34/37", sub: "95% CI 79 to 97", hero: false },
];

// The five harnesses beyond the Q&A grading, all from benchmark/RESULTS.md.
const evalSuites: {
  name: string;
  headline: string;
  headlineNote: string;
  rows: [string, string][];
}[] = [
  {
    name: "Compliance gap detection",
    headline: "F1 0.986",
    headlineNote: "Zero false positives across 52 pairs",
    rows: [["Precision", "1.000"], ["Recall", "0.973"], ["True / false positives", "36 / 0"], ["Full status agreement", "51 / 52"]],
  },
  {
    name: "Entity extraction · Layer 0",
    headline: "F1 0.847",
    headlineNote: "40 labels; a ceiling — one extraction fell back",
    rows: [["Precision", "0.800"], ["Recall", "0.900"], ["PERSON F1", "1.000 (n=7)"], ["ORGANIZATION F1", "0.800 (n=3)"]],
  },
  {
    name: "Per-layer smoke",
    headline: "13 / 13",
    headlineNote: "Every layer answered on the live stack",
    rows: [["Slowest read", "search 3.7 s"], ["Assets", "1.7 s"], ["Graph / Vault", "212 / 163 ms"], ["Failures", "0"]],
  },
  {
    name: "Time to a trusted answer",
    headline: "−9.5%",
    headlineNote: "Modelled, against BM25 keyword search",
    rows: [["Traditional", "100.0 min / 37 q"], ["Kairos", "90.5 min / 37 q"], ["Docs opened", "1.00 vs 1.35"], ["Raw machine time", "loses: 26.7 s vs 35 ms"]],
  },
  {
    name: "Concurrency sweep",
    headline: "0% errors",
    headlineNote: "2275 requests, 9 read endpoints, to 50 VU",
    rows: [["p50 · 1 → 50 VU", "136 → 500 ms"], ["p95 at 50 VU", "1840 ms"], ["Throughput", "5.8 → 74.5 rps"], ["First knee", "50 VU (6.75× baseline)"]],
  },
  {
    name: "Synthesis latency",
    headline: "p50 32.3 s",
    headlineNote: "NIM 70B at the 60 s cap, quoted with its tail",
    rows: [["p95", "65.0 s"], ["Mean", "35.4 s"], ["Graded questions", "37"], ["Answered by", "nim 23 · openrouter 11"]],
  },
];

// Stated plainly rather than buried. RESULTS.md tracks these as open gaps.
const notMeasured: [string, string][] = [
  ["Soak and sustained load", "Not tested. No evidence here about memory growth or connection leakage over hours."],
  ["Validation corpus size", "40 labels, ORGANIZATION at n=3 — the golden corpus holds only two unambiguous vendors, so raising it needs new source documents, not more labelling. Quote that per-type F1 with its n."],
  ["Scale", "50 virtual users against a demo-scale dataset is not evidence for a 10,000-asset deployment."],
];

const edgeProperties = [
  ["valid_from", "When the fact started being true"],
  ["valid_to", "Closed on supersession, never deleted"],
  ["authority_level", "Regulation over vendor over local note"],
  ["document_id", "The source it came from"],
  ["confidence", "Below 0.7 and it goes to quarantine"],
  ["verification_status", "Whether a human has signed it off"],
] as const;

const faqGroups = [
  {
    name: "Basics",
    items: [
      ["What does Kairos actually do?", "It turns the documents, drawings, asset history and field observations a plant already owns into answers people can act on, each one carrying the source it came from, how authoritative that source is, and how confident the system is."],
      ["How is this different from a chatbot over our documents?", "A chatbot returns text. Kairos returns text plus provenance, and refuses when the question is safety-critical and the evidence is thin. Retrieval and citation are graded deterministically, not by another model."],
      ["What does it need to get started?", "The documents you already have. Drawings, procedures, vendor manuals and maintenance history go through the ingestion pipeline; nothing has to be rewritten first."],
    ],
  },
  {
    name: "Governance",
    items: [
      ["What happens when the system is not sure?", "Extractions below 0.7 confidence go to quarantine and stay there until a human promotes them. Nothing low-confidence reaches the knowledge graph on its own."],
      ["Can it refuse to answer?", "Yes, and it will. A safety-critical question without solid evidence gets a refusal card carrying its sources, so you can check the ground yourself rather than trust a hedge."],
      ["Why limit how many briefs someone gets?", "EEMUA-191 exists because operators stop reading alarms when there are too many. The same is true of knowledge. Six an hour, with permit-to-work always exempt."],
    ],
  },
  {
    name: "Data",
    items: [
      ["Is anything ever deleted?", "No. The vault is permanent and storage is immutable. A fact that stops being true has its validity closed, which means the history of what you knew, and when, survives."],
      ["Can we see where an answer came from?", "Every fact carries six properties on the edge itself, including the source document and whether a human verified it. Every answer lists its sources."],
      ["Does it work without connectivity?", "Field capture does. Observations are queued on the device and sent when signal returns."],
    ],
  },
  {
    name: "Access",
    items: [
      ["Who can see what?", "Access follows the role. Field workers get briefs, copilot, assets and capture; engineering and reliability get evidence and governance surfaces; system health is admin only. The guard is central, not per-page."],
      ["Does it work offline?", "Field capture does. Observations queue on the device and sync when the radio returns, so a dead zone never costs you a finding."],
      ["Can we try it without a rollout?", "Yes. The demo account signs straight into a seeded workspace with the golden dataset loaded, so you can interrogate real answers rather than a slide."],
    ],
  },
  {
    name: "Evidence",
    items: [
      ["How was it evaluated?", "Thirty-seven domain-expert questions across fifteen categories, graded deterministically. Retrieval, answer quality and provenance are scored separately, and a refusal counts as a correct outcome where refusing was right."],
      ["Why quote a confidence interval for answer quality?", "Because 34 out of 37 is a sample, not a constant. The interval says the honest thing a bare percentage hides: on this corpus the true rate sits somewhere around 79 to 97 percent. Retrieval and provenance are deterministic and held at 37/37. Every run also carries a validity verdict, and a run served by a fallback model is not quoted at all."],
      ["Can we see the failures too?", "Yes. The harness, the question set and the raw numbers all live in the repository, including the runs where answers were wrong."],
    ],
  },
] as const;

// Footer links point only at real destinations: page anchors and /login.
const footerColumns: { heading: string; links: [string, string][] }[] = [
  { heading: "Product", links: [["Capabilities", "#capabilities"], ["Platform", "#platform"], ["Use cases", "#field"]] },
  { heading: "How it works", links: [["System design", "#system"], ["Provenance", "#provenance"], ["Evals", "#evidence"]] },
];

const developers = ["Krishna Somani", "Arnav Bansal", "M Arshad"];

const GITHUB_URL = "https://github.com/kr1shnasomani/kairos";
// Demo recording. Currently a Drive link; swap in a YouTube URL when one exists
// and nothing else needs to change.
const YOUTUBE_DEMO_URL = "https://drive.google.com/file/d/18ZO95MckNtESg-Z2ruRBNnKq6JyB57rP/view?usp=drive_link";

/* ── Capability mocks, one bespoke composition each ─────────────────────
   Shared atoms only; the layouts deliberately differ so the tab list reveals a
   genuinely different picture each time rather than the same card retitled. */

/** White chip used across the mocks. */
function Slab({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return <div className={`lp-mock-sm bg-white px-3 py-2 text-[12px] text-(--lp-ink) ${className}`}>{children}</div>;
}

/** Briefs: a governor meter: six slots an hour, with PTW bypassing the gate. */
function BriefsMock() {
  return (
    <div>
      <p className="text-[10px] font-semibold uppercase tracking-[0.1em] text-white/75">Governor · this hour</p>
      <div className="mt-3 flex gap-1.5">
        {[true, true, true, true, false, false].map((used, i) => (
          <span key={i} className={`h-8 flex-1 ${used ? "bg-white" : "border border-white/45 bg-white/10"}`} />
        ))}
      </div>
      <div className="mt-2 flex justify-between text-[11px] text-white/80">
        <span>4 of 6 delivered</span>
        <span>2 remaining</span>
      </div>

      <div className="mt-6 grid gap-2 sm:grid-cols-2">
        <Slab>
          <p className="text-[9px] font-semibold uppercase tracking-[0.08em] text-(--lp-accent-text)">Dispatched 07:41</p>
          <p className="mt-1 font-semibold">P-101 isolation changed</p>
          <p className="mt-1 text-[11px] text-(--lp-muted)">Rank 1 · to the duty operator</p>
        </Slab>
        <Slab className="border-l-4 border-(--lp-accent)">
          <p className="text-[9px] font-semibold uppercase tracking-[0.08em] text-(--lp-accent-text)">Permit to work</p>
          <p className="mt-1 font-semibold">Bypasses the governor</p>
          <p className="mt-1 text-[11px] text-(--lp-muted)">Safety work is never rate-limited</p>
        </Slab>
      </div>

      <div className="mt-4 flex items-center gap-2 bg-black/45 px-3 py-2">
        <span aria-hidden="true" className="size-2 shrink-0 bg-(--lp-accent)" />
        <span className="text-[11px] text-white/85">Brief 7 held until 08:00, quota reached and not urgent</span>
      </div>
    </div>
  );
}

/** Copilot: question, governed answer, and the refusal path beside it. */
function CopilotMock() {
  return (
    <div>
      <div className="ml-auto w-fit max-w-[85%] bg-black/55 px-3 py-2 text-[12px] text-white">
        What changed on P-101 since the last turnaround?
      </div>

      <div className="mt-3 max-w-[92%] border-l-2 border-(--lp-accent) bg-white p-3">
        <p className="text-[9px] font-semibold uppercase tracking-[0.08em] text-(--lp-accent-text)">Governed answer</p>
        <div className="mt-2 space-y-1.5" aria-hidden="true">
          <span className="block h-1.5 bg-(--lp-band)" />
          <span className="block h-1.5 w-5/6 bg-(--lp-band)" />
          <span className="block h-1.5 w-2/3 bg-(--lp-band)" />
        </div>
        <div className="mt-3 flex flex-wrap gap-1.5 text-[10px]">
          <span className="bg-(--lp-accent-strong) px-2 py-1 font-medium text-white">3 sources</span>
          <span className="border border-(--lp-line) px-2 py-1 text-(--lp-muted)">Authority: regulation</span>
        </div>
        <div className="mt-3">
          <div className="flex justify-between text-[10px] text-(--lp-muted)"><span>Confidence</span><span className="font-semibold text-(--lp-ink)">0.91</span></div>
          <div className="mt-1 h-1.5 bg-(--lp-band)"><span className="block h-full w-[91%] bg-(--lp-accent)" /></div>
        </div>
      </div>

      <div className="mt-3 flex items-start gap-2 border border-dashed border-white/50 px-3 py-2">
        <span aria-hidden="true" className="mt-0.5 size-2 shrink-0 bg-white" />
        <span className="text-[11px] leading-4 text-white/85">
          Thin evidence on a safety question returns a <strong className="font-semibold text-white">refusal card</strong>, with its sources, never a hedge.
        </span>
      </div>
    </div>
  );
}

/** Assets: a time slider over a small graph, with one edge superseded. */
function AssetsMock() {
  return (
    <div>
      <div className="flex items-center justify-between">
        <p className="text-[10px] font-semibold uppercase tracking-[0.1em] text-white/75">Graph as of</p>
        <span className="bg-black/60 px-2 py-1 text-[11px] font-semibold text-white">2026-03-01</span>
      </div>

      <div className="relative mt-3 h-1 bg-white/30">
        <span aria-hidden="true" className="absolute left-[62%] top-1/2 size-3 -translate-x-1/2 -translate-y-1/2 bg-(--lp-accent)" />
      </div>
      <div className="mt-1.5 flex justify-between text-[10px] uppercase tracking-[0.06em] text-white/70">
        <span>Commissioned</span><span>Now</span>
      </div>

      <div className="mt-6 grid grid-cols-[1fr_auto_1fr] items-center gap-2">
        <Slab className="text-center font-semibold">P-101</Slab>
        <div className="text-center">
          <p className="text-[9px] uppercase tracking-[0.06em] text-white/80">feeds</p>
          <div aria-hidden="true" className="my-1 h-px bg-(--lp-accent)" />
          <p className="text-[9px] text-white/70">verified</p>
        </div>
        <Slab className="text-center font-semibold">HX-204</Slab>
      </div>

      <div className="mt-3 grid grid-cols-[1fr_auto_1fr] items-center gap-2 opacity-55">
        <Slab className="text-center line-through">Seal plan 52</Slab>
        <div className="text-center">
          <p className="text-[9px] uppercase tracking-[0.06em] text-white/80">superseded</p>
          <div aria-hidden="true" className="my-1 h-px border-t border-dashed border-white/70" />
          <p className="text-[9px] text-white/70">valid_to closed</p>
        </div>
        <Slab className="text-center font-semibold">Seal plan 53</Slab>
      </div>

      <p className="mt-4 bg-black/45 px-3 py-2 text-[11px] text-white/85">
        Nothing was deleted. The old fact still answers questions about last March.
      </p>
    </div>
  );
}

/** Governance: a one-way gate splitting the stream by confidence. */
function GovernanceMock() {
  const rows = [
    ["Pump seal plan", "0.94", true],
    ["Vendor torque spec", "0.61", false],
    ["Scanned margin note", "0.42", false],
  ] as const;
  return (
    <div>
      <p className="text-[10px] font-semibold uppercase tracking-[0.1em] text-white/75">Extraction · confidence gate at 0.70</p>
      <div className="mt-3 space-y-1.5">
        {rows.map(([name, score, promoted]) => (
          <div key={name} className="grid grid-cols-[1fr_auto_auto] items-center gap-2 bg-white px-3 py-2">
            <span className="truncate text-[12px] text-(--lp-ink)">{name}</span>
            <span className={`text-[12px] font-semibold ${promoted ? "text-(--lp-ink)" : "text-(--lp-accent-text)"}`}>{score}</span>
            <span className={`px-2 py-0.5 text-[9px] font-semibold uppercase tracking-[0.06em] ${promoted ? "bg-(--lp-band) text-(--lp-muted)" : "bg-(--lp-accent-strong) text-white"}`}>
              {promoted ? "Graph" : "Held"}
            </span>
          </div>
        ))}
      </div>

      <div className="mt-4 grid grid-cols-2 gap-2">
        <div className="border border-white/40 px-3 py-2.5 text-center">
          <p className="lp-display text-[24px] text-white">2</p>
          <p className="mt-1 text-[10px] uppercase tracking-[0.06em] text-white/75">Into the graph</p>
        </div>
        <div className="bg-white px-3 py-2.5 text-center">
          <p className="lp-display text-[24px] text-(--lp-accent-text)">12</p>
          <p className="mt-1 text-[10px] uppercase tracking-[0.06em] text-(--lp-muted)">In quarantine</p>
        </div>
      </div>
      <p className="mt-3 text-center text-[11px] text-white/85">Promotion is a human decision. There is no auto-promote.</p>
    </div>
  );
}

/** Field capture: a device with a mic and an offline write queue. */
function FieldMock() {
  const queue = [
    ["Bearing noise on P-101", "Sent"],
    ["Gasket weep, WO-4471", "Queued"],
    ["Photo · gauge reading", "Queued"],
  ] as const;
  return (
    <div className="grid gap-5 sm:grid-cols-[auto_1fr] sm:items-start">
      <div className="mx-auto w-[132px] border-2 border-white/60 bg-black/55 p-3 sm:mx-0">
        <p className="text-center text-[9px] uppercase tracking-[0.08em] text-(--lp-accent)">● Offline</p>
        <div className="mt-4 grid place-items-center">
          <span className="grid size-14 place-items-center rounded-full bg-(--lp-accent) text-white">
            <svg width="18" height="22" viewBox="0 0 20 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
              <rect x="6" y="1" width="8" height="14" rx="4" />
              <path d="M3 11a7 7 0 0 0 14 0M10 18v5" />
            </svg>
          </span>
        </div>
        <p className="mt-3 text-center text-[10px] font-medium text-white">Hold to record</p>
      </div>

      <div>
        <p className="text-[10px] font-semibold uppercase tracking-[0.1em] text-white/75">Write queue · on device</p>
        <div className="mt-3 space-y-1.5">
          {queue.map(([text, state]) => (
            <div key={text} className="flex items-center justify-between gap-2 bg-white px-3 py-2">
              <span className="truncate text-[12px] text-(--lp-ink)">{text}</span>
              <span className={`shrink-0 px-2 py-0.5 text-[9px] font-semibold uppercase tracking-[0.06em] ${state === "Sent" ? "bg-(--lp-band) text-(--lp-muted)" : "bg-(--lp-accent-strong) text-white"}`}>
                {state}
              </span>
            </div>
          ))}
        </div>
        <p className="mt-4 bg-black/45 px-3 py-2 text-[11px] text-white/85">
          Transcribed and tagged on the device. Sent the moment the radio returns.
        </p>
      </div>
    </div>
  );
}

/**
 * Architecture diagram. Real SVG: service boxes, rounded source nodes, diamond
 * decision gates, datastore cylinders and directed edges with arrowheads.
 * Text is real <text>, so it scales, stays selectable and is read aloud in
 * order. The wrapper scrolls horizontally rather than letting it squash.
 */
const DIAGRAM_LABEL = "fill-white text-[13px] font-medium";
const DIAGRAM_SUB = "fill-[var(--lp-dark-muted)] text-[11px]";
const DIAGRAM_LAYER = "fill-[var(--lp-accent)] text-[10px] font-semibold tracking-[0.08em]";
const EDGE_LABEL = "fill-[var(--lp-dark-muted)] text-[10px] uppercase tracking-[0.08em]";

/**
 * One stage in the pipeline: a surface panel with an accent spine on its left
 * edge and a layer chip. Module scope, because defining it inside
 * SystemDiagram would mint a new component type on every render.
 */
function Stage({ x, y, w, h, tag, name, note }: { x: number; y: number; w: number; h: number; tag: string; name: string; note?: string }) {
  return (
    <g>
      <rect x={x} y={y} width={w} height={h} fill="url(#lp-panel)" stroke="var(--lp-dark-line)" strokeWidth="1" />
      <rect x={x} y={y} width="3" height={h} fill="var(--lp-accent)" />
      {/* layer chip */}
      <rect x={x + w - 78} y={y + 12} width="62" height="18" fill="var(--lp-accent)" opacity="0.16" />
      <text x={x + w - 47} y={y + 25} textAnchor="middle" className={DIAGRAM_LAYER}>{tag}</text>
      <text x={x + 20} y={y + 30} className="fill-white text-[16px] font-semibold">{name}</text>
      {note ? <text x={x + 20} y={y + 52} className={DIAGRAM_SUB}>{note}</text> : null}
    </g>
  );
}

/** A one-way exit: the two places the pipeline deliberately stops. */
function ExitNode({ x, y, tag, name, note }: { x: number; y: number; tag: string; name: string; note: string }) {
  return (
    <g>
      <rect x={x} y={y} width="190" height="72" fill="var(--lp-dark-surface)" stroke="var(--lp-accent)" strokeWidth="1.5" />
      <rect x={x} y={y} width="190" height="3" fill="var(--lp-accent)" />
      <text x={x + 16} y={y + 26} className={DIAGRAM_LAYER}>{tag}</text>
      <text x={x + 16} y={y + 46} className="fill-white text-[14px] font-semibold">{name}</text>
      <text x={x + 16} y={y + 62} className={DIAGRAM_SUB}>{note}</text>
    </g>
  );
}

/**
 * Architecture diagram. Real SVG: source nodes, service panels, diamond
 * decision gates, datastore cylinders and directed edges with arrowheads.
 * Text is real <text>, so it scales, stays selectable and is read in order.
 */
function SystemDiagram() {
  return (
    <svg
      viewBox="0 0 980 940"
      className="lp-diagram h-auto w-full min-w-[900px]"
      role="img"
      aria-label="Kairos architecture. Four source types feed the perception layer. A confidence gate at 0.70 sends low-confidence extractions one way into quarantine; the rest pass to identity resolution and the temporal knowledge graph, backed by Neo4j, Qdrant and Elasticsearch. Governance checks conflicts, supersession and coverage, then a safety gate diverts thin-evidence safety questions to a refusal card. Everything else reaches delivery as governed briefs, copilot answers, field capture and audit packs."
    >
      <defs>
        <marker id="lp-arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
          <path d="M0 0 10 5 0 10z" fill="var(--lp-accent)" />
        </marker>
        <marker id="lp-arrow-dim" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
          <path d="M0 0 10 5 0 10z" fill="var(--lp-dark-muted)" />
        </marker>
        <linearGradient id="lp-panel" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#1b1b1b" />
          <stop offset="100%" stopColor="#121212" />
        </linearGradient>
        <linearGradient id="lp-gate" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#2a1409" />
          <stop offset="100%" stopColor="#150a05" />
        </linearGradient>
        <pattern id="lp-dots" width="22" height="22" patternUnits="userSpaceOnUse">
          <circle cx="1" cy="1" r="1" fill="#ffffff" opacity="0.05" />
        </pattern>
      </defs>

      {/* plotting field, so the diagram reads as a designed surface */}
      <rect x="0" y="0" width="980" height="940" fill="url(#lp-dots)" />

      <g stroke="var(--lp-accent)" strokeWidth="1.5" fill="none">
        <path d="M130 100v30M330 100v30M530 100v30M710 100v30" />
        <path d="M130 130h580" />
        <path d="M490 832v18" />
        <path d="M130 850h580" />
        <path d="M130 850v8M330 850v8M530 850v8M710 850v8" />
      </g>

      <g className="lp-flow" stroke="var(--lp-accent)" strokeWidth="1.5" markerEnd="url(#lp-arrow)" fill="none">
        <path d="M490 130v46" />
        <path d="M490 262v54" />
        <path d="M490 409v55" />
        <path d="M490 560v52" />
        <path d="M490 692v44" />
        <path d="M130 858v14M330 858v14M530 858v14M710 858v14" />
      </g>

      {/* one-way exits, dashed so they read as diversions */}
      <g className="lp-flow" stroke="var(--lp-accent)" strokeWidth="1.5" markerEnd="url(#lp-arrow)" fill="none">
        <path d="M612 362h134" />
        <path d="M622 786h124" />
      </g>

      {/* datastores: reads and writes, not flow, so dimmer and bidirectional */}
      <g stroke="var(--lp-dark-muted)" strokeWidth="1" strokeDasharray="3 3" markerEnd="url(#lp-arrow-dim)" markerStart="url(#lp-arrow-dim)" fill="none" opacity="0.8">
        <path d="M276 512H262" />
      </g>

      {/* edge labels */}
      <text x="500" y="155" className={EDGE_LABEL}>ingest</text>
      <text x="500" y="292" className={EDGE_LABEL}>score</text>
      <text x="500" y="590" className={EDGE_LABEL}>check</text>
      <text x="500" y="718" className={EDGE_LABEL}>synthesise</text>

      <text x="40" y="34" className={DIAGRAM_LAYER}>SOURCES</text>
      {[
        ["Drawings, P&IDs", 40],
        ["Procedures", 240],
        ["OT tag history", 440],
        ["Voice notes", 620],
      ].map(([t, x]) => (
        <g key={t as string}>
          <rect x={x as number} y={48} width={180} height={52} rx="26" fill="url(#lp-panel)" stroke="var(--lp-dark-line)" strokeWidth="1" />
          <text x={(x as number) + 90} y={79} textAnchor="middle" className={DIAGRAM_LABEL}>{t as string}</text>
        </g>
      ))}

      <Stage x={280} y={176} w={420} h={86} tag="L0 · L3" name="Perception" note="OCR · entity extraction · transcription" />

      {/* confidence gate */}
      <path d="M490 316 612 362 490 408 368 362z" fill="url(#lp-gate)" stroke="var(--lp-accent)" strokeWidth="1.5" />
      <text x="490" y="358" textAnchor="middle" className="fill-white text-[13px] font-semibold">confidence</text>
      <text x="490" y="376" textAnchor="middle" className="fill-white text-[13px] font-semibold">≥ 0.70?</text>
      <text x="622" y="352" className="fill-[var(--lp-accent)] text-[11px] font-semibold">no</text>
      <text x="502" y="440" className="fill-[var(--lp-accent)] text-[11px] font-semibold">yes</text>
      <ExitNode x={746} y={326} tag="L6 · ONE-WAY" name="Quarantine" note="Human promotion only" />

      <Stage x={280} y={464} w={420} h={96} tag="L1 · L4" name="Identity and temporal graph" note="MDM merge · valid_from / valid_to · authority" />

      {/* backing stores */}
      <text x="40" y="452" className={DIAGRAM_LAYER}>STORES</text>
      {[["Neo4j", 470], ["Qdrant", 514], ["Elasticsearch", 558]].map(([t, y]) => {
        const top = y as number;
        return (
          <g key={t as string}>
            <rect x={60} y={top} width={196} height={28} fill="url(#lp-panel)" stroke="var(--lp-dark-line)" strokeWidth="1" />
            <ellipse cx={158} cy={top + 28} rx="98" ry="7" fill="url(#lp-panel)" stroke="var(--lp-dark-line)" strokeWidth="1" />
            <ellipse cx={158} cy={top} rx="98" ry="7" fill="var(--lp-dark)" stroke="var(--lp-dark-line)" strokeWidth="1" />
            <text x={158} y={top + 19} textAnchor="middle" className="fill-white text-[12px]">{t as string}</text>
          </g>
        );
      })}

      <Stage x={280} y={612} w={420} h={80} tag="L7" name="Governance" note="conflicts · supersession · coverage gaps" />

      {/* safety gate */}
      <path d="M490 736 622 786 490 836 358 786z" fill="url(#lp-gate)" stroke="var(--lp-accent)" strokeWidth="1.5" />
      <text x="490" y="782" textAnchor="middle" className="fill-white text-[13px] font-semibold">evidence</text>
      <text x="490" y="800" textAnchor="middle" className="fill-white text-[13px] font-semibold">sufficient?</text>
      <text x="632" y="776" className="fill-[var(--lp-accent)] text-[11px] font-semibold">no</text>
      <text x="502" y="862" className="fill-[var(--lp-accent)] text-[11px] font-semibold">yes</text>
      <ExitNode x={746} y={750} tag="L11 · ONE-WAY" name="Refusal card" note="Carries its sources" />

      {/* legend */}
      <g transform="translate(746, 862)">
        <line x1="0" y1="6" x2="26" y2="6" stroke="var(--lp-accent)" strokeWidth="1.5" />
        <text x="34" y="10" className={DIAGRAM_SUB}>flow</text>
        <line x1="0" y1="28" x2="26" y2="28" stroke="var(--lp-accent)" strokeWidth="1.5" strokeDasharray="5 4" />
        <text x="34" y="32" className={DIAGRAM_SUB}>one-way exit</text>
        <line x1="0" y1="50" x2="26" y2="50" stroke="var(--lp-dark-muted)" strokeWidth="1" strokeDasharray="3 3" />
        <text x="34" y="54" className={DIAGRAM_SUB}>read / write</text>
      </g>

      <text x="40" y="842" className={DIAGRAM_LAYER}>DELIVERY</text>
      {[
        ["Governed briefs", 40],
        ["Expert copilot", 240],
        ["Field capture", 440],
        ["Audit packs", 620],
      ].map(([t, x]) => (
        <g key={t as string}>
          <rect x={x as number} y={872} width={180} height={50} rx="25" fill="var(--lp-accent-strong)" />
          <text x={(x as number) + 90} y={902} textAnchor="middle" className="fill-white text-[13px] font-semibold">{t as string}</text>
        </g>
      ))}
    </svg>
  );
}

/* ── Tech logos ───────────────────────────────────────────────────────────
   Real brand marks, inlined as path data at build time: simple-icons (CC0) for
   the single-colour ones and devicon for the two-tone ones. Nothing is fetched
   at runtime and nothing is hand-traced.

   Colours are each brand's own, lifted only where the true colour would vanish
   against the dark band (Next.js and GitHub are black; Elasticsearch's charcoal
   becomes a light grey).

   Qdrant is absent: neither icon set carries its mark. Drop the real SVG into
   public/logos/ and add an entry here. */

const LOGO = "size-7 shrink-0";

type Tech = { name: string; viewBox: string; paths: { d: string; fill: string }[] };

const techStack: Tech[] = [
  { name: "Next.js", viewBox: "0 0 24 24", paths: [{ d: "M18.665 21.978C16.758 23.255 14.465 24 12 24 5.377 24 0 18.623 0 12S5.377 0 12 0s12 5.377 12 12c0 3.583-1.574 6.801-4.067 9.001L9.219 7.2H7.2v9.596h1.615V9.251l9.85 12.727Zm-3.332-8.533 1.6 2.061V7.2h-1.6v6.245Z", fill: "#ffffff" }] },
  { name: "React", viewBox: "0 0 24 24", paths: [{ d: "M14.23 12.004a2.236 2.236 0 0 1-2.235 2.236 2.236 2.236 0 0 1-2.236-2.236 2.236 2.236 0 0 1 2.235-2.236 2.236 2.236 0 0 1 2.236 2.236zm2.648-10.69c-1.346 0-3.107.96-4.888 2.622-1.78-1.653-3.542-2.602-4.887-2.602-.41 0-.783.093-1.106.278-1.375.793-1.683 3.264-.973 6.365C1.98 8.917 0 10.42 0 12.004c0 1.59 1.99 3.097 5.043 4.03-.704 3.113-.39 5.588.988 6.38.32.187.69.275 1.102.275 1.345 0 3.107-.96 4.888-2.624 1.78 1.654 3.542 2.603 4.887 2.603.41 0 .783-.09 1.106-.275 1.374-.792 1.683-3.263.973-6.365C22.02 15.096 24 13.59 24 12.004c0-1.59-1.99-3.097-5.043-4.032.704-3.11.39-5.587-.988-6.38-.318-.184-.688-.277-1.092-.278zm-.005 1.09v.006c.225 0 .406.044.558.127.666.382.955 1.835.73 3.704-.054.46-.142.945-.25 1.44-.96-.236-2.006-.417-3.107-.534-.66-.905-1.345-1.727-2.035-2.447 1.592-1.48 3.087-2.292 4.105-2.295zm-9.77.02c1.012 0 2.514.808 4.11 2.28-.686.72-1.37 1.537-2.02 2.442-1.107.117-2.154.298-3.113.538-.112-.49-.195-.964-.254-1.42-.23-1.868.054-3.32.714-3.707.19-.09.4-.127.563-.132zm4.882 3.05c.455.468.91.992 1.36 1.564-.44-.02-.89-.034-1.345-.034-.46 0-.915.01-1.36.034.44-.572.895-1.096 1.345-1.565zM12 8.1c.74 0 1.477.034 2.202.093.406.582.802 1.203 1.183 1.86.372.64.71 1.29 1.018 1.946-.308.655-.646 1.31-1.013 1.95-.38.66-.773 1.288-1.18 1.87-.728.063-1.466.098-2.21.098-.74 0-1.477-.035-2.202-.093-.406-.582-.802-1.204-1.183-1.86-.372-.64-.71-1.29-1.018-1.946.303-.657.646-1.313 1.013-1.954.38-.66.773-1.286 1.18-1.868.728-.064 1.466-.098 2.21-.098zm-3.635.254c-.24.377-.48.763-.704 1.16-.225.39-.435.782-.635 1.174-.265-.656-.49-1.31-.676-1.947.64-.15 1.315-.283 2.015-.386zm7.26 0c.695.103 1.365.23 2.006.387-.18.632-.405 1.282-.66 1.933-.2-.39-.41-.783-.64-1.174-.225-.392-.465-.774-.705-1.146zm3.063.675c.484.15.944.317 1.375.498 1.732.74 2.852 1.708 2.852 2.476-.005.768-1.125 1.74-2.857 2.475-.42.18-.88.342-1.355.493-.28-.958-.646-1.956-1.1-2.98.45-1.017.81-2.01 1.085-2.964zm-13.395.004c.278.96.645 1.957 1.1 2.98-.45 1.017-.812 2.01-1.086 2.964-.484-.15-.944-.318-1.37-.5-1.732-.737-2.852-1.706-2.852-2.474 0-.768 1.12-1.742 2.852-2.476.42-.18.88-.342 1.356-.494zm11.678 4.28c.265.657.49 1.312.676 1.948-.64.157-1.316.29-2.016.39.24-.375.48-.762.705-1.158.225-.39.435-.788.636-1.18zm-9.945.02c.2.392.41.783.64 1.175.23.39.465.772.705 1.143-.695-.102-1.365-.23-2.006-.386.18-.63.406-1.282.66-1.933zM17.92 16.32c.112.493.2.968.254 1.423.23 1.868-.054 3.32-.714 3.708-.147.09-.338.128-.563.128-1.012 0-2.514-.807-4.11-2.28.686-.72 1.37-1.536 2.02-2.44 1.107-.118 2.154-.3 3.113-.54zm-11.83.01c.96.234 2.006.415 3.107.532.66.905 1.345 1.727 2.035 2.446-1.595 1.483-3.092 2.295-4.11 2.295-.22-.005-.406-.05-.553-.132-.666-.38-.955-1.834-.73-3.703.054-.46.142-.944.25-1.438zm4.56.64c.44.02.89.034 1.345.034.46 0 .915-.01 1.36-.034-.44.572-.895 1.095-1.345 1.565-.455-.47-.91-.993-1.36-1.565z", fill: "#61dafb" }] },
  { name: "TypeScript", viewBox: "0 0 24 24", paths: [{ d: "M1.125 0C.502 0 0 .502 0 1.125v21.75C0 23.498.502 24 1.125 24h21.75c.623 0 1.125-.502 1.125-1.125V1.125C24 .502 23.498 0 22.875 0zm17.363 9.75c.612 0 1.154.037 1.627.111a6.38 6.38 0 0 1 1.306.34v2.458a3.95 3.95 0 0 0-.643-.361 5.093 5.093 0 0 0-.717-.26 5.453 5.453 0 0 0-1.426-.2c-.3 0-.573.028-.819.086a2.1 2.1 0 0 0-.623.242c-.17.104-.3.229-.393.374a.888.888 0 0 0-.14.49c0 .196.053.373.156.529.104.156.252.304.443.444s.423.276.696.41c.273.135.582.274.926.416.47.197.892.407 1.266.628.374.222.695.473.963.753.268.279.472.598.614.957.142.359.214.776.214 1.253 0 .657-.125 1.21-.373 1.656a3.033 3.033 0 0 1-1.012 1.085 4.38 4.38 0 0 1-1.487.596c-.566.12-1.163.18-1.79.18a9.916 9.916 0 0 1-1.84-.164 5.544 5.544 0 0 1-1.512-.493v-2.63a5.033 5.033 0 0 0 3.237 1.2c.333 0 .624-.03.872-.09.249-.06.456-.144.623-.25.166-.108.29-.234.373-.38a1.023 1.023 0 0 0-.074-1.089 2.12 2.12 0 0 0-.537-.5 5.597 5.597 0 0 0-.807-.444 27.72 27.72 0 0 0-1.007-.436c-.918-.383-1.602-.852-2.053-1.405-.45-.553-.676-1.222-.676-2.005 0-.614.123-1.141.369-1.582.246-.441.58-.804 1.004-1.089a4.494 4.494 0 0 1 1.47-.629 7.536 7.536 0 0 1 1.77-.201zm-15.113.188h9.563v2.166H9.506v9.646H6.789v-9.646H3.375z", fill: "#3178c6" }] },
  { name: "Tailwind CSS", viewBox: "0 0 24 24", paths: [{ d: "M12.001,4.8c-3.2,0-5.2,1.6-6,4.8c1.2-1.6,2.6-2.2,4.2-1.8c0.913,0.228,1.565,0.89,2.288,1.624 C13.666,10.618,15.027,12,18.001,12c3.2,0,5.2-1.6,6-4.8c-1.2,1.6-2.6,2.2-4.2,1.8c-0.913-0.228-1.565-0.89-2.288-1.624 C16.337,6.182,14.976,4.8,12.001,4.8z M6.001,12c-3.2,0-5.2,1.6-6,4.8c1.2-1.6,2.6-2.2,4.2-1.8c0.913,0.228,1.565,0.89,2.288,1.624 c1.177,1.194,2.538,2.576,5.512,2.576c3.2,0,5.2-1.6,6-4.8c-1.2,1.6-2.6,2.2-4.2,1.8c-0.913-0.228-1.565-0.89-2.288-1.624 C10.337,13.382,8.976,12,6.001,12z", fill: "#38bdf8" }] },
  { name: "Python", viewBox: "0 0 128 128", paths: [{ d: "M63.391 1.988c-4.222.02-8.252.379-11.8 1.007-10.45 1.846-12.346 5.71-12.346 12.837v9.411h24.693v3.137H29.977c-7.176 0-13.46 4.313-15.426 12.521-2.268 9.405-2.368 15.275 0 25.096 1.755 7.311 5.947 12.519 13.124 12.519h8.491V67.234c0-8.151 7.051-15.34 15.426-15.34h24.665c6.866 0 12.346-5.654 12.346-12.548V15.833c0-6.693-5.646-11.72-12.346-12.837-4.244-.706-8.645-1.027-12.866-1.008zM50.037 9.557c2.55 0 4.634 2.117 4.634 4.721 0 2.593-2.083 4.69-4.634 4.69-2.56 0-4.633-2.097-4.633-4.69-.001-2.604 2.073-4.721 4.633-4.721z", fill: "#3776ab" }, { d: "M91.682 28.38v10.966c0 8.5-7.208 15.655-15.426 15.655H51.591c-6.756 0-12.346 5.783-12.346 12.549v23.515c0 6.691 5.818 10.628 12.346 12.547 7.816 2.297 15.312 2.713 24.665 0 6.216-1.801 12.346-5.423 12.346-12.547v-9.412H63.938v-3.138h37.012c7.176 0 9.852-5.005 12.348-12.519 2.578-7.735 2.467-15.174 0-25.096-1.774-7.145-5.161-12.521-12.348-12.521h-9.268zM77.809 87.927c2.561 0 4.634 2.097 4.634 4.692 0 2.602-2.074 4.719-4.634 4.719-2.55 0-4.633-2.117-4.633-4.719 0-2.595 2.083-4.692 4.633-4.692z", fill: "#ffd43b" }] },
  { name: "FastAPI", viewBox: "0 0 24 24", paths: [{ d: "M12 .0387C5.3729.0384.0003 5.3931 0 11.9988c-.001 6.6066 5.372 11.9628 12 11.9625 6.628.0003 12.001-5.3559 12-11.9625-.0003-6.6057-5.3729-11.9604-12-11.96m-.829 5.4153h7.55l-7.5805 5.3284h5.1828L5.279 18.5436q2.9466-6.5444 5.892-13.0896", fill: "#0aa89e" }] },
  { name: "Go", viewBox: "0 0 24 24", paths: [{ d: "M1.811 10.231c-.047 0-.058-.023-.035-.059l.246-.315c.023-.035.081-.058.128-.058h4.172c.046 0 .058.035.035.07l-.199.303c-.023.036-.082.07-.117.07zM.047 11.306c-.047 0-.059-.023-.035-.058l.245-.316c.023-.035.082-.058.129-.058h5.328c.047 0 .07.035.058.07l-.093.28c-.012.047-.058.07-.105.07zm2.828 1.075c-.047 0-.059-.035-.035-.07l.163-.292c.023-.035.07-.07.117-.07h2.337c.047 0 .07.035.07.082l-.023.28c0 .047-.047.082-.082.082zm12.129-2.36c-.736.187-1.239.327-1.963.514-.176.046-.187.058-.34-.117-.174-.199-.303-.327-.548-.444-.737-.362-1.45-.257-2.115.175-.795.514-1.204 1.274-1.192 2.22.011.935.654 1.706 1.577 1.835.795.105 1.46-.175 1.987-.77.105-.13.198-.27.315-.434H10.47c-.245 0-.304-.152-.222-.35.152-.362.432-.97.596-1.274a.315.315 0 01.292-.187h4.253c-.023.316-.023.631-.07.947a4.983 4.983 0 01-.958 2.29c-.841 1.11-1.94 1.8-3.33 1.986-1.145.152-2.209-.07-3.143-.77-.865-.655-1.356-1.52-1.484-2.595-.152-1.274.222-2.419.993-3.424.83-1.086 1.928-1.776 3.272-2.02 1.098-.2 2.15-.07 3.096.571.62.41 1.063.97 1.356 1.648.07.105.023.164-.117.2m3.868 6.461c-1.064-.024-2.034-.328-2.852-1.029a3.665 3.665 0 01-1.262-2.255c-.21-1.32.152-2.489.947-3.529.853-1.122 1.881-1.706 3.272-1.95 1.192-.21 2.314-.095 3.33.595.923.63 1.496 1.484 1.648 2.605.198 1.578-.257 2.863-1.344 3.962-.771.783-1.718 1.273-2.805 1.495-.315.06-.63.07-.934.106zm2.78-4.72c-.011-.153-.011-.27-.034-.387-.21-1.157-1.274-1.81-2.384-1.554-1.087.245-1.788.935-2.045 2.033-.21.912.234 1.835 1.075 2.21.643.28 1.285.244 1.905-.07.923-.48 1.425-1.228 1.484-2.233z", fill: "#00add8" }] },
  { name: "Celery", viewBox: "0 0 24 24", paths: [{ d: "M2.303 0A2.298 2.298 0 0 0 0 2.303v19.394A2.298 2.298 0 0 0 2.303 24h19.394A2.298 2.298 0 0 0 24 21.697V2.303A2.298 2.298 0 0 0 21.697 0zm8.177 3.072c4.098 0 7.028 1.438 7.68 1.764l-1.194 2.55c-2.442-1.057-4.993-1.41-5.672-1.41-1.574 0-2.17.922-2.17 1.763v8.494c0 .869.596 1.791 2.17 1.791.679 0 3.23-.38 5.672-1.41l1.194 2.496c-.435.271-3.637 1.818-7.68 1.818-1.112 0-4.64-.244-4.64-4.64V7.713c0-4.397 3.528-4.64 4.64-4.64z", fill: "#4caf50" }] },
  { name: "Neo4j", viewBox: "0 0 24 24", paths: [{ d: "M9.629 13.227c-.593 0-1.139.2-1.58.533l-2.892-1.976a2.61 2.61 0 0 0 .101-.711 2.633 2.633 0 0 0-2.629-2.629A2.632 2.632 0 0 0 0 11.073a2.632 2.632 0 0 0 2.629 2.629c.593 0 1.139-.2 1.579-.533L7.1 15.145c-.063.226-.1.465-.1.711 0 .247.037.484.1.711l-2.892 1.976a2.608 2.608 0 0 0-1.579-.533A2.632 2.632 0 0 0 0 20.639a2.632 2.632 0 0 0 2.629 2.629 2.632 2.632 0 0 0 2.629-2.629c0-.247-.037-.485-.101-.711l2.892-1.976c.441.333.987.533 1.58.533a2.633 2.633 0 0 0 2.629-2.629c0-1.45-1.18-2.629-2.629-2.629ZM16.112.732c-4.72 0-7.888 2.748-7.888 8.082v3.802a3.525 3.525 0 0 1 3.071.008v-3.81c0-3.459 1.907-5.237 4.817-5.237s4.817 1.778 4.817 5.237v8.309H24V8.814C24 3.448 20.832.732 16.112.732Z", fill: "#4581c3" }] },
  { name: "Elasticsearch", viewBox: "0 0 128 128", paths: [{ d: "M4 64c0 5.535.777 10.879 2.098 16H84c8.836 0 16-7.164 16-16s-7.164-16-16-16H6.098A63.738 63.738 0 0 0 4 64", fill: "#cfd3d8" }, { d: "M111.695 30.648A61.485 61.485 0 0 0 117.922 24C106.188 9.379 88.199 0 68 0 42.715 0 20.957 14.71 10.574 36H98.04a20.123 20.123 0 0 0 13.652-5.352", fill: "#fec514" }, { d: "M98.04 92H10.577C20.961 113.29 42.715 128 68 128c20.2 0 38.188-9.383 49.922-24a61.1 61.1 0 0 0-6.227-6.648A20.133 20.133 0 0 0 98.04 92", fill: "#00bfb3" }] },
  { name: "Redis", viewBox: "0 0 24 24", paths: [{ d: "M22.71 13.145c-1.66 2.092-3.452 4.483-7.038 4.483-3.203 0-4.397-2.825-4.48-5.12.701 1.484 2.073 2.685 4.214 2.63 4.117-.133 6.94-3.852 6.94-7.239 0-4.05-3.022-6.972-8.268-6.972-3.752 0-8.4 1.428-11.455 3.685C2.59 6.937 3.885 9.958 4.35 9.626c2.648-1.904 4.748-3.13 6.784-3.744C8.12 9.244.886 17.05 0 18.425c.1 1.261 1.66 4.648 2.424 4.648.232 0 .431-.133.664-.365a100.49 100.49 0 0 0 5.54-6.765c.222 3.104 1.748 6.898 6.014 6.898 3.819 0 7.604-2.756 9.33-8.965.2-.764-.73-1.361-1.261-.73zm-4.349-5.013c0 1.959-1.926 2.922-3.685 2.922-.941 0-1.664-.247-2.235-.568 1.051-1.592 2.092-3.225 3.21-4.973 1.972.334 2.71 1.43 2.71 2.619z", fill: "#ff4438" }] },
  { name: "Supabase", viewBox: "0 0 24 24", paths: [{ d: "M11.9 1.036c-.015-.986-1.26-1.41-1.874-.637L.764 12.05C-.33 13.427.65 15.455 2.409 15.455h9.579l.113 7.51c.014.985 1.259 1.408 1.873.636l9.262-11.653c1.093-1.375.113-3.403-1.645-3.403h-9.642z", fill: "#3fcf8e" }] },
  { name: "Docker", viewBox: "0 0 24 24", paths: [{ d: "M13.983 11.078h2.119a.186.186 0 00.186-.185V9.006a.186.186 0 00-.186-.186h-2.119a.185.185 0 00-.185.185v1.888c0 .102.083.185.185.185m-2.954-5.43h2.118a.186.186 0 00.186-.186V3.574a.186.186 0 00-.186-.185h-2.118a.185.185 0 00-.185.185v1.888c0 .102.082.185.185.185m0 2.716h2.118a.187.187 0 00.186-.186V6.29a.186.186 0 00-.186-.185h-2.118a.185.185 0 00-.185.185v1.887c0 .102.082.185.185.186m-2.93 0h2.12a.186.186 0 00.184-.186V6.29a.185.185 0 00-.185-.185H8.1a.185.185 0 00-.185.185v1.887c0 .102.083.185.185.186m-2.964 0h2.119a.186.186 0 00.185-.186V6.29a.185.185 0 00-.185-.185H5.136a.186.186 0 00-.186.185v1.887c0 .102.084.185.186.186m5.893 2.715h2.118a.186.186 0 00.186-.185V9.006a.186.186 0 00-.186-.186h-2.118a.185.185 0 00-.185.185v1.888c0 .102.082.185.185.185m-2.93 0h2.12a.185.185 0 00.184-.185V9.006a.185.185 0 00-.184-.186h-2.12a.185.185 0 00-.184.185v1.888c0 .102.083.185.185.185m-2.964 0h2.119a.185.185 0 00.185-.185V9.006a.185.185 0 00-.184-.186h-2.12a.186.186 0 00-.186.186v1.887c0 .102.084.185.186.185m-2.92 0h2.12a.185.185 0 00.184-.185V9.006a.185.185 0 00-.184-.186h-2.12a.185.185 0 00-.184.185v1.888c0 .102.082.185.185.185M23.763 9.89c-.065-.051-.672-.51-1.954-.51-.338.001-.676.03-1.01.087-.248-1.7-1.653-2.53-1.716-2.566l-.344-.199-.226.327c-.284.438-.49.922-.612 1.43-.23.97-.09 1.882.403 2.661-.595.332-1.55.413-1.744.42H.751a.751.751 0 00-.75.748 11.376 11.376 0 00.692 4.062c.545 1.428 1.355 2.48 2.41 3.124 1.18.723 3.1 1.137 5.275 1.137.983.003 1.963-.086 2.93-.266a12.248 12.248 0 003.823-1.389c.98-.567 1.86-1.288 2.61-2.136 1.252-1.418 1.998-2.997 2.553-4.4h.221c1.372 0 2.215-.549 2.68-1.009.309-.293.55-.65.707-1.046l.098-.288Z", fill: "#2496ed" }] },
  { name: "NVIDIA", viewBox: "0 0 24 24", paths: [{ d: "M8.948 8.798v-1.43a6.7 6.7 0 0 1 .424-.018c3.922-.124 6.493 3.374 6.493 3.374s-2.774 3.851-5.75 3.851c-.398 0-.787-.062-1.158-.185v-4.346c1.528.185 1.837.857 2.747 2.385l2.04-1.714s-1.492-1.952-4-1.952a6.016 6.016 0 0 0-.796.035m0-4.735v2.138l.424-.027c5.45-.185 9.01 4.47 9.01 4.47s-4.08 4.964-8.33 4.964c-.37 0-.733-.035-1.095-.097v1.325c.3.035.61.062.91.062 3.957 0 6.82-2.023 9.593-4.408.459.371 2.34 1.263 2.73 1.652-2.633 2.208-8.772 3.984-12.253 3.984-.335 0-.653-.018-.971-.053v1.864H24V4.063zm0 10.326v1.131c-3.657-.654-4.673-4.46-4.673-4.46s1.758-1.944 4.673-2.262v1.237H8.94c-1.528-.186-2.73 1.245-2.73 1.245s.68 2.412 2.739 3.11M2.456 10.9s2.164-3.197 6.5-3.533V6.201C4.153 6.59 0 10.653 0 10.653s2.35 6.802 8.948 7.42v-1.237c-4.84-.6-6.492-5.936-6.492-5.936z", fill: "#76b900" }] },
  { name: "OpenTelemetry", viewBox: "0 0 24 24", paths: [{ d: "M12.6974 13.1173c-1.0224 1.0224-1.0224 2.68 0 3.7024 1.0224 1.0224 2.68 1.0224 3.7024 0 1.0224-1.0223 1.0224-2.68 0-3.7024-1.0223-1.0223-2.68-1.0223-3.7024 0zm2.7677 2.7701c-.5063.5063-1.3267.5063-1.833 0s-.5063-1.3266 0-1.833c.5063-.5062 1.3267-.5062 1.833 0 .5063.504.5063 1.3267 0 1.833zM16.356.2355l-1.6041 1.6042c-.314.314-.314.83 0 1.144L21.015 9.247c.314.314.83.314 1.144 0l1.6042-1.6041c.314-.314.314-.83 0-1.144L17.4976.2354c-.314-.314-.8276-.314-1.1416 0zM5.1173 20.734c.2848-.2848.2848-.7497 0-1.0345l-.8155-.8155c-.2848-.2848-.7497-.2848-1.0345 0l-1.6845 1.6845-.0024.0024-.4625-.4625c-.2556-.2556-.6718-.2556-.925 0-.2556.2556-.2556.6718 0 .925l2.775 2.775c.2556.2556.6718.2556.925 0 .2532-.2556.2556-.6718 0-.925l-.4625-.4625.0024-.0024zm8.4856-15.893-3.5637 3.5637c-.3164.3164-.3164.8374 0 1.1538l2.2006 2.2005c1.5554-1.1197 3.7365-.981 5.1361.4187l1.7819-1.7818c.3164-.3165.3164-.8374 0-1.1538l-4.401-4.401c-.3165-.319-.8374-.319-1.1539 0zm-2.2881 7.8455-1.2999-1.2999c-.3043-.3043-.8033-.3043-1.1076 0l-4.5836 4.586c-.3042.3043-.3042.8033 0 1.1076l2.5973 2.5973c.3043.3043.8033.3043 1.1076 0l2.9478-2.9527c-.6231-1.2877-.5112-2.8431.3384-4.0383z", fill: "#f5a800" }] },
  { name: "Grafana", viewBox: "0 0 24 24", paths: [{ d: "M23.02 10.59a8.578 8.578 0 0 0-.862-3.034 8.911 8.911 0 0 0-1.789-2.445c.337-1.342-.413-2.505-.413-2.505-1.292-.08-2.113.4-2.416.62-.052-.02-.102-.044-.154-.064-.22-.089-.446-.172-.677-.247-.231-.073-.47-.14-.711-.197a9.867 9.867 0 0 0-.875-.161C14.557.753 12.94 0 12.94 0c-1.804 1.145-2.147 2.744-2.147 2.744l-.018.093c-.098.029-.2.057-.298.088-.138.042-.275.094-.413.143-.138.055-.275.107-.41.166a8.869 8.869 0 0 0-1.557.87l-.063-.029c-2.497-.955-4.716.195-4.716.195-.203 2.658.996 4.33 1.235 4.636a11.608 11.608 0 0 0-.607 2.635C1.636 12.677.953 15.014.953 15.014c1.926 2.214 4.171 2.351 4.171 2.351.003-.002.006-.002.006-.005.285.509.615.994.986 1.446.156.19.32.371.488.548-.704 2.009.099 3.68.099 3.68 2.144.08 3.553-.937 3.849-1.173a9.784 9.784 0 0 0 3.164.501h.08l.055-.003.107-.002.103-.005.003.002c1.01 1.44 2.788 1.646 2.788 1.646 1.264-1.332 1.337-2.653 1.337-2.94v-.058c0-.02-.003-.039-.003-.06.265-.187.52-.387.758-.6a7.875 7.875 0 0 0 1.415-1.7c1.43.083 2.437-.885 2.437-.885-.236-1.49-1.085-2.216-1.264-2.354l-.018-.013-.016-.013a.217.217 0 0 1-.031-.02c.008-.092.016-.18.02-.27.011-.162.016-.323.016-.48v-.253l-.005-.098-.008-.135a1.891 1.891 0 0 0-.01-.13c-.003-.042-.008-.083-.013-.125l-.016-.124-.018-.122a6.215 6.215 0 0 0-2.032-3.73 6.015 6.015 0 0 0-3.222-1.46 6.292 6.292 0 0 0-.85-.048l-.107.002h-.063l-.044.003-.104.008a4.777 4.777 0 0 0-3.335 1.695c-.332.4-.592.84-.768 1.297a4.594 4.594 0 0 0-.312 1.817l.003.091c.005.055.007.11.013.164a3.615 3.615 0 0 0 .698 1.82 3.53 3.53 0 0 0 1.827 1.282c.33.098.66.14.971.137.039 0 .078 0 .114-.002l.063-.003c.02 0 .041-.003.062-.003.034-.002.065-.007.099-.01.007 0 .018-.003.028-.003l.031-.005.06-.008a1.18 1.18 0 0 0 .112-.02c.036-.008.072-.013.109-.024a2.634 2.634 0 0 0 .914-.415c.028-.02.056-.041.085-.065a.248.248 0 0 0 .039-.35.244.244 0 0 0-.309-.06l-.078.042c-.09.044-.184.083-.283.116a2.476 2.476 0 0 1-.475.096c-.028.003-.054.006-.083.006l-.083.002c-.026 0-.054 0-.08-.002l-.102-.006h-.012l-.024.006c-.016-.003-.031-.003-.044-.006-.031-.002-.06-.007-.091-.01a2.59 2.59 0 0 1-.724-.213 2.557 2.557 0 0 1-.667-.438 2.52 2.52 0 0 1-.805-1.475 2.306 2.306 0 0 1-.029-.444l.006-.122v-.023l.002-.031c.003-.021.003-.04.005-.06a3.163 3.163 0 0 1 1.352-2.29 3.12 3.12 0 0 1 .937-.43 2.946 2.946 0 0 1 .776-.101h.06l.07.002.045.003h.026l.07.005a4.041 4.041 0 0 1 1.635.49 3.94 3.94 0 0 1 1.602 1.662 3.77 3.77 0 0 1 .397 1.414l.005.076.003.075c.002.026.002.05.002.075 0 .024.003.052 0 .07v.065l-.002.073-.008.174a6.195 6.195 0 0 1-.08.639 5.1 5.1 0 0 1-.267.927 5.31 5.31 0 0 1-.624 1.13 5.052 5.052 0 0 1-3.237 2.014 4.82 4.82 0 0 1-.649.066l-.039.003h-.287a6.607 6.607 0 0 1-1.716-.265 6.776 6.776 0 0 1-3.4-2.274 6.75 6.75 0 0 1-.746-1.15 6.616 6.616 0 0 1-.714-2.596l-.005-.083-.002-.02v-.056l-.003-.073v-.096l-.003-.104v-.07l.003-.163c.008-.22.026-.45.054-.678a8.707 8.707 0 0 1 .28-1.355c.128-.444.286-.872.473-1.277a7.04 7.04 0 0 1 1.456-2.1 5.925 5.925 0 0 1 .953-.763c.169-.111.343-.213.524-.306.089-.05.182-.091.273-.135.047-.02.093-.042.138-.062a7.177 7.177 0 0 1 .714-.267l.145-.045c.049-.015.098-.026.148-.041.098-.029.197-.052.296-.076.049-.013.1-.02.15-.033l.15-.032.151-.028.076-.013.075-.01.153-.024c.057-.01.114-.013.171-.023l.169-.021c.036-.003.073-.008.106-.01l.073-.008.036-.003.042-.002c.057-.003.114-.008.171-.01l.086-.006h.023l.037-.003.145-.007a7.999 7.999 0 0 1 1.708.125 7.917 7.917 0 0 1 2.048.68 8.253 8.253 0 0 1 1.672 1.09l.09.077.089.078c.06.052.114.107.171.159.057.052.112.106.166.16.052.055.107.107.159.164a8.671 8.671 0 0 1 1.41 1.978c.012.026.028.052.04.078l.04.078.075.156c.023.051.05.1.07.153l.065.15a8.848 8.848 0 0 1 .45 1.34.19.19 0 0 0 .201.142.186.186 0 0 0 .172-.184c.01-.246.002-.532-.024-.856z", fill: "#f46800" }] },
  { name: "GitHub", viewBox: "0 0 24 24", paths: [{ d: "M12 .297c-6.63 0-12 5.373-12 12 0 5.303 3.438 9.8 8.205 11.385.6.113.82-.258.82-.577 0-.285-.01-1.04-.015-2.04-3.338.724-4.042-1.61-4.042-1.61C4.422 18.07 3.633 17.7 3.633 17.7c-1.087-.744.084-.729.084-.729 1.205.084 1.838 1.236 1.838 1.236 1.07 1.835 2.809 1.305 3.495.998.108-.776.417-1.305.76-1.605-2.665-.3-5.466-1.332-5.466-5.93 0-1.31.465-2.38 1.235-3.22-.135-.303-.54-1.523.105-3.176 0 0 1.005-.322 3.3 1.23.96-.267 1.98-.399 3-.405 1.02.006 2.04.138 3 .405 2.28-1.552 3.285-1.23 3.285-1.23.645 1.653.24 2.873.12 3.176.765.84 1.23 1.91 1.23 3.22 0 4.61-2.805 5.625-5.475 5.92.42.36.81 1.096.81 2.22 0 1.606-.015 2.896-.015 3.286 0 .315.21.69.825.57C20.565 22.092 24 17.592 24 12.297c0-6.627-5.373-12-12-12", fill: "#ffffff" }] },
];

function TechLogo({ tech }: { tech: Tech }) {
  return (
    <svg className={LOGO} viewBox={tech.viewBox} aria-hidden="true">
      {tech.paths.map((p, i) => (
        <path key={i} d={p.d} fill={p.fill} />
      ))}
    </svg>
  );
}

function GithubIcon() {
  return (
    <svg width="17" height="17" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true">
      <path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.01 8.01 0 0 0 16 8c0-4.42-3.58-8-8-8Z" />
    </svg>
  );
}

function YoutubeIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M21.58 7.19a2.51 2.51 0 0 0-1.77-1.77C18.25 5 12 5 12 5s-6.25 0-7.81.42a2.51 2.51 0 0 0-1.77 1.77A26.2 26.2 0 0 0 2 12a26.2 26.2 0 0 0 .42 4.81 2.51 2.51 0 0 0 1.77 1.77C5.75 19 12 19 12 19s6.25 0 7.81-.42a2.51 2.51 0 0 0 1.77-1.77A26.2 26.2 0 0 0 22 12a26.2 26.2 0 0 0-.42-4.81ZM10 15V9l5.2 3-5.2 3Z" />
    </svg>
  );
}

/** Adds .lp-anim, then reveals each [data-reveal] block as it scrolls in. */
function useReveal() {
  useEffect(() => {
    const root = document.querySelector<HTMLElement>("main.landing");
    if (!root) return;
    // Gated on JS so a failed hydrate never leaves the page invisible.
    root.classList.add("lp-anim");

    const targets = root.querySelectorAll("[data-reveal]");
    const io = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (!entry.isIntersecting) continue;
          entry.target.classList.add("is-in");
          io.unobserve(entry.target);
        }
      },
      { rootMargin: "0px 0px -12% 0px", threshold: 0.05 },
    );
    targets.forEach((t) => io.observe(t));
    return () => io.disconnect();
  }, []);
}

/**
 * Surveyor marks pinned to the corners of a framed block.
 *
 * Returns a fragment, deliberately, because a wrapper element would be a static child
 * and so claim a cell in the grid containers these sit inside. The ticks
 * themselves are position:absolute (.lp-tick), which keeps them out of flow.
 */
function Ticks({ solid = false, bottom = false }: { solid?: boolean; bottom?: boolean }) {
  const cls = `${solid ? "lp-tick lp-tick--solid" : "lp-tick"} pointer-events-none`;
  return (
    <>
      <span aria-hidden="true" className={`${cls} left-0 top-0 -translate-x-1/2 -translate-y-1/2`} />
      <span aria-hidden="true" className={`${cls} right-0 top-0 translate-x-1/2 -translate-y-1/2`} />
      {bottom ? (
        <>
          <span aria-hidden="true" className={`${cls} bottom-0 left-0 -translate-x-1/2 translate-y-1/2`} />
          <span aria-hidden="true" className={`${cls} bottom-0 right-0 translate-x-1/2 translate-y-1/2`} />
        </>
      ) : null}
    </>
  );
}

/**
 * The reference's primary button does not simply darken: it dissolves to black
 * cell by cell. An 18x4 grid of squares fades in with a stepped 90ms
 * transition and a staggered delay, giving a pixel-wipe.
 *
 * Delays are derived from the index, never Math.random(): a random value would
 * differ between server and client render and break hydration.
 */
const PIXEL_COLS = 18;
const PIXEL_ROWS = 4;

function pixelDelay(index: number) {
  const col = index % PIXEL_COLS;
  const jitter = (index * 1103515245 + 12345) % 45;
  return col * 5 + jitter;
}

function PixelFill() {
  return (
    <span
      aria-hidden="true"
      className="pointer-events-none absolute inset-0 z-0 grid"
      style={{ gridTemplateColumns: `repeat(${PIXEL_COLS}, 1fr)`, gridTemplateRows: `repeat(${PIXEL_ROWS}, 1fr)` }}
    >
      {Array.from({ length: PIXEL_COLS * PIXEL_ROWS }).map((_, i) => (
        <span
          key={i}
          className="bg-(--lp-ink) opacity-0 [transition:opacity_90ms_steps(1)] group-hover:opacity-100"
          style={{ transitionDelay: `${pixelDelay(i)}ms` }}
        />
      ))}
    </span>
  );
}

function Eyebrow({ children }: { children: string }) {
  return (
    <span className="inline-flex items-center rounded-[1px] bg-(--lp-accent-strong) px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.08em] text-white">
      {children}
    </span>
  );
}

/** Heading highlight block: charcoal by default, solid accent when `fill`. */
function Box({ children, fill = false }: { children: React.ReactNode; fill?: boolean }) {
  return (
    <span
      className={`inline-block px-3 py-[5px] font-semibold tracking-normal text-white ${fill ? "bg-(--lp-accent-strong)" : "bg-(--lp-charcoal)"}`}
    >
      {children}
    </span>
  );
}

/**
 * Hero artwork. Designed rather than a screenshot, mirroring how the reference
 * leads with a rendered scene and saves product captures for the use-case
 * panels. It shows the actual claim: four kinds of source converging into one
 * governed answer that carries its provenance.
 */
function HeroVisual() {
  const sources = [
    { label: "Drawings and P&IDs", pos: "left-0 top-[8%]" },
    { label: "Procedures", pos: "right-0 top-[16%]" },
    { label: "OT tag history", pos: "left-0 bottom-[16%]" },
    { label: "Field voice notes", pos: "right-0 bottom-[8%]" },
  ];
  return (
    <div className="relative w-full" style={{ aspectRatio: "16 / 8.5" }}>
      {/* connectors, drawn behind everything */}
      <svg viewBox="0 0 1000 530" className="absolute inset-0 size-full" aria-hidden="true" preserveAspectRatio="none">
        <g stroke="#ffffff" strokeWidth="1" opacity="0.28" fill="none">
          <path d="M210 70 C 360 70, 380 230, 500 250" />
          <path d="M800 110 C 660 110, 640 240, 512 255" />
          <path d="M210 440 C 360 440, 380 290, 500 268" />
          <path d="M800 480 C 660 480, 640 300, 512 275" />
        </g>
        <g fill="var(--lp-accent)">
          <circle cx="500" cy="250" r="3" />
          <circle cx="512" cy="255" r="3" />
          <circle cx="500" cy="268" r="3" />
          <circle cx="512" cy="275" r="3" />
        </g>
      </svg>

      {sources.map((source) => (
        <span
          key={source.label}
          className={`absolute ${source.pos} hidden items-center gap-2 rounded-full border border-white/25 bg-black/45 px-3.5 py-2 text-[12px] text-white backdrop-blur-md sm:inline-flex`}
        >
          <span aria-hidden="true" className="size-1.5 rounded-full bg-(--lp-accent)" />
          {source.label}
        </span>
      ))}

      {/* the governed answer at the centre */}
      <div className="absolute left-1/2 top-1/2 w-[min(92%,460px)] -translate-x-1/2 -translate-y-1/2">
        <div className="lp-mock border border-white/15 bg-(--lp-surface) p-4 sm:p-5">
          <div className="flex items-center justify-between border-b border-(--lp-line) pb-3">
            <span className="text-[11px] font-semibold uppercase tracking-[0.08em] text-(--lp-accent-text)">Governed answer</span>
            <span className="text-[11px] text-(--lp-muted)">2.1s</span>
          </div>
          <p className="lp-display mt-3 text-[17px] leading-tight text-(--lp-ink) sm:text-[19px]">
            P-101 seal plan was revised on 4 March. The old plan still answers questions about February.
          </p>
          <div className="mt-4 flex flex-wrap gap-1.5 text-[11px]">
            <span className="bg-(--lp-accent-strong) px-2 py-1 font-medium text-white">3 sources</span>
            <span className="border border-(--lp-line) px-2 py-1 text-(--lp-muted)">Authority: regulation</span>
            <span className="border border-(--lp-line) px-2 py-1 text-(--lp-muted)">Verified</span>
          </div>
          <div className="mt-4">
            <div className="flex justify-between text-[11px] text-(--lp-muted)">
              <span>Confidence</span>
              <span className="font-semibold text-(--lp-ink)">0.91</span>
            </div>
            <div className="mt-1.5 h-1.5 bg-(--lp-band)">
              <span className="block h-full w-[91%] bg-(--lp-accent)" />
            </div>
          </div>
        </div>
      </div>

      <span className="absolute bottom-0 left-1/2 hidden -translate-x-1/2 items-center gap-2 rounded-full border border-white/25 bg-black/45 px-3.5 py-2 text-[12px] text-white backdrop-blur-md sm:inline-flex">
        No claim without its source
      </span>
    </div>
  );
}

/**
 * A real screenshot of the running app, captured by
 * scripts/capture_landing_shots.mjs. Re-run that script after UI changes so the
 * marketing page never drifts from the product.
 */
function Shot({ src, alt }: { src: string; alt: string }) {
  return (
    <Image
      src={`/shots/${src}.png`}
      alt={alt}
      width={2880}
      height={1620}
      sizes="(max-width: 1024px) 100vw, 900px"
      className="lp-mock h-auto w-full"
    />
  );
}

export default function Home() {
  const router = useRouter();
  const [capability, setCapability] = useState(0);
  const [audience, setAudience] = useState(0);
  const [faqGroup, setFaqGroup] = useState(0);
  useReveal();

  async function enterWorkspace() {
    const user = await getMe();
    router.push(user?.role === "field_worker" ? "/briefs" : user ? "/management" : "/login");
  }

  const active = capabilities[capability];

  return (
    <main className={`landing ${instrumentSans.variable} ${dmSans.variable} min-h-dvh`}>
      {/* ── Nav: segmented cells, not a plain row ──────────────────────── */}
      {/* Solid, no backdrop blur: the reference header is opaque #f8f8f8. */}
      <header className="sticky top-0 z-30 border-b border-(--lp-line) bg-(--lp-band)">
        <nav className="lp-frame flex h-[49px] items-stretch">
          <Link href="/" aria-label="Kairos home" className="flex items-center gap-2.5 border-r border-(--lp-line) px-4 sm:px-5">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/logo.png" alt="" width={24} height={24} className="object-cover" />
            <span className="lp-display text-[18px] text-(--lp-ink)">Kairos</span>
          </Link>

          <div className="hidden items-stretch lg:flex">
            {navLinks.map(([label, href]) => (
              <a
                key={href}
                href={href}
                className="flex items-center border-r border-(--lp-line) px-5 text-[14px] text-(--lp-muted) transition-colors duration-150 hover:bg-(--lp-ink) hover:text-white"
              >
                {label}
              </a>
            ))}
          </div>

          <div className="ml-auto flex items-stretch">
            <Link
              href="/login"
              className="hidden items-center border-x border-(--lp-line) px-7 text-[14px] text-(--lp-ink) transition-colors duration-150 hover:bg-(--lp-ink) hover:text-white sm:flex"
            >
              Sign in
            </Link>
            <button
              type="button"
              onClick={enterWorkspace}
              className="group relative flex items-center gap-2 overflow-hidden bg-(--lp-accent-strong) px-5 text-[14px] font-medium text-white sm:px-7"
            >
              <PixelFill />
              <span className="relative z-10">Open workspace</span>
              <span aria-hidden="true" className="relative z-10">›</span>
            </button>
          </div>
        </nav>
      </header>

      {/* ── Hero ────────────────────────────────────────────────────────── */}
      <section className="lp-frame relative px-4 pb-14 pt-16 sm:px-6 sm:pt-24">
        <div data-reveal className="grid gap-10 lg:grid-cols-[1.1fr_0.9fr] lg:items-start">
          {/* The {" "} before each <br /> is load-bearing: <br> contributes no
              whitespace, so without it the accessible name runs the lines
              together ("Plant knowledge,at the moment…"). Same pattern below. */}
          <h1 className="text-[44px] text-(--lp-ink) sm:text-[60px] lg:text-[72px]">
            Plant knowledge,{" "}<br />
            <span className="text-(--lp-accent)">at the moment</span>{" "}<br />
            of action.
          </h1>

          <div className="lg:pt-4">
            <p className="max-w-md text-[16px] leading-6 text-(--lp-muted)">
              Kairos connects trusted documents, asset history, field observations and governance
              controls into one operational workspace, and makes every answer show its evidence.
            </p>
            <div className="mt-7 flex flex-wrap gap-3">
              <button
                type="button"
                onClick={enterWorkspace}
                className="group relative inline-flex min-h-11 min-w-[207px] items-center justify-center gap-2 overflow-hidden bg-(--lp-accent-strong) px-3 py-[15px] text-[14px] font-medium text-white"
              >
                <PixelFill />
                <span className="relative z-10">Open workspace</span>
                <span aria-hidden="true" className="relative z-10">›</span>
              </button>
              <a
                href="#capabilities"
                className="inline-flex min-h-11 min-w-[207px] items-center justify-center gap-2 bg-(--lp-ink) px-3 py-[15px] text-[14px] font-medium text-white transition-colors duration-150 hover:bg-(--lp-accent-strong)"
              >
                See how it works <span aria-hidden="true" className="text-(--lp-accent)">▶</span>
              </a>
            </div>
          </div>
        </div>

        <div data-reveal className="lp-card lp-media lp-dither relative mt-12 border border-transparent p-3 sm:p-6">
          <div className="relative border border-white/20 p-4 sm:p-8">
            <HeroVisual />
          </div>
        </div>
      </section>

      {/* ── Capabilities: split layout with a composite media card ─────── */}
      <section id="capabilities" className="lp-band border-t border-(--lp-line)">
        <div className="lp-frame relative grid gap-10 px-4 py-16 sm:gap-14 sm:px-6 sm:py-24 lg:grid-cols-[1fr_1.35fr]">
          <Ticks />
          <div data-reveal>
            <Eyebrow>Capabilities</Eyebrow>
            <h2 className="mt-6 text-[30px] text-(--lp-ink) sm:text-[44px]">
              Answers paired with{" "}<br />their <Box>evidence.</Box>
            </h2>
            <p className="mt-6 max-w-md text-[16px] leading-6 text-(--lp-muted)">
              Kairos already knows the plant&apos;s documents, assets and history. Every surface
              speaks the same source-aware language, so nothing is asserted without a way to check it.
            </p>

            <div className="mt-10">
              {capabilities.map((item, index) => {
                const on = index === capability;
                return (
                  <button
                    key={item.id}
                    type="button"
                    aria-pressed={on}
                    aria-controls="capability-panel"
                    onClick={() => setCapability(index)}
                    className="relative block w-full border-b border-(--lp-line) py-4 pl-3 text-left"
                  >
                    {/* 20px / 500-on-active, matching the reference's own tab
                        metrics and its 0.24s colour easing. */}
                    <span
                      className={`lp-display text-[20px] transition-colors duration-[240ms] ease-[cubic-bezier(0.4,0,0.2,1)] ${on ? "font-medium text-(--lp-accent-text)" : "text-(--lp-tab-idle) hover:font-medium hover:text-(--lp-ink)"}`}
                    >
                      {item.name}
                    </span>
                    <span
                      aria-hidden="true"
                      className={`absolute -bottom-px left-0 h-0.5 bg-(--lp-accent) transition-all duration-[240ms] ease-[cubic-bezier(0.4,0,0.2,1)] ${on ? "w-4/5" : "w-0"}`}
                    />
                  </button>
                );
              })}
            </div>
          </div>

          {/* Composite card: gradient media on top, white text block beneath. */}
          <div id="capability-panel" data-reveal className="lp-card relative self-start border border-(--lp-accent) bg-(--lp-surface)">
            <Ticks solid bottom />
            <div key={active.id} className="lp-swap">
              {/* Both regions are pinned so switching tabs never resizes the
                  card. The mocks differ in natural height, so the media area
                  centres its content inside a fixed box. */}
              <div className="lp-media lp-dither relative flex min-h-[340px] flex-col overflow-hidden p-5 sm:min-h-[350px] sm:p-6">
                <p className="inline-block self-start bg-(--lp-accent-strong) px-3 py-1.5 text-[10px] font-semibold uppercase leading-4 tracking-[0.06em] text-white sm:text-[11px]">
                  {active.banner}
                </p>
                <div className="mt-5 flex flex-1 flex-col justify-center">
                  <active.Mock />
                </div>
              </div>

              <div className="flex min-h-[208px] flex-col justify-center p-5 sm:p-7">
                <p className="text-[11px] font-semibold uppercase tracking-[0.1em] text-(--lp-accent-text)">{active.eyebrow}</p>
                <h3 className="mt-3 text-[24px] text-(--lp-ink) sm:text-[32px]">{active.title}</h3>
                <p className="mt-4 max-w-xl text-[15px] leading-6 text-(--lp-muted)">{active.body}</p>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ── Routing strip ───────────────────────────────────────────────── */}
      <section id="platform" className="border-t border-(--lp-line)">
        <div className="lp-frame relative px-4 py-16 sm:px-6 sm:py-24">
          <Ticks />
          <div data-reveal>
            <p className="inline-block bg-(--lp-charcoal) px-3 py-1.5 text-[11px] font-semibold uppercase tracking-[0.08em] text-white">
              Kairos routes every signal to whoever owns the outcome
            </p>
          </div>
          <div data-reveal className="mt-10 grid gap-px bg-(--lp-line) sm:grid-cols-2 lg:grid-cols-4">
            {routing.map(([trigger, owner, outcome]) => (
              <div key={owner} data-stagger className="lp-cell bg-(--lp-bg) p-5">
                <p className="lp-display text-[20px] text-(--lp-ink)">{trigger}</p>
                <p className="mt-4 inline-block bg-(--lp-accent-strong) px-2 py-1 text-[12px] font-semibold text-white">{owner}</p>
                <p className="mt-4 text-[14px] leading-5 text-(--lp-muted)">{outcome}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── System design: the flow, then the stack ─────────────────────── */}
      <section id="system" className="bg-(--lp-dark) text-white">
        <div className="lp-frame lp-frame--dark px-4 py-16 sm:px-6 sm:py-24">
          <div data-reveal>
            <Eyebrow>System design</Eyebrow>
            <h2 className="mt-6 max-w-3xl text-[30px] sm:text-[44px]">
              Thirteen layers,{" "}<br /><Box fill>one path through.</Box>
            </h2>
            <p className="mt-6 max-w-xl text-[16px] leading-6 text-(--lp-dark-muted)">
              A document enters at the top and leaves as an answer someone can act on. Two exits
              along the way are one-way: uncertain facts go to quarantine, and a safety question
              without evidence gets a refusal instead of a guess.
            </p>
          </div>

          {/* A real architecture diagram: service boxes, decision gates,
              datastore cylinders and directed edges. See SystemDiagram. */}
          <div data-reveal className="mt-14 overflow-x-auto">
            <SystemDiagram />
          </div>

        </div>
      </section>

      {/* ── Use cases: full-bleed tab bar over a media panel ───────────── */}
      <section id="field" className="border-t border-(--lp-line)">
        <div className="lp-frame relative px-4 py-16 sm:px-6 sm:py-24">
          <Ticks />
          <div data-reveal>
            <Eyebrow>Use cases</Eyebrow>
            <h2 className="mt-6 text-[30px] text-(--lp-ink) sm:text-[44px]">
              Built for the <Box>way plants <span className="text-(--lp-accent)">actually run.</span></Box>
            </h2>
          </div>

          <div data-reveal className="mt-10">
            <div className="grid grid-cols-2 gap-px bg-(--lp-tab-line) sm:grid-cols-3 lg:grid-cols-6">
              {audiences.map((item, index) => {
                const on = index === audience;
                return (
                  <button
                    key={item.name}
                    type="button"
                    aria-pressed={on}
                    aria-controls="audience-panel"
                    onClick={() => setAudience(index)}
                    className={`min-h-16 px-4 py-5 text-center text-[15px] font-medium transition-colors ${on ? "bg-(--lp-accent-strong) text-white" : "bg-(--lp-tab) text-(--lp-ink) hover:bg-(--lp-tab-hover)"}`}
                  >
                    {item.name}
                  </button>
                );
              })}
            </div>

            <div id="audience-panel" className="lp-media lp-dither relative p-4 sm:p-8">
              <div key={audiences[audience].name} className="lp-swap">
                <div className="max-w-2xl">
                  <h3 className="text-[24px] text-white sm:text-[32px]">{audiences[audience].title}</h3>
                  <p className="mt-3 text-[15px] leading-6 text-white/85">{audiences[audience].body}</p>
                </div>
                <div className="mt-6 border border-white/20 p-2 sm:p-3">
                  <Shot src={audiences[audience].shot} alt={`Kairos workspace: ${audiences[audience].title.toLowerCase()}`} />
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ── Evals: a real chart, on dark ───────────────────────────────── */}
      <section id="evidence" className="bg-(--lp-dark) text-white">
        <div className="lp-frame lp-frame--dark px-4 py-16 sm:px-6 sm:py-24">
          <div data-reveal>
            <Eyebrow>Evals</Eyebrow>
            <h2 className="mt-6 max-w-3xl text-[30px] sm:text-[44px]">
              No empty promises.{" "}<br />
              <Box fill>Provenance at 100%.</Box>
            </h2>
            <p className="mt-6 max-w-xl text-[16px] leading-6 text-(--lp-dark-muted)">
              Thirty-seven domain-expert questions across fifteen categories, graded deterministically
              rather than by another model. Measured 16 August 2026 on the live stack. Higher is better.
            </p>
          </div>

          <div data-reveal className="mt-14">
            <p className="text-[11px] uppercase tracking-[0.12em] text-(--lp-dark-muted)">Graded outcomes · 37 questions</p>

            {/* pt-24 reserves room for the badge, value and sub-line stacked
                above each bar; a 100% bar would otherwise push them off. */}
            <div className="mt-6 flex gap-3 pt-24 sm:gap-5">
              {/* y axis every 10, labels centred on their gridline */}
              <div className="relative h-[460px] w-7 shrink-0" aria-hidden="true">
                {[100, 90, 80, 70, 60, 50, 40, 30, 20, 10, 0].map((n) => (
                  <span
                    key={n}
                    className="absolute right-0 translate-y-1/2 text-[11px] leading-none text-(--lp-dark-muted)"
                    style={{ bottom: `${n}%` }}
                  >
                    {n}
                  </span>
                ))}
              </div>

              <div className="relative min-w-0 flex-1">
                <div
                  aria-hidden="true"
                  className="absolute inset-0 border-b border-l border-(--lp-dark-line)"
                  style={{
                    backgroundImage: "linear-gradient(to top, var(--lp-dark-line) 1px, rgb(0 0 0 / 0) 1px)",
                    backgroundSize: "100% 10%",
                  }}
                />
                <ul className="relative grid h-[460px] grid-cols-3">
                  {evalBars.map((bar) => (
                    <li key={bar.label} className="relative">
                      <div
                        className={`lp-bar absolute inset-x-[24%] bottom-0 ${bar.hero ? "lp-bar--hero lp-dither" : "bg-(--lp-bar-idle)"}`}
                        style={{ height: `${bar.value}%` }}
                      />

                      <div className="absolute inset-x-0 text-center" style={{ bottom: `calc(${bar.value}% + 14px)` }}>
                        <span className={`inline-block px-2 py-0.5 text-[10px] font-semibold tracking-[0.04em] ${bar.hero ? "bg-(--lp-accent-strong) text-white" : "text-(--lp-dark-muted)"}`}>
                          {bar.badge}
                        </span>
                        <p className={`lp-display mt-1.5 text-[26px] sm:text-[32px] ${bar.hero ? "text-white" : "text-(--lp-dark-muted)"}`}>
                          {bar.display}
                        </p>
                        <p className="mt-1 text-[11px] text-(--lp-dark-muted)">{bar.sub}</p>
                      </div>
                    </li>
                  ))}
                </ul>
              </div>
            </div>

            {/* x axis */}
            <div className="ml-10 grid grid-cols-3 pt-4">
              {evalBars.map((bar) => (
                <div key={bar.label} className="text-center">
                  <p className={`text-[14px] font-semibold ${bar.hero ? "text-(--lp-accent)" : "text-white"}`}>{bar.label}</p>
                  <p className="mt-1 text-[12px] text-(--lp-dark-muted)">{bar.note}</p>
                </div>
              ))}
            </div>
            <p className="mt-8 max-w-2xl text-[13px] leading-5 text-(--lp-dark-muted)">
              One run, reported with its confidence interval rather than a median that hides the
              spread: 34 of 37, 95% CI 79 to 97. The run carries a validity verdict — every answer
              came from the same Llama 3.1 70B, none from a different fallback model, or it would
              not be quoted here. Retrieval and provenance are deterministic and held at 37/37.
              Three answers are safety-gate refusals, each carrying its own sources; a correct
              refusal counts as a correct outcome, so each was checked against the graph to confirm
              no authoritative source existed for the parameter asked.
            </p>
          </div>

          {/* The other five harnesses. */}
          <div data-reveal className="mt-16">
            <p className="text-[11px] uppercase tracking-[0.12em] text-(--lp-dark-muted)">The rest of the harness</p>
            <div className="mt-6 grid gap-px bg-(--lp-dark-line) sm:grid-cols-2 lg:grid-cols-3">
              {evalSuites.map((suite) => (
                <div key={suite.name} data-stagger className="lp-cell lp-cell--dark bg-(--lp-dark) p-5">
                  <p className="text-[11px] uppercase tracking-[0.08em] text-(--lp-dark-muted)">{suite.name}</p>
                  <p className="lp-display mt-3 text-[32px] text-white">
                    {suite.headline}
                  </p>
                  <p className="mt-1 text-[12px] text-(--lp-accent)">{suite.headlineNote}</p>
                  <dl className="mt-4 space-y-1.5 border-t border-(--lp-dark-line) pt-3 text-[12px]">
                    {suite.rows.map(([term, value]) => (
                      <div key={term} className="flex justify-between gap-3">
                        <dt className="text-(--lp-dark-muted)">{term}</dt>
                        <dd className="text-right font-semibold text-white">{value}</dd>
                      </div>
                    ))}
                  </dl>
                </div>
              ))}
            </div>
          </div>

          {/* Honesty block. The reference has no equivalent; this one earns it. */}
          <div data-reveal className="lp-card mt-14 border border-(--lp-dark-line) p-5 sm:p-7">
            <p className="lp-display text-[20px] text-white sm:text-[24px]">What these numbers are not</p>
            <div className="mt-5 grid gap-x-10 gap-y-4 sm:grid-cols-3">
              {notMeasured.map(([term, value]) => (
                <div key={term}>
                  <p className="text-[13px] font-semibold text-(--lp-accent)">{term}</p>
                  <p className="mt-1 text-[13px] leading-5 text-(--lp-dark-muted)">{value}</p>
                </div>
              ))}
            </div>
            <p className="mt-6 max-w-3xl text-[13px] leading-5 text-(--lp-dark-muted)">
              Every figure is measured against the authored golden dataset. Kairos has no connection
              to a live plant. That is the intended MVP boundary, stated rather than hidden. The
              harness, the question set and the raw output all live in the repository.
            </p>
          </div>
        </div>
      </section>

      {/* ── Provenance ──────────────────────────────────────────────────── */}
      <section id="provenance" className="lp-band border-t border-(--lp-line)">
        <div className="lp-frame relative px-4 py-16 sm:px-6 sm:py-24">
          <div data-reveal>
            <Eyebrow>Provenance</Eyebrow>
            <h2 className="mt-6 max-w-4xl text-[30px] text-(--lp-ink) sm:text-[44px]">
              No <Box>claim</Box> without its <Box fill>source.</Box>
            </h2>
            <p className="mt-6 max-w-xl text-[16px] leading-6 text-(--lp-muted)">
              Every fact in the graph carries six properties on the edge itself. That is what makes an
              answer checkable, a supersession reversible, and a low-confidence guess impossible to
              mistake for a verified fact.
            </p>
          </div>

          <div data-reveal className="lp-media lp-dither relative mt-12 p-3 sm:p-6">
            <div className="border border-white/20 p-2 sm:p-3">
              <Shot src="graph" alt="The Kairos knowledge graph: assets and facts joined by time-aware edges, each carrying its source and authority." />
            </div>
          </div>

          <div data-reveal className="mt-12 grid gap-px bg-(--lp-line) sm:grid-cols-2 lg:grid-cols-3">
            {edgeProperties.map(([name, note]) => (
              <div key={name} data-stagger className="lp-cell bg-(--lp-surface) p-5">
                <code className="text-[14px] font-semibold text-(--lp-accent-text)">{name}</code>
                <p className="mt-3 text-[14px] leading-5 text-(--lp-muted)">{note}</p>
              </div>
            ))}
          </div>
        </div>
      </section>
      {/* ── FAQ: two columns, category rail then the answers ──────────── */}
      <section className="bg-(--lp-dark) text-white">
        <div className="lp-frame lp-frame--dark px-4 py-16 sm:px-6 sm:py-24">
          <div data-reveal>
            <Eyebrow>FAQ</Eyebrow>
            <h2 className="mt-6 max-w-2xl text-[30px] sm:text-[44px]">
              Your questions,{" "}<br /><Box fill>answered.</Box>
            </h2>
            <p className="mt-6 max-w-md text-[15px] leading-6 text-(--lp-dark-muted)">
              The things people ask before they trust a system with a safety case. Still curious?
              Read the source, or open the workspace and interrogate it directly.
            </p>
            <a
              href={GITHUB_URL}
              target="_blank"
              rel="noreferrer noopener"
              className="mt-6 inline-flex items-center gap-2.5 border border-(--lp-dark-line) px-4 py-2.5 text-[14px] text-white transition-colors duration-150 hover:border-(--lp-accent)"
            >
              <GithubIcon />
              Read the source
              <span aria-hidden="true" className="text-(--lp-accent)">›</span>
            </a>
          </div>

          <div data-reveal className="mt-12 grid gap-10 lg:grid-cols-[0.8fr_1.4fr]">
            <div className="lp-dashed border-t">
              {faqGroups.map((group, index) => {
                const on = index === faqGroup;
                return (
                  <button
                    key={group.name}
                    type="button"
                    aria-pressed={on}
                    aria-controls="faq-answers"
                    onClick={() => setFaqGroup(index)}
                    className="lp-dashed flex w-full items-center justify-between border-b py-6 text-left"
                  >
                    <span className={`lp-display text-[26px] transition-colors sm:text-[32px] ${on ? "text-white" : "text-(--lp-dark-muted) hover:text-white"}`}>
                      {group.name}
                    </span>
                    <span aria-hidden="true" className={`text-[18px] transition-transform ${on ? "rotate-90 text-(--lp-accent)" : "text-(--lp-dark-muted)"}`}>›</span>
                  </button>
                );
              })}
            </div>

            <div id="faq-answers" className="lp-dashed border-t">
              <div key={faqGroups[faqGroup].name} className="lp-swap">
                {faqGroups[faqGroup].items.map(([question, answer], index) => (
                  <details key={question} className="lp-dashed group border-b" open={index === 0}>
                    <summary className="flex cursor-pointer list-none items-center justify-between gap-6 py-5 text-[17px] font-medium text-white marker:hidden hover:text-(--lp-accent)">
                      {question}
                      <span aria-hidden="true" className="shrink-0 text-[20px] text-(--lp-accent) transition-transform group-open:rotate-45">+</span>
                    </summary>
                    <p className="max-w-2xl pb-6 text-[15px] leading-6 text-(--lp-dark-muted)">{answer}</p>
                  </details>
                ))}
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Tech stack band, directly above the footer as on the reference: one
          continuous full-bleed strip, no framed label floating over a
          full-bleed row. Hovering pauses the scroll. */}
      {/* Tech roller, built the way the reference builds its marquee band:
          a light outer band whose padding is what separates the strip from the
          dark section above and the footer below, wrapping a dark inner strip.
          No borders; the light band does that job. Items are mx-9 / gap-9 at
          32px, and the track translates exactly -50%. */}
      <div aria-hidden="true" className="overflow-hidden bg-(--lp-band) py-2">
        <div className="overflow-hidden bg-(--lp-dark) py-2.5">
          {/* Each half must be at least as wide as the viewport or the -50%
              slide opens a gap at the right edge. */}
          <div className="lp-marquee-track flex w-max whitespace-nowrap">
            {[...techStack, ...techStack].map((tech, i) => (
              <span key={`${tech.name}-${i}`} className="mx-9 flex items-center gap-9 text-[32px] text-white">
                <TechLogo tech={tech} />
                {tech.name}
              </span>
            ))}
          </div>
        </div>
      </div>
      <p className="sr-only">Built with {techStack.map((t) => t.name).join(", ")}.</p>

      {/* ── Footer ──────────────────────────────────────────────────────── */}
      <footer className="bg-(--lp-bg)">
        <div className="lp-frame px-4 py-14 sm:px-6">
          <div className="grid gap-10 sm:grid-cols-2 lg:grid-cols-[1.4fr_repeat(3,0.6fr)]">
            <div>
              <div className="flex items-center gap-2.5">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src="/logo.png" alt="" width={26} height={26} className="object-cover" />
<span className="lp-display text-[22px] text-(--lp-ink)">Kairos</span>
              </div>
              <p className="mt-4 max-w-xs text-[14px] leading-5 text-(--lp-muted)">
                The right knowledge to the right person at the moment of action.
              </p>
              <button
                type="button"
                onClick={enterWorkspace}
                className="group relative mt-6 inline-flex min-h-11 items-center justify-center gap-2 overflow-hidden bg-(--lp-accent-strong) px-5 py-[15px] text-[14px] font-medium text-white"
              >
                <PixelFill />
                <span className="relative z-10">Open workspace</span>
                <span aria-hidden="true" className="relative z-10">›</span>
              </button>
            </div>

            {footerColumns.map(({ heading, links }) => (
              <div key={heading}>
                <p className="lp-display text-[18px] text-(--lp-ink)">{heading}</p>
                <ul className="mt-4 space-y-2.5">
                  {links.map(([label, href]) => (
                    <li key={href}>
                      {href.startsWith("/") ? (
                        <Link href={href} className="text-[14px] text-(--lp-muted) transition-colors hover:text-(--lp-accent-text)">{label}</Link>
                      ) : (
                        <a href={href} className="text-[14px] text-(--lp-muted) transition-colors hover:text-(--lp-accent-text)">{label}</a>
                      )}
                    </li>
                  ))}
                </ul>
              </div>
            ))}

            <div>
              <p className="lp-display text-[18px] text-(--lp-ink)">Developers</p>
              <ul className="mt-4 space-y-2.5">
                {developers.map((name) => (
                  <li key={name} className="text-[14px] text-(--lp-muted)">{name}</li>
                ))}
              </ul>
            </div>
          </div>

          <div className="mt-12 flex flex-wrap items-center justify-between gap-4 border-t border-(--lp-line) pt-6">
            <p className="text-[12px] uppercase tracking-[0.08em] text-(--lp-muted)">
              © 2026 Kairos · Governed industrial operational intelligence
            </p>
            <div className="flex items-center gap-2">
              <a
                href={GITHUB_URL}
                target="_blank"
                rel="noreferrer noopener"
                aria-label="Kairos on GitHub"
                className="grid size-9 place-items-center bg-(--lp-ink) text-white transition-colors hover:bg-(--lp-accent-strong)"
              >
                <GithubIcon />
              </a>
              {YOUTUBE_DEMO_URL ? (
                <a
                  href={YOUTUBE_DEMO_URL}
                  target="_blank"
                  rel="noreferrer noopener"
                  aria-label="Watch the Kairos demo"
                  className="grid size-9 place-items-center bg-[#ff0000] text-white transition-opacity hover:opacity-80"
                >
                  <YoutubeIcon />
                </a>
              ) : (
                // Inert until the URL is filled in above. A visible slot beats
                // a dead link, and the markup is already in place.
                <span
                  title="Demo video coming soon"
                  aria-label="Demo video coming soon"
                  className="grid size-9 cursor-not-allowed place-items-center border border-dashed border-(--lp-line) text-(--lp-tab-idle)"
                >
                  <YoutubeIcon />
                </span>
              )}
            </div>
          </div>
        </div>
      </footer>
    </main>
  );
}
