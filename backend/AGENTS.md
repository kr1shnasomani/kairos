# Backend — Agent Reference

> For project overview, current task state, and non-negotiable rules → read `../AGENTS.md` first.

---

## Layer Build Status

| Layer | Files | Status |
|-------|-------|--------|
| 0 — Validation plane | — | Not started |
| 1 — Asset MDM | `routers/assets.py` · `services/graph.py` | ✅ Complete (Task 2) |
| 2 — Immutable vault | `routers/documents.py` | ✅ Complete (Task 3) |
| 3 — OCR perception | `services/ocr.py` · `workflows/document_pipeline.py::run_ocr` | ✅ Complete (Task 4) |
| 3 — NER perception | `services/ner.py` · `workflows/document_pipeline.py::run_ner` | ✅ Complete (Task 5) |
| 4 — Temporal graph | `services/graph.py` · `workflows/document_pipeline.py::link_to_graph` | ✅ Complete (Task 5) |
| 5 — OT connectors | `connectors/internal/ot/client.go` | 🔧 Stub — Task 17 |
| 6 — Quarantine | `routers/governance.py` | 🔧 Stub — Task 9 |
| 7 — Governance / MoC | `routers/governance.py` | 🔧 Stub — Task 9 |
| 8 — Event bus service | `services/event_bus.py` | ✅ Complete as service |
| 8 — Event ingestion endpoints | `routers/events.py` | 🔧 Stub — Task 11 |
| 8 — Briefs router | `routers/briefs.py` | 🔧 Stub — Task 13 |
| 9 — Elicitation | `workflows/elicitation.py` | 🔧 Stub — Task 15 |
| 10 — Attribution | `workers/attribution.py` | 🔧 Stub — Task 16 |
| 6 — Vector + text indexing | `workflows/document_pipeline.py::index_vectors` · `::index_text` | ✅ Complete (Task 6) |
| 11 — Hybrid search | `routers/search.py` | 🔧 Stub — Task 7 |
| 11 — LLM synthesis | `services/llm.py` | 🚫 Phase 2 only — do not activate |
| 12 — Interface | — | 🚫 Frontend deferred |

**Rule:** Wire real logic into the existing stub files. Do not create new router or service files — the skeletons are already there.

---

## Supabase Schema (12 tables — live in production)

| Table | Purpose | Key columns |
|-------|---------|-------------|
| `assets` | MDM mirror of Neo4j | `asset_id`, `tag_number`, `criticality`, `site_id`, `identity_confirmed` |
| `asset_alias_map` | Tag alias resolution | `canonical_asset_id`, `alias_tag`, `confirmed` |
| `documents` | Immutable vault registry | `document_id`, `sha256_hash`, `vault_url`, `authority_level`, `status` |
| `document_asset_links` | Doc ↔ asset join | `document_id`, `asset_id` |
| `extraction_jobs` | Pipeline stage tracking | `job_id`, `document_id`, `pipeline_stage`, `progress_pct`, `ocr_confidence` |
| `operational_events` | Layer 8 event log | `event_id`, `asset_id`, `event_type`, `occurred_at`, `payload` |
| `briefs` | Proactive brief delivery | `brief_id`, `recipient_user_id`, `priority`, `acknowledged_at` |
| `brief_feedback` | Phase 2 feedback loop | `brief_id`, `rating` |
| `knowledge_conflicts` | Dual-track governance | `conflict_id`, `asset_id`, `track`, `status`, `sla_deadline` |
| `quarantine_items` | Layer 6 unverified inputs | `item_id`, `asset_id`, `work_order_id`, `input_type`, `review_status` |
| `moc_items` | Management of Change | `moc_id`, `asset_id`, `triggered_by_document_id` |
| `audit_log` | Immutable action record | `action`, `entity_type`, `entity_id`, `performed_by` |

RLS is active on `assets`, `documents`, `briefs`, `quarantine_items`, `audit_log`. The backend **always** uses `SUPABASE_SERVICE_ROLE_KEY` (bypasses RLS). Never use the anon key server-side.

---

## Working Patterns

