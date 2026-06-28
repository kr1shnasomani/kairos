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

| 19 | Whisper Voice Transcription — `POST /elicitation/{work_order_id}/voice`; Groq API (whisper-large-v3); SHA-256 dedup; Supabase Storage vault; Celery `transcription` queue; NER on transcript; insert into `quarantine_items` | `test.wav` → transcript "Say the word back." confidence=0.84; item_id=681642d3 in quarantine_items with input_type=voice_note ✅ |

### Tasks 1–19 Complete ✅ — Tasks 20–29 Pending
Full spec in `IMPLEMENTATION.md`. Scope extended to 29 tasks. Next: **Task 20**.