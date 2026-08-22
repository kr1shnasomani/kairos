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

**All 13 architecture layers are implemented.** Architecture conformance is **~91.5%** — the mean of
the 13 per-layer scores in [Conformance](#architecture--implementation-conformance).

**The rubric is what makes this number mean anything.** A requirement scores only if it is
*reachable in the path the architecture specifies*, not merely present somewhere in the codebase.
The looser reading — does the mechanism exist — once produced ~94% for the same tree, and four
requirements were built-but-unreachable underneath it. Re-score against reachability or the number
is not comparable. **Recompute the mean from the table whenever a layer score changes**; it has
drifted from the table twice for exactly that reason.

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
scheduled workflows after 60 days of repo inactivity). That workflow also carries the
**idle-connection recovery probe** (added 2026-08-23): it queries Aura, idles 11 minutes past
`max_connection_lifetime`, then reuses **the same pool** — the direct regression test for the
`SessionExpired` bug, which `run_soak_test.py --idle` otherwise only catches in a 70-minute run
nobody does per change. It deliberately does **not** live in `tests.yml`: CI's integration job
runs a *local* Neo4j container, which does not close idle connections the way Aura does, so the
probe would pass there regardless of the pool settings — a green check proving nothing. Its pool
settings mirror `dependencies.py` and must be changed together, and it is reads-only (`RETURN 1`),
so unlike the integration suite it cannot touch the demo dataset.

---

## Layer completion

| # | Layer | Status | Evidence (code) | Notes |
|---|-------|:------:|-----------------|-------|
| 0 | Empirical Validation & Model Safety | ✅ | `workers/model_validation.py`, `services/circuit_breaker.py`, `validation_corpus`, `/governance/model-gate/*` | — |
| 1 | Deterministic Identity & MDM Backbone | ✅ | `/assets` (`MERGE`, `identity_confirmed_by` required), **`POST /assets/bulk`** golden-record import, `asset_alias_map`, `services/graph.py` | EAM *connector* = Go-connector **fixture** (no SAP/Maximo) — mock by design. The golden-record **import path** is no longer missing (2026-08-22): bulk import exists, so a plant no longer has to be bootstrapped one asset at a time |
| 2 | Immutable Evidence Vault | ✅ | Supabase Storage (`kairos-vault`), SHA-256 dedup, `documents`, `POST /documents/ingest` | — |
| 3 | Multimodal Perception Engine | ✅ | OCR (NIM Nemotron), NER (NIM llama-3.2-11b-vision), voice (Groq Whisper), annotations, **P&ID topology** (`services/pid.py`) | Path A (custom YOLO+LayoutLM on GPU) = optional future accuracy upgrade, `requirements-cv.txt` |
| 4 | Temporal Reality Graph | ✅ | Neo4j, `KNOWLEDGE_EDGE` (6 props), `as_of` time-travel, blast-radius, conflict detection | All 6 designed node types now written (2026-08-17). Corpus backfill via `scripts/backfill_graph_nodes.py`: `Event` done 2026-08-23 (137/137), `Person`/`Organisation` still outstanding (116 docs, opt-in, model calls) |
| 5 | Zero-Copy OT Virtualization | 🟦 | Go connector `/ot/query`, `/ot/connectors` (`MockHistorianClient`); coverage map in Python at `/assets/{id}/ot-coverage` | **Mock by design — no plant historian.** Real path (`PIWebAPIClient`) is built; set `PI_WEBAPI_BASE_URL` to go live. OPC-UA is a stub. Go `/ot/coverage` was **deleted 2026-08-16** (fabricated sensor tags); coverage now derives from *verified* topology only. |
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
| 0 · Empirical Validation & Model Safety | 🟡 | 94 | Corpus grows from human promotions/annotations; scores per entity type, per asset class **and per document type**; `make model-gate` exits non-zero on regression. **92 → 94 on 2026-08-23:** a run now records `validity` / `fallback_extractions` / `extraction_paths`, so a run that never reached the model can no longer be read as a measurement, and only a `VALID` run may serve as the baseline. Still not auto-run by CI/CD, and `MODEL_GATE_ENFORCE` ships off — which is what keeps this from a higher score |
| 1 · Deterministic Identity & MDM | 🟡 | 88 | Human-confirmed `MERGE` assets, alias resolution **with a confirm endpoint**, quarantine for unlinkable knowledge, **and the golden-record bulk import the architecture opens with** (`POST /assets/bulk`, 2026-08-22 — confirming authority from the verified token, partial success with per-row reporting, existing assets skipped never overwritten, cross-site rows refused *before* the existence check). The EAM *connector* is still a fixture; the import path it would feed is now real |
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

**Overall ~91.5%** (mean of the 13 per-layer scores: 1190/13 = 91.54). L1 85 → 88 on 2026-08-22 with
the golden-record bulk import; L0 92 → 94 on 2026-08-23 with model-gate run validity and the
per-document-type cut. No layer carries a ⚠️ — L4's node-type drift closed 2026-08-17.
Streaming synthesis deliberately moved **no** score: `ARCHITECTURE.md` asks for progressive render
nowhere, so it is a latency improvement, not a conformance gain.
L10's brownfield branch was fixed 2026-08-17 (72 → 92).

### Divergences that remain

#### 🟡 L4 — the graph fills forward; `Event` is now backfilled, `Person`/`Organisation` is not

**Backfilled 2026-08-23 (Events only):** `scripts/backfill_graph_nodes.py` closes the gap between
Supabase and the graph. `--events` moved the missing 21 of 137 operational events into `Event` +
`OCCURRED_ON` — **no model calls**, every write a `MERGE`, and a second dry run reports 0 missing,
so it is idempotent. Run it after any bulk event import.

**`--entities`, two runs on 2026-08-23.** Run 1: 102 documents, **33** nodes, `validity: SUSPECT`
(`nim: 91, regex: 11`). Run 2: 102 documents, **37** nodes, still `SUSPECT` (`nim: 94, regex: 8`).

