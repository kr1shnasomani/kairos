# KAIROS — Agent Instructions

## What This Is
Industrial Operational Intelligence Platform — 13 layers, event-driven, proactive knowledge delivery to field workers. Not a search tool. Not a RAG chatbot. Full architecture: `docs/ARCHITECTURE.md` (read before writing feature code).

## Commands
```bash
make dev        # Start all Docker services (Neo4j, Qdrant, ES, Redis, Temporal, OPA, Vault, Grafana)
make api        # FastAPI dev server → http://localhost:8000/docs
make workers    # Celery (queues: ingestion / extraction / attribution)
make connectors # Go OT connector → :8090
make init-all   # First-time: Neo4j schema + Qdrant collections
make lint       # ruff + golangci-lint
make test       # pytest
```

## Stack
FastAPI (Python 3.12) · Neo4j 5.20 · Qdrant · Elasticsearch 8.13 · Redis 7.2 · Temporal.io · Celery · Go (Gin) for OT connectors · OPA · HashiCorp Vault · OpenTelemetry → Grafana · Supabase (storage + auth + postgres) · NVIDIA NIM / Ollama (Phase 2 only)

## Current Phase: 1 — Retrieval Only
- Phase 2 (synthesis) activates when `NVIDIA_NIM_API_KEY` or Ollama is configured
- Phase 3 (proactive push) activates after 30-day EEMUA 191 pilot gate passes
- **Do not wire Phase 2/3 features into active Phase 1 code paths**

## Non-Negotiable Rules

**Neo4j edges** — every write must carry all five properties or it's a bug:
```python
valid_from, valid_to          # temporal validity window
authority_level               # 1=Regulatory 2=Engineering 3=OEM 4=Procedure 5=Field
document_id                   # provenance pointer to vault artifact
confidence                    # 0.0–1.0
verification_status           # unverified / verified / disputed / superseded / quarantined
```

**Vault (Layer 2)** — never delete, never overwrite. Supersede by closing `valid_to`.

**Quarantine (Layer 6)** — unverified inputs never auto-promote to the canonical graph. Human action only.

**EEMUA 191 (Layer 8)** — call `EventBusService.check_governor()` before every brief delivery. PTW briefs (`priority='critical'`) are always exempt. All others obey ≤6/hour ceiling.

**LLM synthesis (Layer 11)** — assembles from retrieved context only. Safety-critical parameter queries (pressure limits, interlock sequences, torque specs) use explicit refusal, never hedged answers.

**OT connectors (Go)** — historian data is ephemeral. Never store time-series data in KAIROS infrastructure.

**Cypher** — `MERGE` not `CREATE` for asset nodes. Authority-level pre-filter before traversal, not after.

## Do
- Routers thin, service calls in `backend/api/services/`
- `async/await` throughout FastAPI — no blocking calls in handlers
- `structlog` for all logging — never `print()` or stdlib `logging`
- Pydantic models for every request/response shape
- `MERGE` for asset nodes in Neo4j

## Don't
- Never hardcode secrets — all via env vars, Vault in production
- Never `SELECT *` or wildcard CORS (`"*"`) in production
- Never touch `frontend/` — deferred to a later phase
- Never add Phase 2/3 features to Phase 1 active paths
- Never delete vault documents — supersede only

## Skills
All skills: `SKILL_MANIFEST.md` — 55 skills covering Neo4j, Qdrant, Redis, Elasticsearch, FastAPI, Celery, Temporal, Go, Grafana, HuggingFace, Supabase, OpenTelemetry, and more.
