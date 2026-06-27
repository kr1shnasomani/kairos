# KAIROS — Backend Implementation Plan

## Current State

Every router, worker, service, and Go handler has a correct stub (signature, models, docstrings) but no real logic. DB schemas (Supabase SQL + Neo4j Cypher) are written and ready to apply. Docker stack is fully operational. The implementation work is writing the real bodies that connect all pieces end-to-end.

---

## Task 1: Apply DB Schemas and Verify Connectivity

**Objective:** Apply Neo4j constraints/indices and Qdrant collections. Confirm all backends reachable from the API container. Add a detailed health endpoint as the canonical service check throughout development.

- Run `make init-all` to apply `db/neo4j/init_schema.cypher` and create Qdrant collections
- Wire the `lifespan` function in `api/main.py` to call `VectorStoreService.ensure_collections()` and `SearchEngineService.ensure_indices()` on startup
- Add `GET /health/detailed` that pings all five backends (Neo4j, Qdrant, ES, Redis, Temporal) and returns individual status per service

**Test:** `GET /health/detailed` returns green for all services.

---

## Task 2: Asset MDM Backbone — `/assets` Router

**Objective:** Fully wire all 6 asset endpoints so canonical asset nodes can be created, queried, and alias-mapped in Neo4j and Supabase.

- `POST /assets` — call `GraphService.create_asset_node()` using `MERGE`, write row to Supabase `assets` table; hard-require `identity_confirmed_by` to be a non-empty user ID (no AI-inferred identities, ever)
- `GET /assets` — Cypher: `MATCH (a:Asset) WHERE a.site_id = $site_id RETURN a SKIP $offset LIMIT $limit`; also index into ES `kairos_assets`
- `GET /assets/{asset_id}` — `GraphService.get_asset()`
- `GET /assets/{asset_id}/aliases` — query `asset_alias_map` Supabase table
- `GET /assets/{asset_id}/hierarchy` — Neo4j traversal: `MATCH path = (a:Asset {asset_id: $id})<-[:PARENT_OF*0..5]-(root) RETURN nodes(path)`
- `GET /assets/{asset_id}/knowledge` — `GraphService.get_asset_knowledge_at()`, pass `as_of` as parsed datetime

**Test:** Create asset "P-101", retrieve it, retrieve its empty knowledge, confirm MERGE-safe on duplicate creation call.

---

## Task 3: Immutable Vault — `POST /documents/ingest`

**Objective:** Store uploaded files in Supabase Storage with SHA-256 hash, write to `documents` table, queue the Temporal ingestion workflow.

- Compute `hashlib.sha256(bytes).hexdigest()` before anything else
- Check `documents` table for duplicate SHA-256 (idempotent — same file ingested twice returns existing `document_id`)
- Upload raw bytes to Supabase Storage bucket `kairos-vault` at path `{document_type}/{document_id}/{filename}` — file stored unchanged, no preprocessing
- Insert row into `documents` (status=`active`) and `extraction_jobs` (stage=`queued`)
- Link to asset in `document_asset_links` if `asset_id` provided
- Trigger `DocumentIngestionWorkflow` via Temporal client
- Implement `GET /documents/{document_id}`, `GET /documents/{document_id}/status`, `GET /documents/` list with filtering

**Test:** Upload PDF, verify SHA-256 in DB, verify blob in Supabase Storage, verify Temporal workflow started in UI at `localhost:8088`.

---

## Task 4: OCR — `run_ocr` Temporal Activity

**Objective:** Wire the `store_in_vault` and `run_ocr` Temporal activities to actually execute PaddleOCR and update job status.

- `store_in_vault` activity: download file bytes from Supabase Storage, verify SHA-256 matches, update `extraction_jobs` stage to `ocr_running`
- `run_ocr` activity: call `OCRService.extract_text(file_bytes, mime_type)`, update `extraction_jobs` with `ocr_confidence` and advance stage to `ner_running`; if `overall_confidence < 0.5`, set stage to `review_required`, stop pipeline, push to a Redis Stream `kairos:events:review_required`
- Ensure `requirements-ml.txt` is installed in the `kairos-temporal-worker` container (add to its Dockerfile command or build stage)

**Test:** Ingest a real PDF, poll `/documents/{id}/status`, confirm `ocr_confidence > 0` and stage advances correctly.

---

## Task 5: NER + Entity-to-Asset Linking — `run_ner` and `link_to_graph` Activities

**Objective:** Extract industrial entities and link them to canonical asset nodes. Low-confidence and unresolved entities go to quarantine, never to the canonical graph.