**The retry cost is the finding.** Run 2 spent 102 NIM calls to gain 4 nodes, because the gap is
recomputed from the graph and a document that genuinely mentions no person or organisation never
acquires an edge — so it is indistinguishable from one never processed and is re-extracted on every
run. Convergence is therefore slow and expensive, and further runs are **not** worth the
rate-limited endpoint. Closing this properly needs an "extraction attempted" marker per document
(a row in `extraction_jobs`, or a property on the `Document` node) so the runner can skip a document
it has already tried, rather than inferring from the absence of an edge. Until then the "missing"
count is an upper bound on the real gap, not a measurement of it.


All 6 designed node types are written as of 2026-08-17 (`Event` via `OCCURRED_ON` from all six event
routes; `Person`/`Organisation` from the extraction path). **Only newly ingested documents and newly
received events materialise them.** Backfilling the existing corpus needs a re-ingestion run
(≈1 NIM call per document) and has not been done, so the current graph reflects what has been written
since that date, not the whole corpus. The write path is closed; the gap is data, not code.

Two details that are load-bearing if this is ever touched: `OCCURRED_ON` is deliberately **not** a
`KNOWLEDGE_EDGE` — an event is a fact with its own timestamp, not a temporal assertion that could be
superseded or carry an authority level, and overloading the type would inject non-claims into every
authority-filtered query. And the label is `Organisation`, matching the uniqueness constraint in
`init_schema.cypher`; `Organization` would create a second, unconstrained label indistinguishable in
query output.

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

**Measured 2026-08-16/17** on the shipping configuration: 37 questions, 40 NER labels,
`NVIDIA_NIM_TIMEOUT=60`. (Sweep 08-16; `run_benchmark`, `run_safety_eval` and `run_brief_eval` re-run 08-17.) Raw output: [`benchmark/RESULTS.md`](../../benchmark/RESULTS.md).
Methodology: [`docs/BENCHMARKS.md`](../BENCHMARKS.md).

| Metric | Result | Harness |
|---|---|---|
| Layer smoke checks | **13/13 pass** | `verify_layers.py` |
| Retrieval (fact reaches context) | **37/37 (100%)** CI [91–100%] | `run_benchmark.py` |
| Query answer quality | **33/37 (89.2%)**, 95% CI [79–97%] | `run_benchmark.py` |
| Provenance — all responses, incl. refusals | **37/37 (100%)** CI [91–100%] | `run_benchmark.py` |
| Provenance — correct answers only | **33/33 (100%)** CI [91–100%] | `run_benchmark.py` (`sourced/correct`) |
| Synthesis latency | p50 **32.1 s** · p95 **66.0 s** · mean **34.1 s** | `run_benchmark.py` |
| Entity-extraction F1 (Layer 0) | **0.805** on 40 labels — `VALID`, 0 of 15 fell back | `run_model_validation.py` |
| Model gate, in-app (Layer 0) | **0.7816** (P 0.723 · R 0.850) on **40 scored labels** of the 52-row `validation_corpus` — `VALID`, **0 of 27 extractions fell back**. 12 `COMPONENT` labels reported as `unscoreable` (2026-08-23) | `POST /governance/model-gate/run` |
| Compliance gap detection | **P 1.000 · R 0.838 · F1 0.912**, zero false positives | `run_compliance_eval.py` |
| Retrieval reach by arm | exact **33/37 (89.2%)** · semantic **35/37 (94.6%)** · hybrid **35/37 (94.6%)** (n=37, CIs overlap) | `run_retrieval_baseline.py` |
| Proactive brief quality (Layer 8) | **6/6 graded** — structural only; content expectations unmet, see RESULTS §9 | `run_brief_eval.py` |
| Adversarial safety | **0 unsafe answers** / 15 questions — 12 refusals, S05 now answers — run validity `VALID` | `run_safety_eval.py` |
| Concurrency | **2275 req · 0% errors · knee at 50 VU** | `run_load_test.py` |
| Soak (60 min, cloud stores) | **PASS — no leak signal.** RSS **+8.6 MB/h** · conns +4.2/h · **0.11%** of 37,842 req · idle recovery 4/4 | `run_soak_test.py` |

### How to read these — the caveats that still apply

- **Quote per-category rates with their n.** 15 categories, minimum n=2; at n=2 a single flip moves a
  category by 50%. `ORGANIZATION` F1 rests on n=3 — do not quote it to four decimals.
- **`ORGANIZATION` cannot be grown from this corpus.** It holds exactly two unambiguous vendors
  (Fischer, Meridian). "Rajgarh Petrochemical Complex" appears in 13 documents and is deliberately
  **unlabelled** — it reads equally as ORGANIZATION or LOCATION, and a ground truth that punishes a
  defensible answer is worse than a smaller one. Raising n needs **new source documents**.
- **A `VALID` entity-F1 means zero fallbacks.** 15 of 15 extractions ran on the NIM model with zero timeouts and zero JSON parse failures. This successfully validates the fixes for both the timeout latency issues and the JSON truncation issues.
- **Per-document-type is the informative cut** (added 2026-08-23, the PS criterion that had no
  runner). Measured: `ptw` **1.000** (6 labels) · `procedure` **1.000** (9) · `shift_log` **1.000** (2)
  · `inspection_report` **0.706** (16) · `oem_manual` **0.600** (7, precision 0.462). The model is
  effectively perfect on structured, templated documents and loses accuracy on prose-heavy OEM
  manuals — a shape the per-entity-type and per-asset-class cuts both hide. Small n applies: at 2–9
  labels a single flip moves a type substantially, so treat `shift_log` and `procedure` as
  directional. It costs **zero** extra model calls because every partition shares the run cache.
- **Quote the gate's F1 with `scored_labels`, never alone.** 0.7816 is measured on the **40** labels
  that are both annotated in the corpus and requested by the prompt. The other 12 are `COMPONENT`,
  a type the extractor is never asked for, so scoring them measured the corpus's label space rather
  than the model — and it cost twice, booking a false negative on `COMPONENT` *and* a false positive
  on whatever in-taxonomy type the model gave the same span. Excluding them moved F1 0.6733 → 0.7816
  and recall 0.654 → 0.850. **The 12 labels are a real gap to close** (either teach the prompt
  `COMPONENT` or remap the ground truth), just not a model defect.
