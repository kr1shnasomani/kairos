# Backend — Agent Instructions

## Python Conventions
- Routers in `api/routers/` — one file per domain layer, thin handlers only
- Service calls in `api/services/` — all external I/O lives here, never inline in routers
- Config via `api/config.py` Settings singleton — never `os.environ.get()` inline
- Dependencies via FastAPI `Depends()` in `api/dependencies.py`
- `structlog` everywhere — never `print()` or stdlib `logging`
- Pydantic model for every request and response shape

## Celery
Three queues — route tasks correctly:
- `ingestion` — vault → OCR → NER → graph + vectors
- `extraction` — entity linking and alias resolution
- `attribution` — Layer 10 outcome evaluation

All tasks must be idempotent. Long pipelines wrap in Temporal workflows for crash-resilience.

## Neo4j
```cypher
-- Asset nodes: always MERGE, never CREATE
MERGE (a:Asset {asset_id: $id})

-- Temporal queries: always filter validity window
WHERE r.valid_from <= $as_of AND (r.valid_to IS NULL OR r.valid_to > $as_of)

-- Authority pre-filter BEFORE traversal (composite index exists)
WHERE r.authority_level <= $max_level
```

## OPA
Every governance-sensitive action calls OPA before executing:
```
POST http://localhost:8181/v1/data/kairos/authz/allow
{"input": {"user": ..., "action": ..., "resource": ...}}
```
Policy file: `policies/kairos.rego` — default deny, explicitly allow.

## Layer Build Status
| Layer | File(s) | Status |
|-------|---------|--------|
| 1 MDM | `api/routers/assets.py` | Scaffolded — EAM import stubbed |
| 2+3 Vault+Perception | `api/routers/documents.py`, `api/services/ocr.py`, `api/services/ner.py` | Scaffolded — OCR/NER model calls stubbed |
| 4 Graph | `api/services/graph.py` | Complete |
| 6+7 Quarantine+Governance | `api/routers/governance.py` | Scaffolded — MoC webhook stubbed |
| 8 Event Bus | `api/services/event_bus.py` | Complete |
| 8 Briefs | `api/routers/briefs.py` | Scaffolded |
| 10 Attribution | `workers/attribution.py` | Scaffolded — historian call stubbed |
| 11 Search | `api/routers/search.py` | Scaffolded |
| 11 LLM | `api/services/llm.py` | Phase 2 — do not activate |

Wire real logic into existing skeletons. Do not create new files for layers that already have scaffolding.