- `run_ner` activity: call `NERService.extract_entities(text)`, update `extraction_jobs.entity_count`, advance stage to `graph_linking`
- `link_to_graph` activity:
  - For `ASSET_TAG` entities: call `NERService.resolve_asset_tag(raw_tag, alias_map)` where `alias_map` is fetched from `asset_alias_map`; if resolved → create graph edge; if unresolved → insert into `asset_alias_map` with `confirmed=False` and route entity to `quarantine_items` (never auto-link)
  - For resolved entities: call `GraphService.create_knowledge_edge()` with all five mandatory properties: `valid_from=now`, `authority_level=document.authority_level`, `document_id`, `confidence`, `verification_status='unverified'`
  - Entities with `confidence < 0.7` go to `quarantine_items` table, never to the canonical graph

**Test:** Ingest a document mentioning "P-101", verify a Neo4j edge created with all 5 properties; verify low-confidence entities appear in `quarantine_items`, not as graph edges.

---

## Task 6: Vector and Text Indexing — `index_vectors` and `index_text` Activities

**Objective:** Make ingested documents searchable via Qdrant (semantic) and Elasticsearch (exact).

- `index_vectors` activity: chunk text into 512-token segments with 50-token overlap; embed each chunk via `LLMService.embed(chunk)` (Ollama `nomic-embed-text`); call `VectorStoreService.upsert()` to `kairos_documents` collection with payload `{document_id, asset_id, chunk_index, authority_level, is_quarantine: False, text}`
- `index_text` activity: `es_client.index(index=ELASTICSEARCH_INDEX_DOCUMENTS, id=document_id, document={document_id, asset_id, title, content, document_type, authority_level, status, ingested_at})`
- Steps 5 and 6 run in parallel inside the Temporal workflow (already wired with `workflow.wait([...])`)

**Test:** Complete a full ingestion, verify points in Qdrant dashboard, verify document in ES index.

---

## Task 7: Hybrid Search — `/search` Router

**Objective:** Implement the full hybrid retrieval pipeline with authority-ranked re-ranking. Phase 1: retrieval only, no synthesis.

- `GET /search`: run three retrievals in parallel via `asyncio.gather()`:
  1. `SearchEngineService.search(query, asset_id)` — ES exact match (tag numbers, clause refs, doc IDs)
  2. `VectorStoreService.search(collection, embed(q), asset_id, authority_min)` — semantic
  3. `GraphService.get_asset_knowledge_at(asset_id, as_of)` if `asset_id` provided — graph facts
- Merge results, deduplicate by `document_id`, re-rank: sort by `authority_level ASC` then `relevance_score DESC`
- Apply `as_of` time-travel: validity window filtering already handled in `GraphService.get_asset_knowledge_at()`
- If `include_quarantine=True`, add a Qdrant search filtered to `is_quarantine=True` with explicit labeling
- `synthesis=None` in Phase 1 response

**Test:** Index a document, search for a tag number (expect ES hit), search for a concept (expect Qdrant hit), search with `as_of` before ingestion (expect no results).

---

## Task 8: LLM Synthesis — `POST /search/synthesize`

**Objective:** Implement synthesis with mandatory source citation and explicit safety-critical refusal. Phase 2 gate — no-ops cleanly if no LLM configured.

- Return `{"message": "No LLM configured"}` if neither NIM nor Ollama available (clean Phase 1 fallback)
- Call `LLMService.synthesize(query, retrieved_context, query_category)` — NIM and Ollama paths are already implemented
- Parse LLM response to extract `ANSWER:`, `CONFIDENCE:`, `SOURCES_USED:` from the structured prompt output
- For `query_category` in `SAFETY_CRITICAL_CATEGORIES`: refusal logic already in `LLMService.synthesize()` — wire `query_category` from the request body
- Log every synthesis call to `audit_log`: `{action: 'synthesis', entity_type: 'query', details: {query, sources_used, confidence, refused}}`

**Test:** Synthesize with NIM/Ollama, verify source citations in response; test a safety-critical category with low-confidence context, verify refusal with source documents returned directly.

---

## Task 9: Dual-Track Conflict Detection + Blast-Radius

**Objective:** Detect conflicts when edges are written, classify track, trigger MoC for engineering conflicts, and implement all governance endpoints.

- Add `detect_conflict()` to `GraphService`: before committing a new edge, query for existing active edges on the same parameter with a different value; if found, insert into `knowledge_conflicts` table
- Track classification: `authority_level <= 3` AND parameter in `{pressure, temperature, inspection_interval, isolation_procedure, material_spec}` → `track='engineering'`, SLA = 24h for safety_critical, 5 days otherwise; else → `track='administrative'`, SLA = 5 days
- `GET /governance/conflicts` — query `knowledge_conflicts` with filters
- `GET /governance/blast-radius/{document_id}` — call `GraphService.get_blast_radius()` (already implemented)
- `GET /governance/quarantine` — query `quarantine_items`
- `POST /governance/quarantine/{id}/promote` — call `GraphService.create_knowledge_edge()` with `verification_status='verified'`, close superseded edge, write audit log; requires `reliability` or `admin` role
- `POST /governance/quarantine/{id}/dispute` — update `review_status='disputed'`
- `POST /documents/{id}/supersede` — update old document `status='superseded'`, call `GraphService.close_validity_window()` on all edges with that `document_id`, trigger blast-radius analysis, create `moc_items` row if any affected edge had `authority_level <= 3`
- `POST /governance/moc/webhook` — verify webhook signature, call `GraphService.close_validity_window()` on old edge, promote new edge to `verification_status='verified'`, clear pending conflict, write audit log

