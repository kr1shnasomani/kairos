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
11. [Go OT Connector (port 8090)](#11-go-ot-connector-port-8090)
12. [Error Codes](#12-error-codes)
13. [Auth Quick-Reference](#13-auth-quick-reference)

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
  "name": "Feed Pump Alpha",
  "equipment_class": "pump",
  "site_id": "SITE_001",
  "criticality": "safety_critical",
  "created_at": "2024-01-01T00:00:00Z"
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

**Response `200`:** Array of asset objects.

---

### `GET /assets/{asset_id}`

Get a single asset by its canonical ID.

**Auth required:** Yes

**Response `200`:** Full asset object. **`404`** if not found.

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
| `max_authority` | int 1–5 | `5` | Maximum authority level to include |

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

**Metrics:** Records `kairos.ingestion.duration` histogram on completion.

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

**Response `200`:** Array of `VaultDocument` objects.

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
  "extraction_model": "spacy-en-core-web-lg",
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
  "model": "meta/llama-3.3-70b-instruct"
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

## 6. Events (Operational)

**Prefix:** `/events`

Event ingestion for CMMS work orders, Permit-to-Work, shift handovers, and DCS alarms. All events:
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

`assigned_technician_id` is optional — if absent, brief is addressed site-wide (`recipient_user_id = "site-SITE_001"`).

**Response `202`:**
```json
{
  "event_id": "evt-uuid",
  "status": "accepted",
  "brief_id": "brief-uuid",
  "stream_id": "1704067200000-0"
}
```

Duplicate: `{"event_id": "...", "status": "deduplicated"}` with `200`.

**Side effects:** If this asset had a prior WO in the last 30 days, a Celery `evaluate_outcome` attribution task is queued.

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

PTW events always receive `priority: critical`. The EEMUA 191 governor always delivers PTW briefs regardless of push count.

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
  "severity": "high",
  "acknowledged_by": "tech-uuid",
  "source_system": "DCS",
  "site_id": "SITE_001",
  "occurred_at": "2024-01-01T22:05:00Z"
}
```

**Response `202`:** Same shape.

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
| Param | Type | Description |
|-------|------|-------------|
| `site_id` | string | Filter to site |
| `priority` | string | `critical \| high \| medium \| low` |
| `limit` | int | Max briefs (default 20) |

**Response `200`:**
```json
[
  {
    "brief_id": "brief-uuid",
    "recipient_user_id": "tech-uuid",
    "priority": "high",
    "trigger_event_type": "work_order",
    "headline": "P-101: Elevated vibration — 3 prior failures in 18 months",
    "body": "...",
    "action_items": ["Check coupling alignment", "Review last overhaul report"],
    "warnings": ["Active PTW in same area expires at 18:00"],
    "sources": [
      {
        "document_id": "DOC-P101-FAILURE-HIST",
        "title": "P-101 Failure History Report",
        "authority_level": 2,
        "confidence": 0.91,
        "snippet": "Three vibration-related failures in 18 months..."
      }
    ],
    "requires_countersignature": false,
    "delivered_at": "2024-01-01T22:10:00Z"
  }
]
```

Governor suppressed: returns `[]` (empty array).

---

### `GET /briefs/governor/status`

Get current push governor state for the authenticated user.

**Auth required:** Yes

**Response `200`:**
```json
{
  "user_id": "tech-uuid",
  "state": "active",
  "push_count_last_hour": 3,
  "ceiling": 6,
  "can_receive": true
}
```

`state` values: `active | suppressed`

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

Knowledge conflict detection, quarantine management, and Management of Change.

---

### `GET /governance/conflicts`

List open knowledge conflicts.

**Auth required:** Yes (`engineer`, `admin`, `reliability`)

**Query params:** `status` (`open | resolved | all`, default `open`), `track` (`administrative | engineering`), `asset_id`, `limit`

**Response `200`:**
```json
[
  {
    "conflict_id": "conf-uuid",
    "track": "engineering",
    "asset_id": "P-101",
    "parameter": "max_allowable_pressure",
    "source_a": {"document_id": "doc-a", "value": "12.5 bar", "authority_level": 1},
    "source_b": {"document_id": "doc-b", "value": "15.0 bar", "authority_level": 2},
    "severity": "critical",
    "status": "open",
    "detected_at": "2024-01-01T00:00:00Z"
  }
]
```

Conflict tracks:
- `engineering` — same parameter, different values from different authority levels
- `administrative` — same document with conflicting `valid_from/valid_to` windows

---

### `GET /governance/conflicts/{conflict_id}`

Get conflict detail + blast-radius report.

**Auth required:** Yes

**Response `200`:** Full conflict object + `blast_radius: [{"asset_id": ..., "affected_facts": 5}]`

---

### `POST /governance/conflicts/{conflict_id}/resolve`

Resolve a conflict.

**Auth required:** Yes — `admin` or `engineer` (OPA enforced)

**Request body:**
```json
{
  "resolution": "accept_source_a",
  "notes": "OISD-117 takes precedence per engineering manager sign-off",
  "resolved_by": "admin@kairos.local"
}
```

`resolution` values: `accept_source_a | accept_source_b | supersede_both | moc_required`

**Response `200`:** `{"conflict_id": "...", "status": "resolved"}`

---

### `GET /governance/quarantine`

List items in the quarantine layer.

**Auth required:** Yes

**Query params:** `asset_id`, `review_status` (`pending | promoted | disputed`), `limit`

**Response `200`:**
```json
[
  {
    "item_id": "q-uuid",
    "asset_id": "P-101",
    "parameter": "seal_clearance_mm",
    "value": "0.15",
    "confidence": 0.62,
    "source_document_id": "doc-uuid",
    "review_status": "pending",
    "session_context": null,
    "quarantined_at": "2024-01-01T00:00:00Z"
  }
]
```

Items enter quarantine when `confidence < 0.7` or entity resolution fails during NER.

---

### `POST /governance/quarantine/{item_id}/promote`

Promote a quarantine item to the canonical graph. **Human action only — no auto-promotion, ever.**

**Auth required:** Yes — `admin` or `engineer` (OPA blocks `field_worker` with 403)

**Request body:**
```json
{
  "promoted_by": "engineer@kairos.local",
  "notes": "Verified against P&ID Rev D",
  "authority_level": 3,
  "valid_from": "2024-01-01T00:00:00Z"
}
```

On promotion, `detect_conflict()` runs. If a conflict is detected, `kairos.conflicts.open` metric increments by 1.

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

### `GET /governance/moc`

List Management of Change records.

**Auth required:** Yes

**Query params:** `status` (`open | resolved | all`)

**Response `200`:** Array of MoC objects.

---

### `POST /governance/moc/webhook`

Receive an MoC resolution webhook from the plant MoC system.

**Auth required:** Yes (`admin` or service key)

**Request body:**
```json
{
  "moc_id": "MOC-2024-007",
  "status": "resolved",
  "resolution": "approved",
  "approved_by": "chief.engineer@plant.com",
  "effective_date": "2024-03-01T00:00:00Z"
}
```

**Response `200`:** `{"moc_id": "...", "status": "resolved", "edges_updated": 3}`

---

### `GET /governance/blast-radius/{document_id}`

Get the blast-radius report for a proposed document change.

**Auth required:** Yes

**Response `200`:**
```json
{
  "document_id": "doc-uuid",
  "affected_assets": ["P-101", "V-201"],
  "affected_facts": 12,
  "severity": "high",
  "details": [
    {"asset_id": "P-101", "rel_type": "HAS_MAX_PRESSURE", "count": 5}
  ]
}
```

---

## 9. Compliance

**Prefix:** `/compliance`

Regulatory gap detection against 12 seeded frameworks (OISD-117, ISO 45001, and 10 others). Seed via `docker exec kairos-backend-api python scripts/init_compliance.py`.

---

### `GET /compliance/gaps`

List detected compliance gaps across all assets.

**Auth required:** Yes (`compliance` or `admin`)

**Query params:** `asset_id`, `framework`, `severity` (`critical | high | medium | low`), `cleared` (bool), `limit`

**Response `200`:**
```json
[
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
]
```

---

### `GET /compliance/dashboard`

Compliance posture summary: gap counts by framework, severity, and clearance status.

**Auth required:** Yes (`compliance` or `admin`)

**Response `200`:**
```json
{
  "total_gaps": 18,
  "cleared": 5,
  "open": 13,
  "by_framework": {
    "OISD-117": {"total": 10, "cleared": 3, "open": 7},
    "ISO-45001": {"total": 8, "cleared": 2, "open": 6}
  },
  "by_severity": {
    "critical": 4,
    "high": 6,
    "medium": 8
  }
}
```

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

Knowledge gap elicitation via AI-generated micro-interviews. Triggers a `MicroInterviewWorkflow` on the `kairos-elicitation` Temporal task queue. Responses are stored in `quarantine_items` for human review before graph promotion.

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

## 11. Go OT Connector (port 8090)

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

## 12. Error Codes

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

## 13. Auth Quick-Reference

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
| `engineer` | Above + ingest documents, write assets, read/resolve governance |
| `reliability` | Above (no asset write) + promote quarantine |
| `compliance` | Read search, read compliance, read audit |
| `admin` | Everything |

---

## Appendix: OpenAPI

- Swagger UI: `http://localhost:8000/docs`
- ReDoc: `http://localhost:8000/redoc`
- OpenAPI JSON: `http://localhost:8000/openapi.json`
