# KAIROS — Agent Context

## What Is This
Industrial Operational Intelligence Platform — proactive knowledge delivery to field workers at the moment they need it. Not a RAG chatbot. 13-layer event-driven architecture. Full design: `docs/ARCHITECTURE.md`. Full task list: `IMPLEMENTATION.md`.

---

## Current Implementation State

**Phase:** 1 — Retrieval Only. Do not wire Phase 2 (LLM synthesis) or Phase 3 (proactive push) into active code paths.

### Completed Tasks (verified, tested, running)
| Task | What | Verified By |
|------|------|-------------|
| 1 | DB schema applied, `/health/detailed` pings all 5 services | `GET /health/detailed` → all ok |
| 2 | Asset MDM — all 6 `/assets/*` endpoints, Neo4j + Supabase + ES | Asset P-101 created, retrieved |
| 3 | Immutable vault — `POST /documents/ingest`, SHA-256 dedup, Supabase Storage, Temporal trigger | Full ingest + status poll |
| 4 | OCR Temporal activities — `store_in_vault`, `run_ocr`, `mark_complete` | Pipeline runs to `complete`, confidence=0.95 |
| 5 | NER + entity-to-asset linking — `run_ner`, `link_to_graph` activities, `create_knowledge_edge` Cypher fixed | Pipeline runs all 7 stages; edge verified in Neo4j with all 5 properties |
| 6 | Vector + text indexing — `index_vectors` (Qdrant, Jina `jina-embeddings-v3` 1024-dim) and `index_text` (ES) parallel | Qdrant 1024-dim point + ES doc verified |
| 7 | Hybrid Search — `GET /search` parallel ES + Qdrant + Neo4j, authority re-rank, `as_of` time-travel, quarantine toggle | Tag search → ES hits; concept search → Qdrant semantic; as_of 2020 → 0 graph results; all 3 retrieval methods active |

### Next Task: Task 8 — LLM Synthesis (`POST /search/synthesize`)
See `IMPLEMENTATION.md` Task 8 for the full spec. Key files to touch:
- `backend/api/routers/search.py` — `POST /search/synthesize` endpoint (currently clean stub)
- `backend/api/services/llm.py` — `synthesize()` already implemented, just needs wiring + response parsing

---

## Dev Commands
Everything runs inside Docker. There is no `python manage.py`, no `npm run dev`, no local virtual env.

```bash
make dev        # Build and start ALL services
make stop       # Stop all services
make nuke       # Destroy all volumes — irreversible
make init-all   # First-time setup: Neo4j constraints + Qdrant collections
make test       # pytest in kairos-backend-api + go test in kairos-backend-go
make lint       # ruff + golangci-lint
make logs       # Tail all service logs
make ps         # Show container status
```

**Container names:** `kairos-backend-api` (port 8000) · `kairos-backend-go` (8090) · `kairos-neo4j` (7474/7687) · `kairos-qdrant` (6333) · `kairos-elasticsearch` (9200) · `kairos-redis` (6379) · `kairos-temporal` (7233) · `kairos-temporal-activity-worker` · `kairos-temporal-worker` (Celery) · `kairos-opa` (8181) · `kairos-vault` (8200) · `kairos-grafana` (3001)

**Temporal UI:** `http://localhost:8088` — check workflow status here.

**API is at:** `http://localhost:8000` — `APP_DEBUG=true` in dev, so no auth token required.

---

## Stack
FastAPI (Python 3.12) · Neo4j 5.20 · Qdrant · Elasticsearch 8.13 · Redis 7.2 · Temporal.io · Celery · Go (Gin) for OT connectors · OPA · HashiCorp Vault · OpenTelemetry → Grafana · Supabase (Postgres + Storage + Auth)

---

## Non-Negotiable Rules