**Test:** Ingest two documents with conflicting pressure values for the same asset, verify conflict row with `track='engineering'`; supersede the old document, verify its edges have `verification_status='superseded'` and blast-radius report is populated.

---

## Task 10: Compliance Gap Detection — `/compliance` Router

**Objective:** Seed a minimal regulatory framework and implement gap detection against current documented procedures.

- Seed 10-15 regulatory clauses as `Concept` nodes in Neo4j (OISD-117 or ISO 45001 sample) via `scripts/seed_regulations.py`; each node: `{concept_id, type:'Regulation', framework, clause_id, requirement_text, applies_to_equipment_class}`
- `GET /compliance/gaps`: Cypher — for each applicable `Regulation` node, check if a verified `KNOWLEDGE_EDGE` exists from an `Asset` of that class to a `Document` of type `procedure` with `valid_to IS NULL`; missing edge = gap; gap severity: `critical` if `authority_level=1`, `major` if 2, `minor` otherwise
- `GET /compliance/dashboard`: aggregate gaps by severity/framework/asset_class
- `GET /compliance/audit-pack`: gather `Document` nodes linked to requested `framework` clauses, organized by `clause_id`; flag clauses with `confidence < 0.7` as requiring human review; block clearances below threshold

**Test:** Seed regulations, create assets without linked procedures, verify gaps detected; link a verified procedure edge, verify gap clears.

---

## Task 11: Event Ingestion and Normalization — `/events` Router

**Objective:** Wire all event ingestion endpoints with canonical normalization (dedup, correlation) and publication to Redis Streams.

- `POST /events/work-order`: call `EventBusService.is_duplicate(asset_id, 'work_order_created')`; if duplicate return `{status: 'deduplicated'}`; else publish via `EventBusService.publish_work_order()`, insert into `operational_events`, trigger brief assembly (Task 12)
- `POST /events/ptw`: always `priority='critical'`; publish to `REDIS_STREAM_PTW`; immediately publish to `REDIS_STREAM_BRIEFS` with `priority='critical'` to bypass governor
- `POST /events/shift-handover`: publish to `REDIS_STREAM_SHIFT_HANDOVER`
- `POST /events/alarm`: publish to `REDIS_STREAM_ALARMS`
- `POST /events/{event_id}/ack`: write to `audit_log`: `{action: 'brief_acknowledged', performed_by, details: {event_id, timestamp, signature}}`

**Test:** POST a work order event, verify Redis Stream entry via `redis-cli XRANGE kairos:events:work_orders - +`; POST the same event again within 10 minutes, verify dedup response.

---

## Task 12: Brief Assembly Engine

**Objective:** Implement `api/services/brief_engine.py` — the core that queries the graph and assembles contextual briefs for each event type.

- `BriefEngine.assemble_work_order_brief(event)`: run in parallel via `asyncio.gather()`:
  1. `GraphService.get_asset_knowledge_at(asset_id)` — failure history
  2. `VectorStoreService.search(kairos_knowledge, embed("failure " + failure_code), asset_id)` — similar failures
  3. Supabase: `SELECT * FROM quarantine_items WHERE asset_id = $1 AND review_status = 'pending'`
  4. Supabase: `SELECT * FROM knowledge_conflicts WHERE asset_id = $1 AND status = 'open'`
  5. ES search for `asset_id` filtered to `document_type='procedure'`
  - Assemble `Brief`: headline = top finding from history, body = raw retrieved facts (Phase 1) or LLM synthesis (Phase 2), warnings = open conflicts, quarantine_flags = unverified items
- `BriefEngine.assemble_ptw_brief(event)`: Neo4j query for isolation topology of all `asset_ids` in boundary, maintenance history of each isolation device, PTW-type regulatory requirements, quarantine deviation flags
- `BriefEngine.assemble_shift_handover_brief(event)`: open work orders, active alarms, pending conflicts
- Delivery: save `Brief` to Supabase `briefs` table, publish to `REDIS_STREAM_BRIEFS` with `recipient_user_id` as field, update `briefs.delivered_at`

