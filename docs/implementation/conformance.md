# KAIROS — Architecture ⇄ Implementation Conformance

> **What this file is:** a layer-by-layer audit of `docs/ARCHITECTURE.md` (the *design*) against the actual
> code (the *reality*) — flagging where the implementation **matches**, **partially matches**, **drifts**, or is
> **deferred by design**. Companion to [`status.md`](./status.md): status.md answers *"is it built?"*; this
> file answers *"does it match the spec, and where has it diverged?"*
>
> Audited 2026-07-18 against the codebase; **re-confirmed 2026-07-19** — the manual-QA hardening pass
> (see status.md) was bug-fixes/UI polish only and changed **no** layer's conformance verdict.
> **Re-audited 2026-07-21** — no prior finding was stale, but a deeper code check surfaced **one new
> real drift (L7 — MoC webhook signature check is dead code)** and a nuance on the known L4 drift
> (schema is provisioned for all 6 node types; only the write path lags). Both are folded in below.
>
> **Code-level re-verification 2026-07-21** — every headline verdict re-checked against source (MoC secret,
> node-write path, 6 edge props, L10's 3 attribution checks, L11 refusal, L9 triggers, model gate, circuit
> breaker): **all confirmed accurate**. Two refinements folded in — the L4 Event-node gap also leaves two
> orphaned `GraphService` read methods (so asset-detail `last_inspection_date` is always `null`), and the L7
> circuit breaker uses per-asset-class z-scores but **not** the design's per-maturity-phase control limits.
> Legend: ✅ **Conformant** · 🟡 **Partial** (built, simplified from spec) ·
> 🔵 **Deferred by design** (spec describes an external/phase-gated system KAIROS doesn't own) ·
> ⚠️ **Drift** (implementation diverges from the design in a way worth knowing).

---

## Summary

| Layer | Verdict | One-line |
|---|:--:|---|
| 0 · Empirical Validation & Model Safety | ✅ | Corpus grows from human promotions/annotations; model gate per **entity-type** F1 (per-**asset-class** enforcement lives in L7's circuit breaker) |
| 1 · Deterministic Identity & MDM | ✅ | Human-confirmed `MERGE` assets, alias resolution, quarantine for unlinkable knowledge. EAM bootstrap is a fixture (no SAP/Maximo) |
| 2 · Immutable Evidence Vault | ✅ | Supabase Storage, SHA-256 dedup, version chain, `active/superseded/…` status, never-delete |
| 3 · Multimodal Perception | ✅ | Two-path OCR (PyMuPDF + NIM), NIM NER, P&ID **vision** (Path B), voice (Groq), handwriting, annotations |
| 4 · Temporal Reality Graph | ⚠️ | 6 edge props ✅, time-travel ✅, blast-radius ✅ — but only **3 of 6 node types** are graph nodes |
| 5 · Zero-Copy OT Virtualization | 🔵 | Mock historian by design; `PIWebAPIClient` built, OPC-UA/Honeywell/GraphQL are stubs/absent |
| 6 · Quarantine Knowledge | ✅ | One-way gate, searchable+labelled, 4 review actions, SLA escalation |
| 7 · Dual-Track Governance | ⚠️ | Admin vs engineering tracks, per-criticality SLA, SPC circuit breaker all conformant — but MoC **webhook signature verification is dead code** (see below) |
| 8 · Event Subscription & Delivery | 🟡 | 8 sources, dedup/correlate/late-arrival, EEMUA governor, cool-down, sign-off — **pilot-gate not built** |
| 9 · Knowledge Elicitation | ✅ | Micro-interviews on all 3 designed triggers, off-boarding programmes |
| 10 · Outcome Attribution | ✅ | All 3 parallel checks built; telemetry check reads the L5 mock historian (by design) |
| 11 · Reasoning & Synthesis | ✅ | Hybrid retrieval (exact+semantic+graph+authority re-rank), safety refusal, all output types |
| 12 · Phased Deployment & Interface | ✅ | Phase badge, field mode, point-of-action UI; pilot/phase *gating* is operational, not code |

**Net:** 7 fully conformant · 3 partial/nuanced · 1 deferred-by-design (L5) · 2 real drifts (L4 node
types, L7 webhook signature). The design is implemented faithfully; the divergences below are the
honest exceptions — **ARCHITECTURE.md is not at 100% conformance**, but every gap is narrow and named.

---

## The divergences that matter

### ⚠️ L4 — only 3 of 6 designed node types exist as graph nodes
**Design:** node types are Asset, **Event**, Document, Concept, **Person**, **Organization**.
**Reality:** the graph only `MERGE`s **Asset**, **Document**, **Concept**. Events live in Supabase
(`operational_events`), not as Neo4j `Event` nodes; `PERSON`/`ORGANIZATION` are *extracted* by NER but are
**not promoted to graph nodes** (they surface as entities/edges, not first-class nodes).
**Impact:** graph traversals like "all events on this asset" or "which people touched this equipment" run
through Supabase/edges rather than native node types. Two `GraphService` methods still assume native `Event`
nodes: `get_asset_events` (no caller — dead code) and `get_last_inspection_date`, which **is** wired live into
`routers/assets.py` (the asset-detail `last_inspection_date` field). Since Event nodes are never written
anywhere in the repo, that field is **always `null`** — it degrades cleanly (no error), but it is silently
non-functional rather than "covered via Supabase." **To close:** materialise `Event`/`Person`/`Organization`
nodes during ingestion + event replay, and wire (or remove) the two Event read methods. Low urgency — nothing
errors.

**Nuance (2026-07-21):** this is a write-path gap, not a schema gap — `db/neo4j/init_schema.cypher` already
declares uniqueness constraints for **all 6** node labels (`Event`, `Person`, `Organisation` included) and
even seeds a `KAIROS_PLATFORM` `Organisation` node. The schema was provisioned for the full 6-node model;
`services/graph.py` just never got extended to populate the other 3 during ingestion.

### ⚠️ L7 — MoC webhook signature verification is dead code (found 2026-07-21)
**Design:** ARCHITECTURE.md line 177 — the MoC resolution must arrive via a "digitally signed resolution
webhook"; KAIROS does not update the canonical graph until that signed webhook is received.
**Reality:** `routers/governance.py:562` reads `moc_secret = getattr(settings, "MOC_WEBHOOK_SECRET", None)`,
but `Settings` (`api/config.py`) never declares a `MOC_WEBHOOK_SECRET` field — so `getattr` always returns
`None`, and the signature-check branch at line 563 (`if moc_secret and x_webhook_signature: ...`) never
executes, regardless of what's set in `.env`. **No MoC webhook request is ever signature-verified today.**
**Impact:** the MoC workflow itself (auto-draft, blast-radius, warning banners, graph update on resolution)
is fully functional — this only affects whether an inbound webhook's authenticity is checked. Previously
marked ✅-conformant in this doc without verifying the code path actually executes; corrected here.
**To close:** add `MOC_WEBHOOK_SECRET: str | None = None` to `Settings` and set it in `.env`. (Left as a
`status.md` pending item — not fixed as part of this audit, per user instruction: docs-only pass.)

### 🟡 L4 — timestamp handling detects drift but doesn't fully normalize
**Design:** align cross-system timestamps and **normalize to a site-canonical time reference (the historian)**.
**Reality:** the pipeline **detects** drift beyond `TIMESTAMP_DRIFT_TOLERANCE_MINUTES` (60) and flags
`timestamp_drift_detected` for review (`document_pipeline.py:522`). The *normalize-to-historian* step is not
implemented (there's no live historian). **Verdict:** the safety-relevant half (detect + flag) is built; the
canonical-normalization half is deferred with the historian.

### 🟡 L0 — model gate is per-entity-type, not per-asset-class
**Design:** "a model that passes global metrics but fails on a specific **asset class** is blocked for that
class." **Reality:** the model gate (`model_validation.py`) computes and gates on per-**entity-type** F1
against the incumbent baseline. Per-**asset-class** halting *does* exist — but as the **SPC circuit breaker**
in Layer 7, keyed on override-rate z-scores per asset class. So the capability the design attributes to L0 is
split across L0 (entity-type F1 gate) + L7 (asset-class circuit breaker). Nuance, not a gap.

### 🟡 L8 — pilot monitoring gate not implemented
**Design:** before Phase 3 activates, push volume must stay within EEMUA-191 norms for **30 consecutive
days**. **Reality:** not built — it's an operational phase-activation gate, not runtime code, and meaningless
without a real multi-week pilot. The *runtime* governor it protects (≤6/hr ceiling, priority, cool-down,
state-based suppression) **is** fully built. Deferred by design.

### 🔵 L5 — OT virtualization is mock by design (already tracked)
`MockHistorianClient` serves telemetry; the real `PIWebAPIClient` is built (flip `PI_WEBAPI_BASE_URL`),
OPC-UA is a stub, Honeywell Uniformance + generic GraphQL federation are not implemented; the instrumentation
coverage map returns a mock 75%. All **by design** — there's no plant to connect to. See status.md §Mock-by-design.

---

## Confirmed conformant (spot-checked against code)

- **L2 vault:** SHA-256 dedup, immutable, version-chain, status enum — all in `routers/documents.py`.
- **L3 perception:** native-PDF + NIM-OCR two-path (`services/ocr.py`), NIM NER, P&ID vision via
  `meta/llama-3.2-11b-vision` (`services/pid.py`, real primary + fixture fallback), Groq voice, annotations.
- **L4 edges:** all six mandatory props on 100% of edges (verified 123/123); `as_of` time-travel; blast-radius.
- **L6 quarantine:** one-way gate, `confidence < 0.7` → quarantine, 4 review actions (promote/dispute/
  request-info/archive), SLA escalation; promotion + `is_correct` annotations feed `validation_corpus` (closes
  the L0 loop as designed).
- **L7 governance:** administrative vs engineering tracks, MoC webhook (auto-draft + blast-radius +
  warning banners all real), per-criticality SLA (24h safety-critical / 5-day), SPC circuit breaker with
  per-asset-class z-scores (fixed `z > 2` threshold — the design's per-**deployment-maturity-phase** control
  limits are not implemented) — **except signature verification on the inbound webhook, which is dead code**
  (see divergence above; corrected from an earlier "HMAC-verified" claim in this doc).
- **L8 delivery:** all 8 event sources, 10-min dedup + event correlation + late-arrival window, EEMUA governor
  (≤6/hr, priority order, PTW-exempt), 4-hour cool-down, plant-state suppression, cryptographic sign-off.
- **L9 elicitation:** all three designed triggers implemented — rare failure code, >90th-percentile resolution
  time, novel-troubleshooting flag (`routers/elicitation.py`) — plus off-boarding programmes.
- **L10 attribution:** all three parallel checks (telemetry baseline, failure-code cross-reference, execution
  verification) in `workers/attribution.py`; counterfactual detection works (benchmark Q10/Q22). Telemetry
  input is the L5 mock (by design).
- **L11 synthesis:** hybrid retrieval (exact + semantic + graph + authority re-rank), synthesis assembles only
  from retrieved context (never originates), safety-critical **refusal** below threshold, all output types
  (answers, RCA packs, compliance reports, briefs).
- **L12 interface:** phase badge, field mode, point-of-action mobile+desktop; the deployment *trust arc*
  (shadow → assist → proactive) is a rollout process, represented in-UI, gated operationally not in code.

---

## How to keep this current

Re-run this audit when ARCHITECTURE.md or a layer's core service changes. The four divergences above are the
watch-list; everything else tracks the spec. This file is design-conformance only — for *build completion*
status see [`status.md`](./status.md); for the deployment/ops backlog see status.md §Pending.
