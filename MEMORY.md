**Phase:** All 3 phases live. Phase 1 (retrieval), Phase 2 (LLM synthesis via `POST /search/synthesize`), Phase 3 (proactive push via event-driven brief delivery + EEMUA 191 governor).

### Completed (verified, running)
| Task | What | Verified By |
|------|------|-------------|
| 1 | DB schema + `/health/detailed` pings all 5 services | `GET /health/detailed` → all ok |
| 2 | Asset MDM — all 6 `/assets/*` endpoints, Neo4j + Supabase + ES | Asset P-101 created, retrieved |
| 3 | Immutable vault — `POST /documents/ingest`, SHA-256 dedup, Temporal trigger | Full ingest + status poll |
| 4 | OCR Temporal activities — `store_in_vault`, `run_ocr`, `mark_complete` | Pipeline runs to `complete`, confidence=0.95 |
| 5 | NER + entity-to-asset linking — `run_ner`, `link_to_graph`, `create_knowledge_edge` | All 7 stages; Neo4j edge with all 6 properties verified |
| 6 | Vector + text indexing — `index_vectors` (Qdrant, Jina 1024-dim) + `index_text` (ES) parallel | Qdrant point + ES doc verified |
| 7 | Hybrid Search — `GET /search` parallel ES + Qdrant + Neo4j, authority re-rank, `as_of` time-travel | Tag → ES hit; concept → Qdrant semantic; as_of 2020 → 0 graph results |
| 8 | LLM Synthesis — `POST /search/synthesize`, NIM + Ollama, safety-critical refusal, audit log | NIM answer verified; `max_allowable_pressure` conf=0.35 → refused=true; audit_log written |
| 9 | Dual-Track Conflict Detection + Blast-Radius — `detect_conflict()` in GraphService, all `/governance/*` endpoints wired, MoC webhook | Promote quarantine → conflict_detected=true; MoC webhook → status=resolved; blast-radius=5 affected facts |
| 10 | Compliance Gap Detection — 12-regulation seed (OISD-117 + ISO 45001), `GET /compliance/gaps`, `/dashboard`, `/audit-pack`, `/frameworks` | 18 gaps detected (P-101 + other assets); promote procedure → P-101 OISD gaps clear to 0; audit-pack shows clearance_blocked=False for covered clauses |
| 11 | Event Ingestion + Normalization — `POST /events/work-order`, `/ptw`, `/shift-handover`, `/alarm`, `/{id}/ack`; Redis Streams publish; canonical dedup via Redis TTL key | WO accepted → stream_id in Supabase; duplicate → `{status: deduplicated}`; PTW → priority=critical in briefs stream; alarm + shift handover → operational_events + streams verified |
| 12 | Brief Assembly Engine — `BriefEngine` (WO, PTW, shift-handover), 5-parallel graph+vector+ES+Supabase queries, deliver to `briefs` table + `REDIS_STREAM_BRIEFS`; `GET /briefs` with governor pre-filter | POST WO → brief_id returned; `GET /briefs` as dev-user → headline with source-cited failure history (DOC-P101-FAILURE-HIST, authority=2); Supabase `briefs` row with sources JSONB verified |
| 13 | EEMUA 191 Governor — `GET /briefs` calls `record_push` per returned brief; PTW critical bypass; 4h asset cool-down in `deliver()`; `POST /feedback` incorrect → `confidence_recheck_queued` in audit_log; `POST /ack` with countersignature gate | 6 pushes → governor suppressed → 7th normal suppressed; PTW brief appears regardless; cool-down returns same brief_id; `confidence_recheck_queued` row in audit_log with source_document_ids |
| 14 | Auth + OPA Policy Enforcement — `POST /auth/login` + `/refresh` + `GET /me`; `OPAMiddleware` for all write routes; `require_role("admin","engineer")` on `POST /assets/`; Supabase RLS on `briefs` + `quarantine_items`; rego catch-all for non-sensitive writes | field_worker token → `POST /governance/quarantine/promote` → 403; admin token → 200; OPA blocks field_worker on `/assets/` write (403), passes on non-sensitive `/events/alarm` (202) |
| 15 | Elicitation Engine — `POST /elicitation/trigger` (3 conditions), `MicroInterviewWorkflow` on `kairos-elicitation` queue, `generate_interview_questions` (Neo4j + LLM), `GET /elicitation/{work_order_id}/questions`, `POST /elicitation/{work_order_id}/responses` → `quarantine_items` | Rare failure code → triggered=true; questions_ready session; quarantine item with session_context (5 questions, 3 responses, work_order_id); session status=completed |
| 16 | Attribution Worker — 3-check system (telemetry baseline, failure family, execution compliance), `evaluate_outcome` Celery task, mock Go historian (50 vibration points sine-shaped), `close_notes` on WorkOrderEvent, attribution trigger in WO ingest router | Two WOs → Celery task queued; telemetry=failed:false (mock within 2σ), failure_check=matched:true (VIBE-HIGH→mechanical), exec=compliant:true; genuine_failure=false → no_action ✅ |
| 17 | Go Connector — `PIWebAPIClient.Query()` (Basic Auth, WebID resolve via PI search API), `MockHistorianClient`, `GET /ot/coverage` calls FastAPI knowledge endpoint (source=knowledge_graph), `POST /eam/sync` with `fixtures/sample_assets.json` (5 assets), `POST /eam/work-order` proxy; `INTERNAL_API_KEY` service bypass in FastAPI auth | `GET /ot/query` → 50 mock points; `POST /eam/sync` → 5/5 synced; `GET /assets/HX-301` → exists; `POST /eam/work-order` → brief_id returned; `GET /ot/coverage/P-101` → source=knowledge_graph ✅ |
| 18 | OTEL Instrumentation + Grafana Dashboards — `MeterProvider` + `TracerProvider` with OTLP export; `RedisInstrumentor` + `HTTPXClientInstrumentor`; 4 custom metrics (`kairos.briefs.delivered`, `kairos.governor.suppressed`, `kairos.ingestion.duration`, `kairos.conflicts.open`); Grafana Tempo (traces); 2 dashboards (Ingestion Pipeline + Operational Intelligence, 6+9 panels) | `kairos_briefs_delivered_total=1`, `kairos_ingestion_duration_seconds_count=3` in Prometheus; Tempo `ready`; 3 traces from kairos-api; both dashboards provisioned in Grafana ✅ |
| 19 | Whisper Voice Transcription — `POST /elicitation/{work_order_id}/voice`; Groq API (whisper-large-v3); SHA-256 dedup; Supabase Storage vault; Celery `transcription` queue; NER on transcript; insert into `quarantine_items` | `test.wav` → transcript "Say the word back." confidence=0.84; item_id=681642d3 in quarantine_items with input_type=voice_note ✅ |
| 20 | Engineering Drawing Topology Mock Pipeline — `pid_drawing` skips OCR; loads `fixtures/pid_topology_mock.json` (5 equip, 3 valves, 2 loops, 1 boundary); writes 11 Concept nodes + KNOWLEDGE_EDGE (unverified, auth=3) in Neo4j; 11 quarantine items + 1 manifest item; `GET /documents/{id}/topology` returns full topology JSON | `DOC-FFBSNPWBXXC3` ingested; ocr_confidence=null (OCR skipped); 12 quarantine items; topology endpoint returns drawing_id=P-2301 with all 11 elements; Neo4j edges verified unverified/auth=3 ✅ |
| 21 | Active Learning Annotation Interface — migration `006_ner_annotations.sql`; `POST /annotations` (insert + quarantine confidence -0.1 + audit_log); `GET /annotations?document_id=X`; `GET /annotations/stats` (total, corrections_this_week, top_corrected_entity_types) | V-247 annotation: confidence 0.9→0.8 in quarantine; audit_log row with quarantine_confidence_updated=true; stats returns total=5, corrections_this_week=4, top=[FAILURE_MODE×3] ✅ |
| 22 | SPC Circuit Breaker — migration `007_circuit_breaker.sql` (extraction_overrides table); `CircuitBreakerService.check()/record_override()/get_all_states()`; wired into `link_to_graph` (pre-flight CB check + Redis xadd review_required if halted); dispute endpoint records quarantine_rejection override; annotation `is_correct=False` records annotation_correction override; `GET /governance/circuit-breaker` endpoint; fixed `document_type` NameError in `link_to_graph` | Dispute → override_count_7d=1; annotation correction → override_count_7d=2; full pipeline DOC-CQG2SQ7PRSRG → link_to_graph_complete edges=1 no NameError; CB endpoint returns halted_count=0 (insufficient history) ✅ |
| 23 | Physical Deviation Flag — migration `008_brief_freeze.sql` (`delivery_frozen` col on briefs); `DeviationFlagEvent`+`DeviationFlagResolveRequest` models; `POST /events/deviation-flag` (quarantine insert + freeze unacked P-101 briefs + REDIS_STREAM_ALARMS publish + audit_log); `POST /events/deviation-flag/{item_id}/resolve` (engineer/admin role, unfreeze briefs, optional MoC creation); `GET /briefs` updated to tag frozen briefs and exclude from governor push count | Flag P-101 → briefs_frozen=6, stream_id in alarms; GET /briefs shows frozen=True with freeze_reason; resolve (promoted+moc_warranted) → briefs_unfrozen=6, MOC-J7CZP6K3 created; GET /briefs post-resolve shows frozen=0 ✅ |
| 24 | Timestamp Normalization — migration `009_timestamp_drift.sql` (`occurred_at TIMESTAMPTZ` on `documents`, `timestamp_drift_detected BOOLEAN` on `extraction_jobs`); `TIMESTAMP_DRIFT_TOLERANCE_MINUTES=60` in config + `.env.example`; `occurred_at` form field on `POST /documents/ingest`; `link_to_graph` activity expands doc_meta select to fetch `occurred_at`+`ingested_at`; computes drift minutes; if drift > tolerance → `audit_log` action=`timestamp_drift_detected` + `extraction_jobs.timestamp_drift_detected=True` + log.warning; `canonical_valid_from` = `ingested_at` on drift, `occurred_at` within tolerance; `KNOWLEDGE_EDGE.valid_from` uses `canonical_valid_from`; fixed pre-existing `workflow.logger.warning()` structlog-kwargs bug (stdlib logger → positional args) | DOC-EYWSVST98CCJ with `occurred_at=3 days ago`: drift_minutes=4320 logged; `extraction_jobs.timestamp_drift_detected=true`; `audit_log` row with drift_minutes=4320, source_ts+ingested_ts; pipeline_complete confirmed ✅ |
| 25 | Frontend Integration Contracts — consistent list envelope `{items,total,limit,offset}` on `GET /assets`, `/governance/conflicts`, `/governance/quarantine`, `/compliance/gaps`; `GET /assets/{id}` enriched with `open_work_orders_count`+`compliance_gap_count`+`last_inspection_date` (3-parallel); `GET /search` now batch-fetches `vault_url` from Supabase after results; `GET /briefs` governor_state nested as `{push_count_last_hour,ceiling,state}` + `next_delivery_allowed_at` via Redis TTL; quarantine items include `session_context`; new `GET /audit-log` endpoint with entity_type/entity_id/action filters | `GET /assets/` → keys=[items,total,limit,offset]; `GET /assets/P-101` → open_work_orders_count=12, compliance_gap_count=0; `GET /search?q=seal+failure` → vault_url populated on all results; `GET /briefs` → governor_state nested object; `GET /audit-log?entity_type=document&entity_id=DOC-EYWSVST98CCJ` → 2 entries chronological ✅ |