### Supabase — Every Call Goes Through asyncio.to_thread
```python
from api.dependencies import SupabaseDep
import asyncio

async def my_handler(supabase: SupabaseDep):
    # SELECT
    result = await asyncio.to_thread(
        lambda: supabase.table("assets").select("asset_id, tag_number")
            .eq("site_id", site_id).execute()
    )
    rows = result.data  # list of dicts

    # INSERT
    await asyncio.to_thread(
        lambda: supabase.table("audit_log").insert({
            "action": "thing_done",
            "entity_type": "asset",
            "entity_id": asset_id,
            "performed_by": user_id,
        }).execute()
    )

    # UPSERT (idempotent writes)
    await asyncio.to_thread(
        lambda: supabase.table("assets").upsert(row_dict).execute()
    )
```
The Supabase Python client (`supabase==2.5.3`) is **synchronous**. Never call it directly in an async handler — always wrap in `asyncio.to_thread`.

### Neo4j — Use GraphService, Don't Call Driver Directly
```python
from api.dependencies import Neo4jDep
from api.services.graph import GraphService

async def my_handler(driver: Neo4jDep):
    graph = GraphService(driver)
    asset = await graph.get_asset(asset_id)
    await graph.create_asset_node({...})  # uses MERGE internally
    await graph.merge_document_node(document_id, {"authority_level": 4})
    await graph.create_knowledge_edge(
        source_id=asset_id, source_label="Asset",
        target_id=document_id, target_label="Document",
        relationship_type="DOCUMENTED_BY",
        valid_from=datetime.now(timezone.utc),
        authority_level=4,
        document_id=document_id,
        confidence=0.92,
        verification_status="unverified",
        # valid_to=None is the default (open-ended)
    )
```
All Neo4j access goes through `GraphService`. Don't write Cypher in routers.

### Temporal — Start Workflows, Use asyncio.to_thread Inside Activities
```python
# Starting a workflow (in a router):
from api.dependencies import TemporalDep

async def my_handler(temporal: TemporalDep):
    await temporal.start_workflow(
        DocumentIngestionWorkflow.run,
        args=[{"document_id": doc_id, "vault_path": path, "job_id": job_id, ...}],
        id=f"ingest-{doc_id}",
        task_queue=settings.TEMPORAL_TASK_QUEUE,
    )

# Inside a Temporal activity — use asyncio.to_thread for I/O:
@activity.defn
async def my_activity(document_id: str, job_id: str) -> dict:
    supabase = _get_supabase()   # module-level cached client
    result = await asyncio.to_thread(
        lambda: supabase.table("extraction_jobs").update({...}).eq("job_id", job_id).execute()
    )
    return {"done": True}
```

**Critical — Temporal sandbox issue (already fixed):** The activity worker uses `UnsandboxedWorkflowRunner()` because structlog's dependency `rich` uses `@dataclass` which hits sandbox restrictions. This is already set in `workers/temporal_worker.py` — do not remove it.

```python
# workers/temporal_worker.py — this must stay:
from temporalio.worker import Worker, UnsandboxedWorkflowRunner
worker = Worker(client, ..., workflow_runner=UnsandboxedWorkflowRunner())
```

### Redis — Async Client via RedisDep
```python
from api.dependencies import RedisDep

async def my_handler(redis: RedisDep):
    await redis.xadd("kairos:events:work_orders", {"asset_id": asset_id, ...})
    await redis.ping()
```
Inside Temporal activities, use `_get_redis()` (sync client cached at module level) and wrap in `asyncio.to_thread`:
```python
redis = _get_redis()
await asyncio.to_thread(lambda: redis.xadd("kairos:events:review_required", {...}))
```

### Elasticsearch
```python
from api.dependencies import ElasticsearchDep

async def my_handler(es: ElasticsearchDep):
    await es.index(index="kairos_assets", id=asset_id, document={...})
    result = await es.search(index="kairos_documents", body={"query": {...}})
```

### OPA — Governance Check Pattern
```python
import httpx

async def check_opa(user: dict, action: str, resource: dict) -> bool:
    async with httpx.AsyncClient() as client:
        resp = await client.post(
            "http://kairos-opa:8181/v1/data/kairos/authz/allow",
            json={"input": {"user": user, "action": action, "resource": resource}},
        )
    return resp.json().get("result", False)
```
OPA is at `http://kairos-opa:8181` inside Docker — never `localhost` in service code.

### Dependency Injection Available
```python
from api.dependencies import (
    CurrentUserDep,    # JWT-decoded user dict (or dev bypass)
    SupabaseDep,       # supabase.Client
    Neo4jDep,          # neo4j.AsyncDriver
    QdrantDep,         # AsyncQdrantClient
    ElasticsearchDep,  # AsyncElasticsearch
    RedisDep,          # redis.asyncio.Redis
    TemporalDep,       # temporalio.client.Client
    SettingsDep,       # api.config.Settings
)
```

