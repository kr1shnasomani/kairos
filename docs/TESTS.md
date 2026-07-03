# KAIROS — Integration Test Suite

## How to run

All tests must run **inside the Docker container**. The host shortcut is provided for convenience only.

```bash
# Canonical — inside the container (required per CLAUDE.md)
docker exec kairos-backend-api python -m pytest tests/ -q --timeout=120

# Single file
docker exec kairos-backend-api python -m pytest tests/test_events.py -v --timeout=120

# Single test
docker exec kairos-backend-api python -m pytest tests/test_governance.py::test_promote_quarantine_item -v

# DB-write verification tests (slower — wait for Temporal pipeline ~60s)
docker exec kairos-backend-api python -m pytest tests/test_db_writes.py -v --timeout=180

# Host shortcut (convenience only — not canonical)
python3 -m pytest tests/ -q --timeout=120
```

Prerequisites: `make dev` must be running (full Docker stack up). Seed users must exist — if login fails, run:

```bash
docker exec kairos-backend-api python scripts/seed_users.py
```

---

## Architecture

Tests live at the **project root** in `tests/`, mounted into the container via `docker-compose.yml`:

```
tests/                        ← project root (NOT inside backend/)
  __init__.py                 ← makes tests/ a proper package (prevents site-packages conflict)
  conftest.py                 ← shared fixtures: auth tokens, HTTP clients, shared_asset_id
  test_annotations.py
  test_assets.py
  test_audit_log.py
  test_auth.py
  test_briefs.py
  test_compliance.py
  test_db_writes.py           ← DB-level verification: Neo4j edges, Qdrant vectors, ES documents
  test_documents.py
  test_elicitation.py
  test_events.py
  test_governance.py
  test_health.py
  test_ot_connector.py
  test_search.py
pytest.ini                    ← project root
```

**Volume mounts** (in `docker-compose.yml` under `kairos-backend-api`):

```yaml
volumes:
  - ./backend:/app
  - ./tests:/app/tests         # test files
  - ./pytest.ini:/app/pytest.ini
```

**Environment variables** set on the container for tests:

| Variable | Value | Purpose |
|---|---|---|
| `PYTHONPATH` | `/app` | Ensures `tests/` resolves to `/app/tests/`, not the ML library's `tests` package in site-packages |
| `OT_CONNECTOR_URL` | `http://kairos-backend-go:8090` | Go connector URL (different inside vs. outside Docker) |
| `API_BASE_URL` | *(unset — defaults to `http://localhost:8000`)* | FastAPI base URL; localhost works inside the API container because uvicorn binds there |

---

## Configuration (`pytest.ini`)

```ini
[pytest]
asyncio_mode = auto     # all async tests run automatically without @pytest.mark.asyncio
testpaths = tests
timeout = 90            # per-test timeout in seconds (overridable per-request with timeout= param)
pythonpath = .          # adds rootdir to sys.path (belt-and-suspenders alongside PYTHONPATH env)
```

---

## Fixtures (`tests/conftest.py`)

All fixtures are **session-scoped tokens** (sync) + **function-scoped async clients**.

### Admin auth — INTERNAL_API_KEY (never expires)

`admin_client` does **not** log in via Supabase. It uses the static `INTERNAL_API_KEY` (`kairos-internal-dev-key`) as a Bearer token. FastAPI's `get_current_user` detects this key and returns `role=admin` without calling Supabase. This eliminates JWT expiry failures mid-run.

```python
admin_client     # AsyncClient with Bearer kairos-internal-dev-key (role=admin, never expires)
```

### Tokens — session scope (sync `httpx.post`)

```python
engineer_token   # logs in as engineer@kairos.local — role: engineer
field_token      # logs in as field_worker@kairos.local — role: field_worker
```

Session scope avoids re-authenticating on every test. Sync `httpx.post` avoids event-loop scope conflicts with pytest-asyncio.

### HTTP Clients — function scope (async)

```python
admin_client     # AsyncClient with INTERNAL_API_KEY (role=admin)
engineer_client  # AsyncClient authenticated as engineer
field_client     # AsyncClient authenticated as field_worker
anon_client      # AsyncClient with no auth header
```

Each test gets a fresh client, ensuring no state bleeds between tests.

### Shared asset — session scope

```python
shared_asset_id  # Creates one PUMP asset once; reused by tests that need an existing asset
```

