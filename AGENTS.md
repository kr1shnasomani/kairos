# KAIROS — Agent Context

## Essential Reading (load before anything else)
- `docs/PROBLEM_STATEMENT.md` — what this platform is for and why it matters. Every decision must trace back to this.
- `IMPLEMENTATION.md` — full task specs. The contract for every build.
- `docs/ARCHITECTURE.md` — 13-layer design. Understand the layer a task lives in before touching it.

---

## Current State

**Phase:** 1 — Retrieval Only. Do not wire Phase 2 (LLM synthesis) or Phase 3 (proactive push) into active code paths.

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

### Mainline Quality Audit — Completed
All 15 tasks verified on the mainline (no fallback). Key fixes applied during audit:
- **Auth (Task 14)**: `get_current_user` now uses `supabase.auth.get_user(token)` with a fresh anon client for token verification (Supabase issues ES256 tokens; HS256 decode was failing). Role extracted from `user_metadata.role`.
- **RLS fix**: `POST /auth/login` was calling `auth.sign_in_with_password()` on the global service-role client, which contaminated its session and caused RLS violations on all subsequent table writes. Fixed by using a separate fresh anon client for all auth operations in `auth.py`.
- **Briefs (Task 12)**: `GET /briefs` now also returns site-wide briefs (`recipient_user_id = "site-{site_id}"`), not just user-specific ones. Work orders without `assigned_technician_id` are addressed site-wide.
- **Search (Task 7)**: `document_type` was missing from ES search result dicts. Fixed in `SearchEngineService.search_documents()`.
- **NIM timeout**: `NVIDIA_NIM_MAX_TOKENS=512` in `.env` — container must be **recreated** (`docker compose up -d --no-deps kairos-backend-api`) for env change to take effect.
- **Test users**: Run `docker exec kairos-backend-api python scripts/seed_users.py` after volume reset. Creates `admin@kairos.local`, `engineer@kairos.local`, `field_worker@kairos.local`.
- **Internal service auth (Task 17)**: Go connector uses `INTERNAL_API_KEY` as Bearer token → `get_current_user` returns `role=admin` service account without hitting Supabase.

### All 18 Tasks Complete ✅
Full spec in `IMPLEMENTATION.md`. All backend tasks verified end-to-end.

---

## Task Protocol (follow every time, no exceptions)

### 1 — Full Context Before Writing Anything
- Read the full task spec in `IMPLEMENTATION.md`.
- Read every file you will touch, end-to-end. Trace the call chain: router → service → db/external.
- Check the completed table above — don't re-implement verified work.
- Identify which architecture layer the task lives in (`docs/ARCHITECTURE.md`).

### 2 — Plan
- State exactly which files change and what each change does.
- Invoke `/ponytail lite` (minimum) before planning. YAGNI applies. Reuse what exists. No abstractions for one use case.
- Check `SKILL_MANIFEST.md` for relevant skills and invoke any that apply — skills are mandatory, not optional. Search by domain keyword (e.g. "neo4j", "qdrant", "temporal", "fastapi") to find the right one quickly.

### 3 — Build
- Docker is the only runtime. No local `python`, no `pip install` outside containers.
- Hot-reload is active — edits apply immediately. Rebuild only if new pip deps added.
- After edits: AST parse check before waiting on Docker (`python3 -c "import ast; ast.parse(open('f').read())"`).
- Root-cause errors, don't patch symptoms. One fix in the shared function beats guards at every caller.
- Log with `structlog`. Never `print()`, never stdlib `logging`.
- Stay in scope. If something unrelated is broken, note it — don't fix it mid-task.

### 4 — Verify End-to-End (nothing is done until this passes)
- Run the exact test cases from `IMPLEMENTATION.md` spec via live HTTP calls against the running stack.
- Read container logs: `docker logs kairos-backend-api 2>&1 | tail -30`. No silent errors allowed.
- Confirm writes in the actual database (Supabase/Neo4j/Qdrant/ES) — not just the HTTP response.
- Update the completed table above with a concrete "Verified By" entry.
- Delete any temp files, test scripts, or scratch PDFs created during the task.

---