**Test:** Seed P-101 with failure history, POST a work order event for P-101, call `GET /briefs` as the assigned technician, verify brief contains source-cited failure history.

---

## Task 13: EEMUA 191 Governor — `/briefs` Router

**Objective:** Implement the push governor, brief retrieval, acknowledgment, and feedback. Hard ceiling: ≤6 push events per operator per hour; PTW briefs are never suppressed.

- `GET /briefs`: query Supabase `briefs WHERE recipient_user_id = $1 AND acknowledged_at IS NULL`; check `EventBusService.get_governor_state(user_id)`; always return `priority='critical'` briefs; suppress `normal` priority if `push_count_last_hour >= ceiling`; call `EventBusService.record_push(user_id)` for each brief returned
- `GET /briefs/{brief_id}`: Supabase query with authorization check (`recipient_user_id == current_user.user_id`)
- `POST /briefs/{brief_id}/ack`: update `briefs` with `acknowledged_at`, `acknowledged_by`; for `requires_countersignature=True` (PTW briefs), do NOT set `acknowledged_at` until countersignature received; write `audit_log` entry
- `POST /briefs/{brief_id}/feedback`: insert into `brief_feedback`; if `rating='incorrect'` trigger background task to re-evaluate source document confidence
- `GET /briefs/governor/status`: return `EventBusService.get_governor_state(user_id)`
- Cool-down: in brief delivery, also check `SELECT COUNT(*) FROM briefs WHERE recipient_user_id=$1 AND asset_id=$2 AND created_at > NOW() - INTERVAL '4 hours'` before generating a new brief for the same asset

**Test:** Deliver 6 normal briefs to a user, verify 7th is suppressed; deliver a PTW brief, verify it appears regardless of count.

---

## Task 14: Auth + OPA Policy Enforcement

**Objective:** Wire Supabase Auth JWT verification and OPA policy enforcement into all protected routes.

- `POST /auth/login`: call `supabase.auth.sign_in_with_password({"email", "password"})`, return JWT
- `POST /auth/refresh`: call `supabase.auth.refresh_session(refresh_token)`
- Verify `APP_DEBUG=False` path in `get_current_user()` actually rejects invalid tokens
- Add `OPAMiddleware`: for `POST/PUT/DELETE` routes, construct OPA input `{user: {user_id, role, site_id}, action, resource}` and call `POST http://kairos-opa:8181/v1/data/kairos/authz/allow`; deny with 403 if result is not `true`
- Apply `require_role("admin", "engineer")` to governance promotion/resolution; `require_role("admin")` to MDM bootstrap; field_worker locked to read-only
- Configure Supabase RLS on `briefs` and `quarantine_items` to enforce `recipient_user_id = auth.uid()` and `site_id` isolation

**Test:** Authenticate as `field_worker`, attempt `POST /governance/quarantine/{id}/promote`, verify 403; same with `admin` token, verify 200.

---

## Task 15: Elicitation Engine

**Objective:** Implement graph-derived micro-interview questions at work order closeout and store responses in quarantine.

- `POST /elicitation/trigger`: check trigger conditions — (a) failure code occurrence count for this equipment class in `operational_events` < 3, (b) `resolution_time_hours > 90th percentile` for this failure type, (c) `novel_troubleshooting=True`; if any met, start `MicroInterviewWorkflow` via Temporal
- `generate_interview_questions` activity: query Neo4j for known vs unknown failure modes on this asset; pass gap list to `LLMService.synthesize()` with prompt: "Generate 3-5 targeted diagnostic questions. Known: {known}. Unknown: {unknown}. Be specific, not generic." Max 5 questions.
- `GET /elicitation/{work_order_id}/questions`: return generated questions for mobile delivery
- `POST /elicitation/{work_order_id}/responses`: accept question-answer pairs, call `store_elicitation_response` activity — insert into `quarantine_items` with `input_type='elicitation_response'` and `session_context={questions, work_order_id}`

**Test:** Trigger elicitation for a rare failure code, verify questions are graph-derived (reference specific asset history), submit responses, verify quarantine item with session context.

---

## Task 16: Attribution Worker

**Objective:** Wire the three parallel attribution checks in `workers/attribution.py`. Confidence adjustments only happen when all three checks confirm a genuine recommendation failure.

- `_check_telemetry_baseline(asset_id, work_order_id)`: call `GET http://kairos-backend-go:8090/ot/coverage/{asset_id}`; if `coverage_percent == 0` return `{primary_check: False, reason: 'not_instrumented'}`; if instrumented, call `GET /ot/query?asset_id=...&tag=...&from=maintenance_date&to=maintenance_date+30days` and check if mean value returned to ±2σ of historical baseline
- `_check_failure_code_match(work_order_id)`: query `operational_events` for both work orders' `failure_code`; map codes to failure mode families via a static dict; `matched=True` only if same family
- `_check_execution_compliance(work_order_id)`: query `operational_events.payload->>'close_notes'`; keyword-match recommended action items against close notes; `compliant=True` if found
- Wire attribution trigger in `POST /events/work-order`: query `SELECT COUNT(*) FROM operational_events WHERE asset_id=$1 AND event_type='work_order_created' AND occurred_at > NOW() - INTERVAL '30 days'`; if count > 1, enqueue `attribution.evaluate_outcome.delay(work_order_id, asset_id)`