| 26 | Delay Compensation — `workers/brief_assembly.py` (new Celery task `assemble_brief` on ingestion queue); WO + shift-handover handlers: `apply_async(countdown=LATE_ARRIVAL_WINDOW_MINUTES*60)` + store task_id at `kairos:brief_pending:{asset_id}` in Redis (TTL=window+60s); second event for same asset revokes existing task; PTW handler: stays immediate but revokes pending WO task before assembling; fixed `.decode()` (redis client has `decode_responses=True`) | WO for P-101 → `brief_task_id` + `brief_due_in_seconds=300` returned; Redis key set; PTW for P-101 within window → `events.ptw_revoked_pending_brief` logged; Celery worker: `Tasks flagged as revoked: f2f1dd8f`; PTW brief `c88d8f3e` delivered immediately; `assemble_brief` task manually invoked for HX-301 → brief `dd9f9739` delivered ✅ |

| 27 | Event Correlation — migration `010_compound_events.sql` (`compound_event_id UUID` + index on `operational_events`); `EventBusService.correlate_events(asset_id, event_id, occurred_at, supabase)` queries same-asset events within `DEDUP_WINDOW_MINUTES`, assigns shared UUID to all; called from WO + alarm handlers; `BriefEngine._get_correlated_events()` fetches via `compound_event_id` and appends DCS/PTW/shift context to brief body; `GET /events/{event_id}` returns event + `correlated_event_ids: []` | WO + alarm for P-101 → `compound_event_id=2623de53` linked both; `GET /events/{WO_ID}` → `correlated_event_ids=[alarm_event_id]`; brief body → `[DCS ALARM correlated] Tag: P-101-VIBE-HIGH` ✅ |

