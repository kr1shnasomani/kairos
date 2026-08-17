# KAIROS — Implementation Status

> **Single source of truth for open work.** What's **built** ([Layer completion](#layer-completion)),
> how faithfully it matches the design ([Conformance](#architecture--implementation-conformance)),
> the **current measured numbers** ([Benchmarks](#benchmarks--current-numbers)), and **what's left**
> ([Backlog](#improvement-backlog) · [Pending](#pending)).
>
> **This file tracks open items.** Completed work is removed once done — the git history holds it,
> and a status file that never forgets stops being a status file. Raw benchmark output lives in
> [`benchmark/RESULTS.md`](../../benchmark/RESULTS.md); route/persona verification in
> [`e2e-sweep.md`](./e2e-sweep.md).
>
> It also carries the **reference notes** an agent needs only when it hits them — the
> [Known Pitfalls](#known-pitfalls) tables and the [CI / tooling detail](#ci-tooling--project-reference),
> moved out of `AGENTS.md` on 2026-08-17 so that file stays a short per-task brief rather than
> something re-read in full on every task.
>
> Legend: ✅ **Live** (real, end-to-end) · 🟨 **Live on mock input** (real logic, fed by mock data
> **by design**) · 🟦 **Mocked by design** (final).

---

## Headline

**All 13 architecture layers are implemented.** Architecture conformance is **~91%** — the mean of
the 13 per-layer scores in [Conformance](#architecture--implementation-conformance), measured by an
independent re-audit on 2026-08-17 that scored *reachability in the path the architecture specifies*
rather than *presence of the mechanism*. The previous ~94% figure was self-assessed against the
looser rubric and is superseded; the re-audit landed at ~88%, and same-day fixes to L10
(brownfield attribution), L4 (all 6 node types, ingestion-path alignment, and the `valid_to`
comparison that had silenced conflict detection), L2 (IAM access tags), L7 (MoC banner on every
output type) and L11 (verified topology as gate evidence) moved it to its current value.
**Recompute this from the table when a layer score changes** — it once read ~88% here while the
table said ~89.5%, for exactly that reason.

Four deviations are deliberate and cap the score by construction (P&ID Path A, OPC-UA / Uniformance /
GraphQL connectors, PuppyGraph federated MDM, separate handwriting + form models). The rest of the
gap is real and listed per layer below.

**Corpus and plant connectivity are a fixed scope boundary, not open work.** KAIROS has **no
connection to a live industrial plant** (no OSIsoft PI historian, no SAP/Maximo EAM, single-site) and
no access to a real industrial document archive — every benchmark figure is measured against the
authored golden dataset in `dataset/`. Reviewers should not log "synthetic corpus" or "no real plant
data" as defects; they are the delivered MVP boundary. What *is* fair to assess is whether the
numbers are honestly measured on that corpus, and where corpus size limits what they can prove. The
mock adapters are real code with a documented one-line switch to go live *if* a plant is ever
connected; until then, the mock **is** the product.

**Deployment is out of scope** (user decision 2026-08-15). The Aura keep-alive is done and
independent of deployment (`.github/workflows/uptime.yml`, daily 03:17 UTC; GitHub disables
scheduled workflows after 60 days of repo inactivity).

---

## Layer completion

| # | Layer | Status | Evidence (code) | Notes |
|---|-------|:------:|-----------------|-------|
| 0 | Empirical Validation & Model Safety | ✅ | `workers/model_validation.py`, `services/circuit_breaker.py`, `validation_corpus`, `/governance/model-gate/*` | — |
| 1 | Deterministic Identity & MDM Backbone | ✅ | `/assets` (`MERGE`, `identity_confirmed_by` required), `asset_alias_map`, `services/graph.py` | EAM asset bootstrap = Go-connector **fixture** (no SAP/Maximo) — mock by design |
| 2 | Immutable Evidence Vault | ✅ | Supabase Storage (`kairos-vault`), SHA-256 dedup, `documents`, `POST /documents/ingest` | — |
| 3 | Multimodal Perception Engine | ✅ | OCR (NIM Nemotron), NER (NIM llama-3.2-11b-vision), voice (Groq Whisper), annotations, **P&ID topology** (`services/pid.py`) | Path A (custom YOLO+LayoutLM on GPU) = optional future accuracy upgrade, `requirements-cv.txt` |
| 4 | Temporal Reality Graph | ✅ | Neo4j, `KNOWLEDGE_EDGE` (6 props), `as_of` time-travel, blast-radius, conflict detection | All 6 designed node types now written (2026-08-17); existing corpus not backfilled |
| 5 | Zero-Copy OT Virtualization | 🟦 | Go connector `/ot/query`, `/ot/coverage` (`MockHistorianClient`) | **Mock by design — no plant historian.** Real path (`PIWebAPIClient`) is built; set `PI_WEBAPI_BASE_URL` to go live. OPC-UA is a stub. |
| 6 | Quarantine Knowledge Layer | ✅ | `quarantine_items` one-way gate, `/governance/quarantine` promote / dispute / request-info | — |
| 7 | Dual-Track Governance & Adjudication | ✅ | `knowledge_conflicts`, MoC webhook (signature-verified), SLA escalation, circuit breaker, blast-radius | — |
| 8 | Operational Event & Proactive Delivery | ✅ | 8 event sources, Redis Streams, EEMUA governor, `services/brief_engine.py`, plant-state suppression, PTW dual sign-off | — |
| 9 | Structured Knowledge Elicitation | ✅ | `MicroInterviewWorkflow` (`workflows/elicitation_workflow.py`), off-boarding programmes | — |
| 10 | Telemetry-Grounded Outcome Attribution | ✅ | `workers/attribution.py` — `_attribute`, `_classify_attestation`, `_check_closeout_attestation` (pure), triggered from `POST /events/work-order` | Brownfield branch fixed 2026-08-17: `evidence_role` now branches the decision; uninstrumented assets use closeout attestation as primary; 12 service-free tests |
| 11 | Reasoning & Synthesis | ✅ | Hybrid search, `/search/synthesize`, `/search/rca-pack`, safety refusal (NIM `llama-3.1-70b` + Jina embed) | — |
| 12 | Phased Deployment, Trust & Point-of-Action Interface | ✅ | Next.js frontend, `PhaseBadge`, field mode, all routes | Cross-site advisories render an honest "unavailable" panel (single-site MVP, by design) |

**Score: 12 ✅ live + 1 🟨 live-on-mock + Layer 5 🟦 mock-by-design.** The only non-real data paths
are the external-plant integrations, which are mock **by design**.

---

## Architecture ⇄ Implementation Conformance

> Design-vs-reality audit of `docs/ARCHITECTURE.md` against the code, re-run independently
> **2026-08-17**. Scored on whether each requirement is *reachable in the path the architecture
> specifies*, not merely present somewhere — the looser reading is what produced the earlier ~94%.
> ✅ **Conformant** · 🟡 **Partial** (built, simplified from spec) · 🔵 **Deferred by design** ·
> ⚠️ **Drift**. Re-run when `ARCHITECTURE.md` or a layer's core service changes.

| Layer | Verdict | Score | One-line |
|---|:--:|:--:|---|
| 0 · Empirical Validation & Model Safety | 🟡 | 92 | Corpus grows from human promotions/annotations; scores per entity type **and** per asset class; `make model-gate` exits non-zero on regression. Not auto-run by CI/CD, and `MODEL_GATE_ENFORCE` ships off |
| 1 · Deterministic Identity & MDM | 🟡 | 85 | Human-confirmed `MERGE` assets, alias resolution **with a confirm endpoint**, quarantine for unlinkable knowledge. EAM bootstrap is still a fixture |
| 2 · Immutable Evidence Vault | ✅ | 97 | Supabase Storage, SHA-256 dedup, version chain, never-delete; supersession now propagates to ES + Qdrant. **IAM-derived access tags** now stamped at ingestion (migration 017) — all 6 of the things the spec says each artifact receives. Tags derive from KAIROS's own enforced RBAC and say so (`derived_from: kairos_rbac`); there is no external source-system IAM feed to read |
| 3 · Multimodal Perception | 🟡 | 80 | Two-path OCR, NIM NER, P&ID **vision** (Path B) + element-by-element verification gate, voice. **No separate handwriting model** (a flag, and confidence deliberately not lowered) and **no layout-aware form/checklist parsing** |
| 4 · Temporal Reality Graph | 🟡 | 92 | 6 edge props ✅, time-travel ✅, blast-radius ✅, **all 6 node types now written** (Event via `OCCURRED_ON` from all 6 event routes; Person/Organisation from extraction), and **timestamp alignment now runs on the document-ingestion path** by correlating a document against sibling events for the same asset. Also fixed: `valid_to` was compared to `datetime()` as a string, which yields NULL in Cypher — conflict detection and document supersession were both matching zero rows. Existing corpus is not backfilled with the new node types |
| 5 · Zero-Copy OT Virtualization | 🔵 | 70 | Mock historian by design; `PIWebAPIClient` built; connector registry self-reports config state; OPC-UA/Honeywell/GraphQL fail loudly rather than empty-as-success. Coverage map is derived from verified topology **only — never joined to the historian tag registry**, which is half the spec's derivation |
| 6 · Quarantine Knowledge | ✅ | 97 | One-way gate, searchable+labelled, 4 review actions, SLA escalation. No per-item domain-owner assignment |
| 7 · Dual-Track Governance | 🟡 | 97 | Admin vs engineering tracks, per-criticality SLA, SPC circuit breaker, MoC webhook signature verification, **pending-MoC banner on every output type** — synthesized answers, `GET /search/`, `/search/assets/{id}` and `/rca-pack`. Conflict detection itself was inert until the `valid_to` fix (see L4). SPC has no deployment-maturity dimension |
| 8 · Event Subscription & Delivery | 🟡 | 95 | 8 sources, dedup on **all six** routes keyed by business id, correlate/late-arrival, EEMUA governor, cool-down, priority ordering, **HMAC-signed** PTW dual sign-off, pilot gate (advisory by design) |
| 9 · Knowledge Elicitation | ✅ | 95 | Micro-interviews on all 3 designed triggers, off-boarding programmes |
| 10 · Outcome Attribution | ✅ | 92 | Brownfield branch fixed 2026-08-17: `evidence_role` now routes the decision; uninstrumented assets use the human-verified work-order closeout attestation as primary evidence; `_attribute` and `_classify_attestation` are pure + service-free tested (12 tests). **No authority downgrade** on confirmed failure — audit flag only, deliberately conservative |
| 11 · Reasoning & Synthesis | 🟡 | 97 | Hybrid retrieval (exact+semantic+graph+authority re-rank), double safety refusal gate, all output types, superseded documents excluded from default retrieval, and **engineer-verified P&ID topology admitted as gate evidence** for isolation queries — carrying the edge's own authority, never a privileged one |
| 12 · Phased Deployment & Interface | 🟡 | 96 | Phase badge, field mode, point-of-action UI, **answer feedback wired to the backend**. Phase/pilot *activation* remains operational, not code |

**Overall ~91.2%** (mean of the per-layer scores). No layer carries a ⚠️ — L4's node-type drift closed 2026-08-17.
L10's brownfield branch was fixed 2026-08-17 (72 → 92).

### Divergences that remain

#### ✅ L4 — all 6 designed node types are now written (2026-08-17)
**Design:** Asset, Event, Document, Concept, Person, Organisation.
**Was:** only Asset, Document and Concept were ever `MERGE`d. Events lived solely in Supabase
(`operational_events`), and `PERSON`/`ORGANIZATION` were *extracted* by NER then dropped — the
ingestion loop skipped every entity that was not an `ASSET_TAG`. So "which people touched this
equipment" could not be answered from the graph at all.
**Now:**
- `merge_event_node` writes an `Event` node and an `(:Asset)-[:OCCURRED_ON]->(:Event)` edge from
  **all six** event routes. `OCCURRED_ON` is a plain relationship, deliberately *not* a
  `KNOWLEDGE_EDGE`: an event is a fact with its own timestamp, not a temporal knowledge assertion
  that could be superseded or carry an authority level, and overloading the type would inject
  non-claims into every authority-filtered query. Supabase stays the system of record — graph
  write failures are logged and never fail the ingest.
- `merge_person_node` / `merge_organisation_node` run on the extraction path at the same 0.7
  confidence bar as asset tags, linked by `MENTIONS_PERSON` / `MENTIONS_ORGANISATION` edges.
  Node ids are derived from the normalised surface form (`GraphService.entity_node_id`) so the
  same person in two documents MERGEs onto one node instead of one node per mention.
- Label is `Organisation`, matching the uniqueness constraint `init_schema.cypher` declares.
  `Organization` would create a second, unconstrained label indistinguishable in query output.
**Caveat — the graph fills forward, not backward.** Only newly ingested documents and newly
received events materialise these nodes; backfilling the existing corpus needs a re-ingestion
run (≈1 NIM call per document) and has not been done. The write path is closed; the current
graph reflects what has been written since.

#### ✅ L10 — brownfield attribution branch fixed (2026-08-17)
**Was:** `_check_telemetry_baseline` returned `failed: False` for uninstrumented assets but
`evaluate_outcome` combined all three checks with `AND`, making `genuine_failure` unreachable.
The declared `work_order_closeout_attestation` primary evidence was never a decision input.
**Fix:** `_check_telemetry_baseline` now emits `evidence_role` (`primary`/`supporting`/`unavailable`)
and `conclusive` on every return path. `evaluate_outcome` lazily calls the new
`_check_closeout_attestation` only when telemetry is demoted (`evidence_role == "supporting"`).
The new `_attribute()` pure decision function branches on `evidence_role` and routes
uninstrumented assets through attestation-as-primary. 12 service-free tests, including a
regression test for the brownfield path (`test_brownfield_asset_can_now_be_attributed`).
**Remaining:** no authority downgrade on confirmed failure — audit flag only. Deliberately
conservative; requires human review gate before any confidence change.

#### 🟡 L4 — timestamp handling detects drift but doesn't normalize, and runs in the wrong place
The pipeline **detects** drift beyond `TIMESTAMP_DRIFT_TOLERANCE_MINUTES` (60) and flags it for
review. Two gaps remain: the design's *normalize-to-historian* step is not implemented (no live
historian, and `canonical_timestamp` is computed but never written back), and the check runs **only**
on Layer-8 compound events — never on the document-ingestion path, where the design places it
("before committing any validity window to the graph"). Closing the second half needs a correlation
concept for documents; `compound_event_id` is events-only.

#### 🟡 L0 — per-asset-class scoring is in L0; enforcement routes through L7
Both halves are built: `workers/model_validation.py` partitions the corpus and reports
`by_asset_class` + `regressed_asset_classes`, and the **SPC circuit breaker** in L7 is the single
mechanism that halts extraction for a class. What is missing is automation — `make model-gate` must
be run by a human or a pipeline; nothing invokes it on deploy, and `MODEL_GATE_ENFORCE` ships off, so
a regression reports rather than blocks.

*(Superseded 2026-08-17: an earlier entry here claimed per-asset-class scoring lived only in L7. It
has been in L0 since the class-partitioning change.)*

#### 🟡 L8 — pilot monitoring gate is reporting-only
`GET /governance/push-volume-gate` computes peak per-operator-per-hour volume over a rolling window
and reports whether the deployment sits within EEMUA-191 norms. It **never blocks** Phase 3 at
runtime: a deployment with under 30 days of history would otherwise be unable to deliver briefs at
all. Phase activation stays a deliberate `KAIROS_PHASE` decision informed by that number.

*(Superseded 2026-08-17: an earlier entry here said this gate was "not implemented", contradicting
the layer table in the same document.)*

---

## Mock-by-design (final — not pending)

Mock because the real counterpart is an **external system KAIROS does not own**, or an enterprise
scale-out beyond the single-site MVP:

| Item | Where | To go live (if a plant is ever connected) |
|------|-------|-------------------------------------------|
| OT historian (PI Web API) | `connectors/internal/ot/client.go` | set `PI_WEBAPI_BASE_URL` + creds (`PIWebAPIClient` already built) |
| OT historian (OPC-UA) | `connectors/internal/ot/client.go` | implement `gopcua` read (stub) |
| EAM asset sync (SAP/Maximo) | `connectors/internal/eam/client.go` | set `EAM_ODS_ENDPOINT` + implement SAP ODS query (stub) |
| Cross-site pattern advisories | `frontend .../management/cross-site` | multi-site control-plane feed |

---

## Benchmarks — current numbers

**Measured 2026-08-16** on the shipping configuration: 37 questions, 40 NER labels,
`NVIDIA_NIM_TIMEOUT=60`. Raw output: [`benchmark/RESULTS.md`](../../benchmark/RESULTS.md).
Methodology: [`docs/BENCHMARKS.md`](../BENCHMARKS.md).

| Metric | Result | Harness |
|---|---|---|
| Layer smoke checks | **13/13 pass** | `verify_layers.py` |
| Retrieval (fact reaches context) | **37/37 (100%)** CI [91–100%] | `run_benchmark.py` |
| Answer quality | **34/37 (91%)** CI [79–97%] · run validity **VALID** | `run_benchmark.py` |
| Provenance (sources cited) | **37/37 (100%)** CI [91–100%] | `run_benchmark.py` |
| Synthesis latency | p50 **32.3 s** · p95 **65.0 s** (nim 23 · openrouter 11) | `run_benchmark.py` |
| Entity-extraction F1 (Layer 0) | **0.805** on 40 labels — `VALID`, 0 of 15 fell back | `run_model_validation.py` |
| Compliance gap detection | **P 1.000 · R 0.838 · F1 0.912**, zero false positives | `run_compliance_eval.py` |
| Retrieval reach by arm | exact **89.2%** · semantic **94.6%** · hybrid **94.6%** (n=37, CIs overlap) | `run_retrieval_baseline.py` |
| Proactive brief quality (Layer 8) | **6/6 graded** — structural only; content expectations unmet, see RESULTS §9 | `run_brief_eval.py` |
| Adversarial safety | **0 unsafe answers** / 15 questions — 12 refusals, S05 now answers — run validity `VALID` | `run_safety_eval.py` |
| Concurrency | **2275 req · 0% errors · knee at 50 VU** | `run_load_test.py` |

### How to read these — the caveats that still apply

- **Quote per-category rates with their n.** 15 categories, minimum n=2; at n=2 a single flip moves a
  category by 50%. `ORGANIZATION` F1 rests on n=3 — do not quote it to four decimals.
- **`ORGANIZATION` cannot be grown from this corpus.** It holds exactly two unambiguous vendors
  (Fischer, Meridian). "Rajgarh Petrochemical Complex" appears in 13 documents and is deliberately
  **unlabelled** — it reads equally as ORGANIZATION or LOCATION, and a ground truth that punishes a
  defensible answer is worse than a smaller one. Raising n needs **new source documents**.
- **A `VALID` entity-F1 means zero fallbacks.** 15 of 15 extractions ran on the NIM model with zero timeouts and zero JSON parse failures. This successfully validates the fixes for both the timeout latency issues and the JSON truncation issues.
- **Compliance F1 drifts downward as humans legitimately promote knowledge.** Its ground truth is
  derived from the static dataset manifest, so evidence promoted into the graph afterwards reads as a
  false negative. Five of six FNs in this run are one promotion on EQ-101 (`PROMOTED-f17b1416…`, a
  verified `procedure`), which genuinely covers those clauses. **The truth table is deliberately not
  amended** — grading a system against its own output measures nothing. Precision, the
  safety-relevant direction, stays 1.000.
- **All 3 refusals are genuine**, verified against the graph: no asset involved carries an
  authoritative (≤L3) source for the parameter asked. Q25 is the instructive case — the bulletin
  revising the HE-3xx limit to 16.2 bar is linked to **HE-301**, while Q25 asks about **HE-302/303**,
  so answering would mean extrapolating a safety-critical limit onto assets no source covers. The
  grader counts a refusal as correct, so this was audited specifically: raw score = adjusted score.
- **Latency is the honest cost of the 60 s cap.** Lowering the cap cannot make inference faster; it
  truncates the number and moves work to the fallback tier. Direct probing of NVIDIA's endpoint
  returned 8.6 s–>90 s for identical work with no rate-limit headers. `NVIDIA_NIM_TIMEOUT` must also
  stay **under** the frontend's 90 s budget for `POST /search/synthesize`.
- **Time-to-answer is a floor set by corpus size.** BM25 finds the answer-bearing document at mean
  rank 1.35 across ~20 documents — keyword search is already good at this scale, so there is little
  room to improve on it. The 120 s/document reading assumption is an input, not a measurement.
- **The load sweep is not a soak.** Nothing speaks to memory growth or connection leakage over hours,
  and 50 VU against a demo-scale dataset is not evidence for 10k assets.

---

## Improvement backlog

### Tier 1 — highest value

| # | Improvement | Why it matters | Est. |
|---|---|---|---|
| 1 | **Streaming synthesis (SSE)** | p95 is **65 s** with no progressive render. The tail is NVIDIA's shared endpoint, which cannot be tuned away, so progressive render is the *only* remaining lever on perceived latency. **Not attempted deliberately:** `ANSWER:/CONFIDENCE:/UNCERTAINTY:/SOURCES_USED:` is a parse contract with two consumers (`routers/search.py`, `workflows/elicitation_workflow.py`) and a measured answer-quality figure attached, so it needs a live NIM run to validate against regression. | 1–2 d |
| 2 | ~~**Cascade's free-tier dependency**~~ — **CLOSED 2026-08-17: the three tiers are a deliberate choice, not a defect** | Each tier is kept for a different property: **NIM** is free and has the largest token budget (its weakness is latency and model availability, not quota); **OpenRouter** is fast and serves the *same* `llama-3.1-70b`, so a fallthrough does not change which model answered — but it has a smaller token allowance; **Gemini** is fast with a generous allowance, though smaller than NIM's, and it is a different model family. Keeping all three is redundancy across *different* failure modes, which is stronger than a single provider. What already protects the numbers: the benchmark reports its provider mix and marks a Gemini-heavy run `SUSPECT`, and `rate_limited` reaches the client so an exhausted quota can never be read as poor answer quality. Ollama stays unconfigured by design (cloud-only model plane). | n/a |
| 3 | ~~**NER response-parsing fallback**~~ — **DONE 2026-08-17** | Root cause was `max_tokens: 1024` truncating the JSON on entity-dense documents; `json.loads` then rejected the **whole** response and the document fell to the regex path (ASSET_TAG only), which is what kept the Layer-0 F1 flagged `SUSPECT`. `_salvage_objects` now recovers the complete objects from a truncated or trailing-garbage array and flags `parse_recovered`, so recall degrades proportionally instead of collapsing to one entity type. Raising `max_tokens` was rejected — it only moves the cliff. Unrecoverable input still returns `None`. Pinned by `tests/test_ner_parse.py` (8 cases). **Re-run the model gate to see whether the F1 clears `SUSPECT`.** | done |

| 4 | ~~**Trust boundary: authorization ran but never decided**~~ — **DONE 2026-08-17** | **Three independent defects stacked, any one of which disabled authorization on its own** — which is why none of them ever surfaced as a failure. (a) **`OPA_URL=http://localhost:8181` in `.env`**: inside the API container `localhost` is the API itself, so the policy engine was never reached. (b) **The middleware verified tokens with `jose.jwt.decode(algorithms=["HS256"])` against `SUPABASE_JWT_SECRET`**, but this project's Supabase issues **ES256** tokens signed with an asymmetric JWT signing key — every real token failed to decode, so every caller looked anonymous. (c) **`_ask_opa` returned `True` on any exception**, so (a) was silently absorbed as "allow". Net effect: `kairos.rego` was decorative. Fixes: `.env`/`.env.example` point at `http://kairos-opa:8181`; the middleware's private verifier is **deleted** in favour of `dependencies.resolve_token` (one path, delegating to Supabase, sharing the auth cache, so no extra round-trip); `_ask_opa` returns `self.debug`. Also fixed in the same pass: enforcement was **write-only**, so `read_audit`/`read_compliance`/`read_governance` were dead rules — `_READ_ACTION_MAP` now gates reads on GET/HEAD (**never OPTIONS**: outermost middleware, so gating the CORS preflight 401s every cross-origin request), with `read_nonconformance`/`read_documents`/`read_events` added and all six in `_sensitive_actions` so the catch-all cannot re-grant them; and `site_id` was a **client-supplied query param** on `/assets` + both `/compliance` reads — `dependencies.site_scope` now derives it from the verified token and treats a blank site as *nothing*, not *everything*. Grants mirror `use-role.ts`; `/events/plant-state` is exempt because the app shell renders it for every persona. **Verified live** against all four seeded personas (field worker 403 on six sensitive reads, compliance 200 on conflicts/quarantine/events but 403 on circuit-breaker/documents), plus writes, preflight, the internal service key and the no-token dev bypass. 41 tests in `tests/test_authz_boundary.py`; 34-case policy matrix in `scripts/verify_authz_policy.sh`. | done |

### Tier 2

| # | Improvement | Why it matters | Est. |
|---|---|---|---|
| 5 | **Soak test** — deferred by decision 2026-08-17, spec below | Nothing yet speaks to memory growth or connection leakage over hours, and the pooled HTTP client + LRU cache are exactly what it would stress. **Needs no model provider** (reads-only endpoints), so it blocks nothing and can be run last. | 2–3 h |

#### Soak test — specification (ready to run, nothing blocks it)

**It needs no model provider.** It reuses `run_load_test.py`'s reads-only endpoint list, where
model-backed endpoints are excluded by default, so it cannot spend NIM / Jina / Gemini / Groq quota
however long it runs.

**What it must stress — the three components shaped like leaks:**

| Component | Where | Why a minutes-long load test cannot see it |
|---|---|---|
| Pooled HTTP client | `services/http.py` `shared_client()` | cached **per event loop**; Celery opens a fresh loop per task, so a mistake accumulates clients |
| LRU embedding cache | `services/llm.py` `_LRU` (maxsize 512) | bounded in entry *count*, not bytes — 512 Jina v3 vectors is a real resident footprint |
| Neo4j Aura driver pool | `dependencies.py` (`liveness_check_timeout=30`, `max_connection_lifetime=300`) | already produced one live bug (`SessionExpired` on idle connections); those settings are what a multi-hour run exercises |

**The runs, in order:** (1) baseline sample of RSS, connection count and p95 before load, so the
slope has an origin; (2) steady ~5 VU against reads-only endpoints for the chosen window, sampling
every 60 s; (3) idle-recovery check — stop load ~10 min, then hit each Neo4j-backed endpoint
(`/compliance/dashboard`, `/assets/{id}/knowledge`, graph, blast-radius), where a `SessionExpired` is
a real failure; (4) post-soak sample compared to baseline.

**Verdict must be stated, not inferred:** memory flat or trending at X MB/hour · connection count
stable · p95 drift under constant load · error rate. A rising RSS *slope* is the finding; a single
high reading is not. **Limits:** speaks to hours, not days, and says nothing about 10k assets. Run
against **local stores** if the window is long enough to matter for Aura quota.

### Tier 3 — architectural ceilings

| # | Improvement | Why it matters | Est. |
|---|---|---|---|
| 5 | **A real agent loop** | Two of the problem statement's five illustrative tracks say "agentic". There is no tool-use or planning loop anywhere: every LLM call is single-shot inside a hand-written pipeline. This is the main ceiling on an Innovation score, however good the governance architecture is. | 1 w+ |
| 6 | **Custom P&ID parser (Path A)** | `requirements-cv.txt` pins the YOLOv9 + LayoutLMv3 stack but it is intentionally not installed. Path B (cloud VLM) works and every element is human-verified, so this is an accuracy upgrade, not a gap. | 1 w+ |

### Known limitations — recorded, not planned

- **No supervised ML, permanently — settled, not pending.** PyTorch / scikit-learn / LightGBM are
  not installed and will not be. A 24-document corpus cannot train a model that beats the
  deterministic path. The quantitative story is SPC control charts, Wilson intervals, RRF and 2σ
  baselines — statistical methods where the data supports them. Full reasoning and the deck framing
  are in [Open items](#open-items). **Do not re-file this as a gap.**

- **Compliance counts are computed live**, O(clauses × assets) with a subquery per pair; `EXPLAIN`
  confirms `CartesianProduct`, and the dashboard variant is deliberately unbounded because a `LIMIT`
  would silently undercount a compliance posture. At 12 clauses × 10 assets it is instant. Materialise
  into Supabase on a scheduled scan only when scaling past a few thousand assets.
- **Retrieval is RRF, with no cross-encoder rerank or query planner**, and dedupe is per-document so a
  long document contributes one chunk. Retrieval scores 37/37, so there is nothing to gain on this
  corpus — but RRF scores measured **0.0156–0.0325 across all six hits of one query**, i.e. it barely
  discriminates here. Invisible at 20 documents, material on a real archive. Revisit when the corpus
  grows.

---

## Pending

### Open items

- [x] **Deck/writeup vs as-built — SETTLED 2026-08-17. Do not re-raise.**
  The ML stack named in the deck (PyTorch / scikit-learn / LightGBM) is **deliberately not built and
  will not be built**. It is not a scheduling gap.

  **Why it stays unbuilt:** the corpus is 24 documents and 40 NER labels. Any supervised model
  trained on that cannot outperform the deterministic path, and shipping one would mean presenting a
  model fit on nothing as a credential. The first question it invites — "what was your training set
  size?" — has no good answer. Choosing not to ship it is the correct engineering call, not an
  unfinished task.

  **What is shipped instead, and is the honest quantitative story:** SPC z-score control charts with
  rolling per-asset-class baselines (`services/circuit_breaker.py`), Wilson confidence intervals on
  every reported benchmark rate, Reciprocal Rank Fusion for multi-source retrieval
  (`services/search_service.py`), 2σ telemetry baseline comparison in outcome attribution
  (`workers/attribution.py`), and a precision/recall/F1 evaluation harness with a per-asset-class
  deployment gate (`workers/model_validation.py`). Statistical methods where the data supports them.

  **Framing to use in any deck or writeup:** *"Statistical methods where the data supports them — SPC
  control charts for drift detection, Wilson intervals on all reported rates, RRF for retrieval
  fusion. Supervised ML is roadmap, not shipped: a 24-document corpus cannot train a model that
  outperforms the deterministic path, and we chose not to ship one that looks impressive and measures
  nothing."*

  **The threshold at which this changes:** enough verified operational history to fit a distribution
  per equipment class — the anomaly detection over extraction outputs described in
  `ARCHITECTURE.md §8` (flag a parameter that deviates sharply from its class's historical range) is
  the natural first step, and it is plain statistics rather than a trained model. Neither is
  reachable on the present corpus.

  The knowledge-coverage heatmap **is** built (`GET /assets/coverage` + `/management/coverage`), so
  that half of the original slide was already true. Deployment remains out of scope.

- [x] **Timestamp-drift conflict — RESOLVED 2026-08-17 (option 2: ingest lag, never `valid_from`).**
  `document_pipeline.py` compared `occurred_at` vs `ingested_at`, called the gap "drift", and beyond a
  60-minute tolerance **overwrote `valid_from` with `ingested_at`** — which would have rewritten the
  true date of every historical document to its upload time and corrupted the validity windows Layer 4
  time-travel depends on. It never fired only because `occurred_at` is NULL across the corpus (0 of 24).

  Now: `valid_from` uses the **source** timestamp whenever it is parseable and not future-dated, and
  the gap is recorded as `ingest_lag_recorded` — an observation, explicitly noted as such in the audit
  row. A future-dated `occurred_at` is the one genuinely unsafe case (the authority pre-filter is
  `valid_from <= $as_of`, so a year-3000 date would hide the edge from every present-day query); it
  falls back to ingest time and logs `activity.occurred_at_in_future`. Unparseable values log and fall
  back rather than throwing. The pipeline no longer sets `extraction_jobs.timestamp_drift_detected`,
  so that flag now means only what `services/timestamp_alignment.py` means by it: **cross-source**
  clock skew. The frontend audit tone map carries both actions, drift as `caution` and ingest lag as
  `info`.

- [x] **Dead Event read methods — RESOLVED 2026-08-17.** `get_asset_events` was already gone.
  `get_last_inspection_date` was **fixed rather than deleted**: it matched `(e:Event)`, and no `Event`
  node is ever written, so the asset-detail `last_inspection_date` was permanently `null`. Inspections
  *are* recorded — as `INSPECTION_RECORD` edges written by `POST /events/inspection-complete` — so the
  query now reads the edge that actually exists and excludes superseded ones. Proven against the live
  graph with a disposable edge (returned the date, excluded it once superseded, probe removed). It
  reads `None` on the current corpus for an honest reason: no inspection has been recorded yet.

- [x] **Independent re-audit of the conformance score — done 2026-08-17.** Re-scored layer by layer
  against the code, deliberately *without* reading this file first. Result: **~84%**, not ~94%. The
  gap was a rubric difference, not arithmetic — the earlier pass scored whether a mechanism existed,
  the re-audit scored whether it was reachable in the path the architecture specifies. Four
  requirements were built-but-unreachable (L7's MoC banner, L10's brownfield branch, L12's feedback
  button, L4's alignment hook). The shallow-tier fixes that followed took it to **~88%**; L10, L4,
  L3 and L2 carry the remainder.

- [x] **E2E sweep — 19 of 22 open rows closed 2026-08-17.** Verified through the API layer, where
  these features actually live; four write paths exercised and each restored (plant-state round trip,
  deviation freeze→unfreeze of 4 briefs, offboarding response → quarantine, MDM probe purged from both
  stores with the 10 golden assets re-counted intact). **Three remain open deliberately:** the
  model-gate run (~2.5 min, ~15 NIM calls — its output is already measured), voice capture (Groq
  quota, path proven elsewhere), and horizontal-scroll on the remaining routes (a genuine browser
  check). Detail in [`e2e-sweep.md`](./e2e-sweep.md).

### Known non-blocking gaps

- ~~**`GET /assets/{id}` does not surface `identity_confirmed_by`**~~ — **FIXED 2026-08-17.** The
  read path now joins the Supabase `assets` row for `identity_confirmed_by` / `_at`, which the
  Neo4j node does not carry. Layer 1's whole claim is human-confirmed identity; the provenance
  existed but no surface could show *who* confirmed it.

- ~~**`valid_to` stored as a string**~~ — **FIXED 2026-08-17, and it was not cosmetic.** Four
  queries compared the string property to Cypher's `datetime()`, which yields **NULL** — so
  `(r.valid_to IS NULL OR r.valid_to > datetime())` was `(false OR null)` and dropped every row.
  Measured live: **0** active edges matched where the cast form matched **35**. `detect_conflict`
  therefore never found an existing edge (no conflict was ever raised on edge creation) and
  `close_validity_windows_for_document` closed nothing (document supersession was a no-op).
  Nothing errored and no test went red — every affected query just returned a plausible empty
  list. All sites now use `datetime(r.valid_to)`, and `tests/test_timestamp_alignment.py` scans
  the source for the broken form so it cannot reappear.
- ~~**Brief `sources[]` still shows graph internals**~~ — **FIXED 2026-08-17.** `relevant_excerpt`
  and `document_type` were humanised earlier; the remaining leaks were the raw `DOC-…` id as the
  title and a null `vault_url`, both now resolved from Supabase. Also fixed: `is_quarantine` was
  derived from `verification_status != "verified"`, and since every edge starts unverified by
  design, **every** source was badged as an unverified field observation — including authority-4
  permits. Edge verification is disclosed in the excerpt instead; the badge now means what it says.
- Promoting a **non-existent** quarantine item returns **500 rather than 404**.
- **Audit-pack `vessel`/`compressor` clauses show 0 evidence** (no asset has a matching
  `equipment_class`); `PESO` / `Factory Act` frameworks are not seeded → intentionally not shown.
- **`/rca` takes ~90 s** (NIM 70B) and returns `synthesis_available: false` when the graph lacks
  history. Not a bug.

---

## Verification snapshot

- **Benchmarks** (cloud stores, 2026-08-16): see [Benchmarks](#benchmarks--current-numbers) above.
- **Backend test suite:** ~175 passed · 3 skipped (1 transient flake, passes in isolation).
  *Stale — not re-measured since 2026-08-16; ~53 tests added, so treat this as a floor.* Write-heavy:
  run against `--profile local-stores`, **never cloud**.
- **Service-free tier:** **136 passed** (re-run 2026-08-17), no stack / secrets / network — what CI's `unit` job runs.
- **Frontend:** **145 passed across 57 files**, `tsc` clean, `eslint` 0 errors / 3 pre-existing
  unused-var warnings. Run vitest **in Docker, never on the host** — host package resolution differs
  from the pinned image and makes `auth.test.ts` / `api.test.ts` fail spuriously.
- **P&ID Path B:** live-validated on `dataset/02_Document_Corpus/pid_line3_isolation_boundary.png`.
- **Cloud stores:** Neo4j Aura + Qdrant Cloud + Supabase + Grafana Cloud. Default local stack ≈ 13
  containers; ~2–3 GB idle RAM.
- **Auth verified-token cache:** ~577 ms/request saved (revocation preserved, ≤ TTL staleness).

---

## Known Pitfalls

> Grouped by area for scanning; every row is a real gotcha you can still hit. A row earns its place
> only if it imposes an ongoing constraint or describes a symptom that can recur — bugs fixed in
> committed code, with nothing left to obey, are removed rather than archived here.

### Backend · database · models · API

| Area | Fix |
|---|---|
| `quarantine_items` FK failure | `asset_id = None`, never `""` |
| Supabase login / refresh error | Fresh anon client — never the service-role client |
| NIM env not picked up | `--force-recreate`, not `--restart` |
| `audit_log` sort failure | Column is `timestamp`, not `created_at` |
| Temporal logger crash | `workflow.logger` is stdlib — f-strings, no kwargs |
| `input_type` CHECK rejected | DROP + re-add constraint to add new enum values |
| KNOWLEDGE_EDGE `valid_to` NULL | Sentinel `datetime(9999,12,31,...)`, never NULL |
| `/documents/{id}/topology` 404 | Only for `pid_drawing` docs; others 404 by design |
| Frontend SSR fetch timeout | Wrong base URL — check `API_INTERNAL_URL` vs `NEXT_PUBLIC_API_URL` |
| Work-order dedup test flake | Unique `work_order_id` per run (10-min dedup window; key is business-id scoped since 2026-08-17) |
| **Semantic search returns nothing, silently** | A Qdrant filter on a field with **no payload index** returns HTTP 400 on Qdrant Cloud. `SearchService.hybrid_search` gathers with `return_exceptions=True`, so it is swallowed as `search.qdrant_failed` and hybrid retrieval degrades to Elasticsearch-only with no error surfaced. Cost: the superseded-document filter shipped this way and semantic reach measured **0/37** until `run_retrieval_baseline.py` exposed it. **Any new payload filter needs its field added to `PAYLOAD_INDEXES` in `scripts/init_qdrant.py`**, then `make init-all` (idempotent). |
| **Benchmark / soak numbers spike mid-run for no reason** | You edited a file under `backend/`. `docker-compose.override.yml` mounts `./backend:/app` and runs `uvicorn --reload`, so **every save restarts the live API** — in-flight requests error, p95 spikes ~17x, and RSS resets, which destroys a soak's leak trend. Long measurement runs execute *inside* `kairos-backend-api`, so they are hit by this too. **Do not edit `backend/` or `tests/` while a benchmark or soak is running** — the override mounts both, and `tests/` edits were observed triggering reloads too. Editing `docs/` and `frontend/` is safe; neither is mounted into the API container. |
| **A `localhost` URL in `.env` for a *container* service silently disables it** | `OPA_URL=http://localhost:8181` resolved to the API container itself, so authorization requests never reached OPA — and `_ask_opa`'s fail-open turned that into "allow everything". The host port mapping (`0.0.0.0:8181->8181`) makes `localhost:8181` work from the **host**, which is what makes the wrong value look right. Inside a container always use the compose service name (`http://kairos-opa:8181`). `.env` is `env_file:`-injected at container **creation**, so a change needs `--force-recreate`, not a reload. |
| **A 403 that should exist but doesn't is invisible** | Authorization defects fail *open*, so nothing errors and no test goes red. `scripts/verify_authz_policy.sh` checks the policy's decisions, but the policy being right proves nothing about whether it is *reached*. After any change to `middleware/opa.py`, `kairos.rego` or `OPA_URL`, probe the live API with a real token from a **restricted** persona and confirm a **403** — e.g. `field_worker` on `/audit-log/`. A 200 there means the layer is inert. |
| Site-wide brief wrong recipient | `user_id = f"site-{site_id}"` in `BriefEngine.deliver()` |
| NIM OCR wrong base URL | `https://ai.api.nvidia.com/v1/cv/nvidia/nemotron-ocr-v2` |
| **PostgREST `.neq()` against a missing JSONB key drops every row** | `NULL != 'x'` is `NULL`, not `TRUE`. `.neq("session_context->>element_type", "topology_manifest")` silently excluded *every element row* (they have no such key), so topology reported `elements_total: 0`. Filter in Python when the key may be absent. |
| **Unit tests cannot catch query-semantics bugs** | Every bug the suite has missed was a query bug: `.neq()` vs NULL, `.in_()` against a set the fake ignores. Test doubles implement filters as passthroughs, so a filter whose bug *is* its filtering always passes. These need a real database or a real browser. |

### Frontend — build & runtime

| Area | Fix |
|---|---|
| `dynamic(ssr:false)` build error | Not allowed in Server Components (Next 16) — put it in a `"use client"` wrapper (`components/lazy.tsx`) |
| eslint `react-hooks/purity` | No `Date.now()`/`new Date()` in render — move clock reads to `lib/utils.ts` (e.g. `nowMs`, `slaCountdown`) |
| eslint `set-state-in-effect` | Wrap async fetch in a `load()`; for mount-once DOM/token sync, scoped `eslint-disable` with a reason |
| DB junk from tests | Suite purges on teardown; `make purge-test-data` or full rebuild — never UI-filter test rows |
| FE type drift (root of most bugs) | FE types were built speculatively and crashed on live data. Verify shapes against live `curl`; `x?.arr.length` still throws when `arr` undefined — guard `?? []`. Fixed: `compliance/dashboard.total_gaps` = `{critical,major,minor}` object (not a number); `SlaReport` = escalation report (`overdue_quarantine_items`, `overdue_*_total`, no on-time tallies); `CircuitBreakerState` = `{states[],halted_count}`, `halted` bool; `ValidationCorpusStats` has no `by_asset_class`. **Now guarded by `tests/test_contract.py`.** |
| Blast-radius / topology are nested | `blast-radius/{id}` → `affected:[{edge,target}]`; `documents/{id}/topology` → nested `topology.{equipment_nodes,isolation_valves,isolation_boundaries,instrumentation_loops}`. Both flattened to the UI shape **inside the `api.ts` fetcher** (adapter). Guarded by `test_contract.py`. |
| Service-worker refresh loop | `public/sw.js` registered **production-only** (`app-shell.tsx` gates on `NODE_ENV`, unregisters in dev); navigations network-first. A dev-cached shell + changed chunk hashes = infinite reload. Bump `SHELL` cache version to bust. |
| Turbopack dev 404s-everything | A tight reload loop can corrupt the dev route manifest → all `(app)/*` 404 while `/` 307s. `docker restart kairos-frontend` clears it; not a code bug. |
| `next build` fails on `/_global-error` (`useContext` null) | Next 16.2.10's **default** global-error page fails to prerender. Fixed by a custom `src/app/global-error.tsx` (client, own `<html>/<body>`, **inline styles only** — no providers/tokens exist at that level). Keep it self-contained; don't import app components or `next/image` there. |
| `next build` exits 137 in the dev container | OOM — `kairos-frontend` is capped at **2 GB**, and a Turbopack production build needs more. Not a code error (compile + prerender succeed). CI (ubuntu-latest ~7 GB) and the Docker image build on the runner, not this container. To build locally, raise the container `mem_limit` or run on the host. |
| `not-found.tsx` uses plain `<img>`, not `next/image` | The root not-found renders inside the `_global-error` boundary at build time, where `<Image>`'s config context is null → prerender crash. Use a plain `<img>` (eslint-disable `no-img-element`), same as `brand-link.tsx`. |
| API boot race on ES | `kairos-backend-api` runs `ensure_indices()` at startup and **exits** if ES isn't ready. If the API is down after `make dev`, `docker restart kairos-backend-api` once ES is healthy. |

### Cloud stores — Neo4j Aura · Qdrant · Supabase

| Area | Fix |
|---|---|
| **Neo4j + Qdrant are CLOUD** (Aura + Qdrant Cloud, via `.env`) | Local `kairos-neo4j`/`kairos-qdrant` containers are **profile-gated** — they do NOT start by default; `docker compose --profile local-stores up` brings them back for offline dev/tests. Cloud creds live in `.env` only (never in compose). Aura DB is named after the instance (e.g. `2016aa75`), **not** `neo4j` — always open sessions with `database=settings.NEO4J_DATABASE` (GraphService defaults to it). Cloud Qdrant **requires payload indexes** on any filter field (`asset_id`, `document_id`, `is_quarantine`) — `init_qdrant.py` creates them; without them filtered searches 400. Every Qdrant client must pass `api_key=settings.QDRANT_API_KEY` or it 403s. |
| **Never run the write-heavy test suite against cloud** | `pytest tests/` creates + purges test entities; the teardown purge is unreliable against cloud Supabase (transient Cloudflare 500s) and **pollutes the golden data**. Run tests with local stores (`--profile local-stores`, point `.env` at them) or in CI. To restore clean golden data: truncate Supabase operational tables + wipe Neo4j/Qdrant/ES, then `init-all → seed → load-dataset`. |
| **Pointing the app at `--profile local-stores`** | The compose admin user is hardcoded to `neo4j` (Neo4j rejects any other initial admin name). To point the app at the local container, also set `NEO4J_USERNAME=neo4j` / `NEO4J_PASSWORD=$NEO4J_LOCAL_PASSWORD` in `.env`. |
| **What the benchmark writes** | `run_benchmark.py` + `verify_layers.py` write **only `audit_log` rows** (one per synthesis, ~37 per full sweep) — append-only, no golden data touched, no schema change. `run_compliance_eval.py` and `run_load_test.py` are read-only; `run_model_validation.py` writes one `model_gate_result` row (`--no-persist` to skip). Safe to run against cloud; it does spend NIM/Jina quota. |
| **Benchmark checkpoints must live on a mounted path** | `run_benchmark.py --checkpoint` writes each graded question as it lands so a crash costs the remainder, not the run — but `/tmp` is **container-local**, and a rebuild mid-run wipes it. Use `/app/.benchmark_runs/` (bind-mounted to `backend/.benchmark_runs/` by `docker-compose.override.yml`). Launch detached with `docker exec -d` and write logs there too. |
| Seed cloud (run once) | `make init-all` (schema + Qdrant collections **+ payload indexes**) → `make seed` (regulations + users) → `make load-dataset`. Idempotent. Doc pipelines are async — re-run `scripts/seed_validation_corpus.py` ~30 s after load (validation_corpus needs ES content indexed first). |
| Neo4j Aura keep-alive | Aura Free pauses after 3 days idle. **Handled by `.github/workflows/uptime.yml`** (daily 03:17 UTC) — it queries Aura *directly* with the driver, so it works whether or not a backend is deployed. Needs repo secrets `NEO4J_URI`/`NEO4J_USERNAME`/`NEO4J_PASSWORD`/`NEO4J_DATABASE`. GitHub disables scheduled workflows after 60 days of repo inactivity. |
| Neo4j driver pool settings are load-bearing | `dependencies.py` sets `liveness_check_timeout=30` + `max_connection_lifetime=300`. Aura closes **idle connections** within minutes, and without these a stale pooled connection throws `SessionExpired` → intermittent 500s on every Neo4j endpoint. Don't drop them; the daily keep-alive cron does **not** cover this. |

### Feature-specific — endpoints, roles & pages

| Area | Fix |
|---|---|
| Asset knowledge shows duplicate facts | The graph can hold multiple physical `KNOWLEDGE_EDGE` relationships sharing one logical `edge_id` (Cypher `DISTINCT` can't collapse them — separate graph elements). `GraphService.get_asset_knowledge_at` dedupes by the `edge_id` property; the frontend graph fetcher also dedupes. |
| Model-gate run "does nothing" | `POST /governance/model-gate/run` only **enqueues** a Celery task that evaluates the NER model over the whole validation corpus (a NIM call per item) — it runs **~2.5 min**. `model_name` is optional (defaults to `NVIDIA_NIM_NER_MODEL`). The page shows a "queued" banner, disables the button, polls history every 20s, and auto-refreshes when the run lands. History endpoint returns raw audit rows `{items}` (contract-locked) → `api.ts` `getModelGateHistory` flattens to `{history:[ModelGateResult]}`. |
| `POST /search/rca-pack` slow (~90s) | NIM 70B; returns empty + `synthesis_available:false` when the graph lacks history → RCA page shows honest "Synthesis unavailable". Not a bug. |
| Off-boarding shapes | List `{items,total}` (item `id`/`total_sessions`); detail adds `session_items[]`. Route `[sessionId]` = **programme id** (select items in-page). Questions are `string[]`; responses `{item_id, responses:[{question_index,answer}]}`. Detail fetch uses a 6 s timeout (slow Supabase). Loader seeds a demo programme. |
| Field routes | **There is no mobile bottom tab bar** — no `BottomTabs`, no `FieldBottomTabs` (both names appear in older revisions). Mobile navigates via the hamburger sidebar; recover the component from git history if it is ever revived. Field gating is live: `role === "field_worker"` (`use-role.ts` `FIELD_ROLES`, `roleHome` → `/briefs`). Routes under `/field`: `deviation`, `elicitation`, `voice`. SW offline is prod-only; the IndexedDB write queue (`idb.ts`) is app-level and works in dev. |
| Role-based route access | Enforced centrally in `AppShell` via `routeAllowed(path, role)` + `roleHome(role)` in `use-role.ts` (one guard, not per-page). Staff surfaces need engineer/reliability/admin; `/system-health` is admin-only; a field worker hitting a gated URL is redirected to `/briefs`. Unlisted paths are open to all authed. |
| System Health page | `/system-health` (admin). Probes 11 cheap read-only API GETs + `/health/detailed` every 30s. Search is **excluded** from the always-on set (it embeds via Jina = rate-limited). Opt-in "AI models" section toggles NIM/Gemini/Jina/Groq via `GET /health/model?provider=…` (admin-only, once/min, off by default, `localStorage`-persisted). Never poll model probes by default — they spend provider quota. |
| Roles & personas | Five roles in `infra/policies/kairos.rego`; the frontend `Role` type now includes **`compliance`** (read-only auditor). `/compliance` + `/audit` use `STAFF_AND_COMPLIANCE`, everything else staff-only, and `roleHome("compliance") = /compliance` — the default `/management` is staff-only and would redirect-loop. Seeded users: admin · engineer · field_worker · **reliability** · **compliance**. Only `reliability`/`admin` may `promote_quarantine` (engineers resolve conflicts but do **not** promote — verified against live OPA). **OPA gates writes *and* sensitive reads** (2026-08-17): `GET`/`HEAD` on `/audit-log`, `/compliance`, `/governance`, `/documents`, `/events` are policy-checked, so a `field_worker` gets **403** rather than 200. `read_nonconformance` is deliberately narrower than `read_governance` — the compliance auditor's non-conformance view reads conflicts + quarantine without reaching the model gate or MoC. `/events/plant-state` is exempt (every persona's shell renders it). Backend grants mirror `use-role.ts`; verify with `scripts/verify_authz_policy.sh`. |
| Custom OTEL metrics are per-process | `services/metrics.py` instruments are silent no-ops without a MeterProvider, so **every process that records a metric must call `setup_telemetry()`** — not just the API. Celery does it on `worker_process_init` (per forked child — an exporter thread does not survive a fork); `setup_telemetry(app=None)` skips the FastAPI-only instrumentor. Add a metric to a new process without this and it exports nothing, under any amount of traffic, with no error. |
| Sidebar footer | System information (all roles) · System health (admin) · **System settings** (renamed from "Settings"; route stays `/settings`). Help removed. Login has a "Try demo" → admin button. Tab titles = `Kairos: <page>`. |

---

## CI, tooling & project reference

- **`gh`** — GitHub CLI: PRs, issues, CI status.
- **Supabase MCP** (`mcp__claude_ai_Supabase__*`) — SQL, migrations, table inspection. Prefer over `docker exec`.

**Supabase:** project `ernffgrvdcikwwhkhiix` · bucket `kairos-vault` (private, immutable, 500 MB max)  
**Tests:** service-free tier **222 passed** across **21 files** (no stack/secrets/network) · frontend **145 passed / 57 files, 0 errors** · full suite ~175 passed · 3 skipped *(floor — not re-measured since 2026-08-16)* · 1 known transient flake (`test_attribution_worker_queues_recheck` — passes in isolation) · incl. `tests/test_contract.py` (response-shape contracts) + `tests/test_model_validation.py` (NER surface-form-overlap matcher) · self-cleans on teardown · Package: `ghcr.io/kr1shnasomani/kairos`

**CI:** `tests.yml` is two tiers — **`unit`** runs the service-free tests (PII, query classification, retrieval fusion, spreadsheet/email ingestion, NER matching, P&ID, auth cache, config, **authz boundary**) with **no secrets and no network**, so it is green on every push and fork PR; **`integration`** runs the full suite against `--profile local-stores` and *skips with exit 0* unless `CI_SUPABASE_*` is set. **Never point CI at the production Supabase / Aura / Qdrant Cloud project** — the suite creates+purges entities and `make init-all` reinitialises schema, so it would corrupt the golden dataset on every push. Use a throwaway Supabase project, and set the secrets with `gh secret set CI_SUPABASE_URL` (etc.) yourself — they are never read from `.env` by any script in this repo. **Recommended: leave tier 2 disabled** — it costs ~20 provider calls per push (Jina embed per `/search`, a synthesis cascade call per synthesize) and exhausting a provider tier makes synthesis silently return no answer, which reads as collapsed answer quality. `frontend.yml` (tsc·eslint·build·audit) passes in full. Two CI facts worth knowing: `lint.yml` needs `pull-requests: read` or `dorny/paths-filter` fails with *"Resource not accessible by integration"* and every lint job silently skips on PRs; and `next/font/google` fetches DM Sans/Geist **from Google at build time**, so a runner that cannot reach fonts.googleapis.com fails the build with `Module not found: @vercel/turbopack-next/internal/font/google/font` — transient, retry it, or self-host via `next/font/local` to remove the class.

> **Ruff is pinned in `lint.yml`, and that is deliberate.** Unpinned, it runs whatever rule set the
> newest release enables — one release once took linting from green to **608 errors on an unchanged
> tree**. Rules live in `backend/ruff.toml` (`E`/`W`/`F`/`I`/**`UP`**, py312, line-length 120); `"UP"`
> is selected, so `Dict`/`List`/`Optional[X]`/`timezone.utc` cannot creep back in place of the PEP
> 585/604 spellings. Bump the pin deliberately, never implicitly, and verify against the **pinned**
> version (0.16.0) — a local 0.15.0 passing proves nothing about CI.

> Run tests **in Docker**, never on the host: `docker compose run --rm --no-deps -e KAIROS_SKIP_TEST_CLEANUP=1 kairos-backend-api pytest tests/<file> -q`.
> Host runs resolve different package versions and produce false failures (`auth.test.ts` / `api.test.ts` fail on host, pass in-container).  
**Release:** `git tag v{version} && git push origin v{version}`