**Test:** Create two work orders for the same asset within 30 days, verify attribution task fires; simulate execution deviation, verify no confidence adjustment made.

---

## Task 17: Go Connector — Historian Federation + EAM Sync

**Objective:** Implement the OT historian query and EAM asset sync Go handlers. Use mock data for demo when external systems are not configured.

- `GET /ot/query`: implement `PIWebAPIClient.Query()` in `internal/ot/client.go` calling `{PI_WEBAPI_BASE_URL}/streams/{webid}/recorded?startTime={from}&endTime={to}` with Basic Auth; if `PI_WEBAPI_BASE_URL` is empty, return a configurable mock fixture (50 points with realistic vibration values) so the attribution worker can function for demo
- `GET /ot/coverage/{asset_id}`: call FastAPI `GET /assets/{asset_id}/knowledge` to retrieve instrumentation tags from graph; return coverage map
- `POST /eam/sync`: if `EAM_ODS_ENDPOINT` is empty, parse `fixtures/sample_assets.json`; for each record, POST to `http://kairos-backend-api:8000/assets`
- `POST /eam/work-order`: forward payload to `http://kairos-backend-api:8000/events/work-order`

**Test:** Call `GET /ot/query` with no PI config, verify mock time-series returned; call `POST /eam/sync` with fixture file, verify assets appear in FastAPI.

---

## Task 18: OpenTelemetry Instrumentation + Grafana Dashboards

**Objective:** Ensure all services emit traces and metrics to the OTEL collector, and provision Grafana dashboards for the demo.

- Confirm `setup_telemetry(app)` in `api/main.py` is wiring `FastAPIInstrumentor`, `RedisInstrumentor`, and `HTTPXClientInstrumentor` correctly; add `Neo4jInstrumentor` if available
- Add custom OTEL metrics: `kairos.briefs.delivered` counter, `kairos.governor.suppressed` counter, `kairos.ingestion.duration` histogram, `kairos.conflicts.open` gauge
- Update `backend/otel/otel-config.yaml` to route traces to Grafana Tempo and metrics to Prometheus (add receivers and exporters)
- Provision two Grafana dashboards in `backend/grafana/provisioning/`:
  1. **Ingestion Pipeline** — documents ingested/hour, OCR confidence distribution, NER entity count, pipeline stage breakdown
  2. **Operational Intelligence** — briefs delivered/hour, governor suppression rate, open conflicts by track, compliance gap count by severity

**Test:** Run `make dev`, ingest 3 documents, deliver 2 briefs, open Grafana at `localhost:3001`, verify both dashboards have live data.

---

## Task 19: Whisper Voice Transcription (Layer 3)

**Objective:** Accept voice notes from the elicitation engine, transcribe via Whisper, run through NER, and store in quarantine. Architecture requires this for tacit knowledge capture from field technicians.

- Create `api/services/whisper.py` with `WhisperService`: lazy model init (`whisper.load_model("base")` on first call), `transcribe(audio_bytes) -> {text, language, confidence}` method; add `openai-whisper` to `requirements-ml.txt`
- `POST /elicitation/{work_order_id}/voice`: accept `UploadFile` (audio); store raw bytes in Supabase Storage at `voice_notes/{work_order_id}/{filename}` (immutable, SHA-256); call `WhisperService.transcribe()`; pass transcript through `NERService.extract_entities()`; insert into `quarantine_items` with `input_type='voice_note'`, `content=transcript`, linked `work_order_id`
- Wire into `elicitation_worker.py` — voice transcription runs as a Celery task, not inline

**Test:** Upload a `.m4a` or `.wav` file to the endpoint, verify transcript text in `quarantine_items` table with `input_type='voice_note'` and correct `work_order_id`.

---

## Task 20: Engineering Drawing Topology — Mock Pipeline (Layer 3)

**Objective:** Handle `document_type='pid_drawing'` without destroying spatial relationships via standard OCR. Use a pre-processed mock topology for MVP; gate canonical promotion behind human verification.

