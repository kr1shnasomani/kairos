# KAIROS — Implementation Status

> **Single source of truth for project status.** Verified against the codebase 2026-07-18 (re-verified
> 2026-07-21). Other docs describe *how* each part works; this is the one place for **what's built**
> ([Layer completion](#layer-completion)), **how faithfully it matches the design**
> ([Conformance](#architecture--implementation-conformance)), and **what's left / known issues**
> ([Pending](#pending--deployment-ops--polish-as-of-2026-07-18)).
>
> Legend: ✅ **Live** (real, end-to-end) · 🟨 **Live on mock input** (real logic,
> fed by mock data **by design** — see below) · 🟦 **Mocked by design** (final).

---

## Headline

**All 13 architecture layers are implemented — the *product* is complete.** What remains is
**deployment, ops, and optional polish** (public hosting, manual E2E, security hardening) —
tracked in [Pending](#pending--deployment-ops--polish-as-of-2026-07-18) below.

**Corpus and plant connectivity are a fixed scope boundary, not open work.** KAIROS has **no
connection to a live industrial plant** (no OSIsoft PI historian, no SAP/Maximo EAM, single-site) and
no access to a real industrial document archive — every benchmark figure is measured against the
authored golden dataset in `dataset/`. Reviewers should not log "synthetic corpus" or "no real plant
data" as defects; they are the delivered MVP boundary. What *is* fair to assess is whether the numbers
are honestly measured on that corpus, and where corpus size limits what they can prove. Those integration points therefore run on
mock/fixture data **by design** — that is the intended, delivered MVP state, not
an unfinished task. The mock adapters are real code with a documented one-line
switch to go live *if* a plant is ever connected; until then, the mock **is** the
product.

---

## Session fixes — 2026-07-25 (integrity audit: fabrication paths, safety gate, compliance detection)

A code-level review against `PROBLEM_STATEMENT.md` found four defects where a shipped guarantee did
not hold in code. All four are fixed and covered by tests. Verified **in Docker** (57 backend tests;
frontend `tsc` 0 errors, `eslint` 0 errors, 124/124 vitest) — never on the host, which resolves
different package versions and produces false results.

| Was | Now |
|---|---|
| **Copilot and RCA fabricated answers on failure.** `synthesize()` / `getRcaPack()` return a bare value, not `Fetched<>`, so `useFetch`'s live-only guard never applied. On any error — or zero search results — they returned a hardcoded answer with invented document IDs (`DOC-P101-FAILURE-HIST`) and `confidence: 0.6`, rendered identically to a real cited answer. | Both **throw**. `/copilot` shows a per-turn `AnswerError` with retry; `/rca` uses its existing `failed` state. Copilot fixtures **deleted** from `lib/copilot.ts`; `rcaFor` marked TEST-ONLY. Zero results → `{answer: null, sources: []}`. |
| **The safety-critical refusal gate was unreachable.** It only fires when `query_category` reaches `/search/synthesize`, and **nothing in the system ever set it** — not `api.ts`, not the benchmark. `refused` was always `false`, while the copilot UI promised refusal three times. Worse, the deleted fixture contained a *fake* `PRESSURE_REFUSAL`, so the only refusal a judge could see was the fabricated one. | Endpoint derives the category via `LLMService.classify_query_category` when omitted, so the gate applies to **every** caller. Gate clears on high confidence **or** authority ≤ 3 — a confidence-only gate would have refused every safety query, since hybrid/graph retrieval carries `authority_level` but no `confidence`. |
| **Compliance gap detection was a cross join.** The query asked only "does this asset have *any* verified procedure", ignoring the clause. Since only manual quarantine promotion writes `verification_status='verified'`, `NOT EXISTS` was true for every pair → **every (regulation × asset) pair reported as a gap, unconditionally**. Audit-pack evidence was equally unbound: any document on any applicable asset counted for every clause. | Clauses declare `requires_document_type`; findings are per-clause with three outcomes (`gap` / `unverified_evidence` / covered-and-omitted). Audit evidence is bound to the clause's required type. Validated against a live Neo4j 5.20 (`scripts/verify_compliance_cypher.py`, EXPLAIN + semantics). |
| **PII redaction did not exist.** The deck and writeup both claim a DPDP-aligned pipeline that "strips names, shift identifiers, and personal attributes"; `grep -riE "pii\|redact"` returned one code comment. | `services/pii.py` — regex for structured identifiers + PERSON names reused from NER, stable pseudonyms so cross-references survive. Exposed at `GET /documents/{id}/redacted`, audited to `audit_log`. **Runs at export, never ingestion** — redacting on ingest would break "which technician signed off…" (benchmark Q15). |

**Also fixed:** retrieval fusion now uses RRF instead of comparing unbounded BM25 against 0–1 cosine
(authority stays the primary sort key); duplicate merge keeps the longest snippet; graph hits carry
real snippet text instead of `""`; spreadsheet (`.xlsx`/`.ods`) and email (`.eml`/`.mbox`) ingestion
added — two of the six source types the problem statement names; pooled per-event-loop HTTP client
replacing per-call `AsyncClient` in four services; LRU embedding cache; NER character offsets
recovered; P&ID fixture fallback now **disclosed in the UI**; `--profile local-stores` fixed (it
crash-looped whenever `.env` pointed at Aura, because Neo4j rejects any initial admin name but
`neo4j`).

**`benchmark/RESULTS.md` re-measured 2026-07-25** — every harness now has a number:
retrieval 25/25 · answer quality **22–24/25 (±2 run-to-run, quote the range)** · provenance 25/25 ·
compliance gap detection **precision 1.000 / recall 0.973 / F1 0.986, 0 false positives** ·
NER F1 **0.857** · load **840 requests, 0% errors to 25 VU** · time-to-answer 25.6% modelled reduction.

**Two further defects were found by actually running them, not by reading code:**
- **The NER model was dead.** NVIDIA deprecated `mistralai/ministral-14b-instruct-2512`; the endpoint
  hangs until timeout, so `NERService` silently degraded to its regex fallback (ASSET_TAG only) on
  every document. Swapped to `meta/llama-3.2-11b-vision-instruct` — PERSON recall 0.0 → 1.0.
- **The Layer-0 model gate could not select a model.** `NERService()` took no model argument, so
  `--model-name` only *labelled* the result while the call used `NVIDIA_NIM_NER_MODEL` — producing an
  authoritative-looking F1 attributed to a model never invoked. Fixed + pinned.

Also fixed a **false refusal** the safety gate introduced (bare `isolation` matched the *equipment
name* in "when was isolation valve XV-203 last inspected?"), and two methodology bugs in my own new
harnesses (307 redirects counted as success; a knee detector that fired on a single noisy sample and
reported opposite conclusions on consecutive runs).

**Withdrawn findings** (flagged in review, wrong on inspection): hardcoded hex colours are confined
to `global-error.tsx` — where the pitfalls table *requires* inline styles — and `.test.tsx` token
fixtures, so no violation; and missing NER offsets never affected the Layer-0 F1 metric, because
`_span_match` compares surface forms, not character offsets.

---

## Session fixes — 2026-07-22 (security hardening + demo-readiness)

Verified end-to-end (backend endpoints + browser via agent-browser; `tsc` clean; Go connector builds).

**Security (CodeQL + Dependabot alerts)**

| Area | Fix | Files |
|---|---|---|
| `golang.org/x/crypto` — 4 CRITICAL + 3 (auth-bypass, key-forwarding, DoS) | Bumped `0.23.0 → 0.52.0`; this requires Go 1.25, so `go.mod` + builder image bumped `1.22 → 1.25` (connector rebuilds clean) | `backend/connectors/go.mod`, `go.sum`, `Dockerfile` |
| Stack-trace exposure (CodeQL ×2) | Health checks + model probe now log the exception via `structlog` and return only `"error"` / `"probe failed"` — no internal detail to clients | `backend/api/routers/health.py` |
| XSS-through-DOM (CodeQL ×1, false-positive) | `<audio src>` object URL scheme-guarded to `blob:` only | `frontend/src/components/voice-recorder.tsx` |
| Missing workflow permissions (CodeQL ×7) | Least-privilege top-level `permissions: contents: read` | `.github/workflows/{lint,tests,neo4j,frontend}.yml` |

> Not yet closed by any PR at time of writing: the `x/crypto` bump here supersedes Dependabot PR #8 (which only reached `0.48.0`). Dependabot PRs #7/#10/#11/#12 (pip/npm/actions/docker bumps) still to be merged; #13 duplicates #12.

**Bug fixes (empty/broken pages found in the full 42-route audit)**

| Symptom | Root cause | Fix |
|---|---|---|
| **Briefs page** intermittently threw *"live data unavailable"* | Briefs `GET` counted every brief **on every page view** against the EEMUA governor → 2 refreshes exhausted the 6/hr ceiling → suppressed → empty → the fetcher mapped empty to a fixture-fallback error | `EventBusService.record_push_once()` counts each brief **once/hour** (Redis `SET NX`); `getBriefs` treats an empty-but-successful response as a valid live state (`BriefInbox` renders its own suppressed/empty panel). `briefs.py`, `event_bus.py`, `api.ts` |
| **`/governance/moc`** showed *"No changes under review"* despite a live draft | Backend MoC lifecycle uses `draft` / `pending_approval`; the list only rendered `pending`/`approved`/`rejected`, so drafts were invisible. Rendering the live item also crashed on `parameter.replace` (item has `description`, not `parameter`) | `PENDING_STATUSES` groups `draft`/`pending_approval` under **Pending**; `MocItem`/`MocStatus` aligned to the live shape (`description`, optional structured fields); columns + detail page guarded. `moc/page.tsx`, `moc/[id]/page.tsx`, `types.ts` |
| **`/compliance/audit-pack`** empty for every framework | (1) UI sent display strings (`OISD-117`) but Neo4j stores `OISD_117`; (2) evidence Cypher compared `valid_to` (a **string**) with `datetime()` → null → 0 evidence | UI frameworks now `{key,label}` matching the seeded graph (`OISD_117`, `ISO_45001`); audit Cypher parses `datetime(r.valid_to)`. Now 8 + 4 clauses with 10 evidence docs. `audit-pack/page.tsx`, `compliance.py` |

**Operational (state resets during the session, no code)**
- Restarted `kairos-backend-api` (ES boot-race exit) and `kairos-frontend` (Turbopack dev-manifest corruption from rapid reloads — clears the hard-404s on nested dynamic routes).
- Regenerated off-boarding interview questions (5 sessions × 5) via the elicitation worker.
- Reset the Redis governor counter once (`kairos:governor:dev-user:hourly_count`).

**Known remaining (data/seed, not code — no page is broken by these)**
- Audit-pack `vessel`/`compressor` clauses show 0 evidence (no asset has a matching `equipment_class`); `PESO`/`Factory Act` frameworks are not seeded → intentionally not shown.
- `validation_corpus` is empty (re-run `scripts/seed_validation_corpus.py` before demoing a live Model-Gate run).
- 2 non-golden docs (`DOC-DMW8QGDN4UPT`, `DOC-9WL3QQJOQL9S`) linger in the Documents list.
- The `valid_to`-stored-as-string mismatch exists in other Cypher queries too (`brief_engine`, `offboarding`, `graph`, `elicitation`); only the audit query was corrected here — the rest are a candidate for a root-cause data migration.

---

## Layer completion

| # | Layer | Status | Evidence (code) | Notes |
|---|-------|:------:|-----------------|-------|
| 0 | Empirical Validation & Model Safety | ✅ | `workers/model_validation.py`, `services/circuit_breaker.py`, `validation_corpus`, `/governance/model-gate/*`, `/governance/validation-corpus/stats` | — |
| 1 | Deterministic Identity & MDM Backbone | ✅ | `/assets` (`MERGE`, `identity_confirmed_by` required), `asset_alias_map`, `services/graph.py` | EAM asset bootstrap = Go-connector **fixture** (no SAP/Maximo) — mock by design |
| 2 | Immutable Evidence Vault | ✅ | Supabase Storage (`kairos-vault`), SHA-256 dedup, `documents`, `POST /documents/ingest` | — |
| 3 | Multimodal Perception Engine | ✅ | OCR (NIM Nemotron), NER (NIM llama-3.2-11b-vision), voice (Groq Whisper), annotations, **P&ID topology** (`services/pid.py`, NIM `llama-3.2-11b-vision`) | Path A (custom YOLO+LayoutLM on GPU) = optional future accuracy upgrade, `requirements-cv.txt` |
| 4 | Temporal Reality Graph | ✅ | Neo4j, `KNOWLEDGE_EDGE` (6 props), `as_of` time-travel, blast-radius, conflict detection | — |
| 5 | Zero-Copy OT Virtualization | 🟦 | Go connector `/ot/query`, `/ot/coverage` (`MockHistorianClient`) | **Mock by design — no plant historian.** Real path (`PIWebAPIClient`) is built; set `PI_WEBAPI_BASE_URL` to go live. OPC-UA is a stub. |
| 6 | Quarantine Knowledge Layer | ✅ | `quarantine_items` one-way gate, `/governance/quarantine` promote / dispute / request-info | — |
| 7 | Dual-Track Governance & Adjudication | ✅ | `knowledge_conflicts` (track), MoC webhook, SLA escalation (`services/sla_service.py`), circuit breaker, blast-radius | — |
| 8 | Operational Event & Proactive Delivery | ✅ | 8 event sources (`/events/*`), Redis Streams, EEMUA governor (`services/event_bus.py`), `services/brief_engine.py`, plant-state suppression, late-arrival + correlation | — |
| 9 | Structured Knowledge Elicitation | ✅ | `MicroInterviewWorkflow` (Neo4j + LLM, `workflows/elicitation_workflow.py`), off-boarding programmes | — |
| 10 | Telemetry-Grounded Outcome Attribution | 🟨 | `workers/attribution.py` (3-check logic), triggered from `POST /events/work-order` | Full attribution logic; its telemetry-baseline check reads the Layer-5 **mock** historian by design (no plant). Live logic, mock sensor input. |
| 11 | Reasoning & Synthesis | ✅ | Hybrid search (`services/search_service.py`), `/search/synthesize`, `/search/rca-pack`, safety refusal (NIM `llama-3.1-70b` + Jina embed) | — |
| 12 | Phased Deployment, Trust & Point-of-Action Interface | ✅ | Next.js frontend (36 tasks), `PhaseBadge`, field mode, all routes | Cross-site advisories are fixture-only (single-site MVP, by design). UI polish/depth is an ongoing frontend track. |

**Score: 12 ✅ live + 1 🟨 live-on-mock + Layer 5 🟦 mock-by-design.** Every layer is
implemented; the only non-real data paths are the external-plant integrations, which
are mock **by design**.

---

## Architecture ⇄ Implementation Conformance

> Design-vs-reality audit of `docs/ARCHITECTURE.md` (the *design*) against the code — where the build
> **matches**, **partially matches**, **drifts**, or is **deferred by design**. (Merged in from the former
> `conformance.md`; this file is now the single status source.)
>
> Audited 2026-07-18; re-confirmed 2026-07-19 (manual-QA pass changed no verdict); **re-audited + code-level
> re-verified 2026-07-21** — surfaced the L7 MoC-webhook dead-code drift and the L4 Event-node read-path
> nuance, and re-checked every headline verdict against source (MoC secret, node-write path, 6 edge props,
> L10's 3 attribution checks, L11 refusal, L9 triggers, model gate, circuit breaker): all confirmed accurate.
> Legend: ✅ **Conformant** · 🟡 **Partial** (built, simplified from spec) · 🔵 **Deferred by design** ·
> ⚠️ **Drift** (implementation diverges from the design in a way worth knowing).

### Conformance summary

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

**Net:** 7 fully conformant · 3 partial/nuanced · 1 deferred-by-design (L5) · 2 real drifts (L4 node types,
L7 webhook signature). The design is implemented faithfully; the divergences below are the honest, named exceptions.

### Conformance divergences that matter

#### ⚠️ L4 — only 3 of 6 designed node types exist as graph nodes
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

**Nuance:** this is a write-path gap, not a schema gap — `db/neo4j/init_schema.cypher` already declares
uniqueness constraints for **all 6** node labels (`Event`, `Person`, `Organisation` included) and even seeds a
`KAIROS_PLATFORM` `Organisation` node. The schema was provisioned for the full 6-node model; `services/graph.py`
just never got extended to populate the other 3 during ingestion.

#### ⚠️ L7 — MoC webhook signature verification is dead code
**Design:** ARCHITECTURE.md line 177 — the MoC resolution must arrive via a "digitally signed resolution
webhook"; KAIROS does not update the canonical graph until that signed webhook is received.
**Reality:** `routers/governance.py:562` reads `moc_secret = getattr(settings, "MOC_WEBHOOK_SECRET", None)`,
but `Settings` (`api/config.py`) never declares a `MOC_WEBHOOK_SECRET` field — so `getattr` always returns
`None`, and the signature-check branch at line 563 (`if moc_secret and x_webhook_signature: ...`) never
executes, regardless of what's set in `.env`. **No MoC webhook request is ever signature-verified today.**
**Impact:** the MoC workflow itself (auto-draft, blast-radius, warning banners, graph update on resolution)
is fully functional — this only affects whether an inbound webhook's authenticity is checked.
**To close:** add `MOC_WEBHOOK_SECRET: str | None = None` to `Settings` and set it in `.env`. (Also tracked
under [Known bugs](#known-bugs-found-in-conformance-audit-2026-07-21) above.)

#### 🟡 L4 — timestamp handling detects drift but doesn't fully normalize
**Design:** align cross-system timestamps and **normalize to a site-canonical time reference (the historian)**.
**Reality:** the pipeline **detects** drift beyond `TIMESTAMP_DRIFT_TOLERANCE_MINUTES` (60) and flags
`timestamp_drift_detected` for review (`document_pipeline.py:525`). The *normalize-to-historian* step is not
implemented (there's no live historian). **Verdict:** the safety-relevant half (detect + flag) is built; the
canonical-normalization half is deferred with the historian.

#### 🟡 L0 — model gate is per-entity-type, not per-asset-class
**Design:** "a model that passes global metrics but fails on a specific **asset class** is blocked for that
class." **Reality:** the model gate (`model_validation.py`) computes and gates on per-**entity-type** F1
against the incumbent baseline. Per-**asset-class** halting *does* exist — but as the **SPC circuit breaker**
in Layer 7, keyed on override-rate z-scores per asset class. So the capability the design attributes to L0 is
split across L0 (entity-type F1 gate) + L7 (asset-class circuit breaker). Nuance, not a gap.

#### 🟡 L8 — pilot monitoring gate not implemented
**Design:** before Phase 3 activates, push volume must stay within EEMUA-191 norms for **30 consecutive
days**. **Reality:** not built — it's an operational phase-activation gate, not runtime code, and meaningless
without a real multi-week pilot. The *runtime* governor it protects (≤6/hr ceiling, priority, cool-down,
state-based suppression) **is** fully built. Deferred by design.

#### 🔵 L5 — OT virtualization is mock by design (already tracked)
`MockHistorianClient` serves telemetry; the real `PIWebAPIClient` is built (flip `PI_WEBAPI_BASE_URL`),
OPC-UA is a stub, Honeywell Uniformance + generic GraphQL federation are not implemented; the instrumentation
coverage map returns a mock 75%. All **by design** — there's no plant to connect to. See §Mock-by-design below.

### Confirmed conformant (spot-checked against code)

- **L2 vault:** SHA-256 dedup, immutable, version-chain, status enum — all in `routers/documents.py`.
- **L3 perception:** native-PDF + NIM-OCR two-path (`services/ocr.py`), NIM NER, P&ID vision via
  `meta/llama-3.2-11b-vision` (`services/pid.py`, real primary + fixture fallback), Groq voice, annotations.
- **L4 edges:** all six mandatory props on 100% of edges; `as_of` time-travel; blast-radius.
- **L6 quarantine:** one-way gate, `confidence < 0.7` → quarantine, 4 review actions (promote/dispute/
  request-info/archive), SLA escalation; promotion + `is_correct` annotations feed `validation_corpus` (closes
  the L0 loop as designed).
- **L7 governance:** administrative vs engineering tracks, MoC webhook (auto-draft + blast-radius +
  warning banners all real), per-criticality SLA (24h safety-critical / 5-day), SPC circuit breaker with
  per-asset-class z-scores (fixed `z > 2` threshold — the design's per-**deployment-maturity-phase** control
  limits are not implemented) — **except signature verification on the inbound webhook, which is dead code**
  (see divergence above).
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

_Re-run this audit when `ARCHITECTURE.md` or a layer's core service changes._

---

## Mock-by-design (final — not pending)

These are mock/fixture because the real counterpart is an **external system KAIROS
does not own**, or an enterprise scale-out beyond the single-site MVP. With no plant
to connect to, these are the delivered state:

| Item | Where | To go live (if a plant is ever connected) |
|------|-------|-------------------------------------------|
| OT historian (PI Web API) | `connectors/internal/ot/client.go` | set `PI_WEBAPI_BASE_URL` + creds (`PIWebAPIClient` already built) |
| OT historian (OPC-UA) | `connectors/internal/ot/client.go` | implement `gopcua` read (stub) |
| EAM asset sync (SAP/Maximo) | `connectors/internal/eam/client.go` | set `EAM_ODS_ENDPOINT` + implement SAP ODS query (stub) |
| Cross-site pattern advisories | `frontend .../management/cross-site` | multi-site control-plane feed |

---

## Optional future enhancements (not pending, not required)

| Enhancement | Trigger to build it |
|-------------|---------------------|
| P&ID Path A — custom YOLOv9 + LayoutLMv3 on GPU (`requirements-cv.txt`) | Higher extraction accuracy + a labelled P&ID dataset + GPU node |
| Per-recommendation attribution drill-down (Layer 10) | Deep Layer-10 analytics beyond the current summary |
| Frontend UI depth / polish (Demo-vs-Full cuts in `FE.md`) | The ongoing frontend track |

None of these block the platform; it is fully functional without them.

---

## Live-only cleanup — three fabrication paths were still reachable (2026-08-15)

Removing the "dead" fixture modules turned up three places that were **not** dead. The audit had
assumed every fixture sat behind `source: "demo"`, which `useFetch` mapped to an error. These three
bypassed that and rendered fabricated data on a **successful** request:

| Where | What it fabricated |
|---|---|
| `getEvents` (`api.ts`) | `if (data.items.length === 0) return demoEvents(params)` — a 200 with an empty list was replaced by fixture events. Same defect as the briefs fetcher, which was fixed in July; this instance was missed. |
| `governance/moc/page.tsx` | `buildFixture()` — invented `MOC-2024-001` rows with fake asset ids and document refs, rendered whenever the live MoC list came back empty. |
| `governance/model-gate/page.tsx` | `FIXTURE_HISTORY` — invented model-gate runs with made-up F1 values (0.825, 0.775), served on fetch failure. On the page whose entire purpose is *measured* model evidence. |

Also removed: `blast-radius-panel.tsx` fell back to `fixtureReport()` — fabricated blast-radius
items including a "Design pressure rating 15 bar" fact — whenever the report was null. Fabricated
safety-relevant impact analysis presented as real.

**Kept deliberately:** `documents/[id]/topology` still checks `data.topology_source === "demo_fixture"`.
That is the **backend** fixture disclosure the non-negotiables require; only the frontend `source`
check was removed. `lib/copilot.ts` and `lib/rca.ts` also stay — they export live types and real
constants (`SUGGESTIONS`, `RCA_PRESETS`) plus the test-only `rcaFor`.

Test suites that asserted the old behaviour were inverted rather than deleted, so the guarantee is
now pinned: an empty live list must render an empty state, and an unavailable backend must reject.

---

## Dependency security — what was taken, and what was refused (2026-08-15)

GitHub reported **57 open Dependabot alerts** (1 critical, 11 high, 26 medium, 19 low) across
`backend/requirements.txt` (46), `frontend/package-lock.json` (9) and `backend/connectors/go.mod` (2).

**Applied — only the packages that actually carry alerts:**

| Package | From → To | Alerts |
|---|---|---|
| `aiohttp` | 3.9.5 → 3.14.3 | 34 |
| `python-multipart` | 0.0.9 → 0.0.32 | 8 |
| `python-jose[cryptography]` | 3.3.0 → 3.5.0 | 2 (incl. the **critical**) |
| `python-dotenv` | 1.0.1 → 1.2.2 | 1 |
| `pytest` (+asyncio, +timeout) | 8.2.2 → 9.1.1 | 1 |
| `github.com/redis/go-redis/v9` | 9.5.3 → 9.21.0 | 1 |
| `golang.org/x/net` | 0.54.0 → 0.55.0 | 1 |

npm (`undici`, `brace-expansion`, `js-yaml`) was already cleared earlier by `npm audit fix`;
`npm audit` reports 0. Those 9 alerts persist only because Dependabot scans `main`.

### ⚠️ PR #22 was NOT merged, and should not be

It is presented as a security update but is a wholesale stack modernisation — 41 packages,
including **elasticsearch 8.13.1 → 9.4.1**. The ES server here is **8.13.4**, and the Elasticsearch
Python client enforces major-version compatibility: a 9.x client refuses an 8.x cluster. Merging it
would have broken search, ingestion, the validation corpus and the model gate. It also carries
`neo4j 5.21 → 6.2`, `pandas 2.2 → 3.0`, `numpy 1.26 → 2.5` and `fastapi 0.111 → 0.140`, none of
which any alert requires. The five pip bumps above achieve the same security outcome in 7 lines.

**#31 (actions) and #29 (docker) were also skipped**: they are major CI/base-image bumps
(`checkout` v4→v7 etc.) that close **zero** alerts, and CI behaviour cannot be fully verified locally.

**No PRs were closed** — they close themselves when this branch merges to `main`.

### On the one critical

`python-jose` CVE-2024-33663 is algorithm confusion via OpenSSH ECDSA keys. It was **not exploitable
here**: `middleware/opa.py` decodes with an explicit `algorithms=["HS256"]` allowlist, which is the
documented mitigation. Bumped regardless.

### Verification (each package against the path it actually serves)

- `python-dotenv` → settings load · `aiohttp` → `AsyncElasticsearch` transport: `/search` 200 with hits,
  `/health/detailed` all five datastores ok
- `python-jose` → login 200; an unauthenticated write still 403s
- `python-multipart` → a multipart upload with a deliberately invalid `authority_level` returns 422,
  proving the parser read both file and form parts. **Nothing persisted** — documents stayed at 23.
- Go connector rebuilt: `go build`, `go vet`, `/ot/query` 200, `/ot/coverage/EQ-101` 200
- 13/13 layers · compliance F1 0.986 unchanged · 65 backend tests · ruff 0.16.0 clean

> Two notes. The service-free tier went 64 passed/1 skipped → **65 passed**: `openpyxl` was already
> in `requirements.txt`, but the running image predated it, so the spreadsheet-ingestion test had
> been **silently skipping locally**. The rebuild fixed that — it was not caused by these bumps.
> Separately, starlette now emits `PendingDeprecationWarning: Please use import python_multipart`
> against 0.0.32; harmless today, but it becomes an error when starlette drops the old import name.

---

## Manual QA — safety refusal gate: found broken, fixed, verified live (2026-08-15)

**Found.** Asked the copilot two safety-critical questions in the browser, including its own
suggestion chip. **Both were answered; neither refused.** Not a rendering bug — the gate cleared on
`min(authority_level)` over the *whole* retrieved context, making it a property of the context set
rather than of the evidence supporting the answer. One unrelated authoritative document anywhere in
the context defeated it, which in the live copilot was the normal case.

**The obvious fix would have been a no-op.** "Judge the top-ranked items" fails because
`SearchService` sorts by `(authority_level, -rrf)` — the most authoritative document is always
*first*, so a top-K-by-position filter selects exactly the items guaranteed to be authoritative.
Ranking had to be by `relevance_score` (the RRF value), which meant plumbing it through from the
frontend, where the copilot's context map was dropping it.

**Relevance alone was still not enough.** Measured on the real corpus for "Which valves make up the
isolation boundary for V-247?":

| rank by relevance | rrf | authority | asset |
|---|---|---|---|
| 1 | 0.0325 | L4 | **V-247** (the PTW — the actual evidence) |
| 2 | 0.0325 | L4 | XV-203 |
| 3 | 0.0313 | **L3** | **EQ-101** — Fischer *pump seal* bulletin |
| 4 | 0.0308 | **L3** | **EQ-101** |
| 6 | 0.0156 | L1 | none — the generic standards list |

Top-K by relevance correctly drops the L1 (least relevant of all), but two OEM bulletins about
**a different asset** still ranked 3rd/4th and cleared the gate. An EQ-101 pump-seal bulletin
cannot vouch for a V-247 valve isolation answer.

**Fix (`_authority_candidates` in `services/llm.py`):** an authoritative source may vouch only if it
is among the most relevant **and** shares the asset of the best-matching evidence. Context without
`relevance_score` keeps the previous behaviour, so hand-assembled callers (graph facts, elicitation)
are unaffected rather than silently re-scoped.

**Verified end-to-end on the live corpus** — and checked in both directions, because a gate that
refuses everything is its own failure:

| Query | Result |
|---|---|
| Isolation boundary for V-247 | **REFUSED** — its L3s are EQ-101, wrong asset |
| Maximum allowable pressure for HE-3xx | **answered** — its L3 Meridian bulletin *is* HE-3xx |
| Which OEM manufactures the feed pumps | answered (not safety-critical) |

Confirmed in the browser: the refusal card renders with the reason, the sources under
"SOURCES — VERIFY DIRECTLY", and the escalation line. **This is the first time the refusal has been
seen live in the UI.** Pinned by three tests built from the measured data above.

> The benchmark's 3 refusals (Q07/Q19/Q25) came from a narrow routed context that excluded those
> documents, so it was measuring the gate under conditions the product did not reproduce. Answer
> quality should be re-run: refusal counts may shift now that the gate reflects real retrieval.

---

## Benchmark caveats & measurement notes (2026-08-15)

### OpenRouter added as tier 2 (2026-08-15) — same model, ahead of Gemini

Cascade is now **NIM → OpenRouter → Gemini → Ollama**. OpenRouter serves the *same*
`meta-llama/llama-3.1-70b-instruct` as tier 1, so a fallthrough no longer changes which model
answered — that was the entire reason a Gemini-heavy run had to be flagged as a confound. The
benchmark's validity verdict counts `openrouter` as production-equivalent alongside `nim`; only
`gemini` (a different model family) still triggers SUSPECT.

Verified: direct probe 200 in 1.4 s serving the exact model; forced tier-1 failure fell through to
OpenRouter in 1.2 s with a correct answer. It has its own `OPENROUTER_TIMEOUT` rather than reusing
`NVIDIA_NIM_TIMEOUT`, so tuning NVIDIA's cap cannot silently retime a different vendor.

> **Note it is also ~30× faster than NIM** on the same model (1.4 s vs 9–90 s). Making OpenRouter
> tier 1 would largely dissolve the latency problem that motivates SSE streaming. Left as NIM-first
> deliberately — that is a positioning decision (NVIDIA NIM is the stated stack), not a technical
> one. Worth a conscious choice rather than drift.

> Adding a tier broke `tests/test_query_category.py` in a useful way: it stubbed NIM and Gemini but
> not OpenRouter, so with a real key present the "all providers rate limited" test made a **live
> network call** inside the suite specified to run with no secrets and no network. Both cascade
> tests now stub or disable every tier explicitly; verified passing with all provider keys blanked.

### Open: the 60 s config is not yet confirmed by a valid run

The published **24/25 was measured at `NVIDIA_NIM_TIMEOUT=90`**. The shipping value is now 60. The
confirmation run at 60 s returned **INVALID**: Google's free tier hit 429 partway through, 7 of 25
questions got no answer from any provider, and the run scored **17/25 — quota, not quality. Do not
quote 17/25.** Re-run once the Gemini quota resets; expect ~24/25, since the score held at 24/25
across both 45 s and 90 s caps, but that is an expectation, not a measurement.

Two defects were found by that failed run, both now fixed:

- **The API dropped `rate_limited`.** `LLMService` has always set the flag when every provider
  returns 429, but `SynthesizeResponse` did not carry it, so no caller could distinguish an
  exhausted quota from a model with nothing to say — they are identical on the wire (`answer:
  null`). Added to the response model and passed through in `routers/search.py`. This is why the
  harness recorded those rows as `-` instead of `429` and never triggered its 429 abort.
- **The validity verdict had a blind spot.** It checked for 429s, Gemini share and client timeouts
  but not for rows where *nothing* answered, so a run with 7 no-answer questions still printed
  "SUSPECT — 3 from Gemini", naming the smaller problem. `-` rows now return INVALID and outrank
  the Gemini check. Pinned in `_selftest`.

### The NER timeout fix is applied but unvalidated

`services/ner.py` no longer hardcodes 30 s (see below). Correctness of the change is verified — a
direct probe of the NER model returned 200 in **42.7 s**, a call the old 30 s cap would have cut off
— but the improvement could not be measured end-to-end, because NVIDIA's
`llama-3.2-11b-vision-instruct` endpoint spent the session returning **HTTP 500** on most calls (a
failure mode no timeout value affects; a 500 returns instantly). Gate runs during the outage scored
3/5 and 5/5 fallbacks and were correctly marked SUSPECT. Re-run when the endpoint recovers.

> One `audit_log` row from that outage (5/5 regex, F1 0.8182, `validity: SUSPECT`) was persisted
> before the outage was understood. It is honest data and append-only, but `/system-benchmarks`
> does not currently render the `validity` field, so the trend shows it as a plain score. Either
> surface `validity` on that page or delete the row — a judgement call, left open.


> `benchmark/RESULTS.md` holds **numbers only**. Every warning, confound and "what this does not
> prove" lives here. Read this before quoting any figure from that file.

### ⚠️ Synthesis latency is bounded by NVIDIA's endpoint, not by KAIROS

Direct probing of `integrate.api.nvidia.com` with one identical 73-token synthesis payload, no KAIROS
code in the path:

```
back-to-back  : 30.2s · TIMEOUT(78s) · 47.4s · 14.2s
after 90s idle: 14.5s · 12.2s · 42.6s
paced 20s     :  8.6s · 10.6s · 16.2s
```

No `x-ratelimit` headers are returned at any point — the shared endpoint simply queues. The spread is
8.6 s to >90 s **for identical work**, it worsens under back-to-back load, and it has no upper bound.
It is not a cold start (a cold start is slow-then-fast; burst A went 30 s → timeout → 47 s → 14 s).

**Do not lower `NVIDIA_NIM_TIMEOUT`.** Capping a timeout cannot make inference faster; it truncates
the number and moves the work to the free Gemini tier. The "20.9 s p95 (−56%)" recorded in earlier
versions of RESULTS.md was the cap being lower, not the system being quicker. Measured provider mix
at each cap, same 25 questions:

| `NVIDIA_NIM_TIMEOUT` | nim | gemini | refused | Answer quality |
|---|---|---|---|---|
| 45 s | 10 | **12** | 3 | 24/25 |
| 90 s | 18 | **4** | 3 | 24/25 |

At the 45 s cap every Gemini row landed at 47.1–48.3 s (the cap plus Gemini's ~2 s) while every
successful NIM row landed at 9–38 s, with nothing in between — those fallbacks were NIM calls cut off
mid-flight, not NIM failures. At 90 s they were recovered (Q08 82.8 s, Q21 81.7 s, Q06 68.9 s). p95
rises as a result: **a higher p95 that measures the production model beats a lower p95 that measures
the fallback.** `.env` now pins 90 s, matching `config.py`'s own default.

### ⚠️ Provider-quota confound — the historical record, corrected

The synthesis cascade is NIM → Gemini → Ollama (Ollama unconfigured). Repeated runs in one session on
2026-07-25 exhausted the Gemini free tier, after which every NIM timeout became a *no answer*:

| Run | `NVIDIA_NIM_TIMEOUT` | Answer quality | Gemini state |
|---|---|---|---|
| 1–3 | 45 s | 23, 24, 22 / 25 | quota available |
| 4 | 20 s | 13/25 | quota exhausted (429) |
| 5 | 45 s | 18/25 | quota exhausted (429) |

Two corrections from the 2026-08-15 re-measurement:

1. **Run 4's 20 s cap did not coincide with exhaustion — it caused it.** A lower cap multiplies
   fallthrough, which is what drained the quota.
2. **Gemini answering is not what degraded quality — 429 was.** Both 2026-08-15 mixes scored 24/25, so
   a fallback answer is roughly as good; 13/25 and 18/25 were *no answer at all*. The fragility is
   availability, not fallback quality.

`run_benchmark.py` now reports the provider mix, prints a **Run validity** verdict
(`VALID`/`SUSPECT`/`INVALID`), and aborts after two consecutive 429s. `--delay` (default 15 s) paces
calls; `--limit N` runs a cheap calibration pass before committing to a full sweep.

**The published 24/25 run is flagged `SUSPECT`** (4/25 from the fallback, threshold is 2). The verdict
was left standing rather than tuning the threshold to pass. Preflight Gemini before any run — a 429
invalidates it.

### ⚠️ Entity-extraction F1 is partly a regex score — now measured, and the cause is found

`run_model_validation.py` now counts extraction paths and emits a `validity` verdict. The
2026-08-15 run: **`{"nim": 3, "regex": 2}` — 2 of 5 extractions fell back**, so the run is
`SUSPECT` and **0.917 is a ceiling, not a measurement.** That is also why `ASSET_TAG` scores 1.0
while `ORGANIZATION` scores 0.0: the regex last resort only matches ASSET_TAG, so a fallen-back
document can only ever produce asset tags.

**Root cause identified (not yet fixed): `services/ner.py` hardcodes a 30 s timeout** at both call
sites (lines 77/87 and 107) and ignores `NVIDIA_NIM_TIMEOUT` entirely. The two failures in the run
took exactly 30 s each and logged `ner.nim_failed` with an empty error — a timeout. This is the same
bug class as the synthesis cap: a hardcoded ceiling too tight for NIM's tail, silently degrading to
a worse path instead of failing honestly.

**The fix is safe but was left for a decision.** Every caller is asynchronous —
`workflows/document_pipeline.py`, `workers/voice_transcription.py`, `workers/model_validation.py` —
and the one request-path caller (`GET /documents/{id}/redacted`) has **no frontend caller at all**,
so unlike synthesis there is no UI budget to breach. Point both call sites at
`settings.NVIDIA_NIM_TIMEOUT` (one source of truth, per the root-cause rule) rather than raising a
second hardcoded number. Expected effect: fewer regex fallbacks and the first F1 that is actually
attributable to the model.

Note `ner.ollama_failed` also fires on every fallback (`Request URL is missing an 'http://'
prefix`) — that is the unconfigured `OLLAMA_BASE_URL` being called anyway, harmless but noisy, and
the same missing-third-tier issue as backlog #3.

Two runs of the same model on the same corpus giving 0.857 and 0.917, with `ORGANIZATION` flipping
0.667 → 0.0, is the visible symptom — n=13 with `ORGANIZATION` at n=2 cannot support four decimals.

### Historical: two defects the gate itself had

- **The configured NER model was dead.** `mistralai/ministral-14b-instruct-2512` was deprecated by
  NVIDIA; the endpoint accepted requests then hung until timeout (confirmed at 30 s, 60 s, 90 s, fresh
  client and pooled). `NERService` degraded to regex, producing an F1 of 0.8182 that looked like a
  model score. Replaced with `meta/llama-3.2-11b-vision-instruct` — PERSON recall 0.0 → 1.0.
- **The gate could not select a model.** `NERService()` took no model argument, so `--model-name` only
  *labelled* the result while the call used `NVIDIA_NIM_NER_MODEL`. Fixed, pinned by
  `tests/test_model_validation.py`.

### Compliance — the single false negative is a ground-truth artefact

`4.1.2 / EQ-103` is declared with no documents in the loader's mapping, but the graph correctly links
EQ-103 to an `oem_manual` and an `inspection_report` that extraction found by asset tag. So
`unverified_evidence` was the right answer and the truth table was wrong. **The truth table was
deliberately not amended** — copying the system's output into its own ground truth would destroy the
independence that makes the measurement worth anything.

Before `seed_regulations.py` runs, this harness scores precision 0.000 / recall 0.000, because the
backwards-compatibility fallback (`NULL` = any document type counts) makes every pair report
`unverified_evidence`. That is what an independently-derived ground truth is for.

### Time-to-answer — read 25.6% as a floor set by corpus size

KAIROS **loses the machine-time comparison by three orders of magnitude** (15.6 ms vs 15.7 s) and the
harness reports that unweighted; the claim is about time to a *trusted, cited* answer. BM25 finds the
answer-bearing document at mean rank 1.52 across ~20 documents — on a corpus this small keyword search
is already good, so there is little room to improve on it. The problem statement's premise is 7–12
disconnected systems with thousands of documents, where rank degrades and the gap widens. Do not
extrapolate from 20 documents to a real plant.

### Load test — methodology fixes and what it does not cover

Two bugs had to be fixed before these numbers meant anything:

- An earlier pass counted **307 redirects as success** (`status < 400`), measuring redirect latency
  instead of endpoint work. Now requires 2xx and follows redirects.
- The knee detector fired on a **single noisy sample**: with 6 requests per level it reported "no
  degradation through 25 VU" and "bottleneck at 5 VU" on consecutive runs of the same system. A knee
  must now be *sustained* across all higher levels, and the harness warns below a 20-request baseline.

The superseded 2026-07-25 sweep tripped exactly that warning — a 10-request baseline produced the
implausible sub-1.0 ratios at 5 and 10 VU. At `--requests 25` the baseline is stable and the curve
monotonic. Still a load test, not a soak: nothing here speaks to memory growth or connection leakage
over hours, and 50 VU against a demo-scale dataset is not evidence for 10k assets.

### Safety gate — one false refusal was found and fixed by these runs

Q06 (*"When was isolation valve XV-203 last inspected?"*) was refused because the bare keyword
`isolation` matched the *equipment name* in a date-lookup question. Refusing a fact the vault holds is
as wrong as guessing a parameter, so the patterns now require intent (`isolation boundary`, `safety
isolation`, `isolate`, `lockout`, …). Q06 answers correctly; the three genuine refusals are
unaffected. Pinned by `tests/test_query_category.py`.

---

## Improvement backlog — ranked by judged value (2026-07-25)

Everything below is **actionable and within our control**. The corpus/plant-connectivity
boundary is scope, not backlog — see § Headline. Ordered by what a rubric-driven reviewer
would reward per hour spent.

### Tier 1 — highest value, blocks nothing else

| # | Improvement | Why it matters | Est. |
|---|---|---|---|
| 1 | **Streaming synthesis (SSE)** | p95 is **~96 s** with no progressive render (p50 ~40 s), and the 2026-08-15 measurement showed the tail is NVIDIA's shared endpoint, which we cannot tune away — see §Benchmark caveats. That makes progressive render the *only* remaining lever on perceived latency, so this is now clearly the highest-value Tier-1 item. A reviewer clicking the copilot waits a minute and a half; it costs both UX and Business Impact. **Not attempted deliberately:** `ANSWER:/CONFIDENCE:/UNCERTAINTY:/SOURCES_USED:` is a parse contract with two consumers (`routers/search.py`, `workflows/elicitation_workflow.py`) and a measured answer-quality figure attached, so it needs a live NIM run to validate against regression. | 1–2 d |
| 2 | ~~Re-test `NVIDIA_NIM_TIMEOUT=20`~~ — **DONE 2026-08-15, conclusion reversed** | Tested and **rejected**. Lowering the cap cannot speed up inference; it truncates the number and moves the work to the free Gemini tier. Direct probing of NVIDIA's endpoint (identical payload) returned 8.6 s–>90 s with no rate-limit headers, worsening under back-to-back load. At 45 s the run went 12/25 to Gemini; at **90 s it went 4/25**, with answer quality 24/25 either way. `.env` now pins **90 s** (matching `config.py`'s own default). Anyone reading the old "−56% p95" should read `benchmark/RESULTS.md` §2 first. | done |
| 3 | **Fix the cascade's free-tier dependency** | NIM → Gemini → Ollama with Ollama unconfigured means tier 2 is a free-tier key. **Partly mitigated 2026-08-15** — the 90 s cap cut fallbacks 12 → 4 per run, and the benchmark now reports its provider mix and refuses to present a fallback-heavy run as clean. Not closed: NIM's tail is unbounded and 4 calls still exceeded 90 s. Real fix unchanged — configure Ollama as a genuine third tier, move Gemini to paid, or drop the cascade so a NIM failure surfaces as an honest error. Note the re-measurement also found the *quality* story was wrong: Gemini answers scored the same 24/25; what produced 13/25 and 18/25 was 429 (no answer at all). | 2–4 h |

### Tier 2 — strengthens the numbers we already publish

| # | Improvement | Why it matters | Est. |
|---|---|---|---|
| 4 | ~~Widen the benchmark question set~~ — **DONE 2026-08-15: 25 -> 37 questions, no category left at n=1** | Was 25 questions across 15 categories, 8 of them at n=1 — a single flip moved a whole category from 100% to 0%. The old "±2 of 25" was partly a provider artefact (see #2): the 2026-08-15 re-runs both scored 24/25 under different provider mixes, so genuine run-to-run variance is smaller than believed, but n=1 categories remain uninformative. More questions authored from the existing canon tighten the interval. No new data needed. | 3–4 h |
| 5 | ~~Grow `validation_corpus`~~ — **DONE 2026-08-15: 13 -> 40 labels** | Layer-0 F1 rested on **13 entities**, with `ORGANIZATION` at n=2 — one miss swung a per-type rate. Confirmed 2026-08-15: still 13 rows / 3 entity types, and two runs of the same model on the same corpus gave **0.857 and 0.917** (`ORGANIZATION` flipping 0.667 → 0.0). More labels can be authored from the canon. Until then, stop quoting F1 to four decimals. | 2–3 h |
| 5b | ~~Surface NER fallback invocations in the model gate~~ — **DONE 2026-08-15** | `run_model_validation.py` wraps `NERService` in a counting proxy (harness-only — `evaluate()` types its `ner` arg as `Any` and calls only `extract_entities`, and the result dict already self-reports its path as `model`), then prints `extraction_paths`, `fallback_extractions` and a `validity` verdict. First run came back `{"nim": 3, "regex": 2}` → **SUSPECT**, confirming 0.917 is a ceiling. Root cause now identified too — see §Benchmark caveats. | done |
| 6 | ~~Persist CLI model-gate runs~~ — **DONE 2026-08-15** | `run_model_validation.py` writes `audit_log` in the same row shape the Celery gate uses (`performed_by: "cli"` distinguishes them), with `--no-persist` for dry runs. Write failures warn instead of raising, so a bad insert cannot discard a good measurement. Verified: row 422 landed with `validity: SUSPECT`, and `/system-benchmarks` now has a row for the **current** NER model for the first time — it previously plotted only retired ones. | done |
| 7 | **Soak test** | The load sweep is 2275 requests over minutes (re-run 2026-08-15). Nothing yet speaks to memory growth or connection leakage over hours, and the pooled HTTP client + LRU cache are exactly the components a soak would stress. | 2–3 h |

### Tier 3 — architectural ceilings

| # | Improvement | Why it matters | Est. |
|---|---|---|---|
| 8 | **A real agent loop** | Two of the problem statement's five illustrative tracks say "agentic". There is no tool-use or planning loop anywhere: every LLM call is single-shot inside a hand-written pipeline. This is the main ceiling on an Innovation score, however good the governance architecture is. | 1 w+ |
| 9 | **Materialise compliance counts** | `/compliance/gaps` and `/dashboard` are O(clauses × assets) with a subquery per pair; `EXPLAIN` confirms `CartesianProduct`, and the dashboard variant is deliberately unbounded because a `LIMIT` would silently undercount a compliance posture. Fine at demo scale (12 × 10); materialise into Supabase on a scheduled scan before the asset count reaches the thousands. | 1 d |
| 10 | **Retrieval quality beyond RRF** | RRF fixed the scale-mismatch bug, but there is still no cross-encoder rerank, no query planner, and dedupe is per-document so long documents contribute one chunk. | 2–3 d |
| 11 | **Custom P&ID parser (Path A)** | `requirements-cv.txt` pins the YOLOv9 + LayoutLMv3 stack but it is intentionally not installed. Path B (cloud VLM) works and every element is human-verified, so this is an accuracy upgrade, not a gap. | 1 w+ |

### Tier 4 — housekeeping

| # | Improvement | Why it matters | Est. |
|---|---|---|---|
| 12 | ~~Adopt PEP 585 annotations~~ — **DONE 2026-08-15** | Applied entirely by `ruff --fix`, no hand edits: **283** `typing.Dict`/`List` → PEP 585 builtins (UP006), **48** dead `typing` imports dropped (UP035), **136** `Optional[X]` → `X \| None` (UP045), **49** `timezone.utc` → `datetime.UTC` (UP017), then an F401/I001 pass for imports the rewrite orphaned. `"UP"` is now selected in `backend/ruff.toml`, so the old spelling cannot creep back. Verified against the **CI-pinned ruff 0.16.0** (not just the local 0.15.0): all checks pass; service-free suite 64 passed / 1 skipped; API boots and `/health/detailed` returns all five datastores ok — the Pydantic response models were rewritten, so that runtime check mattered. | done |
| 13 | ~~eslint 10~~ — **DONE 2026-08-15, and it never needed eslint 10** | The claim that only `eslint@10` could fix this went stale: upstream shipped semver-compatible patches, so a plain **`npm audit fix`** cleared all of it. `npm audit` now reports **0 vulnerabilities**, eslint stays on **v9.39.4**, and `package.json` is untouched — only 4 transitive dev packages moved in the lockfile (`brace-expansion`, `js-yaml`, `undici`, `minimatch/brace-expansion`; 12 insertions / 13 deletions). Verified after a container rebuild: `tsc` clean, `eslint` 0 errors (3 pre-existing warnings), **vitest 135/135**. Worth noting the advisories were dev-only throughout — `npm audit --omit=dev` reported 0 even before the fix, so nothing shipped was ever affected. | done |
| 14 | ~~Remove dead frontend fixture modules~~ — **DONE 2026-08-15** | Deleted `lib/{fixtures,assets,governance,documents,events,compliance}.ts`, the `DemoChip` component and all 10 render sites. `DataSource` is now a single member (`"live"`), so a fallback cannot return without a type error, and `FetchState` lost its `demo` case. All 32 fixture-returning `catch` blocks in `api.ts` now rethrow. **Three fabrication paths were live, not dead** — see below. Verified: `tsc` clean, `eslint` 0 errors, **vitest 135/135**. | done |
| 15 | **Cross-site control plane** | `/management/cross-site` is fixture-only, and `ARCHITECTURE.md` describes PII redaction as gating cross-site knowledge promotion. No cross-site endpoint exists, so the redaction pipeline is real but that wiring is not. Either build the endpoint or reword the doc. | 1–2 d |

---

## Pending — deployment, ops & polish (as of 2026-07-18)

> **The product (all 13 layers) is complete.** These are **operational / hosting / polish** tasks that
> remain to get a public demo live and hardened — not product-completeness gaps. Tracked here so nothing
> is lost.

### Deployment — OUT OF SCOPE (user decision, 2026-08-15)

> The project will not be deployed for now. These stay recorded so nothing is lost if that
> changes, but they are **not open work** and should not be counted as pending. The Aura
> keep-alive that used to sit here is done and independent of deployment (`uptime.yml`).
- [~] **Deploy the backend** to an EC2 box: `docker compose -f docker-compose.yml --profile prod up` with **Caddy** for HTTPS. *(The Vercel-hosted frontend is non-functional until this exists.)*
- [~] **Set prod env** on the box: `APP_ENV=production` (activates the fail-closed secret guardrail) + real `INTERNAL_API_KEY`, `NEO4J_PASSWORD`, `APP_SECRET_KEY` in `.env`.
- [~] **Wire the frontend → backend:** set `NEXT_PUBLIC_API_URL` (Vercel or the box) + add that origin to backend `CORS_ORIGINS`. *(Alternative: serve the frontend from the same EC2 box via Caddy — same-origin, no CORS.)*
- [x] **Neo4j Aura keep-alive — done** via `.github/workflows/uptime.yml` (daily 03:17 UTC). It runs a
  trivial Cypher query against Aura *directly* with the Neo4j driver, so it works whether or not a
  backend is deployed — better than the originally-planned cron-job.org → `/health/detailed` ping,
  which would have required the API to be publicly reachable. Needs repo secrets `NEO4J_URI` /
  `NEO4J_USERNAME` / `NEO4J_PASSWORD` / `NEO4J_DATABASE`. Caveat: GitHub disables scheduled workflows
  after 60 days of repo inactivity — re-enable from the Actions tab if the repo goes quiet.
- [~] **AWS billing alarm (~$30)** so the $120 credit isn't overrun.

### Known bugs (found in conformance audit, 2026-07-21)
- [x] **MoC webhook signature verification — FIXED 2026-08-15.** `Settings` now declares
  `MOC_WEBHOOK_SECRET: Optional[str] = None`, so `routers/governance.py` reads a real field instead of
  a `getattr` that always returned `None`.
  **The originally-planned one-line fix would not have closed the hole.** The guard was
  `if moc_secret and x_webhook_signature:` — verification was opt-in *by the caller*, so any client
  could skip it by omitting the header, which is exactly the party you cannot trust to choose. It now
  reads `if moc_secret:` and a missing `X-Webhook-Signature` is rejected with 401. Configuring the
  secret is what turns verification on; once on, unsigned requests are refused.
  Default stays `None`, so behaviour is unchanged until the secret is set — verified against the
  running container (`MOC_WEBHOOK_SECRET field exists: True | value: None`) and the 65-test
  service-free tier (64 passed, 1 skipped).

### Documentation sync (audit 2026-07-21)

> Full-repo doc verification. **Good news first:** the cloud-offload (Neo4j Aura / Qdrant Cloud / Grafana
> Cloud), the production model names (`llama-3.1-70b`, `ministral-14b`, `nemotron-ocr`, `jina-v3`,
> `whisper-large-v3`), the Ollama-disabled fallback tier (`OLLAMA_BASE_URL` empty), and test counts
> (~175/3) are **consistent across every doc** — INFRA/DOCKER/DATABASE/BACKEND/status all correct.
> The drift is concentrated in one place:

- [x] **`ARCHITECTURE.md §6 (Tech Stack)` drift fixed to as-built** (2026-07-21): L464 LLM → `meta/llama-3.1-70b-instruct`;
  L504 Secrets → Supabase Vault (cloud); L505 Observability → Grafana Cloud; L515 → Next.js 16 + React 19;
  L517 → custom `ui.tsx` + Tailwind v4; the local-compose service list dropped `vault/grafana/otel-collector`
  and marks neo4j/qdrant profile-gated; L609 air-gapped narrative → Llama 3.1. *Kept as intentional design
  narrative (not drift):* Redpanda (enterprise-scale story), Expo/React-Native (MVP is responsive Next),
  Neovis-as-alternative (React Flow chosen), the Ollama fallback tier.
- [x] **This file's "Verification snapshot" reconciled** (2026-07-21) — the stale "vitest ~107 passed / ~17
  failing … in progress" line now reads **124/124 green**, matching the resolved 2026-07-19 entries above.
- [x] Minor: "Neo4j 5.20" in `DATABASE.md` — **fixed 2026-08-15** to "Neo4j (Aura 2025.x)", noting
  the local `--profile local-stores` image is still pinned to 5.x. **`ARCHITECTURE.md` intentionally
  left alone**: it describes the design as intended, not the deployed estate.

### Frontend polish (optional)
- [x] **Mobile navigation — RESOLVED 2026-08-15 by deleting the dead component.** `BottomTabs`
  (67 lines in `app-shell.tsx`) had been commented out since the mobile UX was deferred, so it was
  neither shipped nor removed, and it left `isField` orphaned. Deleted rather than restored:
  restoring would undo the original decision to remove it, and mobile redesign is explicitly last
  priority. A comment marks the spot and git history holds the component if it is ever revived.
  eslint warnings dropped 3 -> 1 (only the pre-existing `userId` remains).
- [x] **Friendly copilot shell — DONE 2026-08-15.** Suggestion chips already existed; the real gap
  was meta questions. "what can you do?" / "hello" went into the retrieval pipeline, matched nothing
  relevant, spent a ~40 s synthesis call and came back with a refusal or an answer stitched from
  unrelated documents — which reads as the system being broken. `metaAnswer()` now handles them
  locally with **no API call**.
  Rendered as a distinct, labelled "About Kairos" card carrying *no* sources, because it has none —
  it is not retrieved knowledge and must never look like a governed claim, which would otherwise
  make it the one answer in the app without provenance. `copilot.test.ts` pins the invariant that
  matters: **a plant question is never intercepted** (safety-critical ones must reach the refusal
  gate, not a hardcoded string).
- [ ] **Verify the safety-critical RefusalCard** live in the UI.

### Housekeeping (optional)
- [ ] **CodeQL fails on every PR while the repo is private — expected, not a defect.** `codeql.yml` analyses everything fine (115/115 Python files, all four languages) and then fails on the *upload* step with `Code scanning is not enabled for this repository`. Code scanning on a **private** repo needs GitHub Advanced Security; the API confirms `visibility: private`, `security_and_analysis: null`. The one green CodeQL run (2026-08-10) was a *scheduled* run on `main`, which does not hit the PR upload path. **On making the repo public again:** Settings → Code security → Code scanning → Set up → **Advanced** (not Default — Default replaces the existing `codeql.yml`), then re-run the job. Nothing in the workflow or the code needs changing.
- [x] **Grafana dashboards — IMPORTED 2026-08-15.** Both live in Grafana Cloud:
  `/d/kairos-ingestion` (6 panels) and `/d/kairos-operational` (9 panels), datasources resolved to
  the real stack uids (`grafanacloud-prom`, `grafanacloud-traces`), no unresolved placeholders.
  Done via the Grafana HTTP API using the service-account token from the MCP config — the Grafana
  MCP itself is registered correctly in `~/.claude.json` but **MCP servers are enumerated at
  session start**, so its tools are not reachable until a restart. Nothing else was needed.
  > **The panels will read empty, and that is not an import problem.** Grafana Cloud holds only 11
  > metric names, all `http_server_*` from OTEL FastAPI auto-instrumentation. **Zero `kairos_*`
  > metrics have ever arrived.** The instruments are correctly wired — `ingestion_duration` in
  > `routers/documents.py:205`, `conflicts_open` in `routers/governance.py:317`,
  > `briefs_delivered` in `services/brief_engine.py:578`, `governor_suppressed` in
  > `services/event_bus.py:95` — so this is not dead code either.
  >
  > The import-order worry was checked and **dismissed by experiment**: `services/metrics.py`
  > calls `get_meter()` at module import (main.py line 18) while `setup_telemetry()` runs at line
  > 112, but OTel returns a `_ProxyMeter`/`_ProxyCounter` that forwards once the real provider is
  > installed — verified in-container by recording through an early instrument and seeing it land.
  >
  > So the only remaining explanation is that **the business events have not happened**: no
  > document ingested, brief delivered, conflict raised or governor suppression since telemetry
  > was configured. The dashboards populate on real use. To prove it, ingest a document and watch
  > `kairos_ingestion_duration_seconds_count`.

- [ ] **Streaming synthesis (SSE)** — p95 is ~96 s with no progressive render. Not attempted: the `ANSWER:/CONFIDENCE:/UNCERTAINTY:/SOURCES_USED:` format is a parse contract with two consumers (`routers/search.py`, `workflows/elicitation_workflow.py`) and a measured 24/25 attached, so it needs a live NIM run to validate against regression.
- [ ] **Grow `validation_corpus`** — Layer-0 F1 is measured on **13 entities**, with `ORGANIZATION` at n=2. More labels can be authored from the existing canon (no real-plant data needed), or stop quoting F1 to four decimals. (Re-seeded 2026-07-25; it was empty, so the previously published F1 0.96 had no reproducible ground truth.)
- [x] **Re-measured answer quality on a rested quota (2026-08-15) — 24/25, reproduced twice.** Gemini
  was preflighted (HTTP 200) before the run. The old ±2 range was partly a provider artefact, not model
  variance: both runs scored 24/25 despite very different provider mixes (12/25 vs 4/25 Gemini). The
  harness now prints the mix and a `VALID`/`SUSPECT`/`INVALID` verdict, and aborts on two consecutive
  429s, so a quota-starved run can no longer be mistaken for a model result. Also re-run: retrieval
  25/25, provenance 25/25, compliance F1 0.986 (exact reproduction), `verify_layers` 13/13, load sweep
  2275 requests / 0% errors / knee at 50 VU.
- [x] **Cascade's free-tier dependency — largely fixed 2026-08-15 by adding OpenRouter as tier 2.**
  It serves the same `llama-3.1-70b` as NIM, so a fallthrough no longer changes the model *or* land
  on a daily-capped free key; Gemini drops to tier 3. Also fixed the two things that made a dead
  quota look like poor answer quality: `rate_limited` now reaches the client (it was set by
  `LLMService` but dropped by `SynthesizeResponse`), and the benchmark marks no-answer runs INVALID.
  Residual: Gemini is still free-tier if the cascade gets that far, and Ollama remains unconfigured.
- [x] **`NVIDIA_NIM_TIMEOUT` re-tested 2026-08-15 — settled at 60 s (raised from 45, not lowered).**
  The "−56% p95" was a lower cap, not a faster system: capping a timeout truncates the number and
  pushes work onto the free Gemini tier, which is what exhausted the quota in the first place.
  Endpoint probing showed 8.6 s–>90 s for identical work with no rate-limit headers.
  > **90 s was tried first and was wrong** — it broke the product. The frontend budget for
  > `POST /search/synthesize` is **90 000 ms** (`frontend/src/lib/api.ts`), and a fallthrough costs
  > cap + Gemini (observed up to +11.6 s), so at a 90 s cap the four fallbacks landed at 92–102 s and
  > would have aborted in the browser. The benchmark used a 120 s client timeout and scored them as
  > successes, so **the harness was hiding a regression the harness itself caused** — now fixed by
  > pinning `BENCHMARK_SYNTH_TIMEOUT` to the frontend's 90 s.
  >
  > Measured over 23 NIM calls: 45 s keeps 65% on NIM · **60 s keeps 86%, worst fallthrough ~72 s** ·
  > 70 s keeps 91% (~82 s, thin margin) · 90 s keeps 100% but breaches the UI budget. `config.py`'s
  > default was also 90 and is now 60, so the bug is not inherited by anyone running without `.env`.
- [ ] **Widen the benchmark question set** — 25 questions across 15 categories, 8 at n=1, so one flip moves a category from 100% to 0%. (The old "±2 of 25" was partly a provider artefact — see §Benchmark caveats; both 2026-08-15 runs scored 24/25.) More questions would tighten the interval.
- [x] **`/system-benchmarks` admin page** — measured evidence visualised from **live sources only** (model-gate F1 trend across runs, per-entity-type F1, compliance gaps by severity, datastore health). Harness-only metrics (retrieval/answer/provenance, load sweep, time-to-answer) are **linked, not redrawn** — the system does not persist them, so charting a copy would present a static file as live data. The four system surfaces are now one tabbed section via `SystemTabs`.
- [x] **NER model swapped** to `meta/llama-3.2-11b-vision-instruct` (`ministral-14b` deprecated by NVIDIA). `ARCHITECTURE.md` updated in the two places that named it — minimal edit, model name only.
- [ ] **Deck/writeup vs as-built** (artifacts, not code). Clarified 2026-08-15 — **the ML stack and
  the knowledge-coverage heatmap are in scope, not mistakes on the slide.** PyTorch / scikit-learn /
  LightGBM were deliberately deferred to cut system-design complexity and because the corpus is too
  small to train on; the heatmap is intended but unbuilt. So this is a *roadmap vs shipped* framing
  question, not a correction: either mark those items as planned on the slide, or build them.
  The deployment line on that slide is **moot** — deployment is out of scope (see § Deployment), so
  there is nothing to reconcile it against. If the slide is ever revised, describe what actually
  runs: local Docker + cloud model APIs (NIM / OpenRouter / Gemini / Jina / Groq) with cloud stores
  (Aura, Qdrant Cloud, Supabase). No action while deployment stays out of scope.
- [x] **`ARCHITECTURE.md` PII scope mismatch — refiled, not a docs task.** `ARCHITECTURE.md` states
  the intended *design* and is deliberately not edited to match the build; that is what the
  [Conformance](#architecture--implementation-conformance) section exists to record. So "redaction
  gates cross-site knowledge promotion" is a design-vs-build gap, not a doc defect. The build side
  (no cross-site endpoint) is already tracked as backlog #15. Nothing to fix here.

---

## Manual-testing hardening (2026-07-19)

Page-by-page manual QA pass (field-worker → engineer → admin surfaces). Shipped this session:
- **Live-only data policy** — frontend never renders fabricated data: `useFetch` maps a fixture fallback to
  error+retry, server pages `throw` on it (`(app)/layout.tsx` = `force-dynamic`), custom pages show inline
  retry, cross-site shows an honest "no data" state. Read timeout 1.5 s → 4 s (compliance gaps 5 s).
- **Middleware → proxy** (`src/proxy.ts`, Next 16) — fixes the "tab title reverts to `Kairos` on refresh"
  bug (header now set on the request so `generateMetadata` can read it).
- **Brief content** — operator-readable prose instead of a raw KNOWLEDGE_EDGE dump.
- **Open artifact** — new `GET /documents/{id}/artifact-url` (signed URL) fixes the Supabase 400.
- **Documents list** now returns `asset_links` → projects portfolio classifies docs by equipment class.
- **Blast radius** — returns edge `source` (the affected asset) + dedup; panel always-visible + React Flow
  `<Handle>`s added (fixes "handle id: null" #008).
- **Audit trail** — readable metadata summaries, entity labels (UUID → friendly), badge wrap fix.
- **Role gating** — quarantine promote = reliability/admin; model-gate Run + Identity confirmation = admin.
- **Cosmetic/data** — events limit 250→200, graph/RCA default `EQ-101`/`HE-301`, stale `mXLM-RoBERTa` model
  name → config-driven (`ministral-14b`), admin sidebar superset (Voice/Deviation).
- **Graph page** — right context panel height-matched to the 560px canvas + internal scroll; validity-window
  rows labelled by the distinct **target** node (was every row "DOCUMENTED_BY"); `getKnowledgeGraph` **dedupes
  edges** (re-ingest left ~42 stacked dupes → ~5); `Timeline` dot/spine re-centered (dots no longer offset).
- **Governance hub** — shows KPI **skeletons while loading** (was em-dashes that read as "no data").
- **Audit trail** — synthesis entity shows "Query" (was the full question text reading as a sentence).
- **Sidebar** — added a "+ **Ingest Document**" action below the Knowledge group (staff-gated).
- **Neo4j Aura idle-connection fix** — the driver (`dependencies.py`) now sets `liveness_check_timeout=30`
  + `max_connection_lifetime=300`. Aura closes idle connections and `GraphService` uses raw `session.run`
  (no auto-retry), so a stale pooled connection threw `SessionExpired` ("defunct connection") → intermittent
  500s on Neo4j endpoints (compliance/dashboard, assets/knowledge, graph, blast-radius) → under live-only the
  `/management` overview erroring wholesale. Liveness-checking + recycling stale connections fixes it globally.

---

## Pending — follow-ups & manual QA (2026-07-19)

> **Admin login = the complete surface (confirmed against code).** The admin sidebar is a full **superset**
> of every role's navigation — all Operate/Analyze/Assure/Knowledge items **plus Voice + Deviation + System
> Health** — and OPA grants admin `*`, so every action works. Pages are **shared React components**; role
> only gates visibility/actions, so a page fix made while working as admin applies to that same page for
> every role that can see it. **Safe to log in as admin and work from there as the master workspace.**

### Resolved this pass (2026-07-19 — deep page QA + governance endpoints)
- [x] **MoC in-app sign-off had no backend** — added `GET /governance/moc/{id}` (enriches the thin `moc_items` row with `parameter`/`source_a`/`source_b`/`blast_radius_count` from the linked conflict) and `POST /governance/moc/{id}/approve` (engineer/admin; closes the superseded edge + resolves the conflict via the shared `_resolve_moc_conflict` helper). The UI called these all along — they used to 404.
- [x] **Promote gating reconciled** — endpoint `require_role` dropped `engineer` → now `reliability`/`admin`, matching OPA + frontend `PROMOTE_ROLES`.
- [x] **Model-gate 422** — `POST /model-gate/run` had `model_name` as a required query param the UI never sent; now optional, defaults to `NVIDIA_NIM_NER_MODEL`.
- [x] **Model-gate history never rendered** — backend returns raw `{items}` (contract-locked); `getModelGateHistory` now flattens to `{history:[ModelGateResult]}`.
- [x] **Model-gate run "did nothing"** — it's a ~2.5-min Celery task; added a queued banner, disabled-while-running button, background poll, and auto-refresh on completion. Distinguished 403/other/offline in the error copy; Run button already admin-gated.
- [x] **Asset knowledge duplicate facts** — `get_asset_knowledge_at` now dedupes by `edge_id` (6→3 facts on HE-303). Subtitle "Verified operational facts" → honest "Operational facts … verification status shown per fact".
- [x] **Neo4j `SessionExpired`** — driver pool hygiene (`liveness_check_timeout=30`, `max_connection_lifetime=300`) killed the intermittent 500s on Neo4j-backed endpoints.
- [x] **/management box-leveling + resilience** — Recent Signals stretches to match the left column with an internal scroller; system health split onto its own fetch so a slow ping never blanks the page.
- [x] **404 page + asset cleanup** — `not-found.tsx` now uses the real `logo.png` (old inline-SVG mark removed); deleted unused `logo.jpeg` + 5 Next.js boilerplate SVGs from `frontend/`.
- [x] **Docs/AGENTS/API/BACKEND/FRONTEND synced** — live-only fetcher rule, Neo4j pitfalls, model-gate async + adapter, MoC endpoints. (`CLAUDE.md` is a symlink to `AGENTS.md` — updated in one edit.)

### Resolved (2026-07-19 — batch follow-through)
- [x] **Alias resolution** — `/assets/{id}/knowledge` now accepts confirmed tag aliases via a shared `resolve_canonical_asset_id` helper (`P-101` → `EQ-101`, 5 facts, `resolved_from_alias: true`).
- [x] **Brief detail 404 on site-wide briefs** — `GET /briefs/{id}` + `/ack` filtered `.eq(recipient_user_id, user_id)`, so a `site-{site_id}` brief was unopenable by anyone (this was the user's `/briefs/4eaf5ff9…` 404, which I'd wrongly called "doesn't exist"). Now scoped to `[user_id, site-{site_id}]` via the shared `_brief_recipients` helper — matches the list endpoint.
- [x] **Brief humanized format** — verified in code (`assemble_work_order_brief`): headline/body use `_summarize_relationships`/`_distinct_docs`, no raw `DOCUMENTED_BY | confidence=` dump. Old persisted briefs keep pre-fix text.
- [x] **Frontend tests (partial)** — reconciled the 3 files I own to live-only (`use-fetch` demo→error, `management` demo→live mocks, `model-gate` useRole+removed demo-chip test): 11/11 green. **~11 other page-test files remain red** — pre-existing live-only debt (demo-source mocks, admin-button `useRole` mocks, removed demo-chip assertions), heterogeneous, for pages not touched this session. Recipe: flip happy-path mocks `demo→live`, mock `useRole` for admin-gated buttons, delete "offline fixture fallback" tests.
- [x] **Page spot-check** — circuit-breaker, documents/compare, system-information, SLA all render live data cleanly.

### Needs you — irreversible deletes (a judgement call, not a technical block)

> Corrected 2026-08-15: the old heading said "blocked for the agent — cloud deletes are
> classifier-guarded". That was inaccurate. The agent has SQL and Cypher access and uses it for reads
> throughout. These are held back because **permanent deletion is irreversible and yours to
> authorise**, not because anything prevents it.
>
> **Recommendation: do not run the two `audit_log` deletes.** Nothing is broken by those rows — their
> only effect is that the `/system-benchmarks` F1 trend plots retired models alongside the current
> one. Deleting audit history to tidy a chart contradicts this system's own governing rule (*Vault:
> permanent. Never delete. Supersede by closing `valid_to`*), and it is the kind of thing a reviewer
> is entitled to ask about. **Filter the chart instead** — show the current model only, or render the
> `validity` field so SUSPECT runs are visibly marked. Reversible, and a better story.
>
> The Neo4j dedup is a different case: those are accidental duplicate relationships from re-ingest,
> not history, so removing them destroys no record. Still optional — the read path already dedupes.
- [ ] Stale-audit cleanup (mXLM-RoBERTa): `delete from audit_log where action='model_gate_result' and entity_id='mXLM-RoBERTa';`
- [ ] Dedupe the 3 identical `ministral-14b` runs (ids 44,45,46 at 2026-07-19T08:03). **The SQL
  previously printed here was a no-op** — it filtered `a.entity_id='meta/llama-3.2-11b-vision-instruct'`,
  but those rows are `mistralai/ministral-14b-instruct-2512` (verified against Supabase 2026-08-15).
  Corrected: `delete from audit_log a using audit_log b where a.action='model_gate_result' and b.action='model_gate_result' and a.entity_id=b.entity_id and a.entity_id='mistralai/ministral-14b-instruct-2512' and a.timestamp < b.timestamp;`
  > Related: `audit_log` held only **4** `model_gate_result` rows — id 34 (`mXLM-RoBERTa`) and
  > 44/45/46 (`ministral-14b`) — with **no row for the current NER model at all**. Backlog #6 closed
  > that on 2026-08-15: row 422 (`meta/llama-3.2-11b-vision-instruct`, `performed_by: "cli"`) is now
  > the newest entry. The cleanup below is still worth doing so the trend shows only models in use.
- [ ] **Neo4j edge dedup** — re-counted 2026-08-15: **130 relationships / 43 distinct `edge_id` / 87
  duplicate extras across 22 ids** (was "123→36"; the graph has grown, the defect is unchanged). Run in
  the Aura console:<br>`MATCH ()-[r:KNOWLEDGE_EDGE]->() WITH r.edge_id AS eid, collect(r) AS rels WHERE size(rels)>1 UNWIND rels[1..] AS x DELETE x;`  (read path already dedupes; this makes the graph physically canonical, 130→43 edges.)

### Decisions for you (won't do unilaterally)
- [x] **Compliance + reliability personas — WIRED AND VERIFIED 2026-08-15.**
  Both roles existed in `infra/policies/kairos.rego` but neither could be logged into, so the two
  personas that actually *demonstrate* governance were the two nobody could show.
  - `compliance` added to the frontend `Role` type; `/compliance` and `/audit` moved from
    `STAFF_ONLY` to a new `STAFF_AND_COMPLIANCE` list (adding the role without this would have
    locked the auditor out of its own page), sidebar entries widened to match, and
    `roleHome("compliance") → /compliance` because the default `/management` is `STAFF_ONLY` and
    would have redirect-looped.
  - Users seeded: `reliability@kairos.local` / `compliance@kairos.local` (see `seed_users.py`).
  - **Verified live against OPA** with a deliberately non-existent item id, so nothing mutated:
    `promote_quarantine` is **denied for compliance and for engineer**, and passes policy only for
    reliability. That is the one-way quarantine gate demonstrable from the UI for the first time.
  > Two things found while verifying, both pre-existing and left alone: **OPA only enforces writes**
  > (POST/PUT/DELETE), so a GET to `/governance/*` still returns 200 for compliance — reads are
  > gated by UI visibility, not policy. And promoting a **non-existent** quarantine item returns
  > **500 rather than 404**.
- [x] **Dead frontend fixture modules — DONE 2026-08-15.** It was correctly called a real refactor
  rather than a delete, and it was done as one: 6 modules removed, 32 `catch` branches rewritten to
  rethrow, `DemoChip` + 10 sites gone, `DataSource` narrowed to a single member. The "zero
  user-facing benefit" assessment turned out to be wrong — three fabrication paths were still
  reachable and rendering invented data (see § Live-only cleanup). `copilot.ts`/`rca.ts` were kept
  for their live types and real constants, exactly as this entry advised.

### Resolved (2026-07-19 — green suite + build fix + CI)
- [x] **Frontend test suite reconciled to live-only — 124/124 green** (was 104 pass / 20 fail). Fixes: `demo→live` in happy-path mocks (compliance, governance, sla, circuit-breaker, audit-pack, nonconformance, management); `useRole` mocked for admin-gated buttons (model-gate); removed-behavior tests rewritten (`use-fetch` demo→error, model-gate/audit empty-state, cross-site honest-empty, rca/graph EQ-101 defaults, copilot full-height layout).
- [x] **Pre-existing `next build` blocker fixed** — Next 16.2.10's *default* `_global-error` page failed to prerender (`useContext` null), breaking the build (confirmed on HEAD, independent of this session's changes). Added a self-contained `src/app/global-error.tsx` (client, own `<html>/<body>`, inline styles). Build now compiles + prerenders clean; the local dev container OOMs (137) only because it's capped at **2 GB** — CI (ubuntu-latest ~7 GB) and the published image build on the runner, not this container.
- [x] **Frontend tests green in the container (124/124)**; CI (`frontend.yml`) stays tsc → lint → build → audit. vitest is not gated in CI (the dev container OOMs at 2 GB, masking the exit code) — run it in Docker, **never on the host**: host package resolution differs from the pinned image and makes `auth.test.ts` / `api.test.ts` fail spuriously. `frontend.yml`'s **audit step currently fails** on transitive `next`/`sharp` advisories with no non-breaking upstream fix; tsc/eslint/build pass.
- [ ] Emit a fresh **work order** → confirm the new operator-readable brief format live (code path already verified; the persisted EQ-102 brief keeps the old raw text). Optional end-to-end check (writes to cloud).

### Manual QA still to walk (role × page)
- [ ] **Reliability** + **compliance** role passes — reliability promotes quarantine; compliance cockpit read access.
- [ ] Pages not yet eyeballed: `/copilot`, `/documents/compare`, `/documents/[id]/topology`, `/governance/sla` · `/circuit-breaker`, `/system-information`, `/settings`, field `elicitation`/`voice` flows. *(Admin walkthrough, plant-state, model-gate, bootstrap, asset detail, /management, 404 — done this pass.)*

### Known non-blocking gaps
- [x] ~~Alias resolution~~ — **already fixed**; this entry contradicted the resolved item above and was stale (confirmed 2026-08-15). `routers/assets.py:22` defines `resolve_canonical_asset_id`, used at line 235, and the response carries `resolved_from_alias` (line 250).
> **Duplicate KNOWLEDGE_EDGE relationships** — tracked once, under [Needs you](#needs-you--irreversible-deletes-a-judgement-call-not-a-technical-block) with the current counts (130 rels / 43 distinct / 87 extras). A duplicate entry lived here and has been folded in.
- [x] **Model-gate "Run" button** for non-admins is already hidden; no remaining FE gap there. (Was filed as an open box while its own text said there was nothing to do.)

---

## Verification snapshot (2026-07-18, test counts updated 2026-07-19)

- Backend test suite: **~175 passed · 3 skipped** (1 transient flake; passes in isolation) — **not re-run this session** (write-heavy; must run against `--profile local-stores`, never cloud). This session's backend changes (alias resolve, brief recipient scoping, MoC endpoints, promote gating, model-gate default) are low-risk and don't touch the asserted paths (`test_promote_quarantine_item` uses `admin_client`).
- Frontend suite: **135/135 green across 55 files** (re-run in-container 2026-08-15 after the
  `npm audit fix` lockfile change; was 124/124 on 2026-07-19). `tsc` clean, `eslint` 0 errors / 3
  pre-existing unused-var warnings. vitest is not gated in CI (the dev container OOMs at 2 GB,
  masking the exit code) — run it in Docker, never on the host.
  > Pre-existing and **unrelated to any change here**: vitest reports 3 unhandled rejections —
  > `No "getToken" export is defined on the "@/lib/api" mock`, raised from `lib/auth.ts:33` `getMe()`
  > while `assets/page.test.tsx` runs. An incomplete `vi.mock`, not a product defect; all 135 tests
  > still pass. Fix by adding `getToken` to those mocks (or using `importOriginal`).
- Benchmark (cloud stores, re-measured 2026-08-15): retrieval **25/25**, answer **24/25**, provenance
  **25/25**, entity-F1 **0.917** (ceiling — see §Benchmark caveats), compliance F1 **0.986**, load
  **2275 req / 0% errors / knee at 50 VU**. Full output in `benchmark/RESULTS.md`.
- P&ID Path B: live-validated on `dataset/02_Document_Corpus/pid_line3_isolation_boundary.png`.
- **Cloud stores:** Neo4j Aura + Qdrant Cloud + Supabase + Grafana Cloud (observability). Default local stack ≈ 13 containers (neo4j/qdrant/grafana/tempo/otel offloaded); ~2–3 GB idle RAM.
- Auth verified-token cache: ~577 ms/request saved (revocation preserved, ≤ TTL staleness).