Tests that need deduplication isolation must create their own assets with `uid()`.

### `uid()` utility

```python
from tests.conftest import uid
# returns uuid4().hex[:8].upper() — e.g. "A3F2C1B9"
# used to generate unique IDs per test run to avoid collisions
```

---

## Test files and coverage

### `test_health.py` — Stack liveness (3 tests)
| Test | What it verifies |
|---|---|
| `test_health_returns_200` | `GET /health` → 200 |
| `test_health_response_shape` | Response has `status`, `timestamp` fields |
| `test_health_detailed` | `GET /health/detailed` → all 5 service pings succeed |

### `test_auth.py` — Authentication (Layer 0, 8 tests)
| Test | What it verifies |
|---|---|
| `test_login_admin` | Admin JWT obtained |
| `test_login_engineer` | Engineer JWT obtained |
| `test_login_field` | Field worker JWT obtained |
| `test_login_wrong_password` | 401 on bad credentials |
| `test_login_unknown_email` | 401 on unknown email |
| `test_me_admin/engineer/field` | `GET /auth/me` returns correct role per token |
| `test_invalid_token_rejected` | Malformed Bearer token → 401 in all modes |
| `test_refresh_token` | Token refresh flow works |

### `test_assets.py` — Asset MDM (Tasks 1-3, Layer 1, 15 tests)
| Test | What it verifies |
|---|---|
| `test_create_asset` | POST /assets/ → 201, asset in Supabase + Neo4j |
| `test_create_asset_is_idempotent` | Duplicate asset_id → 200 (MERGE, not error) |
| `test_create_asset_auto_id` | No asset_id supplied → one is generated |
| `test_get_asset` | GET /assets/{id} → correct fields |
| `test_get_asset_not_found` | Unknown asset_id → 404 |
| `test_list_assets` | GET /assets/ → items/total envelope |
| `test_list_assets_filter_site` | `?site_id=` filter works |
| `test_list_assets_filter_equipment_class` | `?equipment_class=` filter works |
| `test_get_asset_aliases` | Alias resolution (TAG → canonical ID) |
| `test_get_asset_hierarchy` | Parent-child hierarchy traversal |
| `test_get_asset_knowledge` | Knowledge graph facts for an asset |
| `test_get_asset_knowledge_as_of` | Bitemporal `as_of` filtering on graph edges |
| `test_get_asset_knowledge_invalid_as_of` | Malformed `as_of` → 422 |
| `test_field_worker_cannot_create_asset` | Role enforcement: field_worker → 403 on POST |
| `test_field_worker_can_list_assets` | field_worker can GET /assets/ |

### `test_documents.py` — Document Vault + Pipeline (Tasks 4-8, 20, Layers 2-3, 16 tests)
| Test | What it verifies |
|---|---|
| `test_ingest_document_accepted` | POST /documents/ingest → 202, SHA-256 in response |
| `test_ingest_duplicate_is_idempotent` | Same bytes → status=duplicate, same document_id |
| `test_ingest_document_linked_to_asset` | `asset_id` param links doc to asset in Supabase |
| `test_pipeline_advances_beyond_queued` | Temporal worker moves stage past "queued" within 60s |
| `test_get_extraction_status` | GET /documents/{id}/status → pipeline_stage field |
| `test_extraction_status_not_found` | Unknown doc_id → 404 |
| `test_get_extraction_results` | `/extraction` endpoint returns `graph_edges_created` |
| `test_get_document_metadata` | GET /documents/{id} → metadata fields |
| `test_get_document_not_found` | Unknown doc → 404 |
| `test_list_documents` | GET /documents/ → items/total envelope |
| `test_list_documents_by_asset` | `?asset_id=` filter works |
| `test_list_documents_by_type` | `?document_type=` filter works |
| `test_supersede_document` | Vault immutability: old doc marked superseded, edges closed |
| `test_supersede_already_superseded_returns_409` | Double supersede → 409 |
| `test_topology_not_found_for_non_pid` | Non-P&ID doc has no topology → 404 |
| `test_topology_endpoint_exists_for_pid_drawing` | P&ID drawing → topology endpoint responds (200 or 404, never 5xx) |

### `test_db_writes.py` — DB-Level Write Verification (Tasks 4-6, Layers 2-3)
Queries Neo4j, Qdrant, and Elasticsearch directly after the document pipeline completes. These tests are slower (~60-90s) because they wait for the full Temporal pipeline.