- In `run_ocr` Temporal activity: detect `document_type == 'pid_drawing'`; skip standard OCR; load mock topology from `backend/fixtures/pid_topology_mock.json` (equipment nodes, flow connections, valve positions, isolation boundaries as structured JSON)
- Store topology as a `Document` node in Neo4j with `document_type='pid_topology'`, create graph edges for each extracted element with `verification_status='unverified'` — all routed to human verification queue via `quarantine_items` with `input_type='deviation_flag'`
- `GET /documents/{document_id}/topology` — return the topology JSON for the engineer verification UI
- Create `backend/fixtures/pid_topology_mock.json` with a realistic sample: 5 equipment nodes, 3 isolation valves, 2 instrumentation loops, 1 isolation boundary

**Test:** Ingest a PDF with `document_type='pid_drawing'`, verify it skips OCR confidence scoring, verify topology items appear in `GET /governance/quarantine`, verify `GET /documents/{id}/topology` returns the mock topology.

---

## Task 21: Active Learning Annotation Interface (Layer 3)

**Objective:** Backend support for inline entity correction in search results — the mechanism that bootstraps Hinglish NER accuracy from normal search usage.

- Add migration `006_ner_annotations.sql`: `ner_annotations(id UUID PK, document_id TEXT, entity_text TEXT, entity_type TEXT, corrected_type TEXT, is_correct BOOL, span_start INT, span_end INT, annotated_by TEXT, created_at TIMESTAMPTZ)`
- `POST /annotations` — insert row into `ner_annotations`; if `is_correct=False`, find matching `quarantine_items` entry by `document_id` + entity span and update its `confidence` downward; write to `audit_log`
- `GET /annotations?document_id=X` — return all annotations for a document (frontend uses this to render highlighted entity spans with correction state)
- `GET /annotations/stats` — aggregate counts: `{total, corrections_this_week, top_corrected_entity_types}` — used by the compliance/model health dashboard

**Test:** Ingest a document, call `GET /search`, take a low-confidence entity, POST correction to `/annotations` with `is_correct=False`, verify row in `ner_annotations` and confidence updated on linked quarantine item.

---

## Task 22: SPC-Based Circuit Breaker (Layer 7)

**Objective:** Halt automated extraction per asset class when override rates drift outside control limits. Prevents model drift from silently corrupting the knowledge base.

- Add migration `007_circuit_breaker.sql`: `extraction_overrides(id UUID PK, asset_class TEXT, document_id TEXT, override_type TEXT CHECK IN ('manual_correction','quarantine_rejection','annotation_correction'), created_at TIMESTAMPTZ)`
- Create `api/services/circuit_breaker.py` with `CircuitBreakerService.check(asset_class) -> {halted: bool, z_score: float, reason: str}`: query `extraction_overrides` for 7-day rolling count; compute Z-score against 30-day historical mean using `(current - mean) / std`; if `z_score > 2.0` → `halted=True`, write to `audit_log`
- Wire into `link_to_graph` Temporal activity: call `circuit_breaker.check(asset_class)` before any graph writes; if `halted=True`, push document to `kairos:events:review_required` and return without writing graph edges
- `GET /governance/circuit-breaker` — return current state per asset class: `{asset_class, status, z_score, override_count_7d, halted_since}`
- Increment `extraction_overrides` when: quarantine item is rejected (`dispute` endpoint), annotation correction is submitted (`is_correct=False`), or manual review routes a document back

**Test:** Insert 15 `quarantine_rejection` overrides for `asset_class='pump'` within 7 days, call `GET /governance/circuit-breaker`, verify `status='halted'` for pumps; ingest a new pump document, verify graph edges are NOT created and document lands in review queue.

---

## Task 23: Physical Deviation Flag (Layer 6 / Layer 8)

**Objective:** Field technicians can flag physical deviations from engineering drawings. On flag, freeze all downstream automated brief delivery for affected asset topology paths until an engineer resolves it.

- `POST /events/deviation-flag` — accept `{asset_id, description, reported_by, affected_topology_path}`; insert into `quarantine_items` with `input_type='deviation_flag'`; set `delivery_frozen=True` on all unacknowledged `briefs` for this `asset_id`; publish to `REDIS_STREAM_ALARMS` with `severity='critical'`; write `audit_log`
- `POST /events/deviation-flag/{item_id}/resolve` — requires `engineer` or `admin` role; update `quarantine_items.review_status='promoted'` or `'disputed'`; set `delivery_frozen=False` on affected briefs; if MoC warranted (topology change confirmed), create `moc_items` row
- Add `delivery_frozen BOOLEAN NOT NULL DEFAULT FALSE` column to `briefs` table (migration `008_brief_freeze.sql`)
- Update `GET /briefs`: filter `delivery_frozen=False` for normal delivery; include frozen briefs in response with `{frozen: true, reason: 'Physical deviation flag pending resolution'}` so the frontend can display the freeze state

**Test:** POST a deviation flag for P-101; call `GET /briefs` for a user with P-101 briefs, verify frozen briefs show `frozen=true`; resolve the flag, verify briefs return to normal delivery.