### Logging — structlog Always
```python
import structlog
log = structlog.get_logger(__name__)

log.info("thing.happened", document_id=doc_id, stage="ocr_running")
log.warning("thing.degraded", reason="low_confidence", confidence=0.4)
log.error("thing.failed", error=str(exc))
```
Never `print()`. Never `import logging`.

---

## Extraction Pipeline — How It Flows

```
POST /documents/ingest
  → upload to Supabase Storage (kairos-vault bucket)
  → insert documents + extraction_jobs rows
  → temporal.start_workflow(DocumentIngestionWorkflow)

DocumentIngestionWorkflow (workflows/document_pipeline.py):
  1. store_in_vault    → SHA-256 verify, stage: ocr_running
  2. run_ocr           → PaddleOCR/PyMuPDF, stage: ner_running  (or review_required → stop)
  3. run_ner           → entity extraction [STUB — Task 5]
  4. link_to_graph     → Neo4j edges + quarantine routing [STUB — Task 5]
  5+6. index_vectors + index_text (parallel) [STUB — Task 6]
  7. mark_complete     → stage: complete, progress: 100
```

Confidence routing:
- `ocr_confidence < 0.5` → `review_required`, publish to Redis stream `kairos:events:review_required`, stop.
- `entity_confidence < 0.7` → `quarantine_items`, never to canonical graph.
- `confidence >= 0.7` → candidate for graph edge with `verification_status='unverified'`.

---

## Celery Queues
Three queues — route tasks to the right one:
- `ingestion` — vault upload, OCR, NER, graph + vectors
- `extraction` — entity linking, alias resolution
- `attribution` — Layer 10 outcome evaluation

All Celery tasks must be idempotent (safe to retry on crash).

---

## GraphService — Available Methods
All Neo4j access through these methods in `services/graph.py`:

| Method | What It Does |
|--------|-------------|
| `create_asset_node(data)` | MERGE asset, set PARENT_OF if parent provided |
| `get_asset(asset_id)` | Single node lookup |
| `list_assets(site_id, equipment_class, skip, limit)` | Paginated with total count |
| `get_asset_hierarchy(asset_id)` | Ancestors + children via PARENT_OF |
| `get_asset_knowledge_at(asset_id, as_of, authority_min)` | Time-travel edge query |
| `merge_document_node(document_id, props)` | Idempotent MERGE for Document nodes — call before creating edges to a doc |
| `create_knowledge_edge(source_id, source_label, target_id, target_label, ...)` | Creates KNOWLEDGE_EDGE; labels validated against whitelist; enforces all 5 mandatory properties |
| `close_validity_window(edge_id, valid_to)` | Supersession — never deletion |
| `get_blast_radius(document_id)` | Downstream impact traversal |

---

## Known Gotchas

**Supabase `extraction_jobs.job_id`:** Auto-generated UUID by Postgres on insert. Get it from `result.data[0]["job_id"]` after insert — don't generate it client-side.

**Temporal workflow `UnsandboxedWorkflowRunner`:** Already set. Don't remove it. Rich + structlog = sandbox crash.

**Temporal `service_healthy` → `service_started`:** The Temporal Docker image's built-in healthcheck never passes in this compose setup. The `kairos-temporal-activity-worker` dependency uses `service_started` (already fixed in `docker-compose.yml`).

**Supabase Storage bucket name:** `kairos-vault` (with hyphen). Hardcoded in `settings.SUPABASE_STORAGE_BUCKET`.

**OPA URL inside Docker:** `http://kairos-opa:8181` — not `localhost`. Same for all service-to-service calls.

**Neo4j async driver:** `neo4j.AsyncDriver` — use `async with driver.session() as session:` always. Don't use the sync driver.

**`quarantine_items` has no `document_id` column.** It links via `asset_id` and `work_order_id`. Task 5's `link_to_graph` populates it via `session_context` JSONB.

---

## Skills Available Here
`fastapi` · `fastapi-templates` · `python-code-style` · `python-design-patterns` · `python-testing-patterns` · `celery-expert` · `temporal-developer` · `neo4j-driver-python-skill` · `neo4j-cypher-skill` · `qdrant-clients-sdk` · `redis-core` · `supabase` · `ponytail` · `ponytail-audit` · `ponytail-debt` · `ponytail-review`