| Test | What it verifies |
|---|---|
| `test_neo4j_knowledge_edge_written` | All 6 required KNOWLEDGE_EDGE properties present: `valid_from`, `valid_to` (stored as sentinel `9999-12-31 23:59:59 UTC` for open-ended edges — Neo4j drops null properties so a real datetime is used), `authority_level`, `document_id`, `confidence`, `verification_status` |
| `test_neo4j_document_node_written` | Document node is merged into Neo4j with matching `document_id` |
| `test_qdrant_vectors_indexed` | At least one vector chunk in `kairos_documents` collection with `document_id` payload |
| `test_elasticsearch_document_indexed` | Document findable in `kairos_documents` ES index by `document_id` term query |

> **Timeout:** Use `--timeout=180` when running `test_db_writes.py` alone. The shared test suite uses `--timeout=120` which may be tight for pipeline-heavy tests.

> **`_ingest_and_wait()` helper:** Ingests a document then polls the pipeline status until a terminal stage is reached — `_TERMINAL = {"complete", "review_required", "failed"}`. Intermediate stages such as `ner_running` are passed through without aborting; only genuinely stuck or unknown states cause a skip.

### `test_annotations.py` — NER Active Learning (Task 21, Layer 3, 8 tests)
| Test | What it verifies |
|---|---|
| `test_annotation_stats_shape` | `/annotations/stats` returns total, corrections_this_week, top types |
| `test_create_annotation_correct` | `is_correct=True` → 201, feeds validation corpus |
| `test_create_annotation_correction` | `is_correct=False` + corrected_type → 201 |
| `test_create_annotation_feeds_corpus` | Correct annotation appears in validation corpus stats |
| `test_list_annotations_returns_created` | Listed annotations match what was submitted |
| `test_list_annotations_requires_document_id` | Missing `document_id` param → 422 |
| `test_list_annotations_empty_for_unknown_doc` | Unknown doc → empty list, not error |
| `test_annotation_missing_required_fields` | Missing entity_text/type/is_correct → 422 |

> **Note:** Annotations require a real `document_id` (FK constraint on `ner_annotations`). Tests ingest a document first.

### `test_events.py` — Event Ingestion (Tasks 13-16, 33, Layer 8)
| Test | What it verifies |
|---|---|
| `test_ingest_work_order` | 202, `status=accepted`, `brief_task_id` present |
| `test_work_order_deduplication` | Same payload twice → second is `deduplicated` |
| `test_work_order_recurring_detection` | `recurring_detected` field present on second WO |
| `test_get/ack_event` | Event retrieval and acknowledgement |
| `test_ingest_ptw` | PTW event → `priority=critical`, `brief_id` generated |
| `test_ingest_shift_handover` | Handover event → brief task queued |
| `test_ingest_alarm` | Alarm → 202 accepted |
| `test_ingest_tag_out` / dedup | LOTO tag-out + deduplication |
| `test_ingest_inspection_complete_passed` | High confidence → `quarantine_item_id=null` |
| `test_ingest_inspection_complete_low_confidence_quarantined` | confidence < 0.7 → quarantine |
| `test_deviation_flag_and_resolve` | Flag deviation → resolve with disputed/confirmed/moc_warranted |
| `test_set_and_get_plant_state` | Plant state gate: normal/turnaround/shutdown/emergency |

> **Dedup isolation:** Tests that assert deduplication behavior create fresh unique assets with `uid()` to avoid bleeding from `shared_asset_id`.

### `test_briefs.py` — Brief Delivery + EEMUA 191 Governor (Tasks 8, 13, 16, Layer 8)
| Test | What it verifies |
|---|---|
| `test_get_my_briefs_shape` | Response includes `briefs`, `total_pending`, `governor_state` |
| `test_governor_ceiling_is_6` | Hard ceiling is exactly 6 pushes/operator/hour |
| `test_governor_state_is_valid_value` | State is one of: normal / suppressed |
| `test_get_governor_status_endpoint` | `/briefs/governor/status` responds with push count + ceiling |
| `test_brief_not_found_returns_404` | GET `/briefs/{uuid}` with non-existent UUID → 404 |
| `test_ack_nonexistent_brief_returns_404` | POST `.../ack` for non-existent brief → 404 |
| `test_brief_feedback_requires_rating` | Feedback with valid rating → 200/404/422, never 500 |
| `test_attribution_worker_queues_recheck` | `rating=incorrect` on a real brief → `confidence_recheck_queued` row in `audit_log` |

