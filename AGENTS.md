# KAIROS — Agent Context

## Documentation

| Doc | Path |
|-----|------|
| Problem & why | `docs/PROBLEM_STATEMENT.md` |
| 13-layer architecture | `docs/ARCHITECTURE.md` |
| REST API reference | `docs/API.md` |
| Backend services & infra | `docs/BACKEND.md` |
| Database schemas | `docs/DATABASE.md` |
| Frontend routes & wiring | `docs/FRONTEND.md` |
| Integration test suite | `docs/TESTS.md` |

**All 34 implementation tasks verified complete.** Read `§ Reference` at the bottom for known pitfalls and model architecture before touching any sensitive area.

---

## Task Protocol (follow every time, no exceptions)

### 1 — Full Context Before Writing Anything
- Read every file you will touch, end-to-end. Trace the call chain: router → service → db/external.
- All 34 tasks complete — check `§ Reference` at the bottom for known pitfalls before touching sensitive areas.
- Identify which architecture layer the task lives in (`docs/ARCHITECTURE.md`).

### 2 — Plan
- State exactly which files change and what each change does.
- Invoke `/ponytail lite` (minimum) before planning. YAGNI applies. Reuse what exists. No abstractions for one use case.
- Check `.agents/SKILL_MANIFEST.md` for relevant skills and invoke any that apply — skills are mandatory, not optional. Search by domain keyword (e.g. "neo4j", "qdrant", "temporal", "fastapi") to find the right one quickly.

### 3 — Build
- Docker is the only runtime. No local `python`, no `pip install` outside containers.
- Hot-reload is active — edits apply immediately. Rebuild only if new pip deps added.
- After edits: AST parse check before waiting on Docker (`python3 -c "import ast; ast.parse(open('f').read())"`).
- Root-cause errors, don't patch symptoms. One fix in the shared function beats guards at every caller.
- Log with `structlog`. Never `print()`, never stdlib `logging`.
- Stay in scope. If something unrelated is broken, note it — don't fix it mid-task.

### 4 — Verify End-to-End (nothing is done until this passes)
- Make live HTTP calls against the running stack. Read container logs: `docker logs kairos-backend-api 2>&1 | tail -30`. No silent errors allowed.
- Confirm writes in the actual database (Supabase/Neo4j/Qdrant/ES) — not just the HTTP response.
- Delete any temp files, test scripts, or scratch PDFs created during the task.
- **Frontend work:** use `docs/demo/LIVE_VERIFICATION.md` as the reference for current live backend/API verification status. Do not modify it unless explicitly asked for a new live-verification run.

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
**Ports:** API `8000` · Frontend `3000` · Neo4j `7474/7687` · Qdrant `6333` · ES `9200` · Redis `6379` · Temporal `7233` · Temporal UI `8088` · Grafana `3001`

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

**Phase discipline:** Phase 2 LLM synthesis lives only in `POST /search/synthesize` — never auto-triggered from routers or workers. Phase 3 proactive push is live — `GET /briefs` delivers event-triggered briefs via the EEMUA 191 governor.

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
- `frontend/` is a Next.js app owned by a separate team — don't touch it unless explicitly asked.

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
| Temporal activity worker | `backend/workers/temporal_worker.py` |
| Celery worker | `backend/workers/celery_app.py` |
| Go OT connectors | `backend/connectors/` |
| Neo4j schema | `db/neo4j/init_schema.cypher` |
| Supabase migrations | `db/migrations/` |

---

## Available Tooling
- **GitHub CLI (`gh`)** — available in terminal. Use for PR creation, issue management, CI status checks.
- **Supabase MCP** — direct Supabase access via MCP tools (`mcp__claude_ai_Supabase__*`). Use for running SQL, checking migrations, inspecting table state, and applying schema changes without going through the API. Prefer this over `docker exec` for Supabase-related diagnostics.

---

## Skills
**`/ponytail` is mandatory for every task.** Use `lite` by default, `full` for complex tasks, `ultra` when asked to cut scope.

All 59 skills are in `.claude/skills/` (symlinked from `.agents/skills/`). Full index: `.agents/SKILL_MANIFEST.md`.
Before starting any task, search `.agents/SKILL_MANIFEST.md` for skills matching your domain — don't guess, scan. Key domains: `neo4j`, `qdrant`, `temporal`, `fastapi`, `elasticsearch`, `redis`, `supabase`, `grafana`, `celery`, `golang`, `python`, `opentelemetry`, `docker`.
Invoke matching skills before writing code in that domain. Skills give current API patterns — don't rely on training data for library-specific calls.

---

## Reference

### Cloud-First Model Architecture (finalized — do not revert)