| 28 | State-Based Push Suppression — `plant_operating_states` table (migration `011_plant_state.sql`); `PLANT_STATE_DEFAULT=normal` in config; `EventBusService.get_plant_state()/check_governor()` with plant-state gate before hourly count; `POST /events/plant-state` (engineer/admin, upserts state+audit_log) + `GET /events/plant-state/{site_id}`; `GET /briefs` suppresses normal-priority briefs during turnaround/shutdown/emergency while always passing critical (PTW) | SITE_001 → turnaround: suppressed_count=3, 0 normal briefs returned; POST PTW → critical brief fa62fcbe delivered (total_pending=1); reset to normal → suppressed_count=0, 4 briefs returned ✅ |

| 29 | RCA Pack Generation — `RCAPackRequest`+`RCAPackResponse` models; `GraphService.get_event_timeline()` (property + EXISTS relationship query, chronological); `LLMService.rca_synthesize()` + `parse_rca_response()` (hypothesis parser: text\|evidence_weight\|sources); `POST /search/rca-pack` (3-parallel: Neo4j events + Supabase operational_events + asset class, then Qdrant kairos_knowledge semantic, then LLM); safety-critical keyword refusal; graceful LLM-unavailable fallback; audit_log write | P-101 seeded with 3 Event nodes; POST /search/rca-pack → timeline=13 events (3 neo4j + 10 operational) in chronological order; synthesis_available=false (no LLM key); fallback returns raw timeline+docs; audit_log rca_pack_generated entity_id=P-101 timeline_events=13 ✅ |