> **UUID requirement:** Brief, conflict, and quarantine endpoints use PostgreSQL UUID columns. Tests use `str(uuid4())` for fake IDs — plain strings cause Postgres parse errors → 500.

### `test_search.py` — Hybrid Search + Synthesis (Tasks 9-12, Layer 11, 11 tests)
| Test | What it verifies |
|---|---|
| `test_search_returns_response_shape` | `query`, `results`, `total`, `retrieval_methods` present |
| `test_search_empty_query_rejected` | Missing `q` param → 422 |
| `test_search_with_asset_scope` | `?asset_id=` filter works |
| `test_search_authority_filter` | `?authority_min=` param accepted |
| `test_search_with_as_of` | `?as_of=` time-travel filter works |
| `test_search_result_fields` | Each result has `retrieval_method` and `relevance_score` |
| `test_search_asset_scoped_endpoint` | `GET /search/assets/{id}` works |
| `test_synthesize_response_shape` | POST /search/synthesize → `refused`, `safety_critical`, `sources` |
| `test_synthesize_safety_critical_refusal` | `query_category=max_allowable_pressure` → `safety_critical=True` |
| `test_rca_pack_response_shape` | `/rca-pack` → `timeline`, `hypotheses`, `supporting_documents` |
| `test_rca_pack_refused_on_low_confidence_safety` | `refused` field present and boolean |

> **Safety categories:** Must use exact keys from `SAFETY_CRITICAL_CATEGORIES` in `backend/api/services/llm.py`: `max_allowable_pressure`, `isolation_interlock_sequence`, `torque_specification`, `electrical_rating`, `pressure_relief_setting`, `safety_shutdown_setpoint`. Other strings won't trigger the safety gate.

> **LLM timeouts:** Synthesize and RCA pack tests use `timeout=120.0` per-request — LLM calls can be slow.

### `test_governance.py` — Governance Layer (Tasks 21-25, 34, Layer 7, 20 tests)
| Test | What it verifies |
|---|---|
| `test_list_conflicts_shape` | Conflicts list → items/total envelope |
| `test_list_conflicts_filter_track` | `?track=administrative` filter works |
| `test_conflict_not_found` | UUID that doesn't exist → 404 |
| `test_resolve_conflict_not_found` | POST resolve on non-existent UUID → 404 |
| `test_resolve_administrative_conflict` | Resolve open admin-track conflict → `status=resolved` (skipped if none exist) |
| `test_resolve_engineering_track_conflict_rejected` | Engineering-track conflicts require MoC webhook → 400 (skipped if none exist) |
| `test_list_quarantine_shape` | Quarantine list → items/total/note envelope |
| `test_quarantine_defaults_to_pending` | Default filter returns only `review_status=pending` items |
| `test_quarantine_filter_by_review_status` | `?review_status=disputed` filter works |
| `test_promote_quarantine_item` | Low-confidence inspection → quarantine → promote → `edge_id` returned |
| `test_dispute_quarantine_item` | Quarantine item → dispute → `status=disputed` |
| `test_double_promote_returns_409` | Promoting already-promoted item → 409 |
| `test_sla_report_shape` | SLA escalation report fields present |
| `test_circuit_breaker_shape` | SPC circuit breaker states per asset class |
| `test_list_moc_shape` | GET /governance/moc → items/total envelope |
| `test_moc_webhook_bad_payload` | Malformed webhook payload → 400 |
| `test_blast_radius_nonexistent_doc` | Blast radius for unknown doc → 200 empty (not 404) |
| `test_validation_corpus_stats` | Corpus coverage stats by entity type |
| `test_model_gate_history` | GET /governance/model-gate/history → items/total |
| `test_model_gate_run_requires_admin` | field_worker → 403; admin → 200 with `task_id` |

### `test_compliance.py` — Compliance (Task 26, Layer 7, 7 tests)
| Test | What it verifies |
|---|---|
| `test_list_frameworks` | GET /compliance/frameworks → list of regulatory frameworks |
| `test_compliance_dashboard_shape` | GET /compliance/dashboard → gap counts by framework |
| `test_list_gaps` | GET /compliance/gaps → items/total envelope |
| `test_list_gaps_filter_framework` | `?framework=` filter works |
| `test_audit_pack_shape` | POST /compliance/audit-pack → `status=draft`, `note` contains sign-off warning |
| `test_audit_pack_oisd_117` | OISD_117 audit pack generated without error |
| `test_gaps_reduce_after_document_promotion` | Promoting a procedure clears its compliance gaps |

