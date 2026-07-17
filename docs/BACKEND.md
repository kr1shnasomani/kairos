# KAIROS — Backend Reference

> **For AI coding agents:** This document covers every service, worker, data model, and configuration parameter in the KAIROS backend. Read alongside `ARCHITECTURE.md` (layer design), `docs/API.md` (endpoint reference), `docs/INFRA.md` (containers, ports, Redis/Qdrant/ES, observability, dev commands), and `docs/FIXTURES.md` (mock data fallbacks). All 34 implementation tasks are verified complete.

---

## Table of Contents

1. [What KAIROS Does](#1-what-kairos-does)
2. [Repository Layout](#2-repository-layout)
3. [Infrastructure Stack](#3-infrastructure-stack)
4. [FastAPI Application](#4-fastapi-application)
5. [Data Models (Pydantic)](#5-data-models-pydantic)
6. [Services Layer](#6-services-layer)
7. [Temporal Workflows and Activities](#7-temporal-workflows-and-activities)
8. [Celery Workers](#8-celery-workers)
9. [Go OT Connector](#9-go-ot-connector)
10. [Database Schemas](#10-database-schemas)
11. [Configuration Reference](#11-configuration-reference)
12. [Auth and Authorization](#12-auth-and-authorization)
13. [Observability](#13-observability)
14. [Non-Negotiable Rules](#14-non-negotiable-rules)

---

## 1. What KAIROS Does

KAIROS is an **Industrial Operational Intelligence Platform**. It continuously monitors the operational pulse of asset-intensive facilities (oil & gas, power, pharma, steel, mining) and delivers the right knowledge to the right person at the exact moment it is needed — without being asked.

Three-phase architecture:
- **Phase 1 (live):** Retrieval — ingest documents, build a temporal knowledge graph, answer queries with source-cited results.
- **Phase 2 (live):** LLM Synthesis — `POST /search/synthesize` assembles retrieved facts into provenance-backed answers via NVIDIA NIM (cloud-only; the local Ollama fallback is disabled — see §6 `LLMService`).
- **Phase 3 (live):** Proactive Push — event-driven brief delivery to operators (work orders, PTWs, shift handovers, alarms, tag-outs, inspections) via Redis Streams and the EEMUA 191 governor.

---

## 2. Repository Layout

```
kairos/                          # repo root
├── backend/                     # Python app (Docker build context)
│   ├── api/
│   │   ├── main.py                  # FastAPI app factory + lifespan
│   │   ├── config.py                # All settings (pydantic-settings, env vars)
│   │   ├── dependencies.py          # DI: Neo4j, Qdrant, ES, Redis, Supabase, Auth
│   │   ├── middleware/
│   │   │   ├── opa.py               # OPA policy enforcement middleware
│   │   │   └── telemetry.py         # OTEL tracing + metrics setup
│   │   ├── models/                  # Pydantic request/response schemas
│   │   ├── routers/                 # One file per domain layer
│   │   ├── services/                # All business logic (no logic in routers)
│   │   └── utils/
│   │       └── failure_families.py  # Shared FAILURE_FAMILIES dict (recurring detection)
│   ├── workers/
│   │   ├── celery_app.py            # Celery app definition
│   │   ├── attribution.py           # Outcome attribution worker
│   │   ├── brief_assembly.py        # Delayed brief assembly worker
│   │   ├── model_validation.py      # NER model gate evaluation worker
│   │   ├── offboarding.py           # Off-boarding interview question generation worker
│   │   ├── temporal_worker.py       # Temporal activity worker (ingestion pipeline)
│   │   ├── elicitation_worker.py    # Temporal worker (elicitation workflows)
│   │   └── voice_transcription.py   # Groq Whisper transcription + NER Celery task
│   ├── workflows/
│   │   ├── document_pipeline.py     # DocumentIngestionWorkflow + all 7 activities
│   │   └── elicitation_workflow.py  # MicroInterviewWorkflow + question generation (Neo4j + LLM)
│   ├── connectors/                  # Go service — OT historian + EAM sync
│   │   ├── cmd/connector/main.go    # Entry point, all HTTP handlers
│   │   ├── internal/ot/client.go    # PIWebAPIClient + MockHistorianClient
│   │   ├── internal/eam/client.go   # EAM connector interface + SAP stub
│   │   ├── internal/events/relay.go # Redis Stream relay
│   │   └── fixtures/sample_assets.json  # 5 demo assets for EAM sync
│   ├── scripts/
│   │   ├── seed_users.py            # Creates 3 Supabase auth test users
│   │   ├── seed_regulations.py      # Seeds 12 regulations into Neo4j
│   │   ├── init_neo4j.py            # Neo4j schema constraints + indices
│   │   ├── init_qdrant.py           # Qdrant collection creation
│   │   ├── run_model_validation.py  # Entity-extraction F1 vs validation_corpus (Layer-0 model gate)
│   │   ├── seed_validation_corpus.py # Seed NER ground-truth entities from canon (entity-F1 labels)
│   │   ├── load_demo_dataset.py     # Load dataset/ via the real API pipeline; seeds aliases + NER corpus (`make load-dataset`)
│   │   ├── purge_test_data.py       # Delete test-prefixed rows from all stores (`make purge-test-data`)
│   │   └── wipe_local_stores.py     # Empty Neo4j + ES + Qdrant entirely (`make wipe-local` / `reset-local`)
│   └── requirements.txt
├── benchmark/                   # Evaluation harness + evidence (mounted at /app/benchmark)
│   ├── run_benchmark.py         # Retrieval · answer quality · provenance · KG-linkage · time-to-answer (`make benchmark`)
│   ├── verify_layers.py         # Per-layer smoke + latency (`make verify`)
│   ├── questions.json           # 25 domain-expert Q&A across 15 categories (grounded in the dataset canon)
│   └── RESULTS.md               # Raw output of both scripts (methodology → docs/BENCHMARKS.md)
├── db/                          # Database schemas (mounted into Python containers)
│   ├── schema.sql               # Consolidated Supabase schema — single source of truth (001–016 folded in)
│   ├── maintenance/             # Cloud-Supabase reset SQL (reset_all_data.sql) + CHANGELOG.md (tracked runs)
│   └── neo4j/init_schema.cypher # Neo4j constraints + indices
├── fixtures/                    # Shared mock data (mounted into Python containers)
│   └── pid_topology_mock.json
├── infra/                       # Infrastructure configs (one dir per service)
│   ├── grafana/provisioning/    # Grafana datasources + dashboards
│   ├── otel/otel-config.yaml    # OTEL collector config
│   ├── policies/kairos.rego     # OPA RBAC rules
│   ├── tempo/tempo.yaml         # Grafana Tempo config
│   └── temporal/dynamicconfig.yaml
├── frontend/                    # Next.js UI (separate Docker build context)
└── tests/                       # Pytest test suite (mounted into backend-api)
```

---

## 3. Infrastructure Stack

> **Moved to [`docs/INFRA.md`](./INFRA.md).** That file is the single source of truth for all Docker containers, ports, Redis DB allocation, Redis Streams, Qdrant collections, Elasticsearch indices, OTEL pipeline, Grafana dashboards, and dev commands.

---

## 4. FastAPI Application

**Entry point:** `backend/api/main.py`

`create_app()` registers:
1. CORS middleware (`CORS_ORIGINS` from settings)
2. `OPAMiddleware` (enforces write-route RBAC via OPA)
3. OTEL instrumentation (`setup_telemetry(app)`)
4. All routers with prefix/tag

**Lifespan:** On startup, `VectorStoreService.ensure_collections()` and `SearchEngineService.ensure_indices()` create Qdrant collections and ES indices if missing.

### Dependency Injection (`api/dependencies.py`)

All backends are injected as FastAPI dependencies. Each is a singleton (module-level global, lazy-initialized).

| Dependency | Type | Notes |
|------------|------|-------|
| `Neo4jDep` | `AsyncDriver` | Bolt to `NEO4J_URI` |
| `QdrantDep` | `AsyncQdrantClient` | HTTP to `QDRANT_URL` |
| `ElasticsearchDep` | `AsyncElasticsearch` | HTTP to `ELASTICSEARCH_URL` |
| `RedisDep` | `aioredis.Redis` | DB 0 |
| `TemporalDep` | `TemporalClient` | gRPC to `TEMPORAL_ADDRESS` |
| `SupabaseDep` | `Client` | Service-role key — bypasses RLS |
| `CurrentUserDep` | `dict` | Decoded JWT: `{user_id, email, role, site_id, sub}` |
| `SettingsDep` | `Settings` | Cached settings singleton |

**Auth flow in `get_current_user`:**
1. If no `Authorization` header and `APP_DEBUG=True` → returns `{user_id: "dev-user", role: "engineer"}` (dev only).
2. If token matches `INTERNAL_API_KEY` → returns service account `{role: "admin"}` (Go connector bypass).
3. Otherwise → calls `supabase.auth.get_user(token)` using a fresh anon client (never the service-role client). Role extracted from `user.user_metadata.role`.

---

## 5. Data Models (Pydantic)

All models live in `backend/api/models/`.

### Asset (`models/asset.py`)

| Model | Purpose |
|-------|---------|
| `AssetCreate` | `POST /assets` request body |
| `Asset` | Full asset representation |
| `TagAliasMap` | Alias entry from `asset_alias_map` table |
| `AssetHierarchy` | Recursive parent/child tree |

**Key constraint:** `confirmed_by_user_id` is mandatory in `AssetCreate` — AI-inferred identities are never accepted.

### Document (`models/document.py`)

| Model | Purpose |
|-------|---------|
| `VaultDocument` | Full vault record |
| `DocumentStatus` | Extraction job status |
| `ExtractionResult` | NER/OCR result summary |
| `SearchResult` | Single search hit with authority + method |
| `SearchResponse` | Paginated hybrid search response |
| `SynthesizeRequest` | Query + context + optional `query_category` |
| `SynthesizeResponse` | Answer + sources + confidence + `refused` flag |
| `PromoteQuarantineRequest` | Quarantine promotion payload |
| `RCAPackRequest` | `asset_id`, `incident_date`, `failure_code`, `include_quarantine` |
| `RCAPackResponse` | `timeline[]`, `hypotheses[]`, `supporting_documents[]`, `confidence`, `refused`, `synthesis_available` |

### Brief (`models/brief.py`)

| Model | Purpose |
|-------|---------|
| `Brief` | Full brief with headline, body, action_items, warnings, sources |
| `SourceCitation` | `{document_id, document_type, title, authority_level, relevant_excerpt, vault_url, is_quarantine}` |
| `BriefFeedback` | `rating` (`accurate | missing_context | incorrect`) + optional `notes`. No `brief_id` — that comes from the URL path. |

### Event (`models/event.py`)

All events inherit from `BaseEvent` (`event_id`, `source_system`, `site_id`, `occurred_at`, `received_at`).

| Model | Extra Fields | Source |
|-------|-------------|--------|
| `WorkOrderEvent` | `work_order_id`, `asset_id`, `failure_code`, `description`, `priority`, `close_notes` | CMMS/EAM |
| `PTWEvent` | `ptw_id`, `work_area`, `asset_ids[]`, `ptw_type`, `issuing_engineer_id` | PTW system |
| `ShiftHandoverEvent` | `outgoing_shift_lead_id`, `incoming_shift_lead_id`, `handover_time` | Any |
| `AlarmEvent` | `alarm_id`, `asset_id`, `alarm_tag`, `severity`, `acknowledged_by` | DCS |
| `TagOutEvent` | `asset_id`, `tag_out_reason`, `performed_by`, `expected_return_date` | Field |
| `InspectionCompleteEvent` | `asset_id`, `inspection_type`, `result`, `performed_by`, `findings`, `document_id`, `confidence` | Field/QA |
| `EventAck` | `user_id`, `role`, `signature`, `notes` | API client |
| `DeviationFlagEvent` | `asset_id`, `description`, `reported_by`, `affected_topology_path` | Field inspector |
| `DeviationFlagResolveRequest` | `resolution` (`promoted|disputed`), `moc_warranted`, `notes` | Engineer/admin |
| `PlantStateEvent` | `site_id`, `state` (`normal|turnaround|shutdown|emergency`), `expires_at` | Engineer/admin |

`close_notes` on `WorkOrderEvent` is used by the attribution worker for execution compliance keyword matching.

---

## 6. Services Layer

All business logic lives in `backend/api/services/`. Routers call services; services never call routers.

### `GraphService` (`services/graph.py`)

Interface to Neo4j. All writes use `MERGE`, never `CREATE` for asset nodes.

Key methods:
- `create_asset_node(props)` — MERGE Asset node with all properties
- `get_asset(asset_id)` — single asset lookup
- `list_assets(site_id, equipment_class, skip, limit)` — paginated
- `get_asset_hierarchy(asset_id)` — PARENT_OF traversal up to 10 levels
- `get_asset_knowledge_at(asset_id, as_of)` — KNOWLEDGE_EDGE traversal with optional time-travel
- `create_knowledge_edge(asset_id, document_id, rel_type, props)` — writes edge with all 6 required properties. `valid_to` defaults to the open-ended sentinel `_OPEN_VALID_TO` (see below) when not supplied; it is never stored as `null`.
- `merge_document_node(document_id, props)` — MERGE Document node
- `detect_conflict(asset_id, parameter, new_value, new_authority)` — dual-track conflict detection
- `get_blast_radius(document_id)` — graph traversal for downstream impact of a document change
- `close_validity_window(edge_id, closed_at)` — sets `valid_to` on a KNOWLEDGE_EDGE (used by MoC webhook on approval)
- `create_concept_node(props)` — Concept:Regulation seed
- `link_concept_to_asset(concept_id, asset_id, props)` — compliance framework linkage
- `get_event_timeline(asset_id, window_start_iso)` — Event nodes linked to an asset within a date window for RCA pack assembly

**All 6 properties required on every KNOWLEDGE_EDGE write:**
`valid_from`, `valid_to`, `authority_level`, `document_id`, `confidence`, `verification_status`

**`_OPEN_VALID_TO` sentinel (`datetime(9999, 12, 31, 23, 59, 59, tzinfo=timezone.utc)`):**
Neo4j silently drops properties set to `null`. Storing `valid_to=None` would cause the key to disappear from `edge.keys()`, silently violating the six-property rule. Instead, `create_knowledge_edge()` stores `(valid_to or self._OPEN_VALID_TO).isoformat()` — the far-future sentinel signals "currently active / no supersession date" without dropping the property.

**"Active edge" query pattern:**
All Cypher queries that filter for currently-active edges use `(r.valid_to IS NULL OR r.valid_to > datetime())`, not `r.valid_to IS NULL` alone. The `IS NULL` branch covers legacy edges written before the sentinel was introduced; the `> datetime()` branch covers all new sentinel edges. Affected files: `graph.py` (`detect_conflict`, `close_validity_windows`), `compliance.py` (3 call sites), `brief_engine.py`, `offboarding.py`, `elicitation_workflow.py`.

### `SearchService` (`services/search_service.py`)

Orchestrates hybrid search across three engines in parallel.

`hybrid_search(query, collection, asset_id, authority_min, include_quarantine, as_of, limit)`:
1. **ES exact search** — tag numbers, document IDs, clause refs
2. **Qdrant semantic search** — 1024-dim embedding via `LLMService.embed()`
3. **Neo4j graph traversal** — only when `asset_id` provided

Results merged and authority-ranked: level 1 (Regulatory) > level 5 (Field).

### `SearchEngineService` (`services/search_engine.py`)

Wraps Elasticsearch.
- `ensure_indices()` — creates `kairos_documents`, `kairos_assets`, and `kairos_events` indices on startup
- `search_documents(query, asset_id, limit)` — ES full-text search with highlight
- `index_document(doc_id, content, metadata)` — index a document chunk

### `VectorStoreService` (`services/vector_store.py`)

Wraps Qdrant.
- `ensure_collections()` — creates `kairos_documents` and `kairos_knowledge` on startup
- `upsert_point(collection, point_id, vector, payload)` — upsert a single vector
- `search(collection, query_vector, asset_id, limit)` — ANN search with optional asset filter

### `LLMService` (`services/llm.py`)

LLM synthesis + embedding. Never originates knowledge — only assembles retrieved context.

- `synthesize(query, context, query_category)` — NIM `meta/llama-3.1-70b-instruct`
- `rca_synthesize(query, context)` — RCA-specific prompt, returns timeline + hypotheses
- `embed(text, task)` — Jina `jina-embeddings-v3` (1024-dim)
- `parse_synthesis_response(answer)` — extracts structured fields from LLM output
- `parse_rca_response(answer)` — extracts `hypothesis|evidence_weight|sources` lines

> **Provider cascade (`_synthesize_cascade`): NIM → Gemini → Ollama.** Each tier is tried only if
> configured and falls through to the next on failure (a NIM timeout counts as failure → auto-falls to
> Gemini). Defaults ship with **only `NVIDIA_NIM_API_KEY` set, so it is NIM-only** — identical to before.
> Fill `GEMINI_API_KEY` (Google's OpenAI-compatible endpoint, `_synthesize_gemini`) to add a generous
> free-tier cloud fallback; set `OLLAMA_BASE_URL` to add the local air-gapped tier (intentionally empty by
> default — an accidental local Ollama once consumed ~6 GB RAM). Embeddings stay Jina → Ollama.

**Safety-critical categories** (explicit refusal when evidence confidence < 0.7):
`max_allowable_pressure`, `isolation_interlock_sequence`, `torque_specification`, `electrical_rating`, `pressure_relief_setting`, `safety_shutdown_setpoint`

### `BriefEngine` (`services/brief_engine.py`)

Assembles operator briefs from 5 parallel graph+vector+ES+Supabase queries.

- `assemble_work_order_brief(event)` — pulls failure history, open conflicts, procedures, quarantine flags; appends correlated DCS alarms / PTW context
- `assemble_ptw_brief(event)` — adds isolation topology, regulatory requirements; revokes any pending WO brief task for the same asset
- `assemble_shift_handover_brief(event)` — pulls active WOs, alarms, open PTWs
- `assemble_recurring_failure_brief(event)` — triggered when same-family WO detected in 90-day window; priority=high headline includes recurrence count
- `assemble_tag_out_brief(event)` — pulls downstream topology dependencies for the tagged-out asset
- `assemble_inspection_brief(event)` — triggered on `result=failed` or non-empty `findings`; includes finding text and referenced document
- `deliver(brief, redis)` — saves to `briefs` table, publishes to `REDIS_STREAM_BRIEFS`, records `kairos.briefs.delivered` metric. 4-hour asset cool-down.
- `_get_correlated_events(event_id)` — fetches all events sharing the same `compound_event_id` via Supabase

### `EventBusService` (`services/event_bus.py`)

Redis Streams producer + EEMUA 191 push governor.

- `publish(stream, payload)` — `XADD` to any stream
- `publish_work_order(payload)` / `publish_ptw(payload)` — typed publish helpers
- `is_duplicate(asset_id, event_type)` — Redis TTL key check (`DEDUP_WINDOW_MINUTES` window)
- `correlate_events(asset_id, event_id, occurred_at, supabase)` — assigns shared `compound_event_id` to same-asset events within the dedup window
- `check_governor(user_id, priority, site_id, supabase)` — returns True if brief can be sent. PTW (`priority="critical"`) always passes. Checks plant state gate then hourly rolling counter.
- `get_plant_state(site_id, supabase)` — queries `plant_operating_states`, checks `expires_at`
- `record_push(user_id)` — increments hourly counter with 3600s TTL
- `get_governor_state(user_id)` — returns `{state, push_count_last_hour, ceiling, next_delivery_allowed_at}`

### `SLAService` (`services/sla_service.py`)

Lazy, inline SLA escalation. Called at the top of `GET /governance/conflicts` and `GET /governance/quarantine`. No Celery Beat, no scheduled worker.

- `check_and_escalate(supabase)` — idempotent (guarded by `escalated_at IS NULL`). Queries overdue conflicts (`sla_deadline < NOW()`) and quarantine items (`sla_due_at < NOW()`). Writes `escalated_at` and appends `audit_log` entry with `action=sla_escalated` for each. Returns `{conflicts_escalated, quarantine_escalated, checked_at}`.

### `CircuitBreakerService` (`services/circuit_breaker.py`)

SPC circuit breaker: halts graph writes for an **asset class** when its 7-day override-count z-score exceeds 2.0.

- `check(asset_class)` — returns `{halted: bool, z_score: float, reason: str, override_count_7d: int}`. `reason` ∈ `z_score_exceeded | within_normal_range | stats_error`.
- `record_override(asset_class, override_type, document_id)` — inserts an `extraction_overrides` row for SPC tracking.
- `get_all_states()` — returns one state dict per distinct `asset_class` that has override records (each carries `asset_class` + the `check()` fields). `GET /governance/circuit-breaker` wraps these as `{states[], halted_count}`.

### `NERService` (`services/ner.py`)

Named entity recognition for the extraction pipeline. Cloud-first: NIM primary, then a regex last resort. (A local Ollama tier exists in code but is disabled — `OLLAMA_BASE_URL` is empty; see §6 `LLMService`.)

- `extract_entities(text, document_type)` — tries NIM `mistralai/ministral-14b-instruct-2512`; falls back to regex ASSET_TAG pattern matching (Ollama tier skipped while `OLLAMA_BASE_URL` is empty). Returns `[(entity, entity_type, confidence)]`

### `OCRService` (`services/ocr.py`)

OCR for the extraction pipeline. Cloud-first for scanned documents; zero-API-cost fast path for native digital PDFs.

- `extract_text(file_bytes, mime_type)` — **Fast paths:** plain text (`text/plain`) decoded directly as UTF-8; digital PDFs via PyMuPDF native extraction. **Cloud path:** `nvidia/nemotron-ocr-v2` for scanned documents and images.

> **Important:** The OCR model uses the NVIDIA CV API (`https://ai.api.nvidia.com/v1/cv/<model>`), NOT the chat completions endpoint (`integrate.api.nvidia.com`). Request format uses `"input": [{"type": "image_url", "url": "data:..."}]`. Response format is `{"data": [{"text_detections": [{"label": "..."}]}]}`. Inline image limit: 180KB base64 — larger pages are skipped (assets API needed). Pages are rasterized at 96 DPI to stay under this limit.

### `PIDService` (`services/pid.py`)

**Layer 3, Path B** — P&ID engineering-drawing topology extraction via a cloud vision model. Vision-*understanding*, not OCR (OCR destroys the drawing's connections).

- `extract_topology(file_bytes, mime_type) -> dict | None` — rasterizes the drawing (150 DPI for PDFs), downscales to fit the inline size cap (Pillow), sends it to NIM `meta/llama-3.2-11b-vision-instruct` (chat completions, OpenAI-style `image_url` content) with a schema-locked prompt, and parses the returned topology JSON (`equipment_nodes`, `isolation_valves`, `instrumentation_loops`, `isolation_boundaries`). Returns `None` on any failure so the pipeline falls back to the demo fixture.
- Wired into `run_ocr` for `document_type='pid_drawing'`. The result carries `topology_source` (`vision_model` | `demo_fixture`) through the manifest and `GET /documents/{id}/topology` so a fixture never masquerades as a real extraction. Every element still routes to element-by-element engineer verification (Layer 7).
- **Path A** (custom YOLOv9 + LayoutLMv3 on GPU) is the documented future upgrade — see `ARCHITECTURE.md` Layer 3.

### `metrics` (`services/metrics.py`)

OTEL custom metric instruments. All no-ops when `MeterProvider` is not configured.

| Instrument | Type | Labels |
|-----------|------|--------|
| `kairos.briefs.delivered` | Counter | `priority`, `trigger_event_type` |
| `kairos.governor.suppressed` | Counter | `user_id` |
| `kairos.ingestion.duration` | Histogram (seconds) | `document_type` |
| `kairos.conflicts.open` | UpDownCounter | `track` |

---

## 7. Temporal Workflows and Activities

### DocumentIngestionWorkflow (`workflows/document_pipeline.py`)

Task queue: `kairos-ingestion`. Triggered by `POST /documents/ingest`.

Seven sequential activities:

| Activity | What it does | Output |
|---------|-------------|--------|
| `store_in_vault` | Downloads from Supabase Storage, computes SHA-256, sets `pipeline_stage=ocr_pending` | `vault_path` |
| `run_ocr` | PyMuPDF text extraction (fast path for digital PDFs) or NIM OCR | `text`, `confidence` |
| `run_ner` | NER on extracted text → named entities | `entities[]` |
| `link_to_graph` | MERGE Document node in Neo4j, MERGE Asset nodes, circuit breaker pre-flight, create KNOWLEDGE_EDGE for each entity | `edge_count` |
| `index_vectors` | Jina embed + Qdrant upsert (1024-dim) | `point_id` |
| `index_text` | Elasticsearch index for full-text retrieval | `es_doc_id` |
| `mark_complete` | Updates `extraction_jobs.pipeline_stage=complete`, computes timestamp drift | — |

`index_vectors` and `index_text` run in parallel.

**Timestamp drift detection** (in `mark_complete`): if `occurred_at` supplied at ingest and drift from `ingested_at` exceeds `TIMESTAMP_DRIFT_TOLERANCE_MINUTES`, sets `extraction_jobs.timestamp_drift_detected=True` and writes `audit_log` entry with `action=timestamp_drift_detected`. KNOWLEDGE_EDGE `valid_from` uses `ingested_at` on drift.

**vault_path safety**: workflow gracefully exits with `{"status": "failed", "reason": "missing vault_path"}` if `vault_path` is absent from params (guards against stale workflow history replays).

### MicroInterviewWorkflow (`workflows/elicitation_workflow.py`)

Task queue: `kairos-elicitation`. Triggered by `POST /elicitation/trigger`.

1. Queries Neo4j for gap-filling questions (failure code + asset context)
2. Calls LLM to generate 3–7 targeted questions
3. Saves session to `elicitation_sessions` with `status=questions_ready`
4. Waits for `StoreElicitationResponseWorkflow` signal

### StoreElicitationResponseWorkflow

Triggered by `POST /elicitation/{work_order_id}/responses`. Stores Q&A pairs as a `quarantine_items` row for human review before graph promotion.

---

## 8. Celery Workers

App defined in `workers/celery_app.py`. Broker and result backend: `redis://kairos-redis:6379/1`.

Six queues: `ingestion`, `extraction`, `attribution`, `transcription`, `elicitation`, `validation`.

All workers use **lazy imports** inside the task body (never at module level) to avoid Celery fork-time conflicts.

### Brief Assembly Worker (`workers/brief_assembly.py`)

Task: `workers.brief_assembly.assemble_brief(event_type, event_dict)` on the `ingestion` queue.

Supported `event_type` values and their brief assemblers:
- `work_order_created` → `assemble_work_order_brief`
- `shift_handover_created` → `assemble_shift_handover_brief`
- `ptw_created` → `assemble_ptw_brief`
- `equipment_tag_out` → `assemble_tag_out_brief`
- `inspection_complete` → `assemble_inspection_brief`
- `recurring_failure_detected` → `assemble_recurring_failure_brief`

Triggered with `apply_async(countdown=LATE_ARRIVAL_WINDOW_MINUTES*60)` for WO, tag-out, and shift-handover events. PTW and inspection (failed/findings) briefs are immediate.

**Redis pending key:** `kairos:brief_pending:{asset_id}` — stores the Celery task ID so a subsequent PTW or tag-out event for the same asset can revoke the pending WO brief task.

### Attribution Worker (`workers/attribution.py`)

Task: `workers.attribution.evaluate_outcome(event_id, asset_id)`

Triggered from `POST /events/work-order` when `count(WO for same asset in last 30 days) > 1`.

Three independent checks — **all must pass** for `genuine_failure=True`:

| Check | What it does | Passes when |
|-------|-------------|------------|
| `_check_telemetry_baseline` | Calls Go connector `/ot/coverage` then `/ot/query`. Splits data baseline/post halves. Computes 2σ deviation. | `abs(post_mean - baseline_mean) > 2σ` |
| `_check_failure_code_match` | Queries last 5 WOs for asset. Maps failure codes to families via `FAILURE_FAMILIES`. | Same family in both current and prior WO |
| `_check_execution_compliance` | Reads `close_notes` from WO payload. Keyword match against action verbs. | At least one action keyword found |

Failure families in `api/utils/failure_families.py`: `mechanical`, `seal`, `electrical`, `process`. If `genuine_failure=True`: writes `attribution_flag` to `audit_log`. No automatic confidence adjustment.

### Voice Transcription Worker (`workers/voice_transcription.py`)

Task: `workers.voice_transcription.transcribe_voice_note(work_order_id, storage_path, sha256, submitted_by, filename)` on the `transcription` queue.

1. Downloads audio from Supabase Storage
2. Sends to Groq `whisper-large-v3` for transcription
3. Runs NER on transcript
4. Inserts into `quarantine_items` with `input_type=voice_note` and `session_context={sha256, vault_path, ...}`

### Off-Boarding Worker (`workers/offboarding.py`)

Task: `workers.offboarding.generate_offboarding_questions(item_id)` on the `elicitation` queue.

Triggered by `POST /elicitation/offboarding` — one task per equipment family session item, scheduled at the item's `scheduled_for` time.

1. Fetches session item from `offboarding_session_items`
2. Queries Neo4j for equipment family knowledge gaps
3. Calls LLM with offboarding-specific prompt to generate 5–8 questions
4. Falls back to 5 generic questions if LLM is unavailable
5. Updates item `status=questions_ready` and saves questions to `offboarding_session_items.questions`

### Model Validation Worker (`workers/model_validation.py`)

Task: `workers.model_validation.run_model_gate(model_name)` on the `validation` queue.

Triggered by `POST /governance/model-gate/run` (admin only).

1. Loads validation corpus from `validation_corpus` table
2. Runs NER extraction using the specified model on each corpus sample
3. Computes precision, recall, F1 per entity type
4. Retrieves incumbent baseline F1 from most recent passing `model_gate_result` in `audit_log`
5. If F1 ≥ baseline (or no baseline): gate_passed=True
6. Writes result to `audit_log` with `action=model_gate_result`

---

## 9. Go OT Connector

Service: `kairos-backend-go` at `http://kairos-backend-go:8090`.

Source: `backend/connectors/cmd/connector/main.go`.

### Endpoints

| Method | Path | What it does |
|--------|------|-------------|
| `GET` | `/health` | Liveness probe |
| `GET` | `/ot/query` | Query historian. Uses `PIWebAPIClient` if `PI_WEBAPI_BASE_URL` set, else `MockHistorianClient` (50 sine-wave vibration points, mean≈1.8 mm/s). |
| `GET` | `/ot/coverage/:asset_id` | Checks FastAPI `GET /assets/{id}/knowledge` for fact count. Returns `source=knowledge_graph` if asset is in graph, else mock 75% coverage. |
| `POST` | `/eam/sync` | Reads `fixtures/sample_assets.json` if `EAM_ODS_ENDPOINT` not set. POSTs each asset to FastAPI `POST /assets` using `INTERNAL_API_KEY`. |
| `POST` | `/eam/work-order` | Proxies incoming JSON body to FastAPI `POST /events/work-order`. |

> **External systems — mock by design.** The OT historian (PI Web API) and EAM sync
> (SAP/Maximo) integrate with **plant enterprise systems KAIROS does not own**. With no
> live plant to connect to, they run on mock/fixture data by design — the intended state,
> not a gap. The real paths exist (`PIWebAPIClient` built; SAP ODS + OPC-UA are stubs) and
> would activate via `PI_WEBAPI_BASE_URL` / `EAM_ODS_ENDPOINT` if a plant were ever
> connected. Completion status for every layer: [`docs/implementation/status.md`](./implementation/status.md).

### PI Web API Client (`internal/ot/client.go`)

When `PI_WEBAPI_BASE_URL` is configured:
1. `GET {baseURL}/search?q={tag}` → resolves `WebID`
2. `GET {baseURL}/streams/{webId}/recorded?startTime={from}&endTime={to}` → time series

Basic Auth via `PI_WEBAPI_USERNAME` / `PI_WEBAPI_PASSWORD`.

---

## 10. Database Schemas

### Supabase PostgreSQL (single source of truth: `db/schema.sql`)

All 16 historical migrations (001–016) are folded into `db/schema.sql` — apply that one file to a fresh database. The live applied history is tracked by Supabase itself in `supabase_migrations.schema_migrations`. The tables:

| Table | Purpose | Key Columns |
|-------|---------|-------------|
| `assets` | MDM backbone — mirrors Neo4j for relational queries | `asset_id` (PK), `criticality`, `eam_source`, `identity_confirmed_by` |
| `asset_alias_map` | Tag alias resolution | `canonical_asset_id`, `alias`, `confidence`, `confirmed` |
| `documents` | Immutable vault registry | `document_id`, `sha256_hash` (UNIQUE), `authority_level`, `vault_url`, `status`, `occurred_at` (TIMESTAMPTZ for timestamp drift) |
| `document_asset_links` | Document↔Asset many-to-many | `document_id`, `asset_id` |
| `extraction_jobs` | Pipeline stage tracking | `job_id`, `document_id`, `pipeline_stage`, `ocr_confidence`, `entity_count`, `timestamp_drift_detected` (BOOLEAN) |
| `operational_events` | Event log (WO, PTW, alarm, handover, tag-out, inspection, deviation-flag) | `event_id`, `event_type`, `event_subtype`, `asset_id`, `payload` (JSONB), `redis_stream_id`, `compound_event_id` (UUID) |
| `briefs` | Delivered operator briefs | `brief_id`, `recipient_user_id`, `priority`, `headline`, `body`, `sources` (JSONB), `requires_countersignature`, `delivery_frozen` (BOOLEAN) |
| `brief_feedback` | Operator feedback on brief accuracy | `brief_id`, `rating` (`accurate\|missing_context\|incorrect`), `notes`, `submitted_by` |
| `knowledge_conflicts` | Dual-track governance conflicts | `conflict_id`, `track`, `parameter`, `source_a/b`, `severity`, `status`, `sla_deadline`, `escalated_at`, `escalated_to` |
| `quarantine_items` | Unverified facts pending human review | `item_id`, `asset_id`, `review_status`, `input_type`, `session_context` (JSONB), `sla_due_at` (DEFAULT NOW()+5d), `escalated_at` |
| `moc_items` | Management of Change records | `moc_id`, `conflict_id`, `asset_id`, `description`, `status`, `approved_by`, `approved_at` |
| `audit_log` | Immutable audit trail | `action`, `entity_type`, `entity_id`, `performed_by`, `details` (JSONB), `timestamp` (NOT `created_at`) |
| `elicitation_sessions` | Micro-interview Q&A sessions | `session_id`, `work_order_id`, `questions` (JSONB), `status` |
| `ner_annotations` | Human NER correction annotations | `annotation_id`, `document_id`, `entity_type`, `original_value`, `corrected_value`, `is_correct`, `submitted_by` |
| `knowledge_conflict_overrides` | Circuit breaker override log | `id`, `entity_type`, `override_type`, `document_id`, `recorded_at` |
| `plant_operating_states` | Site plant state history | `id`, `site_id`, `state` (CHECK: `normal\|turnaround\|shutdown\|emergency`), `set_by`, `set_at`, `expires_at` |
| `offboarding_sessions` | Off-boarding interview programme headers | `id`, `personnel_id`, `personnel_email`, `retirement_date`, `total_sessions`, `session_interval_days`, `status`, `created_by` |
| `offboarding_session_items` | Individual session items per equipment family | `id`, `session_id`, `session_number`, `equipment_family`, `status`, `questions` (JSONB), `scheduled_for`, `completed_at` |
| `validation_corpus` | Ground-truth NER samples for model gate | `id`, `entity_type`, `text`, `expected_entities` (JSONB), `authority`, `created_at` |

**`quarantine_items.input_type` CHECK constraint** allowed values (migration 013):
`field_observation`, `voice_note`, `elicitation_response`, `deviation_flag`, `offboarding_response`

**`audit_log` uses `timestamp` column, not `created_at`.**

**RLS policies (migration 004):**
- `briefs` — service-role key bypasses; user JWTs see only own rows
- `quarantine_items` — read-only for field_worker role

### Neo4j Graph Schema (`db/neo4j/init_schema.cypher`)

**Node labels:** `Asset`, `Document`, `Event`, `Person`, `Concept`, `Organisation`

**Relationship types:**
- `KNOWLEDGE_EDGE` — primary knowledge relationship, carries all 6 temporal properties
- `PARENT_OF` — asset hierarchy (parent → child)
- `LINKED_TO` — document↔asset link
- `MENTIONS` — event references asset
- `RESOLVED_BY` — conflict resolution link
- `INSPECTION_RECORD` — inspection result linked to asset

**Required KNOWLEDGE_EDGE properties (all 6, every write):**

| Property | Type | Semantics |
|----------|------|-----------|
| `valid_from` | ISO8601 datetime | When this fact became valid |
| `valid_to` | ISO8601 datetime or null | When it was superseded (null = current) |
| `authority_level` | int 1–5 | 1=Regulatory, 2=Engineering, 3=OEM, 4=Procedure, 5=Field |
| `document_id` | string | Source document in the vault |
| `confidence` | float 0–1 | NER extraction confidence |
| `verification_status` | string | `verified`, `unverified`, `disputed` |

---

## 11. Configuration Reference

All settings in `api/config.py` via `pydantic-settings`. Source: `.env` file.

### App

| Key | Default | Description |
|-----|---------|-------------|
| `APP_ENV` | `development` | `development \| test \| production` |
| `APP_DEBUG` | `True` | Enables dev auth bypass (no token required) |
| `APP_VERSION` | `0.1.0` | Included in health response |
| `APP_SECRET_KEY` | `CHANGE_ME_IN_PRODUCTION` | Change in prod |
| `CORS_ORIGINS` | `["http://localhost:3000","http://localhost:8000"]` | Allowed origins |
| `INTERNAL_API_KEY` | `kairos-internal-dev-key` | Service-to-service auth token |

### Supabase

| Key | Description |
|-----|-------------|
| `SUPABASE_URL` | Project URL |
| `SUPABASE_ANON_KEY` | Anon key (used for auth verification only) |
| `SUPABASE_SERVICE_ROLE_KEY` | Service role key (bypasses RLS — backend only) |
| `SUPABASE_JWT_SECRET` | JWT secret for ES256 token verification |
| `SUPABASE_STORAGE_BUCKET` | `kairos-vault` |

> **Critical:** Never use the service-role key for `auth.sign_in_with_password()` or `auth.get_user()`. Always use a fresh `create_client(url, ANON_KEY)` for auth operations.

### Neo4j

| Key | Default |
|-----|---------|
| `NEO4J_URI` | `bolt://localhost:7687` |
| `NEO4J_USERNAME` | `neo4j` |
| `NEO4J_PASSWORD` | `kairos_dev_password` |
| `NEO4J_DATABASE` | `neo4j` |

### Qdrant

| Key | Default |
|-----|---------|
| `QDRANT_URL` | `http://localhost:6333` |
| `QDRANT_COLLECTION_KNOWLEDGE` | `kairos_knowledge` |
| `QDRANT_COLLECTION_DOCUMENTS` | `kairos_documents` |

### Elasticsearch

| Key | Default |
|-----|---------|
| `ELASTICSEARCH_URL` | `http://localhost:9200` |
| `ELASTICSEARCH_INDEX_ASSETS` | `kairos_assets` |
| `ELASTICSEARCH_INDEX_DOCUMENTS` | `kairos_documents` |
| `ELASTICSEARCH_INDEX_EVENTS` | `kairos_events` |

### Redis

| Key | Default |
|-----|---------|
| `REDIS_URL` | `redis://localhost:6379` |
| `REDIS_DB_CACHE` | `0` |
| `REDIS_DB_CELERY` | `1` |
| `REDIS_DB_STREAMS` | `2` |
| `REDIS_STREAM_BRIEFS` | `kairos:events:briefs` |
| `REDIS_STREAM_WORK_ORDERS` | `kairos:events:work_orders` |
| `REDIS_STREAM_TAG_OUT` | `kairos:events:tag_out` |
| `REDIS_STREAM_INSPECTIONS` | `kairos:events:inspections` |

> **Docker note:** Inside containers, `localhost` is not the Redis host. `docker-compose.yml` explicitly sets `REDIS_URL=redis://kairos-redis:6379/0` and `CELERY_BROKER_URL=redis://kairos-redis:6379/1`.

### LLM

| Key | Default | Description |
|-----|---------|-------------|
| `NVIDIA_NIM_API_KEY` | `""` | Required for NIM synthesis, NER, and OCR |
| `NVIDIA_NIM_MODEL` | `meta/llama-3.1-70b-instruct` | LLM synthesis |
| `NVIDIA_NIM_NER_MODEL` | `mistralai/ministral-14b-instruct-2512` | NER extraction |
| `NVIDIA_NIM_OCR_MODEL` | `nvidia/nemotron-ocr-v2` | OCR for scanned docs/images |
| `NVIDIA_NIM_VISION_MODEL` | `meta/llama-3.2-11b-vision-instruct` | P&ID drawing → topology JSON (Layer 3, Path B) |
| `NVIDIA_NIM_MAX_TOKENS` | `4096` | Set to `512` to avoid ReadTimeout |
| `JINA_API_KEY` | `""` | Required for Jina embeddings |
| `JINA_EMBED_MODEL` | `jina-embeddings-v3` | 1024-dim output, primary embeddings |
| `GROQ_API_KEY` | `""` | Required for voice transcription |
| `GROQ_WHISPER_MODEL` | `whisper-large-v3` | STT via Groq API |
| `GEMINI_API_KEY` | `""` | Optional LLM fallback (Google OpenAI-compatible). Empty ⇒ disabled; cascade stays NIM-only. |
| `GEMINI_BASE_URL` | `https://generativelanguage.googleapis.com/v1beta/openai` | Gemini OpenAI-compatible endpoint |
| `GEMINI_MODEL` | `gemini-2.5-flash-lite` | Gemini fallback model (15 RPM / 1000 RPD free tier) |
| `OLLAMA_BASE_URL` | **`""` (empty in `.env`)** | Local fallback LLM/NER/embeddings — **disabled**: empty URL ⇒ `ollama_available` is False, so all inference stays cloud-only. Set a URL only to re-enable the local path. |
| `OLLAMA_MODEL` | `qwen2.5:14b` | Fallback synthesis model (unused while `OLLAMA_BASE_URL` empty) |
| `OLLAMA_NER_MODEL` | `llama3.1:8b` | Fallback NER model (unused while `OLLAMA_BASE_URL` empty) |
| `OLLAMA_EMBED_MODEL` | `nomic-embed-text` | Fallback embedding model (unused while `OLLAMA_BASE_URL` empty) |

### Temporal

| Key | Default |
|-----|---------|
| `TEMPORAL_ADDRESS` | `localhost:7233` |
| `TEMPORAL_TASK_QUEUE` | `kairos-ingestion` |
| `TEMPORAL_TASK_QUEUE_ELICITATION` | `kairos-elicitation` |

### EEMUA 191 Governor

| Key | Default | Description |
|-----|---------|-------------|
| `MAX_PUSH_PER_USER_PER_HOUR` | `6` | Hard ceiling per operator |
| `BRIEF_COOLDOWN_HOURS` | `4` | Same (recipient, asset) cool-down |
| `DEDUP_WINDOW_MINUTES` | `10` | Event dedup window + event correlation window |
| `LATE_ARRIVAL_WINDOW_MINUTES` | `5` | Countdown before delayed brief assembly fires |
| `PLANT_STATE_DEFAULT` | `normal` | Fallback plant state |
| `TIMESTAMP_DRIFT_TOLERANCE_MINUTES` | `60` | Max drift before flagging |

### Go Connector

| Key | Default |
|-----|---------|
| `GO_CONNECTOR_PORT` | `8090` |
| `PI_WEBAPI_BASE_URL` | `""` (uses mock when empty) |
| `PI_WEBAPI_USERNAME` | `""` |
| `PI_WEBAPI_PASSWORD` | `""` |
| `EAM_ODS_ENDPOINT` | `""` (uses fixture when empty) |
| `FASTAPI_URL` | `http://kairos-backend-api:8000` |
| `INTERNAL_API_KEY` | `kairos-internal-dev-key` |
| `EAM_FIXTURE_PATH` | `/app/fixtures/sample_assets.json` |

### OpenTelemetry

| Key | Default |
|-----|---------|
| `OTEL_EXPORTER_OTLP_ENDPOINT` | `http://localhost:4317` |
| `OTEL_SERVICE_NAME` | `kairos-api` |

---

## 12. Auth and Authorization

### JWT Flow (Supabase Auth)

1. Client calls `POST /auth/login` → gets `access_token` (ES256 JWT)
2. Client includes `Authorization: Bearer <access_token>` on all requests
3. `get_current_user` calls `supabase.auth.get_user(token)` using a fresh anon client
4. Role extracted from `user.user_metadata.role` (not the top-level `role` field)

### Test Users

Created by `docker exec kairos-backend-api python scripts/seed_users.py`.

| Email | Password | Role |
|-------|----------|------|
| `admin@kairos.local` | `KairosAdmin123!` | `admin` |
| `engineer@kairos.local` | `KairosEngineer123!` | `engineer` |
| `field_worker@kairos.local` | `KairosField123!` | `field_worker` |

### Role Permissions (OPA Policy `policies/kairos.rego`)

| Role | Permissions |
|------|-------------|
| `field_worker` | `read_search`, `read_briefs`, `ack_brief` |
| `engineer` | All above + `ingest_document`, `read_governance`, `resolve_admin_conflict`, `read_assets`, `write_assets`, `start_offboarding` |
| `reliability` | `read_search`, `read_briefs`, `ingest_document`, `read_governance`, `promote_quarantine`, `resolve_admin_conflict`, `read_assets` |
| `compliance` | `read_search`, `read_compliance`, `read_audit` |
| `admin` | `*` (all) |

### OPA Middleware

`OPAMiddleware` in `api/middleware/opa.py` intercepts all `POST/PUT/PATCH/DELETE` requests (except `/health`, `/auth`, `/docs`). Maps route prefix to OPA action name, calls `http://kairos-opa:8181/v1/data/kairos/authz/allow`. 403 if denied.

### Rate-limit Middleware

`RateLimitMiddleware` in `api/middleware/ratelimit.py` (outermost) caps requests per client IP using a Redis fixed-window counter (`RATE_LIMIT_PER_MINUTE`, default 120). **Enforced only when `APP_ENV=production`** (0 = off in dev/test so bursts never trip it). Fails open if Redis is unreachable; `/health*` exempt. Trusts the first `X-Forwarded-For` hop (behind Caddy). Pairs with the `MAX_UPLOAD_MB` (25) cap on `/documents/ingest` — both are public-exposure abuse guards.

### Internal Service Auth

Go connector and service-to-service calls use `Authorization: Bearer <INTERNAL_API_KEY>`. `get_current_user` recognizes this and returns a service admin account without calling Supabase.

---

## 13. Observability

### Pipeline, metrics & dashboards

> **Moved to [`docs/INFRA.md`](./INFRA.md) §6–7** — the OTEL trace/metric pipeline, the custom Prometheus
> metrics table (`kairos_briefs_delivered_total`, `kairos_governor_suppressed_total`,
> `kairos_ingestion_duration_seconds`, `kairos_conflicts_open`), and the Grafana dashboards/credentials.

App-level instrumentation: `FastAPIInstrumentor`, `RedisInstrumentor`, `HTTPXClientInstrumentor` are set up
in `api/middleware/telemetry.py` (`setup_telemetry(app)`), called from `create_app()`.

### Structured Logging

All logs via `structlog`. Never use `print()` or stdlib `logging`. Notable log events:
- `governor.suppressed` — user_id, count, ceiling
- `governor.plant_state_suppression` — user_id, site_id, plant_state
- `brief_engine.delivered` — brief_id, recipient, priority
- `attribution.complete` — event_id, asset_id, genuine_failure, action
- `ingest.complete` — document_id, sha256, job_id
- `event_bus.compound_event_linked` — compound_event_id, event_ids
- `events.ptw_revoked_pending_brief` — asset_id, revoked task ID
- `timestamp_drift_detected` — document_id, drift_minutes
- `rca_pack.generated` — asset_id, failure_code, timeline_count
- `document_pipeline.missing_vault_path` — document_id (graceful early exit)
- `offboarding.programme_created` — session_id, personnel_id, sessions

---

## 14. Non-Negotiable Rules

These apply to every code change in this codebase. Violations are bugs.

1. **All 6 KNOWLEDGE_EDGE properties on every write:** `valid_from`, `valid_to`, `authority_level`, `document_id`, `confidence`, `verification_status`

2. **Vault is permanent.** Never delete. Never overwrite. Supersede by closing `valid_to`. Supabase Storage objects are immutable.

3. **Quarantine is a one-way gate.** `confidence < 0.7` or unresolved entity → `quarantine_items`. Human action only to promote. No auto-promotion ever.

4. **Asset nodes:** `MERGE (a:Asset {asset_id: $id}) SET a += $props` — never `CREATE`.

5. **Authority pre-filter before graph traversal.** Always: `WHERE r.authority_level <= $max_level AND r.valid_from <= $as_of`

6. **Safety-critical parameter queries** — explicit refusal when confidence < 0.7. Never hedge. Return sources directly.

7. **Phase discipline.** Phase 2 LLM synthesis lives only in `POST /search/synthesize`. Never auto-triggered from routers or workers.

8. **EEMUA 191 Governor.** Call `EventBusService.check_governor(user_id)` before every brief delivery. PTW (`priority="critical"`) always exempt.

9. **Secrets via env vars.** All config through `api/config.py` Settings. Never hardcode.

10. **OT data is ephemeral.** Query historian data in memory, reason with it, discard. Never store time-series in KAIROS.

11. **structlog only.** Never `print()`, never `import logging`. `workflow.logger` in Temporal is a stdlib logger — use f-strings for message formatting, not keyword args.

12. **Supabase client hygiene.** Never call `auth.sign_in_with_password()` or `auth.get_user()` on the global service-role client. Use a fresh `create_client(url, ANON_KEY)`.

13. **Docker is the only runtime.** No `python` or `pip install` outside containers. Hot-reload is active — edits apply immediately. Rebuild only when new pip deps are added.

14. **Lazy imports in Celery workers.** Import `api.services.*` inside the task body, never at module level. Add `sys.path.insert(0, "/app")` at the top of each worker file.

---

> **Dev commands and service URLs moved to [`docs/INFRA.md`](./INFRA.md) — Section 9.**