| 30 | Recurring Failure Detection — `FAILURE_FAMILIES` shared dict (`api/utils/failure_families.py`); recurrence detection in `POST /events/work-order` (90-day WO history query, `event_subtype='recurring'`); `recurring_failure_detected` event published; `assemble_recurring_failure_brief` in `BriefEngine`; migration `012_event_subtype.sql` | P-101 with 3 prior WOs: `recurring_detected=True`, brief b11d1f34 delivered `priority=high`, headline "3 time(s) in 90 days" ✅ |

| 31 | Off-Boarding Interview Series — migration `013_offboarding_sessions.sql` (2 tables: `offboarding_sessions`, `offboarding_session_items`); `workers/offboarding.py` Celery task `generate_offboarding_questions` on `elicitation` queue (Neo4j equipment-family gap query → LLM offboarding prompt → 5 fallback questions if LLM unavailable); 5 endpoints on `/elicitation/offboarding`; `quarantine_items_input_type_check` constraint extended to include `offboarding_response`; `elicitation` queue added to Celery worker in `docker-compose.yml` | `POST /elicitation/offboarding` → 6 items across centrifugal_pump/PUMP/pump/vessel/heat_exchanger/compressor, session 1 fired in 10s, `questions_ready`; responses submitted → quarantine item f0dd5def `input_type=offboarding_response` with full `session_context` (session_id, session_number, equipment_family, questions, personnel_id); `GET /elicitation/offboarding` → completion_pct=17% (1/6 done); `GET /elicitation/offboarding/{id}` → all items with statuses ✅ |