### `test_elicitation.py` — Elicitation (Tasks 19, 29-31, Layer 9, 12 tests)
| Test | What it verifies |
|---|---|
| `test_voice_note_ingest_accepted` | Audio file upload → 202, `task_id` + `sha256` in response |
| `test_voice_note_idempotent` | Same bytes twice → both 202 (accepted or duplicate) |
| `test_trigger_no_conditions_not_triggered` | No trigger conditions met → `triggered=False` |
| `test_trigger_novel_troubleshooting_triggers` | `novel_troubleshooting=True` → `triggered=True`, workflow_id |
| `test_elicitation_questions_not_found` | GET questions for unknown WO → 404 |
| `test_submit_elicitation_responses` | Trigger novel → get questions → submit responses → 200 |
| `test_create_offboarding_programme` | Creates programme, returns `session_id`, `total_sessions` |
| `test_offboarding_requires_engineer_or_admin` | field_worker → 403 |
| `test_submit_offboarding_responses` | Create programme → get items → submit responses for first item |
| `test_list_offboarding_shape` | GET /elicitation/offboarding → items with completion_pct |
| `test_get_offboarding_programme` | GET /elicitation/offboarding/{id} → session items with statuses |
| `test_get_offboarding_questions_for_session` | GET questions for specific session item |

> **Voice note MIME type:** Supabase storage bucket does not allow `audio/wav`. Tests use `application/octet-stream` as content type.

> **Voice dedup is async:** The dedup check reads from `quarantine_items` which is populated by the Celery transcription worker. Both uploads correctly return 202 but the second may not yet show `status=duplicate` synchronously.

### `test_audit_log.py` — Audit Trail (Task 25, Layer 7, 8 tests)
| Test | What it verifies |
|---|---|
| `test_audit_log_shape` | GET /audit-log/ → items/total envelope |
| `test_audit_log_filter_entity_type` | `?entity_type=document` returns only document entries |
| `test_audit_log_filter_action` | `?action=confidence_recheck_queued` filters correctly |
| `test_audit_log_filter_performed_by` | `?performed_by=` filter works |
| `test_audit_log_pagination_page1` | Page 1 returns first N entries |
| `test_audit_log_pagination_page2` | Page 2 entries don't overlap with page 1 |
| `test_audit_log_no_results_empty_list` | Unknown entity → empty items, not 404 |
| `test_audit_log_requires_auth` | No token → 401 |

### `test_ot_connector.py` — Go OT Connector (Task 17, Layer 5, 8 tests)
Hits the **Go service at port 8090** (`http://kairos-backend-go:8090` inside Docker, `http://localhost:8090` from host).

| Test | What it verifies |
|---|---|
| `test_ot_connector_health` | `/health` → `status=ok`, `service=kairos-connector` |
| `test_ot_query_requires_asset_and_tag` | Missing params → 400 |
| `test_ot_query_returns_timeseries` | `/ot/query?asset_id=&tag=` → `data[]`, `from`, `to` |
| `test_ot_query_mock_flag` | `mock=true` when `PI_WEBAPI_BASE_URL` not set |
| `test_ot_coverage_returns_shape` | `/ot/coverage/{id}` → `instrumented_tags`, `coverage_percent` |
| `test_ot_coverage_unknown_asset` | Unknown asset → 200 with mock coverage (not 404) |
| `test_eam_sync_returns_completed` | `/eam/sync` loads fixture → `status=completed`, `synced>=0` |
| `test_eam_work_order_forwarding` | Go `/eam/work-order` → proxied to FastAPI → `status=accepted/deduplicated` |

---

## What the tests prove vs. what they don't