All inference runs via cloud API. No local model packages except the YOLO/ultralytics stack (untouchable — drawing parser).

| Concern | Primary | Fallback |
|---------|---------|---------|
| LLM synthesis | NIM `meta/llama-3.3-70b-instruct` | Ollama `qwen2.5:14b` |
| NER | NIM `mistralai/ministral-14b-instruct-2512` | Ollama `llama3.1:8b` → regex |
| OCR | NIM `nvidia/nemotron-ocr-v2` | PyMuPDF fast path (native digital PDFs only) |
| Embeddings | Jina AI `jina-embeddings-v3` (1024-dim) | Ollama `nomic-embed-text` |
| STT (voice) | Groq `whisper-large-v3` | none |

All model names live in `.env`: `NVIDIA_NIM_MODEL`, `NVIDIA_NIM_NER_MODEL`, `NVIDIA_NIM_OCR_MODEL`, `OLLAMA_NER_MODEL`, `GROQ_WHISPER_MODEL`, `JINA_EMBED_MODEL`. Do not add local model packages — `requirements-ml.txt` is deleted.

### Known Pitfalls

**Celery workers — lazy imports only.** `import sys; sys.path.insert(0, "/app")` at file top; import services inside the task body, never at module level.
**`asset_id` in `quarantine_items` — use `None`, not `""`.** FK constraint to `assets`. Empty string fails; unknown asset → SQL NULL.
**Supabase auth — never call auth on the global service-role client.** Use a fresh anon client for `POST /auth/login` and `/refresh`.
**NIM env changes — force recreate, not restart.** `docker compose up -d --no-deps --force-recreate kairos-backend-api`.
**Internal service auth.** Go connector uses `INTERNAL_API_KEY` Bearer token (`kairos-internal-dev-key`). FastAPI returns `role=admin` without hitting Supabase.
**`quarantine_items.input_type` CHECK constraint.** Must DROP + re-add to add new values. Current: `field_observation`, `voice_note`, `elicitation_response`, `deviation_flag`, `offboarding_response`.
**`audit_log` column is `timestamp`, not `created_at`.** Any `.order("created_at")` query fails.
**`workflow.logger` in Temporal is stdlib, not structlog.** Use f-strings, not keyword args.
**Work order dedup key — `asset_id:event_type`, 10-minute window.** Tests must use unique `asset_id` per run.
**Site-wide briefs — addressed to `site-{site_id}`.** New brief types must set `user_id = f"site-{site_id}"` in `BriefEngine.deliver()`.
**Celery queues — all six must be registered:** `--queues=ingestion,extraction,attribution,transcription,elicitation,validation`.
**NIM 70B timeout in dev.** Returns `synthesis_available=false` with raw sources. Check that field before assuming LLM output.
**NIM OCR uses a different base URL.** `https://ai.api.nvidia.com/v1/cv/nvidia/nemotron-ocr-v2` — not `integrate.api.nvidia.com`. Payload: `{"input": [{"type": "image_url", "url": "data:..."}]}`.
**`valid_to` on KNOWLEDGE_EDGE — use sentinel, never NULL.** `GraphService.create_knowledge_edge()` defaults to `datetime(9999, 12, 31, ...)`. Active queries: `(r.valid_to IS NULL OR r.valid_to > datetime())`.
**`pid_drawing` bypasses OCR.** Loads `fixtures/pid_topology_mock.json`. `GET /documents/{id}/topology` only works for `pid_drawing` docs — others return 404.
**Frontend SSR routing.** `API_INTERNAL_URL=http://kairos-backend-api:8000` for server components; `NEXT_PUBLIC_API_URL=http://localhost:8000` for browser clients.

### Post-Volume-Reset Steps

After `make nuke`, run in order:
1. `make init-all`
2. `docker exec kairos-backend-api python scripts/seed_regulations.py`
3. `docker exec kairos-backend-api python scripts/seed_users.py`

**Tests:** `docker exec kairos-backend-api python -m pytest tests/ -q --timeout=120` — 150 passed, 1 flaky. See `docs/TESTS.md`.

**CI/CD:** 5 workflows in `.github/workflows/`. Release: `git tag v{version} && git push origin v{version}`. Package: `ghcr.io/kr1shnasomani/kairos`. `tests.yml` needs 7 GitHub Secrets (deferred — `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `SUPABASE_JWT_SECRET`, `GROQ_API_KEY`, `NVIDIA_NIM_API_KEY`, `JINA_API_KEY`).

**Supabase:** project `ernffgrvdcikwwhkhiix`, bucket `kairos-vault` (private, max 500 MB, immutable).