## Stack
FastAPI (Python 3.12) · Neo4j 5.20 · Qdrant · Elasticsearch 8.13 · Redis 7.2 · Temporal.io · Celery · Go (Gin) · OPA · HashiCorp Vault · OpenTelemetry → Grafana · Supabase (Postgres + Storage + Auth)

## Dev Commands
```bash
make dev        # Build + start all services
make stop       # Stop all
make nuke       # Destroy all volumes — irreversible
make init-all   # First-time: Neo4j constraints + Qdrant collections
make logs       # Tail all service logs
make ps         # Container status
```
**Ports:** API `8000` · Neo4j `7474/7687` · Qdrant `6333` · ES `9200` · Redis `6379` · Temporal `7233` · Temporal UI `8088` · Grafana `3001`

---

## Non-Negotiable Rules

**Neo4j edges — all 6 properties on every write, no exceptions:**
`valid_from` · `valid_to` · `authority_level` · `document_id` · `confidence` · `verification_status`

**Vault is permanent.** Never delete. Never overwrite. Supersede by closing `valid_to`. Supabase Storage artifacts are immutable.

**Quarantine is a one-way gate.** `confidence < 0.7` or unresolved entity → `quarantine_items`. Human action only to promote. No auto-promotion ever.

**Asset nodes:** `MERGE (a:Asset {asset_id: $id}) SET a += $props` — never CREATE.

**Authority pre-filter before graph traversal:**
`WHERE r.authority_level <= $max_level AND r.valid_from <= $as_of`

**Safety-critical queries** (pressure limits, interlock sequences, torque specs): explicit refusal, never hedged answers. Sources returned directly.

**Phase discipline:** Phase 2 LLM synthesis lives only in `POST /search/synthesize` — never auto-triggered. Phase 3 push never wired until Phase 2 is stable.

**EEMUA 191 Governor:** call `EventBusService.check_governor(user_id)` before every brief delivery. Hard ceiling ≤6 push events/operator/hour. PTW briefs always exempt.

**Secrets:** never hardcode. All via `api/config.py` Settings → env vars.

**OT Connectors:** historian data is ephemeral — query, reason in memory, discard. Never store time-series in KAIROS.

---

## Code Style
- Routers thin — handler calls service, returns result. No business logic in routers.
- All service logic in `backend/api/services/`.
- Pydantic model for every request and response shape.
- `async/await` throughout. No blocking I/O in async handlers.
- Never `SELECT *`. Never wildcard CORS `"*"` in production.
- Never touch `frontend/` — deferred.

---

## Where Things Live
| Concern | Path |
|---------|------|
| FastAPI entrypoint | `backend/api/main.py` |
| Settings | `backend/api/config.py` |
| Dependency injection | `backend/api/dependencies.py` |
| Routers | `backend/api/routers/*.py` |
| Services | `backend/api/services/*.py` |
| Pydantic models | `backend/api/models/*.py` |
| Temporal workflow | `backend/workflows/document_pipeline.py` |
| Temporal worker | `backend/workers/temporal_worker.py` |
| Celery worker | `backend/workers/celery_app.py` |
| Go OT connectors | `backend/connectors/` |
| Neo4j schema | `backend/db/neo4j/init_schema.cypher` |
| Supabase migrations | `backend/db/migrations/` |

---

## Available Tooling
- **GitHub CLI (`gh`)** — available in terminal. Use for PR creation, issue management, CI status checks.
- **Supabase MCP** — direct Supabase access via MCP tools (`mcp__claude_ai_Supabase__*`). Use for running SQL, checking migrations, inspecting table state, and applying schema changes without going through the API. Prefer this over `docker exec` for Supabase-related diagnostics.

---

## Skills
**`/ponytail` is mandatory for every task.** Use `lite` by default, `full` for complex tasks, `ultra` when asked to cut scope.

All 59 skills are in `.claude/skills/` (symlinked from `.agents/skills/`). Full index: `SKILL_MANIFEST.md`.
Before starting any task, search `SKILL_MANIFEST.md` for skills matching your domain — don't guess, scan. Key domains: `neo4j`, `qdrant`, `temporal`, `fastapi`, `elasticsearch`, `redis`, `supabase`, `grafana`, `celery`, `golang`, `python`, `opentelemetry`, `docker`.
Invoke matching skills before writing code in that domain. Skills give current API patterns — don't rely on training data for library-specific calls.