- **The in-app gate's number is not a regression from the 0.7317 in its own history — it is the first
  trustworthy number, and the old one was flattering the model.** Every gate entry before 2026-08-23
  was written without a validity field, and the one audited on 2026-08-22 had **52 of 55 extractions
  fall through to the regex path**, which only matches `ASSET_TAG`. That is why those runs show
  `ASSET_TAG` at 1.000 and `PERSON` / `COMPONENT` / `ORGANIZATION` at 0.000: the regex's output was
  being attributed to the model. **Do not quote any gate entry lacking `validity: "VALID"`**, and do
  not read the drop as the model getting worse. The two figures in the table above are also *not*
  comparable to each other — different corpora (40 curated labels vs the 52-row live
  `validation_corpus`) and different harnesses.
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
- **The soak says "no leak signal", not "no leak".** `+8.6 MB/hour` clears the harness's FLAT
  threshold (`<10`) but sits at 86% of it, measured across a band that oscillates ~11 MB over 59
  samples — the slope's uncertainty is plausibly its own size. Quote it as *no leak signal detectable
  over a 60-minute window*, never as "memory is flat", and do not extrapolate to a shift. The 41
  errors (0.11%) are **counted, not classified**: the harness captures no status codes, so their
  attribution to cloud-store resets is an inference from their burst shape.
- **Neither the load sweep nor the soak speaks to scale.** 50 VU and a 24-document corpus are not
  evidence for 10k assets, and the soak speaks to hours, not days. Both are **reads-only** — the
  model path is never exercised by either.

---

## Improvement backlog

> **Numbers are retired, never renumbered.** The gaps are deliberate: items are cross-referenced by
> number from elsewhere in this file and from `e2e-sweep.md`, so reusing a number silently
> re-points an existing reference at different work. Closed so far — **1** streaming synthesis
> (2026-08-23), **3** surface held briefs (2026-08-23), **4** soak test (2026-08-22),
> **10** per-document-type extraction accuracy (2026-08-23).

### Tier 1 — highest value

| # | Improvement | Why it matters | Est. |
|---|---|---|---|
| 2 | **Backend dependency advisories — 10 left, both blocked upstream** | Was 16 across 4 packages; **protobuf and setuptools cleared 2026-08-23** and their suppressions removed, so the gate now catches a regression in either. The unlock was one transitive package: `setuptools` was **not** a stale cap — OTEL 0.45b0 imported `pkg_resources`, which setuptools 78+ removes, so lifting it alone crashed `api.main` on import. OTEL ≥0.49b0 drops `pkg_resources` but needs protobuf 5, which `grpcio-tools 1.62.3` forbade; `qdrant-client` asks only for `grpcio-tools>=1.41.0` and `temporalio` declares `protobuf>=3.20` with no ceiling, so pinning **`grpcio-tools>=1.66`** moved protobuf to 5.29.6 and OTEL to 1.28.0/0.49b0 with **both clients untouched**. What is left is genuinely blocked, not deferred: **`starlette 0.37.2`** (7 advisories) is pinned transitively by `fastapi==0.111.1` (`>=0.37.2,<0.38.0`) and the fixes run 0.40.0 → 1.3.1, i.e. a **FastAPI major upgrade** — a separate piece of work with real breakage risk across every router. **`ecdsa 0.19.2`** has an **empty `fix_versions`**: no released fix exists at all, so nothing can be done but re-check upstream periodically; it arrives via `python-jose[cryptography]`, and dropping that dependency is the only other lever. Dependabot PR #22 (41-package group) remains the blunt alternative. | FastAPI major: 1–2 d |

### Tier 2

> **#4 (soak test) closed 2026-08-22** — PASS, no leak signal: RSS +8.6 MB/h, connections +4.2/h,
> 0.11% errors over 37,842 requests, idle recovery 4/4. Numbers, raw output and the three things the
> run does **not** establish are in [`benchmark/RESULTS.md` §10](../../benchmark/RESULTS.md). The
> number is retired rather than reused, because items 5–14 are cross-referenced by it elsewhere.

| # | Improvement | Why it matters | Est. |
|---|---|---|---|
| 5 | **Event reorder buffer — Layer 8 normalization's third operation** | Dedup and correlation are built; out-of-order buffering before the trigger queue commits is not. `LATE_ARRIVAL_WINDOW_MINUTES` currently scopes correlation lookups only. **Not a uniform buffer:** a 5-minute hold on a PTW event delivers the safety brief *after* the permit is issued, so it must interact with priority — and it changes dedup semantics, since you would be deduping over a window that is still open. Unobservable single-site with REST-posted events; real on a plant with CMMS/DCS propagation delay. | 2–3 d |
| 6 | **Layout-aware form / checklist parsing** | `workers/extraction.py` is labelled "DEAD STUBS" and `run_form_extraction` raises — the only dead path in ingestion. **The hard part is destination, not extraction:** a field→value pair means nothing without the form type and field semantics, and then — graph edge at what authority, or quarantine? A handwritten checkbox promoted to canonical fact is what Layer 6 exists to prevent. Spans L3 × L4 × L6. **Measured impact today: none** — retrieval is 37/37 and none of the four benchmark misses (Q02 causal, Q07 topology, Q09 aggregation, Q29 blast-radius) is a form-parsing problem. Value appears at plant scale where field-level aggregation matters. | 3–5 d |
| 7 | **Graph query policy — hot-asset Redis precompute only** | Four of the five `ARCHITECTURE.md §7` requirements are now closed or settled. **Composite index:** impossible, settled 2026-08-22 (`asset_id` is a node property, the validity window a relationship property). **Traversal depth limits:** `graph.MAX_TRAVERSAL_DEPTH` is the single policy bound, interpolated into the one variable-length traversal, and `tests/test_graph_query_policy.py` fails if any unbounded `*` ships. **Authority pre-filter before traversal:** no multi-hop query exists for it to apply to — the Layer 4 hot path is a 1-hop expand, where filter-after-expand *is* the plan (`PROFILE`: `NodeUniqueIndexSeek` → `Expand(All)` → `Filter`). **Query-perf regression test:** `make graph-perf` (`scripts/verify_graph_perf.py`) asserts plan **shape**, so it catches the anchor regression that already happened once without going flaky as the corpus grows. **Left: hot-asset Redis precompute.** Deliberately not built — at this corpus size it is speculative, and a precomputed view that goes stale after a knowledge write is precisely the 'silent propagation of outdated information' the architecture calls the most dangerous failure mode. Build it when a `PROFILE` on a real corpus shows the seek+expand is no longer enough, and give it explicit invalidation on every `KNOWLEDGE_EDGE` write. | 1–2 d when triggered |
| 8 | **Extend the model gate beyond NER** to OCR and synthesis | OCR has **no labelled ground truth** in the corpus, so this means *creating* ground truth to feed a gate that ships `MODEL_GATE_ENFORCE=False`. Synthesis quality is measured by `run_benchmark.py`, but measurement is not a gate. Low value until enforcement is on. | 2–4 d |
| 9 | **Model weight signing + submission-pattern audit monitoring** | The remaining two of `ARCHITECTURE.md §8`'s three anti-poisoning mitigations. The third — parameter anomaly detection — is recorded under Known limitations: it needs a per-class distribution the corpus cannot supply. | 2–3 d |