---

## Task 24: Timestamp Normalization in Ingestion Pipeline (Layer 4)

**Objective:** Prevent incorrect temporal ordering in the graph from unsynchronized source system clocks. Architecture calls this a first-class ingestion requirement.

- Add `TIMESTAMP_DRIFT_TOLERANCE_MINUTES=60` to `api/config.py` Settings and `.env.example`
- In `link_to_graph` Temporal activity, before setting `valid_from` on any graph edge: compare `source_timestamp` (from document payload / event `occurred_at`) against `ingested_at` (Supabase Storage upload time); if `abs(source - ingested) > TIMESTAMP_DRIFT_TOLERANCE_MINUTES`, log to `audit_log` with `action='timestamp_drift_detected'` and `details={source_ts, ingested_ts, drift_minutes}`; use `ingested_at` as the canonical `valid_from` instead of the source timestamp
- Flag the document's `extraction_jobs` row with a `timestamp_drift_detected=True` column (add to migration `009_timestamp_drift.sql`) so reviewers can see which documents had clock drift

**Test:** Ingest a document with `occurred_at` set 5 hours in the future; verify the resulting Neo4j edge has `valid_from` equal to `ingested_at`, not the future timestamp; verify `audit_log` has a `timestamp_drift_detected` row.

---

## Task 25: Frontend Integration Contracts — API Response Completeness

**Objective:** Harden all API responses so the frontend can integrate without hitting missing fields or inconsistent envelope shapes.

- **Consistent list envelope**: all list endpoints must return `{items: [], total: int, limit: int, offset: int}` — fix `GET /assets`, `GET /governance/conflicts`, `GET /governance/quarantine`, `GET /compliance/gaps` which currently use inconsistent keys (`assets:`, `conflicts:`, `items:`, `gaps:`)
- **Asset detail**: `GET /assets/{asset_id}` must return a typed response including `open_work_orders_count` (query `operational_events`), `compliance_gap_count` (query `knowledge_conflicts`), `last_inspection_date` (query graph for most recent `Event` node of type `inspection`)
- **vault_url on search results**: `GET /search` results must include `vault_url` — the Supabase Storage public URL for the source document; required for "view source" links in the frontend; compute via `supabase.storage.from_(bucket).get_public_url(path)`
- **Governor state in briefs list**: `GET /briefs` response must include `{governor_state: {push_count_last_hour, ceiling, state}, suppressed_count: int, next_delivery_allowed_at: ISO8601}` at the top level so the frontend can render governor status without a separate request
- **Session context in quarantine**: `GET /governance/quarantine` items of `input_type='elicitation_response'` must include the full `session_context` (questions + answers) so the reviewer UI can show what was asked alongside the response
- **Audit trail endpoint**: `GET /audit-log?entity_type=X&entity_id=Y&limit=50` — frontend needs this to render the evidence lineage panel; currently the `audit_log` table exists but has no router endpoint

**Test:** Call each endpoint and verify the envelope shape; call `GET /assets/P-101` and verify `open_work_orders_count` is present; call `GET /search?q=seal+failure` and verify each result has a non-null `vault_url`; call `GET /audit-log?entity_type=document&entity_id=DOC-001` and verify chronological audit entries returned.

---

## Task 26: Delay Compensation for Event Normalization (Layer 8)

**Objective:** Implement the late-arrival buffer so brief assembly waits for correlated events from multiple source systems before triggering, preventing duplicate briefs from the same real-world action.

- In `POST /events/work-order` (and `/ptw`, `/shift-handover`): instead of triggering `BriefEngine.assemble_*` immediately, enqueue a Celery task with `apply_async(countdown=LATE_ARRIVAL_WINDOW_MINUTES * 60)` — default 5-minute delay
- Store the pending Celery task ID in Redis at key `kairos:brief_pending:{asset_id}:{event_type}` with TTL = late-arrival window; if a second event for the same asset arrives during the window, revoke the existing task (`celery_app.control.revoke(task_id)`) and re-enqueue with the merged compound payload
- After the countdown fires, brief assembly proceeds with all accumulated event data for that asset in the window
- `LATE_ARRIVAL_WINDOW_MINUTES` already exists in `config.py` — wire it into the Celery countdown value

**Test:** POST a work order for P-101; within 30 seconds POST a PTW for the same asset; wait 5 minutes; verify only ONE brief generated (not two), and the brief includes context from both events.

---

## Task 27: Event Correlation — Compound Events (Layer 8)

**Objective:** Link events from different source systems referring to the same physical action into a single compound event, enriching the brief without generating separate deliveries.

