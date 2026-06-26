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