### Measurement gaps — PS evaluation criteria without a runner

`ARCHITECTURE.md §9` names the nine harnesses and closes four of the seven criteria. These three remain.

| # | Criterion | Why it is not trivial | Est. |
|---|---|---|---|
| 11 | **KG linkage completeness — measured; the 34 unexplained documents are the open work** | **Closed as a measurement gap 2026-08-23.** The previous entry said "undefined and unmeasured, no runner", which was half wrong: `run_benchmark.py` had an asset-centric line all along, but "assets linked / total assets" reads 100% as soon as every asset carries one edge — reachability, not completeness. `benchmark/run_kg_completeness.py` now defines it document-centrically (**active vault documents with ≥1 `KNOWLEDGE_EDGE` carrying their `document_id`**) and classifies the remainder instead of leaving a bare percentage: quarantined items are **not** counted as misses, because Layer 6 holding unlinkable knowledge is the designed outcome. First run: **70/108 (64%) linked · 4 quarantined by design · 34 unexplained · 1 dangling**. It also measures the reverse direction, which matters more: an edge citing a `document_id` with no vault row asserts a fact whose evidence cannot be produced. The **34 unexplained documents** are now the real open work. | 0.5 d to triage the 34 |
| 12 | **Cross-functional knowledge discovery improvement** | The only criterion with neither definition nor runner. **Needs a counterfactual** — what would someone in function X have found *without* KAIROS. A proxy like "distinct document types per answer" measures answer composition, not discovery improvement. Honest route is a narrow definition with the limit stated out loud, as `run_time_to_answer.py` does with its 120 s/document assumption. | 2 d+ |

### Tier 3 — architectural ceilings

| # | Improvement | Why it matters | Est. |
|---|---|---|---|
| 13 | **A real agent loop** | Two of the problem statement's five illustrative tracks say "agentic". There is no tool-use or planning loop anywhere: every LLM call is single-shot inside a hand-written pipeline. This is the main ceiling on an Innovation score, however good the governance architecture is. **Recommended form — not a generic agent:** a **bounded re-retrieval loop on the refusal path**. The safety gate currently refuses on insufficient evidence after one retrieval attempt; a loop that reformulates and re-queries before refusing targets exactly the four honest misses (Q02, Q07, Q09, Q29), is measurable against an existing benchmark, never takes an action, and only ever gathers more evidence — so it does not contradict the architecture's position that human authority retains accountability. A generic tool-use loop does. | 2–3 d bounded · 1 w+ generic |
| 14 | **Custom P&ID parser (Path A)** | `requirements-cv.txt` pins the YOLOv9 + LayoutLMv3 stack but it is intentionally not installed. Path B (cloud VLM) works and every element is human-verified, so this is an accuracy upgrade, not a gap. | 1 w+ |

### Known limitations — recorded, not planned

- **No supervised ML, permanently — settled, not pending.** PyTorch / scikit-learn / LightGBM are
  not installed and will not be. A 24-document corpus cannot train a model that beats the
  deterministic path. The quantitative story is SPC control charts, Wilson intervals, RRF and 2σ
  baselines — statistical methods where the data supports them. **Do not re-file this as a gap.**

  *Why it stays unbuilt:* any supervised model trained on 24 documents cannot outperform the
  deterministic path, and shipping one would mean presenting a model fit on nothing as a credential.
  The first question it invites — "what was your training set size?" — has no good answer.

  *Framing for any deck or writeup:* "Statistical methods where the data supports them — SPC control
  charts for drift detection, Wilson intervals on all reported rates, RRF for retrieval fusion.
  Supervised ML is roadmap, not shipped: a 24-document corpus cannot train a model that outperforms
  the deterministic path, and we chose not to ship one that looks impressive and measures nothing."

  *The threshold at which this changes:* enough verified operational history to fit a distribution
  per equipment class. `ARCHITECTURE.md §8`'s extraction anomaly detection is the natural first step
  and is plain statistics, not a trained model — neither is reachable on the present corpus.

- **The `(asset_id, valid_from, valid_to)` composite index cannot exist — settled 2026-08-22, do not
  re-file.** `ARCHITECTURE.md §7` asks for it, but `asset_id` is a **node** property and the validity
  window is a **relationship** property, so no single entity carries all three. `PROFILE` confirms the
  hot path is anchor → `Expand(All)` → `Filter`, and a relationship index is not consulted for edges
  reached by expansion. What actually mattered was the **anchor**: restoring the missing
  `asset_id_unique` constraint changed the plan from `NodeByLabelScan` (10 rows / 11 dbHits) to
  `NodeUniqueIndexSeek` (1 row / 2 dbHits). Reasoning is recorded in `init_schema.cypher` and the
  `get_asset_knowledge_at` docstring, both of which previously claimed the composite index existed.

- **Go `GET /ot/coverage/{id}` is deleted on purpose — do not restore it.** Removed 2026-08-16 because
  it returned hardcoded `{asset}-VIBE` / `{asset}-TEMP` / `75%` for every asset, which Layer 5 forbids
  outright. Two tests pinning that behaviour survived until 2026-08-22 — one asserting "unknown asset
  falls back to mock coverage, still 200", i.e. *requiring* the fabrication. They were removed with a
  comment saying why, because the obvious way to make a red suite green is to re-add the route.
  Instrumentation coverage derives from **verified topology only**, in Python, at
  `GET /assets/{id}/ot-coverage`.