- Add `correlate_events(primary_event, candidate_events) -> CompoundEvent` to `EventBusService`: groups events with same `asset_id` where `abs(occurred_at_a - occurred_at_b) < DEDUP_WINDOW_MINUTES`; merges into `CompoundEvent(primary_event, correlated_events: [], source_systems: [])`
- Pass `CompoundEvent` to `BriefEngine` — reads `correlated_events` to enrich content (PTW correlated → add isolation topology; alarm correlated → add DCS context)
- Add migration `010_compound_events.sql`: add `compound_event_id UUID` column to `operational_events` so correlated events reference each other
- `GET /events/{event_id}` — return event with `correlated_event_ids: []` list for the frontend audit trail

**Test:** POST a work order and alarm for P-101 within 2 minutes; call `GET /events/{work_order_event_id}`, verify `correlated_event_ids` contains the alarm event ID; verify the generated brief references both event contexts.

---

## Task 28: State-Based Push Suppression (Layer 8 Governor)

**Objective:** During turnarounds, planned shutdowns, or declared emergencies, the governor delivers only critical briefs. Architecture names this as a required governor component.

- Add migration `011_plant_state.sql`: `plant_operating_states(id UUID PK, site_id TEXT, state TEXT CHECK IN ('normal','turnaround','shutdown','emergency'), set_by TEXT, set_at TIMESTAMPTZ, expires_at TIMESTAMPTZ)`
- `POST /events/plant-state` — `engineer` or `admin` only; upsert current state for a site; write `audit_log`
- `GET /events/plant-state/{site_id}` — return current state (frontend needs this for the operator dashboard banner)
- Update `EventBusService.check_governor(user_id, priority, site_id)`: query `plant_operating_states`; if state is `turnaround`, `shutdown`, or `emergency` → suppress all briefs except `priority='critical'`; log suppression with `reason='plant_state_suppression'`
- Update `GET /briefs` to pass `site_id` from `current_user` into `check_governor()`
- Add `PLANT_STATE_DEFAULT=normal` to `config.py` and `.env.example`

**Test:** Set state to `turnaround` for SITE_001; trigger 3 normal work order events; verify no normal briefs delivered; trigger a PTW (`critical`); verify PTW brief delivered; reset to `normal`; verify normal briefs resume.

---

## Task 29: RCA Pack Generation (Layer 11)

**Objective:** Layer 11 explicitly lists "RCA packs" as a distinct synthesis output type — timeline of events, failure mode hypotheses ranked by evidence weight, supporting documents. Not covered by the generic synthesis endpoint.

- `POST /search/rca-pack` — accepts `{asset_id, incident_date: ISO8601, failure_code: str, include_quarantine: bool}`:
  1. Neo4j: all `Event` nodes linked to `asset_id` with `occurred_at >= incident_date - 90 days`, ordered chronologically — the failure timeline
  2. Qdrant semantic search: `embed(failure_code + " " + asset_class)` against `kairos_knowledge` — failure mode evidence
  3. Supabase: work orders, alarms, PTWs in the same 90-day window from `operational_events`
  4. Pass to `LLMService.synthesize()` with structured prompt: "Generate an RCA pack. Timeline: {events}. Evidence: {docs}. Rank failure mode hypotheses by evidence weight. Cite each to its source document."
  5. Return `{timeline: [{event_type, occurred_at, description, source}], hypotheses: [{hypothesis, evidence_weight, sources: [document_id]}], supporting_documents: [], confidence, refused: bool}`
- If LLM unavailable: return raw timeline + documents without synthesis (same fallback pattern as `/synthesize`)
- Log every call to `audit_log` with `action='rca_pack_generated'`, `entity_id=asset_id`
- Apply safety-critical refusal per hypothesis: if hypothesis involves a safety-critical parameter and `confidence < 0.7`, mark `refused=True` and return sources directly

**Test:** Seed P-101 with 3 Event nodes and 2 documents in Neo4j; POST to `/search/rca-pack`; verify `timeline` has >=3 events in chronological order, `hypotheses` has >=1 entry with `evidence_weight > 0`, all `sources` reference valid `document_id`s.

---

## Non-Negotiable Constraints (apply to every task)

- Every Neo4j edge write must carry all five properties: `valid_from`, `valid_to`, `authority_level`, `document_id`, `confidence`, `verification_status`
- Vault artifacts are never deleted, never overwritten — supersede only (close `valid_to`)
- Unverified inputs never auto-promote to the canonical graph — human action only
- Call `EventBusService.check_governor()` before every brief delivery; PTW briefs (`priority='critical'`) are always exempt
- Safety-critical parameter queries use explicit refusal, never hedged answers
- `MERGE` not `CREATE` for asset nodes in Neo4j
- Authority-level pre-filter before graph traversal, not after
- Never hardcode secrets — all via env vars
- `structlog` for all logging — never `print()` or stdlib `logging`