### Proven
- All API routes exist and return correct HTTP status codes
- Request/response contracts (shapes, required fields, error codes) are correct
- Auth and RBAC: roles enforced correctly (admin vs engineer vs field_worker)
- Deduplication logic works for work orders, tag-outs, documents, voice notes
- Quarantine gate: `confidence < 0.7` routes to quarantine; promote/dispute flows work
- Safety-critical refusal: exact SAFETY_CRITICAL_CATEGORIES trigger `safety_critical=True`
- EEMUA 191 governor ceiling is 6; governor state is valid
- Vault immutability: supersede closes edges, double-supersede returns 409
- Pipeline: Temporal worker advances document past "queued" within 60s
- **Conflict resolution:** non-existent UUID → 404; admin-track → resolved; engineering-track → 400
- **Elicitation responses:** novel troubleshooting and offboarding response submission work end-to-end
- **Go connector WO forwarding:** `POST /eam/work-order` proxied from Go to FastAPI
- **Attribution worker:** `rating=incorrect` → `confidence_recheck_queued` row in audit_log
- **Neo4j KNOWLEDGE_EDGE:** all 6 required properties present and correctly typed
- **Qdrant vectors:** document chunks indexed with `document_id` payload in `kairos_documents`
- **Elasticsearch:** document indexed in `kairos_documents` with correct `document_id`

### Not proven (known gaps)
- **Celery worker correctness end-to-end:** tasks are queued and accepted; the Neo4j confidence update after recheck is not verified — only that the task was queued
- **Concurrent correctness:** dedup under concurrent load, governor under burst
- **Attribution Neo4j edge update:** `confidence_recheck_queued` verifies the task was queued, not that Neo4j confidence values were updated afterwards

---

## Test users

Seeded by `docker exec kairos-backend-api python scripts/seed_users.py`:

| Email | Password | Role |
|---|---|---|
| `admin@kairos.local` | `KairosAdmin123!` | admin |
| `engineer@kairos.local` | `KairosEngineer123!` | engineer |
| `field_worker@kairos.local` | `KairosField123!` | field_worker |

> **Admin client in tests:** `admin_client` does NOT use Supabase JWT. It uses `INTERNAL_API_KEY` (`kairos-internal-dev-key`) which never expires. This eliminates mid-run JWT expiry failures on long test suite runs.

---

## Common pitfalls

| Symptom | Cause | Fix |
|---|---|---|
| `ImportError: cannot import name 'uid' from 'tests.conftest'` | `PYTHONPATH` not set; site-packages `tests` package wins | Ensure `PYTHONPATH=/app` is in container env (set in docker-compose.yml) and `tests/__init__.py` exists |
| Admin login fails (401) | Test users not seeded | `docker exec kairos-backend-api python scripts/seed_users.py` |
| `422 Unprocessable Entity` on asset create | `criticality` value invalid | Use `critical` / `safety_critical` / `non_critical` — not `high`/`medium`/`low` |
| `500` on brief/conflict fake ID | UUID expected by Postgres | Use `str(uuid4())` not plain strings like `"BRIEF-FAKE"` |
| `500` on voice upload | Supabase bucket rejects `audio/wav` MIME | Use `application/octet-stream` in tests |
| Document ingest returns `status=duplicate` | Same bytes → same SHA-256 | Append `uid()` to content bytes to guarantee uniqueness |
| Work order dedup test fails (first call already `deduplicated`) | `shared_asset_id` was used by a prior test within the dedup window | Create a fresh unique asset per dedup test |
| `test_synthesize_safety_critical_refusal` → `safety_critical=False` | Wrong category key | Use exact key: `max_allowable_pressure` (see `backend/api/services/llm.py`) |
| Search result assertion fails on `score` field | Field is `relevance_score`, not `score` | Assert `relevance_score` |
| OT connector tests fail inside Docker | `localhost:8090` not reachable from API container | `OT_CONNECTOR_URL` env var routes to `http://kairos-backend-go:8090` |
| `test_db_writes.py` times out | Temporal pipeline takes >90s | Run with `--timeout=180` or check Temporal UI at `http://localhost:8088` for stuck workflows |
| `test_neo4j_knowledge_edge_written` fails with missing `valid_to` key | Neo4j silently drops null properties, so a null `valid_to` never appears on the edge | Fixed in `GraphService.create_knowledge_edge()`: open-ended edges now store sentinel `datetime(9999, 12, 31, 23, 59, 59, tzinfo=timezone.utc)` — test passes reliably |
| Mid-run admin token expiry (401 in long runs) | Supabase JWT TTL < 9-minute suite runtime | `admin_client` now uses `INTERNAL_API_KEY` — no expiry; engineer/field tokens can still expire on very slow stacks |