| 32 | Validation Corpus + Model Gate — migration `014_validation_corpus.sql`; corpus ingestion via `promote_quarantine_item` (`authority='human_promotion'`) and `POST /annotations` with `is_correct=True` (`authority='annotation_correction'`); `workers/model_validation.py` Celery task on `validation` queue (NER over corpus, precision/recall/F1 per entity type, baseline gate via `audit_log`); 3 governance endpoints: `GET /governance/validation-corpus/stats`, `POST /governance/model-gate/run`, `GET /governance/model-gate/history`; `docker-compose.yml` updated with `validation` queue | Corpus has 2 `ASSET_TAG` rows; run 1 passed (F1=1.0, no baseline); run 2 correctly failed (F1=0.667 < incumbent 1.0); all 3 endpoints verified ✅ |

| 33 | Equipment Tag-Out + Inspection Completion Events — `POST /events/tag-out` (dedup, `REDIS_STREAM_TAG_OUT`, delayed brief), `POST /events/inspection-complete` (Neo4j INSPECTION_RECORD edge if doc_id, quarantine if confidence<0.7, immediate brief on result=failed/findings, correlate_events); `BriefEngine.assemble_tag_out_brief` + `assemble_inspection_brief` + 4 helpers; `REDIS_STREAM_TAG_OUT` + `REDIS_STREAM_INSPECTIONS` in config+.env.example; `TagOutEvent`+`InspectionCompleteEvent` models; dispatch cases in `brief_assembly.py` | P-101 tag-out → operational_events+audit_log verified; P-101 inspection with DOC-INSP-P101-2026 → Neo4j KNOWLEDGE_EDGE confidence=1.0 authority=4 verification_status=unverified (all 6 props); inspection brief b06f496c priority=high; tag-out brief "7 downstream dependencies" assembled ✅ |

| 34 | Governance SLA Tracking + Escalation — migration `015_sla_tracking.sql` (`escalated_at`+`escalated_to` on `knowledge_conflicts`; `sla_due_at DEFAULT NOW()+5d`+`escalated_at` on `quarantine_items`); `api/services/sla_service.py` `SLAService.check_and_escalate()` (lazy, idempotent, writes `audit_log` action=`sla_escalated`); lazy check at top of `GET /conflicts`, `GET /quarantine`, new `GET /governance/sla-report`; `deviation_flag` inserts override `sla_due_at` to 24h; responses enriched with `sla_due_at`+`is_overdue` | Inserted conflict with `sla_deadline=NOW()-1m` → sla-report returned `conflicts_escalated=1`, `escalated_at` populated in DB, `sla.conflict_escalated` in logs; second call → `escalated_this_run=0` (idempotent); `GET /conflicts` fields include `sla_due_at`, `is_overdue`; `GET /quarantine` fields include `sla_due_at`, `is_overdue` ✅ |

