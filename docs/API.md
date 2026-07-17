# KAIROS — API Reference

> **For AI coding agents:** Every HTTP endpoint is documented here. Base URL: `http://localhost:8000`. All endpoints except `/health` and `POST /auth/login` require `Authorization: Bearer <access_token>`.
>
> Also read `docs/BACKEND.md` for architecture, service internals, and non-negotiable rules before modifying any endpoint.

---

## Table of Contents

1. [Authentication](#1-authentication)
2. [Health](#2-health)
3. [Assets (MDM)](#3-assets-mdm)
4. [Documents (Vault + Pipeline)](#4-documents-vault--pipeline)
5. [Search](#5-search)
6. [Events (Operational)](#6-events-operational)
7. [Briefs (Operator Intelligence)](#7-briefs-operator-intelligence)
8. [Governance](#8-governance)
9. [Compliance](#9-compliance)
10. [Elicitation](#10-elicitation)
11. [Annotations](#11-annotations)
12. [Audit Log](#12-audit-log)
13. [Go OT Connector (port 8090)](#13-go-ot-connector-port-8090)
14. [Error Codes](#14-error-codes)
15. [Auth Quick-Reference](#15-auth-quick-reference)

---

## 1. Authentication

**Prefix:** `/auth`

Supabase issues ES256 JWTs. Tokens expire after 1 hour. Role is stored in `user_metadata.role`, not the top-level Supabase role.

**Test credentials (seed via `docker exec kairos-backend-api python scripts/seed_users.py`):**

| Email | Password | Role |
|-------|----------|------|
| `admin@kairos.local` | `KairosAdmin123!` | `admin` |
| `engineer@kairos.local` | `KairosEngineer123!` | `engineer` |
| `field_worker@kairos.local` | `KairosField123!` | `field_worker` |

**Dev mode:** When `APP_DEBUG=True` (default in dev), any request without an `Authorization` header is treated as `{user_id: "dev-user", role: "engineer", site_id: "SITE_001"}`.

**Service bypass:** Bearer token matching `INTERNAL_API_KEY` (default: `kairos-internal-dev-key`) returns a service admin account without calling Supabase. Used by the Go connector and Celery workers.

---

### `POST /auth/login`

Exchange email + password for a JWT pair.

**Auth required:** No

**Request body:**
```json
{
  "email": "admin@kairos.local",
  "password": "KairosAdmin123!"
}
```

**Response `200`:**
```json
{
  "access_token": "<ES256 JWT>",
  "refresh_token": "<opaque token>",
  "token_type": "bearer",
  "user_id": "uuid"
}
```

**Errors:** `401` invalid credentials, `400` malformed payload

> **Critical:** This handler uses a fresh anon Supabase client (never the service-role client). Using the service-role client for auth operations contaminates its session and causes RLS violations on all subsequent table writes.

---

### `POST /auth/refresh`

Exchange a refresh token for a new JWT pair.

**Auth required:** No

**Request body:**
```json
{ "refresh_token": "<token>" }
```

**Response `200`:** Same shape as `/auth/login`.

---

### `GET /auth/me`

Return the current user's profile decoded from the JWT.

**Auth required:** Yes (any role)

**Response `200`:**
```json
{
  "user_id": "uuid",
  "email": "admin@kairos.local",
  "role": "admin",
  "site_id": "SITE_001"
}
```

---

## 2. Health

**Prefix:** `/health`

---

### `GET /health/`

Liveness probe. Returns 200 if the API process is running.

**Auth required:** No

**Response `200`:**
```json
{
  "status": "healthy",
  "service": "kairos-api",
  "version": "0.1.0",
  "timestamp": "2024-01-01T00:00:00Z"
}
```

---

### `GET /health/detailed`

Readiness probe. Checks all 5 downstream services concurrently.

**Auth required:** No

**Response `200`:**
```json
{
  "status": "healthy",
  "services": {
    "neo4j": "ok",
    "qdrant": "ok",
    "elasticsearch": "ok",
    "redis": "ok",
    "temporal": "ok"
  },
  "timestamp": "2024-01-01T00:00:00Z"
}
```

If any service is unreachable, its value is `"error: <message>"`.

---

### `GET /health/model`

Opt-in liveness probe for a **rate-limited model provider**. Makes the smallest possible real call
(1 token / 1 embedding / a models list) so the System Health page can show live model status.

**Auth required:** Yes — `admin` only. **Not** polled by default (each call spends provider quota).

**Query params:** `provider` — one of `nim | gemini | jina | groq`.

**Response `200`:**
```json
{ "provider": "nim", "ok": true, "status": 200, "model": "meta/llama-3.1-70b-instruct", "latency_ms": 2603, "detail": null }
```

`ok: false` with `detail: "not configured"` when the provider's API key is unset; `detail` carries the
error text when the upstream call fails. `400` for an unknown provider.

---

## 3. Assets (MDM)

**Prefix:** `/assets`

Asset MDM: Neo4j (graph) + Supabase (relational) + Elasticsearch (search). Asset identities are **human-confirmed** — no AI-inferred canonical IDs are accepted. All writes use `MERGE` in Neo4j, never `CREATE`.

**Required role for `POST /assets/`:** `admin` or `engineer` (OPA enforced)

---

### `POST /assets/`

Register a new canonical asset.

**Auth required:** Yes — `admin` or `engineer`

**Request body:**
```json
{
  "asset_id": "P-101",
  "tag_number": "P-101",
  "name": "Feed Pump Alpha",
  "equipment_class": "pump",
  "site_id": "SITE_001",
  "parent_asset_id": null,
  "criticality": "safety_critical",
  "design_pressure_bar": 12.5,
  "design_temperature_c": 180.0,
  "manufacturer": "Flowserve",
  "model_number": "PVXD-250",
  "eam_source": "SAP_PM",
  "eam_asset_id": "10001234",
  "confirmed_by_user_id": "admin@kairos.local",
  "additional_properties": {}
}
```

Key fields:
- `asset_id` — canonical identifier (tag number). Must be globally unique.
- `criticality` — `safety_critical | critical | non_critical`
- `confirmed_by_user_id` — **mandatory**. AI-inferred identities are rejected.
- `eam_source` — `SAP_PM | IBM_Maximo | other`

**Response `201`:**
```json
{
  "asset_id": "P-101",
  "tag_number": "P-101",
  "status": "created"
}
```

---

### `GET /assets/`

List all registered assets.

**Auth required:** Yes

**Query params:**
| Param | Type | Default | Description |
|-------|------|---------|-------------|
| `site_id` | string | — | Filter by site |
| `equipment_class` | string | — | Filter by class (pump, vessel, …) |
| `skip` | int | `0` | Pagination offset |
| `limit` | int | `50` | Page size (max 200) |

**Response `200`:**
```json
{
  "items": [...],
  "total": 5,
  "limit": 50,
  "offset": 0
}
```

---

### `GET /assets/{asset_id}`

Get a single asset by its canonical ID. Enriched with 3-parallel live counts.

**Auth required:** Yes

**Response `200`:**
```json
{
  "asset_id": "P-101",
  "tag_number": "P-101",
  "name": "Feed Pump Alpha",
  "equipment_class": "pump",
  "site_id": "SITE_001",
  "criticality": "safety_critical",
  "open_work_orders_count": 2,
  "compliance_gap_count": 0,
  "last_inspection_date": "2024-03-01T00:00:00Z"
}
```

`open_work_orders_count`, `compliance_gap_count`, and `last_inspection_date` are fetched in parallel from Supabase. **`404`** if not found.

---

### `GET /assets/{asset_id}/aliases`

List all known tag aliases (alternate tag numbers, legacy names) for an asset.

**Auth required:** Yes

**Response `200`:**
```json
[
  {
    "alias": "PUMP-101",
    "confidence": 0.95,
    "confirmed": true,
    "source": "P&ID Rev C"
  }
]
```

---

### `GET /assets/{asset_id}/hierarchy`

Get the parent–child asset hierarchy (up to 10 levels deep via Neo4j `PARENT_OF` traversal).

**Auth required:** Yes

**Response `200`:**
```json
{
  "asset_id": "P-101",
  "parent": null,
  "children": [
    { "asset_id": "P-101-SEAL", "name": "Mechanical Seal" }
  ]
}
```

---

### `GET /assets/{asset_id}/knowledge`

Get all temporal graph facts linked to this asset from Neo4j.

**Auth required:** Yes

**Query params:**
| Param | Type | Default | Description |
|-------|------|---------|-------------|
| `as_of` | ISO8601 datetime | `now` | Time-travel: return facts valid at this timestamp |

**Response `200`:**
```json
{
  "asset_id": "P-101",
  "fact_count": 4,
  "facts": [
    {
      "rel_type": "HAS_MAX_PRESSURE",
      "value": "12.5 bar",
      "authority_level": 1,
      "document_id": "doc-oisd-clause-6.4",
      "confidence": 0.98,
      "valid_from": "2020-01-01T00:00:00Z",
      "valid_to": null,
      "verification_status": "verified"
    }
  ]
}
```

---

## 4. Documents (Vault + Pipeline)

**Prefix:** `/documents`

Documents are **immutable**. Once ingested, they can only be superseded (version chained), never deleted or overwritten. SHA-256 deduplication prevents duplicate ingestion.

---

### `POST /documents/ingest`

Ingest a document into the vault and trigger the full pipeline: OCR → NER → graph linking → vector indexing → text indexing.

**Auth required:** Yes (`engineer` or `admin`)

**Request:** `multipart/form-data`

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `file` | binary | Yes | PDF, PNG, JPG, TIFF |
| `document_type` | string | Yes | `procedure`, `regulation`, `engineering_drawing`, `maintenance_record`, `ptw`, `incident_report`, `material_certificate`, `datasheet` |
| `authority_level` | int 1–5 | Yes | 1=Regulatory, 2=Engineering, 3=OEM, 4=Procedure, 5=Field |
| `asset_ids` | string (JSON array) | No | `'["P-101","V-201"]'` |
| `source_system` | string | Yes | e.g. `SAP_DMS`, `SharePoint` |
| `access_tags` | string (JSON array) | No | e.g. `'["confidential","process"]'` |
| `occurred_at` | ISO8601 string | No | Source document date (used for timestamp drift detection) |

**Response `202`:**
```json
{
  "document_id": "doc-uuid",
  "job_id": "job-uuid",
  "workflow_id": "temporal-workflow-id",
  "status": "accepted",
  "message": "Ingestion pipeline started"
}
```

SHA-256 deduplication: if an identical file was previously ingested, returns the existing `document_id` with `status: "duplicate"`.

---

### `GET /documents/`

List vault documents.

**Auth required:** Yes

**Query params:**
| Param | Type | Default |
|-------|------|---------|
| `asset_id` | string | — |
| `document_type` | string | — |
| `status` | string | `active` |
| `authority_level` | int | — |
| `skip` | int | `0` |
| `limit` | int | `50` |

**Response `200`:**
```json
{
  "items": [...],
  "total": 12
}
```

---

### `GET /documents/{document_id}/status`

Poll the extraction pipeline status for a document.

**Auth required:** Yes

**Response `200`:**
```json
{
  "document_id": "doc-uuid",
  "pipeline_stage": "complete",
  "progress_percent": 100,
  "ocr_confidence": 0.95,
  "ner_entity_count": 12,
  "graph_edges_created": 8,
  "review_items_pending": 2,
  "error": null,
  "updated_at": "2024-01-01T00:00:00Z"
}
```

Pipeline stages (in order): `pending → ocr_pending → ocr_complete → ner_pending → ner_complete → graph_pending → graph_complete → index_pending → complete` (or `failed`).

---

### `GET /documents/{document_id}/extraction`

Get full NER extraction results.

**Auth required:** Yes

**Response `200`:**
```json
{
  "document_id": "doc-uuid",
  "extraction_model": "mistralai/ministral-14b-instruct-2512",
  "entities": [
    {
      "entity_type": "process_parameter",
      "value": "12.5 bar",
      "normalized_value": "12.5",
      "confidence": 0.94,
      "linked_asset_id": "P-101",
      "requires_review": false
    }
  ],
  "graph_edges_created": 8,
  "vector_chunks_indexed": 3,
  "review_items": [],
  "extracted_at": "2024-01-01T00:00:00Z"
}
```

Entity types: `asset_tag`, `process_parameter`, `material`, `person`, `date`, `regulation`, `failure_mode`.

Entities with `confidence < 0.7` or unresolved `linked_asset_id` appear in `review_items` and are placed in `quarantine_items`.

---

### `GET /documents/{document_id}`

Get vault document metadata.

**Auth required:** Yes

**Response `200`:**
```json
{
  "document_id": "doc-uuid",
  "sha256_hash": "abc123...",
  "file_name": "OISD-117.pdf",
  "file_size_bytes": 1048576,
  "mime_type": "application/pdf",
  "document_type": "regulation",
  "authority_level": 1,
  "source_system": "OISD",
  "vault_url": "https://supabase-url/storage/v1/...",
  "ingested_at": "2024-01-01T00:00:00Z",
  "ingested_by": "admin@kairos.local",
  "status": "active",
  "version_chain": null,
  "asset_links": ["P-101", "V-201"],
  "access_tags": []
}
```

`status` values: `active | superseded | archived | disputed`

---

### `GET /documents/{document_id}/topology`

Get the parsed P&ID / engineering drawing topology for a drawing document.

**Auth required:** Yes

Only available for documents with `document_type = "pid_drawing"` — all other types `404` by design. Topology is extracted at ingest time (OCR is skipped) by the Layer 3 vision model (`PIDService`, Path B); the response includes `topology_source` (`vision_model` when the model ran, `demo_fixture` when it fell back). Every element routes to element-by-element engineer verification before it becomes canonical.

**Response `200`:**
```json
{
  "document_id": "DOC-TS4FXYKHCQEF",
  "manifest_item_id": "3c0e469e-…",
  "verification_status": "unverified",
  "topology": {
    "title": "Feed Section P&ID - Pump P-101",
    "revision": "Rev-4",
    "drawing_id": "P-2301",
    "equipment_nodes": [
      {"id": "TOPO-EQ-001", "tag": "P-101", "type": "centrifugal_pump", "equipment_class": "pump", "service": "Feed Pump A", "design_temp_c": 80, "design_pressure_kpa": 800}
    ],
    "isolation_valves": [
      {"id": "TOPO-VLV-001", "tag": "XV-203", "type": "gate_valve", "service": "P-101 Suction Isolation", "normally_open": true, "last_inspected": "2024-06-15", "inspection_interval_months": 18}
    ],
    "isolation_boundaries": [
      {"id": "TOPO-ISO-001", "boundary_id": "ISO-P101-MAINT", "ptw_type": "mechanical", "primary_isolations": ["XV-203", "XV-204"], "bleed_vents": ["PG-18"], "regulatory_ref": "OISD-117-6.2", "requires_engineer_signoff": true, "requires_double_block_bleed": true}
    ],
    "instrumentation_loops": [
      {"id": "TOPO-LOOP-001", "loop_id": "FIC-3047", "type": "flow_control", "instruments": ["FT-3047", "FIC-3047", "FV-3047"], "design_range_m3h": "0-120", "alarm_low_m3h": 5, "alarm_high_m3h": 110}
    ]
  },
  "extracted_at": "2026-07-10T11:52:56Z"
}
```

> ⚠️ Elements are **grouped under a nested `topology` object** in four category arrays
> (`equipment_nodes`, `isolation_valves`, `isolation_boundaries`, `instrumentation_loops`) — there is no
> flat `equipment`/`valves`/`loops`/`boundaries` list and no explicit edges. The frontend
> `getDocumentTopology` fetcher flattens these into `{nodes, edges}`, synthesising boundary→valve/bleed
> edges from `primary_isolations` + `bleed_vents`.

**`404`** for any non-`pid_drawing` document, or if topology not yet extracted.

---

### `POST /documents/{document_id}/supersede`

Mark a document as superseded by a newer version. Closes `valid_to` on all Neo4j KNOWLEDGE_EDGE relationships sourced from this document.

**Auth required:** Yes (`engineer` or `admin`)

**Request body:**
```json
{
  "superseded_by_document_id": "doc-new-uuid",
  "reason": "Rev D issued 2024-03-01"
}
```

**Response `200`:**
```json
{
  "document_id": "doc-old-uuid",
  "status": "superseded",
  "superseded_by": "doc-new-uuid",
  "edges_closed": 8
}
```

---

## 5. Search

**Prefix:** `/search`

Hybrid search across three engines in parallel. Results are authority-ranked (level 1 Regulatory > level 5 Field).

---

### `GET /search/`

Parallel hybrid search: ES exact + Qdrant 1024-dim semantic + Neo4j graph.

**Auth required:** Yes

**Query params:**
| Param | Type | Default | Description |
|-------|------|---------|-------------|
| `q` | string | **required** | Search query |
| `asset_id` | string | — | Scope to a specific asset's knowledge graph |
| `limit` | int | `10` | Max results per engine |
| `include_quarantine` | bool | `false` | Include unverified quarantine items |
| `as_of` | ISO8601 datetime | `now` | Time-travel: return only facts valid at this time |
| `authority_min` | int 1–5 | `1` | Exclude sources below this authority level |

**Response `200`:**
```json
{
  "query": "max allowable pressure P-101",
  "results": [
    {
      "document_id": "doc-oisd-6.4",
      "asset_id": "P-101",
      "document_type": "regulation",
      "title": "OISD-117 Section 6.4 — Pressure Limits",
      "snippet": "Maximum allowable working pressure: 12.5 bar at 180°C",
      "authority_level": 1,
      "status": "active",
      "relevance_score": 0.95,
      "retrieval_method": "graph",
      "is_quarantine": false,
      "vault_url": "https://..."
    }
  ],
  "total": 1,
  "retrieval_methods": ["exact", "semantic", "graph"]
}
```

`retrieval_method` per result:
- `exact` — Elasticsearch tag number / document ID match
- `semantic` — Qdrant 1024-dim ANN (Jina embeddings)
- `graph` — Neo4j KNOWLEDGE_EDGE traversal (only when `asset_id` provided)

---

### `GET /search/assets/{asset_id}`

Search within a specific asset's knowledge. Same engines but asset pre-filtered.

**Auth required:** Yes

**Query params:** Same as `GET /search/` minus `asset_id`.

**Response `200`:** Same shape as `GET /search/`.

---

### `POST /search/synthesize`

**Phase 2.** Synthesize a natural-language answer from retrieved context using NVIDIA NIM (primary) or Ollama (fallback). Never originates knowledge — assembles only what was retrieved and passed in `context`.

**Auth required:** Yes

**Request body:**
```json
{
  "query": "What is the maximum allowable pressure for P-101?",
  "context": [
    {
      "document_id": "doc-oisd-6.4",
      "title": "OISD-117 Section 6.4",
      "snippet": "Maximum allowable working pressure: 12.5 bar at 180°C",
      "authority_level": 1,
      "confidence": 0.98
    }
  ],
  "query_category": "max_allowable_pressure"
}
```

`query_category` is optional. When set to a safety-critical category and evidence confidence < 0.7, synthesis is **refused** — sources returned directly without LLM answer.

**Safety-critical categories (refusal when confidence < 0.7):**
`max_allowable_pressure` · `isolation_interlock_sequence` · `torque_specification` · `electrical_rating` · `pressure_relief_setting` · `safety_shutdown_setpoint`

**Response `200` — normal:**
```json
{
  "answer": "The maximum allowable working pressure for P-101 is 12.5 bar at 180°C, per OISD-117 Section 6.4.",
  "sources": [{"document_id": "doc-oisd-6.4", "authority_level": 1}],
  "confidence": 0.98,
  "refused": false,
  "safety_critical": true,
  "sources_used": [0],
  "model": "meta/llama-3.1-70b-instruct"
}
```

**Response `200` — refused:**
```json
{
  "answer": null,
  "refused": true,
  "refusal_reason": "Safety-critical parameter query refused: evidence confidence 0.35 is below threshold 0.70 for category max_allowable_pressure. Return sources directly.",
  "sources": [...],
  "safety_critical": true
}
```

An `audit_log` entry is written on every synthesis call.

---

### `POST /search/rca-pack`

**Layer 11 RCA synthesis.** Assembles a failure timeline, ranked hypotheses, and supporting documents for a specific asset incident.

**Auth required:** Yes

**Three parallel retrieval passes:**
1. **Neo4j** — Event nodes linked to the asset in a 90-day window (chronological timeline)
2. **Qdrant** — Semantic search on `failure_code + asset_class` against `kairos_knowledge`
3. **Supabase** — `operational_events` (work orders, alarms, PTWs) in the same 90-day window

Combined evidence is passed to `LLMService.rca_synthesize()`. Falls back to raw timeline + documents when LLM is unavailable.

**Safety-critical queries:** `refused=True` when the failure code matches a safety-critical category. Sources returned directly.

**Request body:**
```json
{
  "asset_id": "P-101",
  "incident_date": "2026-07-02T09:00:00Z",
  "failure_code": "SEAL-FAIL",
  "include_quarantine": false
}
```

**Response `200`:**
```json
{
  "asset_id": "P-101",
  "incident_date": "2026-07-02T09:00:00Z",
  "failure_code": "SEAL-FAIL",
  "timeline": [
    {
      "event_type": "vibration_alarm",
      "occurred_at": "2026-04-05T06:12:00",
      "description": "Elevated vibration on P-101",
      "source": "neo4j"
    }
  ],
  "hypotheses": [
    {
      "hypothesis": "Bearing wear caused by insufficient lubrication",
      "evidence_weight": 0.82,
      "sources": ["doc-p101-maint-record"]
    }
  ],
  "supporting_documents": [
    {
      "document_id": "doc-p101-failure-hist",
      "title": "P-101 Failure History",
      "authority_level": 2,
      "confidence": 0.91
    }
  ],
  "confidence": 0.85,
  "refused": false,
  "synthesis_available": true
}
```

- `synthesis_available: false` when NIM/Ollama is unavailable — timeline and documents still returned.
- `refused: true` with empty `hypotheses` when the failure code is safety-critical.
- Every call writes an `audit_log` entry with `action=rca_pack_generated`.

---

## 6. Events (Operational)

**Prefix:** `/events`

Event ingestion for CMMS work orders, Permit-to-Work, shift handovers, DCS alarms, equipment tag-outs, and inspections. All events:
1. Deduplicated via 10-minute Redis TTL key (same `asset_id` + `event_type`)
2. Written to `operational_events` (Supabase)
3. Published to the appropriate Redis Stream
4. Trigger brief assembly asynchronously

---

### `POST /events/work-order`

Ingest a CMMS work order.

**Auth required:** Yes

**Request body:**
```json
{
  "work_order_id": "WO-2024-001",
  "asset_id": "P-101",
  "failure_code": "VIBE-HIGH",
  "description": "Elevated vibration on feed pump",
  "priority": "high",
  "assigned_technician_id": "tech-uuid",
  "planned_start": "2024-01-02T08:00:00Z",
  "close_notes": null,
  "source_system": "SAP_PM",
  "site_id": "SITE_001",
  "occurred_at": "2024-01-01T22:00:00Z"
}
```

`close_notes` is populated when the WO is closed — used by the Celery attribution worker's execution compliance check.

`assigned_technician_id` is optional — if absent, brief is addressed site-wide.

**Side effects:**
- Recurring failure detection: if same asset had ≥1 prior WO in the last 90 days with the same failure family, `event_subtype=recurring` is set and a `recurring_failure_detected` event is published. A high-priority brief is assembled immediately.
- Attribution trigger: if same asset had a prior WO in the last 30 days, a Celery `evaluate_outcome` task is queued.
- Elicitation check: if failure code is rare, asset is uninstrumented, or priority is critical/urgent, a `MicroInterviewWorkflow` may be triggered on the `kairos-elicitation` queue.

**Response `202` — first event for asset:**
```json
{
  "event_id": "evt-uuid",
  "status": "accepted",
  "brief_task_id": "celery-task-uuid",
  "brief_due_in_seconds": 300,
  "stream_id": "1704067200000-0",
  "recurring_detected": false
}
```

Brief assembly is delayed by `LATE_ARRIVAL_WINDOW_MINUTES` (default 5 min) via `apply_async(countdown=...)` to allow correlated events to arrive first.

**Response `200` — duplicate within dedup window:** `{"event_id": "...", "status": "deduplicated"}`

---

### `POST /events/ptw`

Ingest a Permit-to-Work event.

**Auth required:** Yes

**Request body:**
```json
{
  "ptw_id": "PTW-2024-042",
  "work_area": "Pump Bay A",
  "asset_ids": ["P-101", "P-102"],
  "ptw_type": "hot_work",
  "issuing_engineer_id": "eng-uuid",
  "valid_from": "2024-01-02T06:00:00Z",
  "valid_to": "2024-01-02T18:00:00Z",
  "source_system": "PTW_System",
  "site_id": "SITE_001",
  "occurred_at": "2024-01-02T06:00:00Z"
}
```

PTW events always receive `priority: critical`. The EEMUA 191 governor always delivers PTW briefs regardless of push count. PTW handler also revokes any pending delayed WO brief for the same asset before assembling immediately.

**Response `202`:** Same shape as work order.

---

### `POST /events/shift-handover`

Ingest a shift handover event.

**Auth required:** Yes

**Request body:**
```json
{
  "outgoing_shift_lead_id": "lead-uuid-1",
  "incoming_shift_lead_id": "lead-uuid-2",
  "handover_time": "2024-01-02T06:00:00Z",
  "site_id": "SITE_001",
  "source_system": "DCS",
  "occurred_at": "2024-01-02T06:00:00Z"
}
```

**Response `202`:** Same shape.

---

### `POST /events/alarm`

Ingest an alarm acknowledgment.

**Auth required:** Yes (`field_worker` or higher — OPA exempts non-sensitive event writes)

**Request body:**
```json
{
  "alarm_id": "ALM-0042",
  "asset_id": "P-101",
  "alarm_tag": "P-101-VIBHI",
  "alarm_description": "Vibration high alarm — P-101 exceeds 4.5 mm/s",
  "severity": "high",
  "acknowledged_by": "tech-uuid",
  "source_system": "DCS",
  "site_id": "SITE_001",
  "occurred_at": "2024-01-01T22:05:00Z"
}
```

**Response `202`:** Same shape.

---

### `POST /events/tag-out`

Ingest an equipment tag-out event. Used when a physical tag-out (lockout/tagout) is applied to an asset.

**Auth required:** Yes

**Request body:**
```json
{
  "asset_id": "P-101",
  "tag_out_reason": "Planned maintenance — seal replacement",
  "performed_by": "tech-uuid",
  "expected_return_date": "2024-01-05T08:00:00Z",
  "source_system": "SAP_PM",
  "site_id": "SITE_001",
  "occurred_at": "2024-01-02T06:00:00Z"
}
```

**Side effects:**
- Inserts into `operational_events` and publishes to `kairos:events:tag_out` stream
- Writes `audit_log` entry with `action=equipment_tag_out`
- Triggers delayed brief assembly (same countdown as WO)

**Response `202`:**
```json
{
  "status": "accepted",
  "event_id": "evt-uuid",
  "stream_entry_id": "1704067200000-0",
  "brief_task_id": "celery-task-uuid",
  "brief_due_in_seconds": 300
}
```

---

### `POST /events/inspection-complete`

Ingest an inspection completion event. Optionally creates a Neo4j knowledge edge if a supporting document is provided. Low-confidence findings (<0.7) are automatically quarantined.

**Auth required:** Yes

**Request body:**
```json
{
  "asset_id": "P-101",
  "inspection_type": "visual",
  "result": "failed",
  "performed_by": "inspector-uuid",
  "findings": "Seal showing wear, recommend replacement within 30 days",
  "document_id": "DOC-INSP-P101-2024",
  "confidence": 1.0,
  "source_system": "SAP_PM",
  "site_id": "SITE_001",
  "occurred_at": "2024-01-02T10:00:00Z"
}
```

`result` values: `passed | failed | conditional`

**Side effects:**
- If `document_id` provided: creates `INSPECTION_RECORD` Neo4j edge with all 6 required properties
- If `confidence < 0.7`: inserts into `quarantine_items` with `input_type=field_observation`
- If `result = "failed"` or `findings` non-empty: triggers immediate brief assembly
- Correlates with other events for the same asset via `compound_event_id`
- Publishes to `kairos:events:inspections` (normal) or `kairos:events:work_orders` (failed/findings)

**Response `202`:**
```json
{
  "status": "accepted",
  "event_id": "evt-uuid",
  "stream_entry_id": "1704067200000-0",
  "edge_id": "neo4j-edge-id",
  "quarantine_item_id": null,
  "brief_task_id": "celery-task-uuid"
}
```

`edge_id` is `null` when no `document_id` was provided. `quarantine_item_id` is populated only when `confidence < 0.7`.

---

### `POST /events/deviation-flag`

Report a physical deviation from the last known state for an asset. Freezes all unacknowledged briefs for the asset until resolved. Carries a 24-hour SLA (overrides default 5-day quarantine SLA).

**Auth required:** Yes

**Request body:**
```json
{
  "asset_id": "P-101",
  "description": "Bypass valve observed open — not reflected in DCS state",
  "reported_by": "tech-uuid",
  "affected_topology_path": "P-101 → XV-101 → V-201"
}
```

**Response `202`:**
```json
{
  "item_id": "q-item-uuid",
  "asset_id": "P-101",
  "status": "quarantined",
  "briefs_frozen": 3,
  "stream_id": "1704067200000-0"
}
```

**Side effects:**
- Inserts item into `quarantine_items` with `input_type=deviation_flag` and `sla_due_at = NOW() + 24h`
- Sets `delivery_frozen=true` on all unacknowledged briefs for this asset
- Publishes to `kairos:events:alarms` stream
- Writes to `audit_log`

---

### `POST /events/deviation-flag/{item_id}/resolve`

Resolve a physical deviation flag. Unfreezes briefs and optionally creates an MoC record.

**Auth required:** Yes — `engineer` or `admin` (OPA enforced)

**Request body:**
```json
{
  "resolution": "promoted",
  "moc_warranted": true,
  "notes": "Bypass confirmed open per field inspection — MOC initiated"
}
```

`resolution` values: `promoted | disputed`

**Response `200`:**
```json
{
  "item_id": "q-item-uuid",
  "status": "resolved",
  "briefs_unfrozen": 3,
  "moc_id": "MOC-XXXXXXXX"
}
```

`moc_id` is only present when `moc_warranted=true`.

---

### `POST /events/plant-state`

Set the current plant operating state for a site. Non-critical briefs are suppressed during `turnaround`, `shutdown`, or `emergency` states.

**Auth required:** Yes — `engineer` or `admin`

**Request body:**
```json
{
  "site_id": "SITE_001",
  "state": "turnaround",
  "expires_at": null
}
```

`state` values: `normal | turnaround | shutdown | emergency`

`expires_at` (optional ISO8601 datetime) — if set, the state automatically reverts to `PLANT_STATE_DEFAULT` after this time.

**Response `202`:**
```json
{
  "status": "set",
  "site_id": "SITE_001",
  "state": "turnaround"
}
```

**Side effects:** Upserts `plant_operating_states` row; writes `audit_log` entry with `action=plant_state_changed`.

---

### `GET /events/plant-state/{site_id}`

Get the current plant operating state for a site.

**Auth required:** Yes

**Response `200`:**
```json
{
  "site_id": "SITE_001",
  "state": "turnaround"
}
```

Returns `PLANT_STATE_DEFAULT` (default: `"normal"`) if no state has been set or if the latest state has expired.

---

### `GET /events/{event_id}`

Get a single operational event with event correlation metadata.

**Auth required:** Yes

**Response `200`:**
```json
{
  "event_id": "evt-uuid",
  "event_type": "work_order_created",
  "asset_id": "P-101",
  "site_id": "SITE_001",
  "occurred_at": "2026-07-02T09:00:00Z",
  "payload": {},
  "compound_event_id": "compound-uuid",
  "correlated_event_ids": ["alarm-evt-uuid"]
}
```

`compound_event_id` and `correlated_event_ids` are set when this event was correlated with other same-asset events within `DEDUP_WINDOW_MINUTES`.

**`404`** if not found.

---

### `POST /events/{event_id}/ack`

Acknowledge receipt of an operational event.

**Auth required:** Yes

**Request body:**
```json
{
  "user_id": "tech-uuid",
  "role": "field_worker",
  "signature": "John Smith",
  "notes": "Acknowledged, will investigate"
}
```

**Response `200`:** `{"event_id": "...", "ack_recorded": true}`

---

## 7. Briefs (Operator Intelligence)

**Prefix:** `/briefs`

Operator intelligence briefs assembled from 5 parallel queries (Neo4j graph + Qdrant vectors + Elasticsearch + Supabase event history + regulatory graph). Governed by EEMUA 191: hard ceiling ≤6 push events/operator/hour, 4-hour asset cool-down per (recipient, asset) pair.

---

### `GET /briefs/`

Get pending briefs for the current user. Also returns site-wide briefs. Calls `record_push` per returned brief (counts against governor).

**Auth required:** Yes

**Query params:**
| Param | Type | Default | Description |
|-------|------|---------|-------------|
| `unacknowledged_only` | bool | `true` | When true, filters to unacknowledged briefs only |
| `limit` | int | `10` | Max briefs (max 50) |

**Response `200`:**
```json
{
  "briefs": [
    {
      "brief_id": "brief-uuid",
      "recipient_user_id": "tech-uuid",
      "priority": "high",
      "trigger_event_type": "work_order_created",
      "headline": "P-101: Elevated vibration — 3 prior failures in 18 months",
      "body": "...",
      "action_items": ["Check coupling alignment", "Review last overhaul report"],
      "warnings": ["Active PTW in same area expires at 18:00"],
      "sources": [
        {
          "document_id": "DOC-P101-FAILURE-HIST",
          "document_type": "maintenance_record",
          "title": "P-101 Failure History Report",
          "authority_level": 2,
          "relevant_excerpt": "Three vibration-related failures in 18 months...",
          "vault_url": "https://...",
          "is_quarantine": false
        }
      ],
      "requires_countersignature": false,
      "delivery_frozen": false,
      "delivered_at": "2024-01-01T22:10:00Z"
    }
  ],
  "total_pending": 1,
  "suppressed_count": 0,
  "governor_state": {
    "push_count_last_hour": 1,
    "ceiling": 6,
    "state": "normal"
  },
  "next_delivery_allowed_at": null
}
```

**Suppression rules (in priority order):**
1. **EEMUA 191 governor:** If `push_count_last_hour >= ceiling`, all non-critical briefs suppressed.
2. **Plant state gate:** If plant state for the user's `site_id` is `turnaround`, `shutdown`, or `emergency`, non-critical briefs suppressed. Critical (PTW) briefs always pass.
3. **Frozen briefs:** Briefs with `delivery_frozen=true` (set by deviation flag) are included with `frozen=true` and `freeze_reason` but excluded from governor push counting.

---

### `GET /briefs/governor/status`

Get current push governor state for the authenticated user.

**Auth required:** Yes

**Response `200`:**
```json
{
  "user_id": "tech-uuid",
  "state": "normal",
  "push_count_last_hour": 3,
  "ceiling": 6,
  "next_delivery_allowed_at": null
}
```

`state` values: `normal | suppressed`

---

### `GET /briefs/{brief_id}`

Get a specific brief.

**Auth required:** Yes

**Response `200`:** Full brief object.

---

### `POST /briefs/{brief_id}/ack`

Acknowledge a brief. Required for PTW briefs and any brief with `requires_countersignature: true`.

**Auth required:** Yes

**Request body:**
```json
{
  "user_id": "tech-uuid",
  "signature": "John Smith",
  "notes": "Understood, proceeding with isolation check"
}
```

Safety-critical briefs (`requires_countersignature: true`) require a second user's signature. Attempting to ack without the countersignature returns `400`.

**Response `200`:** `{"brief_id": "...", "ack_status": "acknowledged"}`

---

### `POST /briefs/{brief_id}/feedback`

Submit feedback on brief accuracy.

**Auth required:** Yes

**Request body:**
```json
{
  "rating": "incorrect",
  "notes": "Pressure value shown is for a different vessel"
}
```

`rating` values: `accurate | missing_context | incorrect`

When `rating = "incorrect"`: writes `confidence_recheck_queued` to `audit_log` with `source_document_ids`.

**Response `200`:** `{"brief_id": "...", "feedback_recorded": true, "confidence_recheck_queued": true}`

---

## 8. Governance

**Prefix:** `/governance`

Knowledge conflict detection, quarantine management, Management of Change, SLA tracking, circuit breaker, validation corpus, and model gate.

---

### `GET /governance/conflicts`

List open knowledge conflicts. Runs lazy SLA escalation before returning results.

**Auth required:** Yes (`engineer`, `admin`, `reliability`)

**Query params:** `status` (`open | pending_moc | resolved | all`, default `open`), `track` (`administrative | engineering`), `asset_id`, `limit`, `offset`

**Response `200`:**
```json
{
  "items": [
    {
      "conflict_id": "conf-uuid",
      "track": "engineering",
      "asset_id": "P-101",
      "parameter": "max_allowable_pressure",
      "source_a": {"document_id": "doc-a", "value": "12.5 bar", "authority_level": 1},
      "source_b": {"document_id": "doc-b", "value": "15.0 bar", "authority_level": 2},
      "severity": "critical",
      "status": "open",
      "sla_due_at": "2024-01-06T00:00:00Z",
      "is_overdue": false,
      "escalated_at": null,
      "detected_at": "2024-01-01T00:00:00Z"
    }
  ],
  "total": 1,
  "limit": 50,
  "offset": 0
}
```

Conflict tracks:
- `engineering` — same parameter, different values from different authority levels
- `administrative` — same document with conflicting `valid_from/valid_to` windows

`sla_due_at` maps to the existing `sla_deadline` column. `is_overdue` is computed inline. `escalated_at` is populated when SLA escalation fires.

---

### `GET /governance/conflicts/{conflict_id}`

Get conflict detail + blast-radius report.

**Auth required:** Yes

**Response `200`:** Full conflict object + `blast_radius: [{"asset_id": ..., "affected_facts": 5}]`

---

### `POST /governance/conflicts/{conflict_id}/resolve`

Resolve an administrative-track conflict. Engineering-track conflicts must be resolved via `POST /governance/moc/webhook`.

**Auth required:** Yes — `admin` or `engineer` (OPA enforced)

**Request body:**
```json
{
  "resolution": "accept_source_a",
  "notes": "OISD-117 takes precedence per engineering manager sign-off",
  "resolved_by": "admin@kairos.local"
}
```

**Response `200`:** `{"conflict_id": "...", "status": "resolved"}`

---

### `GET /governance/quarantine`

List items in the quarantine layer. Runs lazy SLA escalation before returning results.

**Auth required:** Yes

**Query params:** `asset_id`, `reviewer_id`, `review_status` (`pending | promoted | disputed | archived`), `limit`, `offset`

Default `review_status` is `pending`.

**Response `200`:**
```json
{
  "items": [
    {
      "item_id": "q-uuid",
      "asset_id": "P-101",
      "content": "Seal clearance 0.15mm from voice note",
      "input_type": "voice_note",
      "submitted_by": "tech-uuid",
      "review_status": "pending",
      "session_context": null,
      "sla_due_at": "2024-01-06T00:00:00Z",
      "is_overdue": false,
      "escalated_at": null,
      "quarantined_at": "2024-01-01T00:00:00Z"
    }
  ],
  "total": 1,
  "limit": 50,
  "offset": 0,
  "note": "All items are unverified field inputs — not reviewed by engineering authority."
}
```

Items enter quarantine when `confidence < 0.7` or entity resolution fails. `sla_due_at` defaults to `NOW() + 5 days`; deviation flags override to `NOW() + 24h`.

---

### `POST /governance/quarantine/{item_id}/promote`

Promote a quarantine item to the canonical graph. **Human action only — no auto-promotion, ever.**

**Auth required:** Yes — `reliability`, `engineer`, or `admin` (OPA blocks `field_worker` with 403)

**Request body:**
```json
{
  "promoted_by": "engineer@kairos.local",
  "notes": "Verified against P&ID Rev D",
  "authority_level": 3,
  "valid_from": "2024-01-01T00:00:00Z"
}
```

On promotion, `detect_conflict()` runs. If a conflict is detected, `kairos.conflicts.open` metric increments.

**Response `200` — no conflict:**
```json
{
  "item_id": "q-uuid",
  "status": "promoted",
  "conflict_detected": false,
  "edge_id": "neo4j-edge-id"
}
```

**Response `200` — conflict detected:**
```json
{
  "item_id": "q-uuid",
  "status": "promoted",
  "conflict_detected": true,
  "conflict_id": "conf-uuid",
  "conflict_track": "engineering"
}
```

---

### `POST /governance/quarantine/{item_id}/dispute`

Mark a quarantine item as incorrect. Prevents accidental promotion.

**Auth required:** Yes

**Request body:** `{"disputed_by": "engineer@kairos.local", "reason": "Value is for V-201, not P-101"}`

**Response `200`:** `{"item_id": "...", "status": "disputed"}`

---

### `POST /governance/quarantine/{item_id}/request-info`

Layer 6's fourth review action — a reviewer asks for clarification instead of promoting or disputing. The item stays `pending` (still actionable); the request + note are recorded to the audit log (`action=info_requested`).

**Auth required:** Yes (same gate as promote — `reliability`/`admin`)

**Request body:** `{"note": "Which seal face — inboard or outboard?"}`

**Response `200`:** `{"item_id": "...", "status": "info_requested", "note": "..."}`

**Errors:** `404` item not found · `409` item is not `pending`

---

### `GET /governance/sla-report`

SLA escalation report for all overdue conflicts and quarantine items. Runs lazy escalation then returns full overdue inventory.

**Auth required:** Yes

**Response `200`:**
```json
{
  "checked_at": "2024-01-06T12:00:00Z",
  "escalated_this_run": {
    "conflicts": 1,
    "quarantine_items": 0
  },
  "overdue_conflicts": [
    {
      "conflict_id": "conf-uuid",
      "track": "engineering",
      "asset_id": "P-101",
      "sla_deadline": "2024-01-05T00:00:00Z",
      "escalated_at": "2024-01-06T12:00:00Z",
      "status": "open"
    }
  ],
  "overdue_conflicts_total": 1,
  "overdue_quarantine_items": [],
  "overdue_quarantine_total": 0
}
```

Escalation is idempotent — `escalated_this_run` is 0 on subsequent calls for already-escalated items.

---

### `GET /governance/moc`

List Management of Change records.

**Auth required:** Yes

**Query params:** `status` (`draft | pending_approval | approved | rejected`)

**Response `200`:**
```json
{
  "items": [...],
  "total": 3
}
```

---

### `POST /governance/moc/webhook`

Receive an MoC resolution webhook from the plant MoC system.

**Auth required:** Yes (`admin` or service key)

Optionally verifies HMAC-SHA256 signature via `X-Webhook-Signature` header when `MOC_WEBHOOK_SECRET` is configured.

**Request body:**
```json
{
  "moc_id": "MOC-2024-007",
  "status": "approved",
  "approved_by": "chief.engineer@plant.com",
  "effective_date": "2024-03-01T00:00:00Z"
}
```

`status` values: `approved | rejected`

On `approved`: closes the old validity window on the conflicting Neo4j edge and resolves the linked `knowledge_conflicts` row.

**Response `200`:** `{"status": "received", "moc_id": "...", "resolution": "approved"}`

---

### `GET /governance/circuit-breaker`

Get the current SPC circuit breaker state for all monitored entity types.

**Auth required:** Yes

One state per **asset class** that has recorded extraction overrides in the last 30 days. An asset class trips to `halted: true` when its 7-day override-count z-score exceeds 2.0; new extractions for that class are then queued for human review rather than written to the graph. An empty `states` array means no class has any override records yet (all ingestion paths open).

**Response `200`:**
```json
{
  "states": [
    {
      "asset_class": "pump",
      "halted": false,
      "z_score": 1.2,
      "reason": "within_normal_range",
      "override_count_7d": 3
    }
  ],
  "halted_count": 0
}
```

> ⚠️ Each state carries `asset_class` + boolean **`halted`** (not `entity_type` / a `status` string).
> `reason` is `z_score_exceeded | within_normal_range | stats_error`. There is no `override_rate`,
> `total_extractions_7d`, or `threshold` field.

---

### `GET /governance/blast-radius/{document_id}`

Get the blast-radius report for a proposed document change.

**Auth required:** Yes

**Response `200`:**
```json
{
  "document_id": "DOC-TS4FXYKHCQEF",
  "affected_count": 11,
  "affected": [
    {
      "edge": {
        "relationship_type": "CONTAINS_TOPOLOGY_ELEMENT",
        "edge_id": "DOC-…_CONTAINS_TOPOLOGY_ELEMENT_TOPO-EQ-001_…",
        "authority_level": 3,
        "confidence": 0.85,
        "verification_status": "unverified",
        "valid_from": "2026-07-10T11:52:56Z",
        "valid_to": "9999-12-31T23:59:59Z",
        "document_id": "DOC-TS4FXYKHCQEF"
      },
      "target": {
        "concept_id": "TOPO-EQ-001",
        "label": "P-101",
        "element_type": "equipment_nodes",
        "source_document_id": "DOC-TS4FXYKHCQEF"
      }
    }
  ]
}
```

> ⚠️ The payload is `affected: [{edge, target}]` (edge/target node pairs) + `affected_count` — **not**
> `affected_assets` / `affected_facts` / `severity`. Targets are heterogeneous graph nodes (facts,
> concepts, assets); read a display label from `target.label ?? target.name ?? target.concept_id`.
> The frontend `getBlastRadius` fetcher flattens each pair into `{item_id, item_type, description,
> asset_id, flagged_for_review}` (flagged = edge `verification_status != "verified"`).

---

### `GET /governance/validation-corpus/stats`

Return validation corpus coverage statistics used by the model gate.

**Auth required:** Yes

**Response `200`:**
```json
{
  "total_corpus_size": 42,
  "by_entity_type": {
    "ASSET_TAG": 18,
    "process_parameter": 12,
    "FAILURE_MODE": 12
  },
  "last_updated_at": "2024-01-05T09:00:00Z"
}
```

The corpus is populated automatically when quarantine items are promoted (`authority=human_promotion`) or when annotations with `is_correct=True` are submitted (`authority=annotation_correction`).

---

### `POST /governance/model-gate/run`

Trigger NER model gate evaluation against the validation corpus.

**Auth required:** Yes — `admin` only

**Query params:**
| Param | Type | Required | Description |
|-------|------|----------|-------------|
| `model_name` | string | Yes | NER model to evaluate (e.g. `mistralai/ministral-14b-instruct-2512`) |

**Response `200`:**
```json
{
  "task_id": "celery-task-uuid",
  "model_name": "mistralai/ministral-14b-instruct-2512",
  "status": "queued"
}
```

The Celery task runs on the `validation` queue. Results are written to `audit_log` with `action=model_gate_result`. The gate compares F1 against the incumbent baseline; if lower, the run is marked `failed`.

---

### `GET /governance/model-gate/history`

Return the last 20 model gate run results.

**Auth required:** Yes

**Response `200`:**
```json
{
  "items": [
    {
      "id": "uuid",
      "entity_id": "mistralai/ministral-14b-instruct-2512",
      "details": {
        "model_name": "mistralai/ministral-14b-instruct-2512",
        "precision": 0.91,
        "recall": 0.88,
        "f1": 0.895,
        "gate_passed": true
      },
      "timestamp": "2024-01-05T09:05:00Z"
    }
  ],
  "total": 1
}
```

---

## 9. Compliance

**Prefix:** `/compliance`

Regulatory gap detection against 12 seeded frameworks (OISD-117, ISO 45001, and 10 others). Seed via `docker exec kairos-backend-api python scripts/seed_regulations.py`.

---

### `GET /compliance/gaps`

List detected compliance gaps across all assets.

**Auth required:** Yes (`compliance` or `admin`)

**Query params:** `asset_id`, `framework`, `severity` (`critical | high | medium | low`), `cleared` (bool), `limit`

**Response `200`:**
```json
{
  "items": [
    {
      "gap_id": "gap-uuid",
      "asset_id": "P-101",
      "framework": "OISD-117",
      "clause_id": "6.4.2",
      "requirement": "Maximum allowable pressure must be documented and tagged",
      "gap_description": "No pressure documentation found in knowledge graph for P-101",
      "severity": "critical",
      "cleared": false,
      "detected_at": "2024-01-01T00:00:00Z"
    }
  ],
  "total": 1,
  "limit": 50,
  "offset": 0,
  "framework": "OISD-117",
  "last_scan": "realtime"
}
```

---

### `GET /compliance/dashboard`

Compliance posture summary: gap counts by framework, severity, and clearance status.

**Auth required:** Yes (`compliance` or `admin`)

**Response `200`:**
```json
{
  "site_id": null,
  "total_gaps": {"critical": 12, "major": 40, "minor": 0},
  "by_framework": {
    "OISD_117": {"critical": 12, "major": 0, "minor": 0},
    "ISO_45001": {"critical": 0, "major": 40, "minor": 0}
  },
  "by_asset_class": {
    "pump": {"critical": 6, "major": 0, "minor": 0},
    "valve": {"critical": 6, "major": 0, "minor": 0}
  },
  "last_updated": "realtime"
}
```

> ⚠️ **`total_gaps` is an object `{critical, major, minor}`, not a number.** Severity buckets are
> `critical | major | minor` (not `high/medium`). `by_framework` and `by_asset_class` are keyed by
> those same severity buckets. There are no `cleared` / `open` / `by_severity` fields. Sum the three
> buckets to get a grand total; never render `total_gaps` directly.

---

### `GET /compliance/audit-pack`

Generate an audit evidence package (all gaps + evidence + clearance status).

**Auth required:** Yes (`compliance` or `admin`)

**Query params:** `framework` (optional filter)

**Response `200`:**
```json
{
  "generated_at": "2024-01-01T00:00:00Z",
  "framework": "OISD-117",
  "total_clauses": 24,
  "covered": 14,
  "clearance_blocked": false,
  "evidence": [
    {
      "clause_id": "6.4.2",
      "status": "covered",
      "document_id": "doc-oisd-evidence",
      "clearance_blocked": false
    }
  ]
}
```

---

### `GET /compliance/frameworks`

List all configured regulatory frameworks.

**Auth required:** Yes

**Response `200`:**
```json
[
  {
    "framework_id": "OISD-117",
    "name": "OISD Standard 117 — Inspection of Pressure Vessels",
    "clause_count": 24,
    "equipment_classes": ["vessel", "pressure_vessel"]
  }
]
```

---

## 10. Elicitation

**Prefix:** `/elicitation`

Knowledge gap elicitation via AI-generated micro-interviews and off-boarding programmes. Micro-interview responses and off-boarding responses are stored in `quarantine_items` for human review before graph promotion.

---

### `POST /elicitation/trigger`

Evaluate whether elicitation should be triggered. Three conditions trigger it:
1. Failure code not seen in the last 6 months for this asset
2. Asset has no knowledge graph edges (uninstrumented)
3. Work order priority is `critical` or `urgent`

**Auth required:** Yes

**Request body:**
```json
{
  "work_order_id": "WO-2024-001",
  "asset_id": "P-101",
  "failure_code": "SEAL-LEAK-EXT",
  "priority": "high"
}
```

**Response `200` — triggered:**
```json
{
  "work_order_id": "WO-2024-001",
  "triggered": true,
  "reason": "rare_failure_code",
  "session_id": "session-uuid",
  "workflow_id": "temporal-workflow-id"
}
```

**Response `200` — not triggered:** `{"triggered": false, "reason": "failure_code_seen_recently"}`

---

### `GET /elicitation/{work_order_id}/questions`

Get generated interview questions (available after workflow reaches `status=questions_ready`).

**Auth required:** Yes

**Response `200`:**
```json
{
  "session_id": "session-uuid",
  "work_order_id": "WO-2024-001",
  "status": "questions_ready",
  "questions": [
    {
      "question_id": "q-1",
      "text": "When did you first notice the seal leak? Was there any change in operating conditions beforehand?",
      "type": "open_ended"
    }
  ]
}
```

Returns `404` if no session exists yet.

---

### `POST /elicitation/{work_order_id}/responses`

Submit Q&A responses. Stored in `quarantine_items` for expert review before graph promotion.

**Auth required:** Yes

**Request body:**
```json
{
  "session_id": "session-uuid",
  "responses": [
    {"question_id": "q-1", "answer": "Started 3 days ago, no operating changes"},
    {"question_id": "q-2", "answer": "Yes, replaced twice in 2022"}
  ]
}
```

**Response `200`:**
```json
{
  "session_id": "session-uuid",
  "status": "completed",
  "quarantine_item_id": "q-item-uuid",
  "message": "Responses stored in quarantine for expert review"
}
```

---

### `POST /elicitation/{work_order_id}/voice`

Submit a voice note for a work order. Transcribed via Groq Whisper, NER extracted, stored as a `quarantine_items` entry.

**Auth required:** Yes

**Request:** `multipart/form-data`

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `file` | binary | Yes | Audio file (WAV, MP3, M4A, FLAC) |
| `submitted_by` | string | Yes | User ID of submitter |

**Processing pipeline:**
1. SHA-256 dedup check — returns existing item if same audio file submitted twice
2. Upload to Supabase Storage (`kairos-vault` bucket)
3. Celery task on `transcription` queue → Groq `whisper-large-v3` transcription
4. NER extraction on transcript text
5. Insert into `quarantine_items` with `input_type=voice_note`

**Response `202`:**
```json
{
  "status": "accepted",
  "work_order_id": "WO-2024-001",
  "task_id": "celery-task-uuid",
  "storage_path": "voice_notes/WO-2024-001/abc12345_note.wav",
  "sha256": "abc123...",
  "message": "Voice note stored. Transcription and NER running asynchronously."
}
```

---

### `POST /elicitation/offboarding`

Start an off-boarding interview programme for a departing employee. Identifies the top equipment families from the employee's work order history (up to 6), creates one session item per family, and schedules a Celery task to generate questions for each.

**Auth required:** Yes — `engineer` or `admin`

**Request body:**
```json
{
  "personnel_id": "tech-uuid",
  "personnel_email": "john.smith@plant.com",
  "retirement_date": "2024-06-30",
  "session_interval_days": 12
}
```

`session_interval_days` — spacing between successive interview sessions (default 12).

**Response `201`:**
```json
{
  "session_id": "session-uuid",
  "personnel_id": "tech-uuid",
  "total_sessions": 6,
  "items": [
    {
      "item_id": "item-uuid",
      "session_number": 1,
      "equipment_family": "centrifugal_pump",
      "scheduled_for": "2024-01-01T00:00:10Z"
    }
  ]
}
```

Session 1 fires in 10 seconds (demo/test). Subsequent sessions are spaced by `session_interval_days`.

---

### `GET /elicitation/offboarding`

List all active off-boarding programmes with completion percentage.

**Auth required:** Yes

**Response `200`:**
```json
{
  "items": [
    {
      "id": "session-uuid",
      "personnel_id": "tech-uuid",
      "personnel_email": "john.smith@plant.com",
      "retirement_date": "2024-06-30",
      "total_sessions": 6,
      "status": "scheduled",
      "sessions_completed": 1,
      "completion_pct": 17,
      "created_at": "2024-01-01T00:00:00Z"
    }
  ],
  "total": 1
}
```

---

### `GET /elicitation/offboarding/{session_id}`

Get a specific off-boarding programme with all session items and their statuses.

**Auth required:** Yes

**Response `200`:**
```json
{
  "id": "session-uuid",
  "personnel_id": "tech-uuid",
  "personnel_email": "john.smith@plant.com",
  "retirement_date": "2024-06-30",
  "total_sessions": 6,
  "status": "scheduled",
  "session_items": [
    {
      "id": "item-uuid",
      "session_number": 1,
      "equipment_family": "centrifugal_pump",
      "status": "completed",
      "scheduled_for": "2024-01-01T00:00:10Z",
      "completed_at": "2024-01-01T00:05:00Z"
    }
  ]
}
```

**`404`** if not found.

---

### `GET /elicitation/offboarding/{session_id}/questions`

Return questions for all session items in this programme (items with `status=questions_ready`).

**Auth required:** Yes

**Response `200`:**
```json
{
  "session_id": "session-uuid",
  "total_items": 6,
  "items_ready": 1,
  "items": [
    {
      "id": "item-uuid",
      "session_number": 1,
      "equipment_family": "centrifugal_pump",
      "status": "questions_ready",
      "questions": ["..."],
      "scheduled_for": "2024-01-01T00:00:10Z"
    }
  ]
}
```

---

### `POST /elicitation/offboarding/{session_id}/responses`

Submit responses for one session item. Stores in `quarantine_items` with `input_type=offboarding_response`.

**Auth required:** Yes

**Request body:**
```json
{
  "item_id": "item-uuid",
  "responses": [
    {"question_index": 0, "answer": "I check the mechanical seal weekly for any signs of leakage"},
    {"question_index": 1, "answer": "The most common failure is bearing wear, usually after 18 months"}
  ],
  "submitted_by": "tech-uuid"
}
```

`question_index` is an integer (0-based). `submitted_by` defaults to the current user if omitted.

**Response `200`:**
```json
{
  "session_id": "session-uuid",
  "item_id": "item-uuid",
  "quarantine_item_id": "q-item-uuid",
  "status": "completed",
  "message": "Responses stored in quarantine for expert review"
}
```

---

## 11. Annotations

**Prefix:** `/annotations`

Active learning annotation interface. Allows human reviewers to correct NER extraction errors. Each correction reduces the confidence of the associated quarantine item by 0.1 and is logged for circuit breaker monitoring.

---

### `POST /annotations/`

Submit a NER correction annotation.

**Auth required:** Yes (`engineer` or `admin`)

**Request body:**
```json
{
  "document_id": "doc-uuid",
  "entity_type": "process_parameter",
  "original_value": "12.5 bar",
  "corrected_value": "15.0 bar",
  "is_correct": false,
  "notes": "Wrong vessel — this value applies to V-201, not P-101"
}
```

**Side effects:**
- Inserts annotation into `ner_annotations`
- If `is_correct=false`: reduces `quarantine_items.confidence` by 0.1 for any pending quarantine item with matching `document_id` + `entity_type`; writes `audit_log` entry with `action=confidence_recheck_queued`; records a circuit breaker override for the entity type
- If `is_correct=true`: adds to `validation_corpus` with `authority=annotation_correction`

**Response `201`:**
```json
{
  "annotation_id": "ann-uuid",
  "document_id": "doc-uuid",
  "entity_type": "process_parameter",
  "is_correct": false,
  "quarantine_confidence_updated": true
}
```

---

### `GET /annotations/`

List annotations, optionally filtered by document.

**Auth required:** Yes

**Query params:** `document_id` (optional)

**Response `200`:** Array of annotation objects.

---

### `GET /annotations/stats`

Aggregated annotation statistics for dashboard display.

**Auth required:** Yes

**Response `200`:**
```json
{
  "total_annotations": 42,
  "corrections_this_week": 6,
  "top_corrected_entity_types": [
    {"entity_type": "FAILURE_MODE", "count": 3},
    {"entity_type": "process_parameter", "count": 2}
  ]
}
```

---

## 12. Audit Log

**Prefix:** `/audit-log`

Immutable audit trail. Every write operation in KAIROS appends an entry. Read-only API.

> **Note:** The time column is `timestamp`, not `created_at`.

---

### `GET /audit-log/`

Query the audit log with optional filters.

**Auth required:** Yes (`engineer` or `admin`)

**Query params:**
| Param | Type | Description |
|-------|------|-------------|
| `action` | string | Filter by action type |
| `entity_type` | string | Filter by entity type (`document`, `brief`, `asset`, …) |
| `entity_id` | string | Filter by entity ID |
| `limit` | int | Max results (default 50) |

**Common action values:** `brief_acknowledged` · `confidence_recheck_queued` · `plant_state_changed` · `rca_pack_generated` · `timestamp_drift_detected` · `attribution_flag` · `quarantine_promoted` · `quarantine_disputed` · `info_requested` · `moc_resolved` · `moc_webhook_received` · `circuit_breaker_override` · `equipment_tag_out` · `sla_escalated` · `model_gate_result` · `offboarding_programme_created` · `recurring_failure_detected`

**Response `200`:**
```json
{
  "items": [
    {
      "id": "uuid",
      "action": "rca_pack_generated",
      "entity_type": "asset",
      "entity_id": "P-101",
      "performed_by": "engineer@kairos.local",
      "details": {
        "failure_code": "SEAL-FAIL",
        "timeline_events": 18,
        "synthesis_available": false
      },
      "timestamp": "2026-07-02T12:05:00Z"
    }
  ],
  "total": 1
}
```

---

## 13. Go OT Connector (port 8090)

**Base URL:** `http://localhost:8090`

The Go connector (Gin) bridges OT historian data and EAM sync with the FastAPI backend. Uses `INTERNAL_API_KEY` as a service bearer token when calling FastAPI.

---

### `GET /health`

Connector liveness probe.

**Response `200`:** `{"status": "ok"}`

---

### `GET /ot/query`

Query historian time-series. Uses `PIWebAPIClient` if `PI_WEBAPI_BASE_URL` is configured, otherwise `MockHistorianClient` (50 sine-wave vibration points, mean≈1.8 mm/s, 2-minute span).

**Query params:**
| Param | Type | Description |
|-------|------|-------------|
| `tag` | string | Historian tag (e.g. `P-101.VIB`) |
| `from` | ISO8601 | Start time |
| `to` | ISO8601 | End time |

**Response `200`:**
```json
{
  "tag": "P-101.VIB",
  "from": "2024-01-01T22:00:00Z",
  "to": "2024-01-01T22:02:00Z",
  "points": [
    {"timestamp": "2024-01-01T22:00:00Z", "value": 1.82, "quality": "good"}
  ],
  "count": 50,
  "mock": true
}
```

`mock: true` when using `MockHistorianClient`. OT data is ephemeral — never stored in KAIROS.

---

### `GET /ot/coverage/:asset_id`

Check whether an asset has knowledge graph coverage. Calls FastAPI `GET /assets/{asset_id}/knowledge` with internal service key.

**Response `200`:**
```json
{
  "asset_id": "P-101",
  "coverage_percent": 100,
  "source": "knowledge_graph",
  "fact_count": 4
}
```

`source: "mock"` when FastAPI returns no facts or is unreachable.

---

### `POST /eam/sync`

Sync EAM assets into KAIROS. Reads `fixtures/sample_assets.json` if `EAM_ODS_ENDPOINT` is not configured (5 assets: P-101, V-201, HX-301, C-401, T-501). POSTs each to FastAPI `POST /assets`.

**Response `200`:**
```json
{
  "synced": 5,
  "failed": 0,
  "assets": ["P-101", "V-201", "HX-301", "C-401", "T-501"]
}
```

---

### `POST /eam/work-order`

Proxy an EAM work order into KAIROS event ingestion. Forwards raw body to FastAPI `POST /events/work-order`.

**Request body:** Same as `POST /events/work-order`.

**Response:** Proxied response from FastAPI.

---

## 14. Error Codes

| HTTP Status | When |
|------------|------|
| `200` | Success |
| `201` | Resource created |
| `202` | Accepted — async operation started |
| `400` | Malformed request body / missing required field |
| `401` | Missing or invalid JWT |
| `403` | OPA policy denied (wrong role for the route) |
| `404` | Resource not found |
| `409` | Conflict (duplicate asset_id, document already superseded) |
| `422` | Pydantic validation error (field type mismatch) |
| `500` | Internal server error — check `docker logs kairos-backend-api 2>&1 | tail -30` |

**OPA 403 response shape:**
```json
{
  "detail": "Access denied by policy",
  "required_action": "promote_quarantine",
  "user_role": "field_worker"
}
```

**Pydantic 422 response shape:**
```json
{
  "detail": [
    {
      "type": "missing",
      "loc": ["body", "confirmed_by_user_id"],
      "msg": "Field required"
    }
  ]
}
```

---

## 15. Auth Quick-Reference

```bash
# Get a token
TOKEN=$(curl -s -X POST http://localhost:8000/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"admin@kairos.local","password":"KairosAdmin123!"}' \
  | jq -r .access_token)

# Use it
curl -H "Authorization: Bearer $TOKEN" http://localhost:8000/assets/P-101

# Health check (no auth needed)
curl http://localhost:8000/health/detailed

# Internal service call (Go connector pattern)
curl -H "Authorization: Bearer kairos-internal-dev-key" \
  http://localhost:8000/assets/P-101

# Dev shortcut: omit Authorization header when APP_DEBUG=True
# Treated as {user_id: "dev-user", role: "engineer", site_id: "SITE_001"}
curl http://localhost:8000/assets/P-101
```

**Role permission matrix:**

| Role | Can do |
|------|--------|
| `field_worker` | Read search, read briefs, ack briefs, post alarms |
| `engineer` | Above + ingest documents, write assets, read/resolve governance, start offboarding |
| `reliability` | Above (no asset write) + promote quarantine |
| `compliance` | Read search, read compliance, read audit |
| `admin` | Everything |

---

## Appendix: OpenAPI

- Swagger UI: `http://localhost:8000/docs`
- ReDoc: `http://localhost:8000/redoc`
- OpenAPI JSON: `http://localhost:8000/openapi.json`