### Neo4j Edges — Every Write Needs All 5 Properties
```python
await graph.create_knowledge_edge({
    "from_node": asset_id,
    "to_node": document_id,
    "relationship": "DOCUMENTED_BY",
    "valid_from": datetime.now(timezone.utc).isoformat(),
    "valid_to": None,                        # open-ended
    "authority_level": 4,                    # 1=Regulatory 2=Engineering 3=OEM 4=Procedure 5=Field
    "document_id": document_id,
    "confidence": 0.92,
    "verification_status": "unverified",     # unverified / verified / disputed / superseded / quarantined
})
```
Missing any of these five is a bug, not a warning.

### Vault — Never Delete, Never Overwrite
Close `valid_to` to supersede. The artifact in Supabase Storage is permanent. Use `GraphService.close_validity_window(edge_id, valid_to)` to supersede graph edges.

### Quarantine — Unverified Never Auto-Promotes
`confidence < 0.7` or unresolved tag → `quarantine_items` table. Never directly to the canonical graph. Human action only to promote.

### Asset Nodes — MERGE Not CREATE
```cypher
MERGE (a:Asset {asset_id: $id}) SET a += $props
```

### Authority Pre-Filter Before Traversal
```cypher
WHERE r.authority_level <= $max_level AND r.valid_from <= $as_of
```
Filter on the index first, traverse second.

### EEMUA 191 Governor
Call `EventBusService.check_governor(user_id)` before every brief delivery. PTW briefs (`priority='critical'`) are always exempt. Hard ceiling: ≤6 push events per operator per hour.

### LLM / Safety-Critical Queries
Phase 2 only. In Phase 1, return retrieved documents directly. Safety-critical parameter queries (pressure limits, interlock sequences, torque specs) → explicit refusal, never hedged answers.

### OT Connectors (Go)
Historian data is ephemeral — query, reason in memory, discard. Never store time-series in KAIROS infrastructure.

---

## Code Style
- Routers thin — handler calls service, returns result. No business logic inline.
- All service I/O lives in `backend/api/services/`
- `structlog` for all logging. Never `print()`, never stdlib `logging`.
- `async/await` throughout FastAPI. No blocking I/O in async handlers.
- Pydantic model for every request and response shape.
- Never hardcode secrets — all via `api/config.py` Settings or env vars.
- Never `SELECT *` or wildcard CORS `"*"` in production.
- Never touch `frontend/` — deferred.

---

## Where Things Live
| Concern | File |
|---------|------|
| FastAPI app entrypoint | `backend/api/main.py` |
| Settings / env vars | `backend/api/config.py` |
| Dependency injection | `backend/api/dependencies.py` |
| Routers | `backend/api/routers/*.py` |
| Services (business logic + I/O) | `backend/api/services/*.py` |
| Pydantic models | `backend/api/models/*.py` |
| Temporal workflow | `backend/workflows/document_pipeline.py` |
| Temporal worker entrypoint | `backend/workers/temporal_worker.py` |
| Celery worker | `backend/workers/celery_app.py` |
| Go OT connectors | `backend/connectors/` |
| Neo4j schema | `backend/db/neo4j/init_schema.cypher` |
| Supabase migrations | `backend/db/migrations/` |
| Agent instructions (backend) | `backend/AGENTS.md` |
| Agent instructions (connectors) | `backend/connectors/AGENTS.md` |
| Full task specs | `IMPLEMENTATION.md` |
| Architecture detail | `docs/ARCHITECTURE.md` |

---

## Skills
All skills: `SKILL_MANIFEST.md` — 59 skills for Neo4j, Qdrant, Redis, Elasticsearch, FastAPI, Celery, Temporal, Go, Grafana, Supabase, OpenTelemetry, and more.

`ponytail` — YAGNI enforcement. Invoke with `/ponytail [lite|full|ultra]` or say "be lazy".
`ponytail-review` — diff-scoped over-engineering review. Invoke with `/ponytail-review`.
`ponytail-audit` — whole-repo scan. Invoke with `/ponytail-audit`.
`ponytail-debt` — harvest `ponytail:` comments. Invoke with `/ponytail-debt`.