### All 34 tasks complete.
Full spec in `IMPLEMENTATION.md`.

---

## Cloud-First Model Architecture (finalized — do not revert)

All inference runs via cloud API. No local model packages except the YOLO/ultralytics stack (untouchable — drawing parser).

| Concern | Primary | Fallback |
|---|---|---|
| LLM synthesis | NIM `meta/llama-3.3-70b-instruct` | Ollama `qwen2.5:14b` |
| NER | NIM `mistralai/ministral-14b-instruct-2512` | Ollama `llama3.1:8b` → regex |
| OCR | NIM `nvidia/nemotron-ocr-v2` | PyMuPDF fast path (native digital PDFs only) |
| Embeddings | Jina AI `jina-embeddings-v3` (1024-dim) | Ollama `nomic-embed-text` |
| STT (voice) | Groq `whisper-large-v3` | none |
| VLM | deferred | — |

**All model names live in `.env`** — never hardcode in service files:
`NVIDIA_NIM_MODEL`, `NVIDIA_NIM_NER_MODEL`, `NVIDIA_NIM_OCR_MODEL`, `OLLAMA_NER_MODEL`, `GROQ_WHISPER_MODEL`, `JINA_EMBED_MODEL`

`requirements-ml.txt` deleted — merged into single `backend/requirements.txt`. Do not recreate it.

Do not add: `openai-whisper`, `faster-whisper`, `paddleocr`, `paddlepaddle`, `gliner`, `sentence-transformers`, `transformers` (for NER/OCR), any local VLM package.

---

## Known Pitfalls (read before touching these areas)

**Celery workers — lazy imports only.**
Workers (`backend/workers/*.py`) cannot import `api.services.*` at module level — Celery forks at startup before the app path is set. Pattern:
```python
import sys
sys.path.insert(0, "/app")

@celery_app.task(...)
def my_task(...):
    from api.services.foo import FooService  # lazy import inside task body
    ...
```

**`asset_id` in `quarantine_items` — use `None`, not `""`.**
The column has a FK constraint to the `assets` table. An empty string `""` fails the constraint. When asset is unknown, pass `asset_id=None` so it inserts as SQL NULL.

**Supabase auth — never call auth methods on the global service-role client.**
`POST /auth/login` and `/refresh` must use a fresh anon client. Calling `auth.sign_in_with_password()` on the service-role client contaminates its session and causes RLS violations on all subsequent table writes.

**NIM container env changes — force recreate, not restart.**
`NVIDIA_NIM_MAX_TOKENS=512` and any `.env` change to the API container requires:
`docker compose up -d --no-deps --force-recreate kairos-backend-api`
A plain restart does not re-read `.env`.

**Internal service auth (Go connector + testing admin endpoints).**
The Go connector uses `INTERNAL_API_KEY` as a Bearer token. `get_current_user` in FastAPI detects this and returns a service account with `role=admin`, bypassing Supabase token verification. Default dev value: `kairos-internal-dev-key`. Use this when testing `require_role("admin")` endpoints (e.g. `POST /governance/model-gate/run`) without a real admin JWT.

**`quarantine_items.input_type` CHECK constraint must be updated for new input types.**
The constraint is `CHECK (input_type = ANY (ARRAY[...]))`. Adding a new `input_type` value requires `ALTER TABLE quarantine_items DROP CONSTRAINT quarantine_items_input_type_check` then re-adding it with the new value included. Current allowed values: `field_observation`, `voice_note`, `elicitation_response`, `deviation_flag`, `offboarding_response`.

**`audit_log` column is `timestamp`, not `created_at`.**
The `audit_log` table uses `timestamp TIMESTAMPTZ` as its time column. Any `.order("created_at", ...)` or `.select("..., created_at")` query against `audit_log` will fail with `column audit_log.created_at does not exist`.

