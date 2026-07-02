**Phase:** All 3 phases live. Phase 1 (retrieval), Phase 2 (LLM synthesis via `POST /search/synthesize`), Phase 3 (proactive push via event-driven brief delivery + EEMUA 191 governor).

### Completed (verified, running)
| Task | What | Verified By |
|------|------|-------------|
| 1 | DB schema + `/health/detailed` pings all 5 services | `GET /health/detailed` → all ok |
| 2 | Asset MDM — all 6 `/assets/*` endpoints, Neo4j + Supabase + ES | Asset P-101 created, retrieved |
| 3 | Immutable vault — `POST /documents/ingest`, SHA-256 dedup, Temporal trigger | Full ingest + status poll |
| 4 | OCR Temporal activities — `store_in_vault`, `run_ocr`, `mark_complete` | Pipeline runs to `complete`, confidence=0.95 |
| 5 | NER + entity-to-asset linking — `run_ner`, `link_to_graph`, `create_knowledge_edge` | All 7 stages; Neo4j edge with all 5 properties verified |
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
| 29 | RCA Pack Generation — `RCAPackRequest`+`RCAPackResponse` models; `GraphService.get_event_timeline()` (property + EXISTS relationship query, chronological); `LLMService.rca_synthesize()` + `parse_rca_response()` (hypothesis parser: text\|evidence_weight\|sources); `POST /search/rca-pack` (3-parallel: Neo4j events + Supabase operational_events + asset class, then Qdrant kairos_knowledge semantic, then LLM); safety-critical keyword refusal; graceful LLM-unavailable fallback; audit_log write | P-101 seeded with 3 Event nodes; POST /search/rca-pack → timeline=13 events (3 neo4j + 10 operational) in chronological order; synthesis_available=false (no LLM key); fallback returns raw timeline+docs; audit_log rca_pack_generated entity_id=P-101 timeline_events=13 ✅ |

| 25 | Frontend Integration Contracts — consistent list envelope `{items,total,limit,offset}` on `GET /assets`, `/governance/conflicts`, `/governance/quarantine`, `/compliance/gaps`; `GET /assets/{id}` enriched with `open_work_orders_count`+`compliance_gap_count`+`last_inspection_date` (3-parallel); `GET /search` now batch-fetches `vault_url` from Supabase after results; `GET /briefs` governor_state nested as `{push_count_last_hour,ceiling,state}` + `next_delivery_allowed_at` via Redis TTL; quarantine items include `session_context`; new `GET /audit-log` endpoint with entity_type/entity_id/action filters | `GET /assets/` → keys=[items,total,limit,offset]; `GET /assets/P-101` → open_work_orders_count=12, compliance_gap_count=0; `GET /search?q=seal+failure` → vault_url populated on all results; `GET /briefs` → governor_state nested object; `GET /audit-log?entity_type=document&entity_id=DOC-EYWSVST98CCJ` → 2 entries chronological ✅ |

| 26 | Delay Compensation — `workers/brief_assembly.py` (new Celery task `assemble_brief` on ingestion queue); WO + shift-handover handlers: `apply_async(countdown=LATE_ARRIVAL_WINDOW_MINUTES*60)` + store task_id at `kairos:brief_pending:{asset_id}` in Redis (TTL=window+60s); second event for same asset revokes existing task; PTW handler: stays immediate but revokes pending WO task before assembling; fixed `.decode()` (redis client has `decode_responses=True`) | WO for P-101 → `brief_task_id` + `brief_due_in_seconds=300` returned; Redis key set; PTW for P-101 within window → `events.ptw_revoked_pending_brief` logged; Celery worker: `Tasks flagged as revoked: f2f1dd8f`; PTW brief `c88d8f3e` delivered immediately; `assemble_brief` task manually invoked for HX-301 → brief `dd9f9739` delivered ✅ |

| 27 | Event Correlation — migration `010_compound_events.sql` (`compound_event_id UUID` + index on `operational_events`); `EventBusService.correlate_events(asset_id, event_id, occurred_at, supabase)` queries same-asset events within `DEDUP_WINDOW_MINUTES`, assigns shared UUID to all; called from WO + alarm handlers; `BriefEngine._get_correlated_events()` fetches via `compound_event_id` and appends DCS/PTW/shift context to brief body; `GET /events/{event_id}` returns event + `correlated_event_ids: []` | WO + alarm for P-101 → `compound_event_id=2623de53` linked both; `GET /events/{WO_ID}` → `correlated_event_ids=[alarm_event_id]`; brief body → `[DCS ALARM correlated] Tag: P-101-VIBE-HIGH` ✅ |

| 28 | State-Based Push Suppression — `plant_operating_states` table (migration `011_plant_state.sql`); `PLANT_STATE_DEFAULT=normal` in config; `EventBusService.get_plant_state()/check_governor()` with plant-state gate before hourly count; `POST /events/plant-state` (engineer/admin, upserts state+audit_log) + `GET /events/plant-state/{site_id}`; `GET /briefs` suppresses normal-priority briefs during turnaround/shutdown/emergency while always passing critical (PTW) | SITE_001 → turnaround: suppressed_count=3, 0 normal briefs returned; POST PTW → critical brief fa62fcbe delivered (total_pending=1); reset to normal → suppressed_count=0, 4 briefs returned ✅ |

### All 29 Tasks Complete ✅
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

**Internal service auth (Go connector).**
The Go connector uses `INTERNAL_API_KEY` as a Bearer token. `get_current_user` in FastAPI detects this and returns a service account with `role=admin`, bypassing Supabase token verification.

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

## Supabase
Project ID: `ernffgrvdcikwwhkhiix` · Storage bucket: `kairos-vault`