- **Dependabot version updates cannot run on push — do not try to wire it.** `interval` accepts only
  daily / weekly / monthly; there is no event trigger and no API to force a run (the "Check for
  updates" button is UI-only). Set to **daily** 2026-08-22. It also *looks* idle when working: every
  ecosystem groups all patterns into one PR, and an open group PR is **rebased in place** rather than
  replaced. The per-push equivalent is `.github/workflows/deps-audit.yml`.

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

- **E2E sweep — 22/22 rows closed** (last 3 on 2026-08-22). Horizontal scroll: 0 overflow across all
  35 static routes at 375 px, with the detector validated against an injected 900 px element. Voice
  capture: real speech → vault → Groq Whisper (0.926) → `quarantine_items` `pending`, 50.4 s. The
  model-gate run **exposed four defects rather than clearing a checkbox** — no run-validity field, a
  per-partition re-extraction doubling model calls, a Celery time limit calibrated on a broken run,
  and 23% of the corpus scored against a taxonomy the extractor never receives. All fixed and
  re-verified on 2026-08-23 — see [Known Pitfalls](#backend--database--models--api) and the
  model-gate row in [Benchmarks](#benchmarks--current-numbers). Detail in [`e2e-sweep.md`](./e2e-sweep.md).

- **`Person`/`Organisation` corpus backfill is incomplete.** The 2026-08-23 run merged 33 nodes over
  102 documents but came back `validity: SUSPECT` (`nim: 91, regex: 11`) — 11 documents never reached
  the model, and the regex fallback cannot emit either type. Re-run
  `scripts/backfill_graph_nodes.py --entities --apply`; it recomputes the gap from the graph, so it
  picks up only what is still missing. `Event` is complete (137/137).

- **The 12 `COMPONENT` labels in `validation_corpus` are unscoreable by design, not fixed.** They are
  reported rather than counted as failures, but closing the gap needs a decision: teach the prompt
  `COMPONENT`, or remap the ground truth. Deferred deliberately — nothing in the codebase consumes
  the type, and 3 distinct entities cannot validate adding one to production extraction (the same
  reasoning already recorded for `ORGANIZATION`).

- **`DOC-MERIDIAN-HE301-SB` is cited by edges but has no vault record.** Found by the new
  linkage runner on its first run. **Contained, not operator-visible:** the citing edges hang off
  `BlastEntity` demo-scaffolding nodes, and the Layer 4 read path matches `(a:Asset)`, so the id
  cannot surface in an answer — `run_kg_completeness.py` exits 0 for exactly that reason and would
  fail if it were ever cited from an Asset. Worth cleaning up in the seed data.

- **Linkage triaged 2026-08-23 — the gap is 4 documents, and they are the known L3 limitation.**
  The first reading (70/108 = 64%, "34 unexplained") was a *measurement* artifact, not a corpus
  gap: **85 of 108 "active" vault documents were test artifacts** (`ann_test_*`, `dbtest_*`,
  scratch files) carrying ordinary random `DOC-` ids, so only the file name identified them. With
  them in the denominator the metric was reporting test hygiene rather than linkage — the same
  class of error as scoring the model gate against labels outside its taxonomy.
  `run_kg_completeness.py` now excludes them **and reports the count**, so the denominator stays
  auditable. Verified not to over-exclude: the 23 remaining documents are exactly the golden
  dataset (`sop_he_*`, `oem_*`, `insp_*`, `ptw_*`, `pid_*`), matching the documented ~24-document
  corpus, and two borderline names are conservatively kept.
  **Corrected figure: 18/23 (78%) linked · 1 quarantined by design · 4 unexplained.** The four are
  `regulatory_clause_excerpts.pdf` plus the handwritten and degraded-scan images — i.e. the L3
  gap already recorded ("no separate handwriting model"), not a new defect. Closing them means
  closing L3, not fixing linkage.

- **Audit-pack `vessel` / `compressor` clauses show 0 evidence** — no asset carries a matching
  `equipment_class`, and the `PESO` / `Factory Act` frameworks are not seeded, so they are
  intentionally not shown.

- **`/rca` takes ~90 s** (NIM 70B) and returns `synthesis_available: false` when the graph lacks
  history. Not a bug.

---

## Verification snapshot

- **Benchmarks** (cloud stores, 2026-08-16): see [Benchmarks](#benchmarks--current-numbers) above.
- **Backend test suite:** **412 passed · 0 failed** (full suite, 2026-08-22). Write-heavy: run against
  `--profile local-stores`, **never cloud**. The long-standing `test_attribution_worker_queues_recheck`
  flake is gone — it was one of six failures traced to a shared-fixture dedup collision, now fixed.
- **Service-free tier:** **318 passed** across **27 files** (2026-08-23) — no stack / secrets / network.
  This is exactly what CI's `unit` job runs; the list is duplicated in `AGENTS.md`, `docs/TESTS.md` and
  `.github/workflows/tests.yml` and **all three must be updated together** (they have drifted twice).
- **Frontend:** **154 passed across 59 files** (2026-08-23, green), `tsc` clean, `eslint` 0 errors /
  3 pre-existing unused-var warnings. Run vitest **in Docker, never on the host** — host package
  resolution differs from the pinned image and makes `auth.test.ts` / `api.test.ts` fail spuriously.
  **The OOM is fixed by running a one-off container, not by raising `mem_limit`:** the running
  `kairos-frontend` sits at ~1.85 GB of its 2 GB (the Next dev server), so `docker exec` leaves vitest
  no headroom. `docker compose run --rm --no-deps kairos-frontend npx vitest run` gets its own budget
  and finishes in ~13 s.
  The one failure found on 2026-08-22 was **stale, not a regression**, and is fixed: the test still
  expected the pre-redesign attention-list label `Overdue quarantine · {input_type}`, while
  `attention-list.tsx:32` has rendered `Quarantine: {content ?? input_type}` since the
  template-fidelity redesign. The **test** was corrected rather than the shipped copy — but the two
  rows in that list now read inconsistently (`Overdue conflict · {track}` vs `Quarantine: {content}`)
  and nothing in `FE.md` specifies either, so the wording is an open design question, not a settled one.
- **P&ID Path B:** live-validated on `dataset/02_Document_Corpus/pid_line3_isolation_boundary.png`.
- **Cloud stores:** Neo4j Aura + Qdrant Cloud + Supabase + Grafana Cloud. Default local stack ≈ 13
  containers; ~2–3 GB idle RAM.
- **Auth verified-token cache:** ~577 ms/request saved (revocation preserved, ≤ TTL staleness).
- **Soak (2026-08-22, cloud stores):** 60 min × 5 VU → 10 min idle → recovery probes. **PASS on all
  four harness thresholds** — memory FLAT, connections STABLE, errors CLEAN, idle recovery 4/4. Read
  it as *no leak signal over a 60-minute window*; §10 of `RESULTS.md` records what it does not prove.

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
| **A test that passes alone and fails in a full run is probably colliding with event dedup** | `shared_asset_id` is **session-scoped**, a full suite finishes well inside `DEDUP_WINDOW_MINUTES` (10), and seven tests POST `/events/inspection-complete` against it — so the first wins and every later one correctly returns `{"status": "deduplicated"}` with **no `quarantine_item_id`**, producing a `KeyError` in whichever test reads it. The dedup is behaving exactly as designed. Six full-suite failures traced to this on 2026-08-22. **Any test that needs its operational event to actually land must use the `fresh_asset_id` fixture, not `shared_asset_id`.** |
| **A schema statement can be silently dropped and the run still reports success** | `scripts/init_neo4j.py` split `init_schema.cypher` on `;` and *then* filtered chunks starting with `//` — so every statement following a comment block was discarded **before** the execution loop, meaning nothing was logged and the summary still said complete. Six statements had never reached Aura, including **`asset_id_unique`**: the graph's most important node type had no uniqueness constraint (assets are written with `MERGE`, which needs one to be safe under concurrency) and no index, so the Layer 4 hot path planned as a `NodeByLabelScan`. Fixed 2026-08-22 by stripping comment lines *before* splitting, and the loader now reports `statements_applied` / `statements_failed` separately. **After changing the schema file, verify with `SHOW CONSTRAINTS` / `SHOW INDEXES` — do not trust the run summary.** |
| **Semantic search returns nothing, silently** | A Qdrant filter on a field with **no payload index** returns HTTP 400 on Qdrant Cloud. `SearchService.hybrid_search` gathers with `return_exceptions=True`, so it is swallowed as `search.qdrant_failed` and hybrid retrieval degrades to Elasticsearch-only with no error surfaced. Cost: the superseded-document filter shipped this way and semantic reach measured **0/37** until `run_retrieval_baseline.py` exposed it. **Any new payload filter needs its field added to `PAYLOAD_INDEXES` in `scripts/init_qdrant.py`**, then `make init-all` (idempotent). |
| **Benchmark / soak numbers spike mid-run for no reason** | You edited a file under `backend/`. `docker-compose.override.yml` mounts `./backend:/app` and runs `uvicorn --reload`, so **every save restarts the live API** — in-flight requests error, p95 spikes ~17x, and RSS resets, which destroys a soak's leak trend. Long measurement runs execute *inside* `kairos-backend-api`, so they are hit by this too. **Do not edit `backend/` or `tests/` while a benchmark or soak is running** — the override mounts both, and `tests/` edits were observed triggering reloads too. Editing `docs/` and `frontend/` is safe; neither is mounted into the API container. |
| **A `localhost` URL in `.env` for a *container* service silently disables it** | `OPA_URL=http://localhost:8181` resolved to the API container itself, so authorization requests never reached OPA — and `_ask_opa`'s fail-open turned that into "allow everything". The host port mapping (`0.0.0.0:8181->8181`) makes `localhost:8181` work from the **host**, which is what makes the wrong value look right. Inside a container always use the compose service name (`http://kairos-opa:8181`). `.env` is `env_file:`-injected at container **creation**, so a change needs `--force-recreate`, not a reload. |
| **A 403 that should exist but doesn't is invisible** | Authorization defects fail *open*, so nothing errors and no test goes red. `scripts/verify_authz_policy.sh` checks the policy's decisions, but the policy being right proves nothing about whether it is *reached*. After any change to `middleware/opa.py`, `kairos.rego` or `OPA_URL`, probe the live API with a real token from a **restricted** persona and confirm a **403** — e.g. `field_worker` on `/audit-log/`. A 200 there means the layer is inert. |
| **A purge matcher that can never fail is the danger; `tests/test_purge_safety.py` now pins it** | Every prefix and exact id is asserted against a list of ids that must survive — including `WO-2026-0714`, whose promoted quarantine item (`PROMOTED-f17b1416…`) the compliance caveat above cites, and a `DOC-X…`-shaped id reproducing the original incident. Also enforced: **every prefix ends in `-`**, and nothing appears in both a prefix list and an `_EXACT` list. The 2026-08-23 addition was `WO-E2E-ELICIT-001` — 4 stranded rows from the 2026-08-16 sweep, typed by hand and generated by no fixture, so it went in `WO_EXACT_IDS` matched by equality. **A bare `WO-` prefix would have deleted real dataset content**, which is why the exact-id pass is now generalised (`EXACT_ID_SETS`) rather than hardcoded to documents. |
| **A test-id prefix that is also a real id's first characters deletes real data** | `scripts/purge_test_data.py` matches every entry in its `*_PREFIXES` lists as a **prefix** — `STARTS WITH` in Neo4j, `LIKE 'p%'` in Supabase, a `prefix` query in ES — and `tests/conftest.py` runs it as an **autouse session teardown** unless `KAIROS_SKIP_TEST_CLEANUP` is set. `DOC_PREFIXES` contained the bare string `DOC-X`, present only because `tests/test_annotations.py` writes that exact id as a literal. Real document ids are `DOC-` plus twelve random characters, so roughly **one document in thirty-six** starts with X: four real documents matched and were `DETACH DELETE`d from the graph and dropped from Supabase on every full-suite run, against CLAUDE.md's "Vault: permanent. Never delete." Fixed 2026-08-22 by splitting whole ids into `DOC_EXACT_IDS`, matched by equality in all three stores. **A prefix shorter than its trailing separator is a data-loss bug — put whole ids in the `_EXACT` lists, and keep every prefix ending in `-`.** |
| **Test assets accumulate in the cloud stores even though a purge runs** | The purge only removes what its prefix lists name, and that list drifts from `tests/conftest.py`. `fresh_asset_id` has minted `ASSET-FRESH-{uid}` since it was added, but `ASSET_PREFIXES` never listed it, so 25 test assets built up in Aura and dragged 200 phantom ISO-45001 gaps into `GET /compliance/gaps`. Added 2026-08-22. **After adding a fixture that creates an entity, add its prefix to `purge_test_data.py` in the same change** — the lists are the only thing keeping the demo stores clean, and nothing fails when they drift. |
| **`make nuke` does not clean the cloud stores** | It is `docker compose down -v` — local volumes only. Neo4j Aura, Qdrant Cloud and Supabase are untouched, so the documented `nuke → dev → init-all → seed → load-dataset` reset leaves every cloud-side test entity in place. Use `purge_test_data.py` for prefix-matched residue; anything created by hand through the API (`BULK-*`, and the bare `ASSET-<8HEX>` ids `POST /assets` generates when the payload omits one) carries **no test marker at all** and can only be removed by explicit id. **A generated id is indistinguishable from a real one — pass an explicit prefixed id when creating throwaway entities by hand.** |
| Site-wide brief wrong recipient | `user_id = f"site-{site_id}"` in `BriefEngine.deliver()` |
| NIM OCR wrong base URL | `https://ai.api.nvidia.com/v1/cv/nvidia/nemotron-ocr-v2` |
| **PostgREST `.neq()` against a missing JSONB key drops every row** | `NULL != 'x'` is `NULL`, not `TRUE`. `.neq("session_context->>element_type", "topology_manifest")` silently excluded *every element row* (they have no such key), so topology reported `elements_total: 0`. Filter in Python when the key may be absent. |
| **A bare directory name in `.gitignore` matches at every depth** | `scripts/` sat under the benchmark-logs heading and silently excluded **both** `backend/scripts/` and the repo-root `scripts/` — five documented files were untracked, including `verify_authz_policy.sh`, which `BACKEND.md` instructs you to run, and the Layer-4 backfill script this file references. Nothing failed: the files exist locally, `make` targets work, docs read correctly, and only a fresh clone reveals the gap. Fixed 2026-08-23 by removing the pattern (`node_modules/` and `.next/` were already ignored on their own lines, so it was protecting nothing). **Anchor any future directory ignore with a leading slash** (`/path/scripts/`), and after adding a script that docs or a Makefile target reference, confirm with `git status --untracked-files=all` that git can actually see it. |
| **Unit tests cannot catch query-semantics bugs** | Every bug the suite has missed was a query bug: `.neq()` vs NULL, `.in_()` against a set the fake ignores. Test doubles implement filters as passthroughs, so a filter whose bug *is* its filtering always passes. These need a real database or a real browser. |
| **A safety-critical answer must never be streamed to the screen** | `POST /search/synthesize/stream` (2026-08-23) renders progressively, but `CONFIDENCE:` arrives **after** `ANSWER:` in the parse contract, and `LLMService.result_gate` can turn a complete answer into a refusal based on it. Streaming the text would therefore show an operator words the gate is about to retract — the "hedged partial answer" `ARCHITECTURE.md` forbids outright. So the six `SAFETY_CRITICAL_CATEGORIES` emit **no `delta` events at all**: they stream `status` only, with `streaming_text: false` and a reason the UI shows, then one terminal `done`. `tests/test_synthesis_stream.py` asserts this per category. Two rules follow: **`done` is authoritative and `delta` text is provisional** (the frontend holds it on `Turn.streaming`, never merged into `answer`), and the streaming path calls the **same** `evidence_gate` / `result_gate` methods as `synthesize()` — a second copy of a refusal rule would drift and whichever an operator hit would be the wrong one. |
| **A `StreamingResponse` has no `response_model`, so nothing filters it** | The first live run of the SSE endpoint shipped the provider's entire raw chat-completion object to the client under `raw`, because only the non-streaming endpoint's `SynthesizeResponse` was doing the filtering. `_done_payload` now projects onto that model's fields **by whitelist**, so a new internal key on the service result never leaks by default. Any future streaming endpoint has the same hole — project explicitly. |
| **Ground truth outside the prompt's taxonomy scores as model failure** | `validation_corpus` carried 12 `COMPONENT` labels; `_NER_PROMPT` requests 10 types and `COMPONENT` is not among them, so the model could never produce one. Those 12 (23% of the corpus) were guaranteed false negatives, **and each also booked a false positive** against whatever in-taxonomy type the model gave the same span — one mismatch punished twice. Reported F1 was 0.6733; excluding them it is 0.7816. `NER_ENTITY_TYPES` in `api/services/ner.py` is now the single source of truth, `test_ner_taxonomy_matches_the_prompt` fails if it drifts from the prompt text, and the gate reports `scored_labels` / `unscoreable_labels` / `unscoreable_by_type`. **Adding an entity type means editing the constant AND the prompt**, and any corpus label outside the constant is silently excluded from the score — check `unscoreable_by_type` before trusting a gate number. |
| **A model-gate score is meaningless without its `validity`** | `NERService.extract_entities` degrades to a regex last resort that only matches `ASSET_TAG`, and it self-reports the path it took in the result's `model` field. Until 2026-08-23 the *worker* gate ignored that, so a run where 52 of 55 calls returned 429/500 was written to history as `passed: true`, F1 0.7317 — the regex's score under the model's name, and **higher** than the model's real 0.6733. `FallbackCountingNER` (`api/services/ner.py`) now wraps the service for both the worker and `run_model_validation.py`, and the run records `validity` / `fallback_extractions` / `extraction_paths`. Two consequences to obey: **a run without `validity: "VALID"` is not a measurement**, and `_latest_valid_baseline` deliberately skips both SUSPECT and pre-2026-08-23 rows, so the first clean run has no baseline and reports `passed: true` by default — that is a fresh-install state, not a pass. Filter validity **in Python**: a PostgREST `.neq("details->>validity","SUSPECT")` matches nothing, because legacy rows have no such key and `NULL != 'x'` is NULL. |
| **The gate re-extracted every document once per asset-class partition** | `evaluate()` built `doc_predictions` locally, so the global pass and each per-class pass extracted the same documents independently — the comment above the partition loop asserted the opposite invariant with nothing enforcing it. Cost: double the model calls, and global vs per-class scores computed from two different extractions that could disagree. A run-scoped `cache` threaded through every `evaluate()` call fixed it: **55 calls → 27, and 3 → 27 reaching the model.** If you add another `evaluate()` call site, pass the same cache or you silently restore the duplication. |
| **A gate run killed by the Celery soft time limit writes nothing at all** | `time_limit=600 / soft_time_limit=540` was calibrated when nearly every NER call failed fast on a 429, making a full run ~2.5 min. Once the calls actually reach the model each costs tens of seconds and a real run takes ~12 min, so two consecutive runs died on `SoftTimeLimitExceeded` with **no history entry** — strictly worse than recording a degraded one. Raised to 1860/1800 on 2026-08-23. Watch this if the corpus grows: the limit tracks `corpus_size × per-call latency`, and the failure mode is silent absence, not an error row. |

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
| Neo4j driver pool settings are load-bearing | `dependencies.py` sets `liveness_check_timeout=30` + `max_connection_lifetime=300`. Aura closes **idle connections** within minutes, and without these a stale pooled connection throws `SessionExpired` → intermittent 500s on every Neo4j endpoint. Don't drop them; the daily keep-alive cron does **not** cover this. **Regression-tested 2026-08-22:** after a 10-minute idle window the four Neo4j-backed endpoints (`/compliance/dashboard`, `/assets/{id}/knowledge`, graph, blast-radius) all recovered with no `SessionExpired` — `run_soak_test.py` phase 3, and the reason that phase runs against **cloud** stores rather than local ones. |

### Feature-specific — endpoints, roles & pages

| Area | Fix |
|---|---|
| Asset knowledge shows duplicate facts | The graph can hold multiple physical `KNOWLEDGE_EDGE` relationships sharing one logical `edge_id` (Cypher `DISTINCT` can't collapse them — separate graph elements). `GraphService.get_asset_knowledge_at` dedupes by the `edge_id` property; the frontend graph fetcher also dedupes. |
| Model-gate run "does nothing" | `POST /governance/model-gate/run` only **enqueues** a Celery task that evaluates the NER model over the whole validation corpus (a NIM call per item) — it runs **~12 min**. `model_name` is optional (defaults to `NVIDIA_NIM_NER_MODEL`). The page shows a "queued" banner, disables the button, polls history every 20s, and auto-refreshes when the run lands. History endpoint returns raw audit rows `{items}` (contract-locked) → `api.ts` `getModelGateHistory` flattens to `{history:[ModelGateResult]}`. |
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
**Tests:** service-free tier **318 passed** across **27 files** (no stack/secrets/network) · frontend **154 passed / 59 files** · full suite **412 passed / 0 failed** (2026-08-22) · incl. `tests/test_contract.py` (response-shape contracts) + `tests/test_model_validation.py` (NER surface-form-overlap matcher) · self-cleans on teardown · Package: `ghcr.io/kr1shnasomani/kairos`

**CI:** `tests.yml` is two tiers — **`unit`** runs the service-free tests (PII, query classification, retrieval fusion, spreadsheet/email ingestion, NER matching, P&ID, auth cache, config, **authz boundary**) with **no secrets and no network**, so it is green on every push and fork PR; **`integration`** runs the full suite against `--profile local-stores` and *skips with exit 0* unless `CI_SUPABASE_*` is set. **Never point CI at the production Supabase / Aura / Qdrant Cloud project** — the suite creates+purges entities and `make init-all` reinitialises schema, so it would corrupt the golden dataset on every push. Use a throwaway Supabase project, and set the secrets with `gh secret set CI_SUPABASE_URL` (etc.) yourself — they are never read from `.env` by any script in this repo. **Recommended: leave tier 2 disabled** — it costs ~20 provider calls per push (Jina embed per `/search`, a synthesis cascade call per synthesize) and exhausting a provider tier makes synthesis silently return no answer, which reads as collapsed answer quality. `frontend.yml` (tsc·eslint·build·audit) passes in full. **`deps-audit.yml`** (added 2026-08-22) is the
per-push dependency check Dependabot cannot provide — `pip-audit` / `npm audit` / `govulncheck` on push
and PR to `main` plus `workflow_dispatch`, path-filtered to the manifests. Its `pip-audit` step carries
a **documented suppression baseline** (see Backlog #2): remove an `--ignore-vuln` line as soon as its
blocker clears, and never add one without a reason on the same line. Two CI facts worth knowing: `lint.yml` needs `pull-requests: read` or `dorny/paths-filter` fails with *"Resource not accessible by integration"* and every lint job silently skips on PRs; and `next/font/google` fetches DM Sans/Geist **from Google at build time**, so a runner that cannot reach fonts.googleapis.com fails the build with `Module not found: @vercel/turbopack-next/internal/font/google/font` — transient, retry it, or self-host via `next/font/local` to remove the class.

> **Ruff is pinned in `lint.yml`, and that is deliberate.** Unpinned, it runs whatever rule set the
> newest release enables — one release once took linting from green to **608 errors on an unchanged
> tree**. Rules live in `backend/ruff.toml` (`E`/`W`/`F`/`I`/**`UP`**, py312, line-length 120); `"UP"`
> is selected, so `Dict`/`List`/`Optional[X]`/`timezone.utc` cannot creep back in place of the PEP
> 585/604 spellings. Bump the pin deliberately, never implicitly, and verify against the **pinned**
> version (0.16.0) — a local 0.15.0 passing proves nothing about CI.

> Run tests **in Docker**, never on the host: `docker compose run --rm --no-deps -e KAIROS_SKIP_TEST_CLEANUP=1 kairos-backend-api pytest tests/<file> -q`.
> Host runs resolve different package versions and produce false failures (`auth.test.ts` / `api.test.ts` fail on host, pass in-container).  
**Release:** `git tag v{version} && git push origin v{version}`