**`workflow.logger` in Temporal is a stdlib logger, not structlog.**
`workflow.logger` wraps Python's stdlib `logging.Logger`. It does NOT accept keyword arguments. Calling `workflow.logger.error("msg", key=val)` raises `TypeError: Logger._log() got an unexpected keyword argument`. Always use f-strings: `workflow.logger.error(f"event key={val}")`. This is distinct from structlog (used everywhere else in the codebase) which does accept keyword args.

**Work order dedup key — `asset_id:event_type`, 10-minute window.**
The dedup key used in Redis is `kairos:dedup:{asset_id}:{event_type}`. Any two work orders for the same `asset_id` + `event_type` arriving within 10 minutes collapse to a single event (`status: deduplicated`). Tests that need to verify dedup behavior must use a fresh unique `asset_id` per test — reusing `shared_asset_id` within the dedup window will make the first call deduplicated.

**Site-wide briefs — addressed to `site-{site_id}`, visible to all site users.**
`BriefEngine.deliver()` sets `user_id = f"site-{site_id}"` for non-PTW, non-WO-assigned briefs. `GET /briefs` returns briefs where `user_id` matches the requesting user's `user_id` OR the requesting user's `site_id` (i.e., `site-SITE_001` briefs appear for any user on SITE_001). A fresh agent adding a brief type must follow this pattern or the brief will never appear for field workers.

**Celery queues — all six must be registered on the worker.**
The Celery worker in `docker-compose.yml` must include all active queues in its `--queues` flag: `ingestion`, `extraction`, `attribution`, `transcription`, `elicitation`, `validation`. Adding a new queue (e.g., Task 31 added `elicitation`, Task 32 added `validation`) requires updating the `command:` in `docker-compose.yml` AND recreating the container: `docker compose up -d --no-deps --force-recreate kairos-celery-worker`.

**NIM 70B model timeout — use fallback model for dev.**
`meta/llama-3.3-70b-instruct` on NVIDIA NIM frequently times out under current API load. `mistralai/ministral-8b-instruct-2410` (8B) is confirmed working. The graceful fallback chain is active — LLM synthesis endpoints return `synthesis_available=false` with raw sources rather than erroring. Do not assume LLM output is available in dev without checking the `synthesis_available` field.

**NIM OCR uses a different base URL and request format than LLM/NER models.**
The OCR model (`nvidia/nemotron-ocr-v2`) is a CV API endpoint, NOT a chat completions endpoint:
- LLM/NER: `https://integrate.api.nvidia.com/v1/chat/completions` (OpenAI-compatible, payload uses `messages`)
- OCR: `https://ai.api.nvidia.com/v1/cv/nvidia/nemotron-ocr-v2` (CV API, payload uses `{"input": [{"type": "image_url", "url": "..."}]}`)
- Response: `{"data": [{"text_detections": [{"label": "detected text"}]}]}`
- Inline image limit: 180KB base64 (pages rasterized at 96 DPI to stay under this)
- Fast paths bypass OCR entirely: `text/plain` → UTF-8 decode; `application/pdf` with native text → PyMuPDF

**`valid_to` on KNOWLEDGE_EDGE — use sentinel, never NULL.**
Neo4j silently drops properties set to `null`. Passing `valid_to=None` means the property never appears in `edge.keys()`, breaking the "all 6 properties" invariant. `GraphService.create_knowledge_edge()` now defaults to `_OPEN_VALID_TO = datetime(9999, 12, 31, 23, 59, 59, tzinfo=timezone.utc)` when no `valid_to` is given. All "currently active" queries use `(r.valid_to IS NULL OR r.valid_to > datetime())` to handle both legacy NULL edges and new sentinel edges.

**`pid_drawing` document type bypasses OCR entirely.**
When `document_type='pid_drawing'`, the Temporal pipeline skips `run_ocr` (no NIM OCR call, `ocr_confidence=null`) and instead loads `fixtures/pid_topology_mock.json`. All extracted concepts are written with `verification_status='unverified'` and `authority_level=3`. The `GET /documents/{id}/topology` endpoint is only available for `pid_drawing` docs — all other types return 404.

---

## Critical Post-Volume-Reset Steps
After `make nuke`, run in order:
1. `make init-all` — Neo4j constraints + Qdrant collections
2. `docker exec kairos-backend-api python scripts/seed_regulations.py` — 12 regulations (OISD-117 + ISO 45001)
3. `docker exec kairos-backend-api python scripts/seed_users.py` — admin/engineer/field_worker Supabase auth users

## Test Users
- `admin@kairos.local` / `KairosAdmin123!` → role: admin
- `engineer@kairos.local` / `KairosEngineer123!` → role: engineer
- `field_worker@kairos.local` / `KairosField123!` → role: field_worker

---

## Integration Test Suite (150 passed, 1 skipped, 1 flaky)

**Run:** `docker exec kairos-backend-api python -m pytest tests/ -q --timeout=120`
**Full docs:** `docs/TESTS.md`

`test_rca_pack_refused_on_low_confidence_safety` — flaky: times out when Temporal/LLM cold-starts after a container rebuild. Run it in isolation with `--timeout=300` after services stabilize.

---

## Repo Structure (post-restructure)

`backend/` is Python-only. Infra configs and shared data live at the repo root:
- `db/` — Neo4j schema + Supabase migrations (was `backend/db/`)
- `fixtures/` — mock data (`pid_topology_mock.json`) (was `backend/fixtures/`)
- `infra/` — grafana, otel, policies, tempo, temporal configs (was `backend/{grafana,otel,policies,tempo,temporal}/`)

All 4 Python containers (`kairos-backend-api`, `kairos-celery-worker`, `kairos-temporal-activity-worker`, `kairos-elicitation-worker`) mount `./fixtures:/app/fixtures` and `./db:/app/db` so existing code paths remain valid with no Python changes.

`kairos-temporal-worker` renamed to `kairos-celery-worker` (it runs Celery, not Temporal activities).

### Files
`tests/conftest.py`, `test_health.py`, `test_auth.py`, `test_assets.py`, `test_documents.py`, `test_db_writes.py`, `test_annotations.py`, `test_events.py`, `test_briefs.py`, `test_search.py`, `test_governance.py`, `test_compliance.py`, `test_elicitation.py`, `test_audit_log.py`, `test_ot_connector.py`

### Key decisions
- `admin_client` uses `INTERNAL_API_KEY` (`kairos-internal-dev-key`) not Supabase JWT. Never expires. Eliminates mid-run 401 failures.
- `tests/__init__.py` (empty) + `PYTHONPATH=/app` in docker-compose required to prevent ML library's `tests` package in site-packages from shadowing `/app/tests/`.
- `pytest.ini` has `asyncio_mode = auto` — no `@pytest.mark.asyncio` decorators needed.
- Volume mounts: `./tests:/app/tests` + `./pytest.ini:/app/pytest.ini` on `kairos-backend-api`.

### Coverage highlights
- All 34-task endpoints covered
- DB-level verification: Neo4j KNOWLEDGE_EDGE (all 6 props), Qdrant vectors, ES documents
- Attribution worker: `rating=incorrect` → `confidence_recheck_queued` in audit_log verified
- Go connector: OT query, coverage, EAM sync, WO forwarding to FastAPI

### Pitfall: JWT expiry mid-run
Supabase JWT TTL can be shorter than a 9-minute suite run. Admin endpoints must use `INTERNAL_API_KEY`. Engineer/field tokens (session-scoped) can still expire on slow stacks — if seen, shorten suite or refresh tokens between files.

## Supabase
Project ID: `ernffgrvdcikwwhkhiix` · Storage bucket: `kairos-vault`
