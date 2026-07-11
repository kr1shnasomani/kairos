# KAIROS — Fixtures Reference

> **For AI coding agents:** Fixtures are static mock files used as fallbacks when live external systems (EAM, OT historian, P&ID topology API) are unavailable. Every fetcher follows the pattern `try { live } catch { fixture }`. This doc maps every fixture file to the endpoint it backs, its data contract, and when it fires.

---

## Table of Contents

1. [Fixture Fallback Pattern](#1-fixture-fallback-pattern)
2. [Fixture Files](#2-fixture-files)
3. [Frontend Fixture Fallback (Demo Chip)](#3-frontend-fixture-fallback-demo-chip)

---

## 1. Fixture Fallback Pattern

**Backend (Go connector):** Environment variable absent → fixture file loaded from disk.

```go
// EAM sync — fires when EAM_ODS_ENDPOINT is not set
if os.Getenv("EAM_ODS_ENDPOINT") == "" {
    // reads EAM_FIXTURE_PATH (default: /app/fixtures/sample_assets.json)
}
```

**Backend (Python API):** Live service unreachable → fixture JSON returned inline.

**Frontend:** Every fetcher wraps live API calls in `try { live } catch { fixture }` with a 1500 ms abort. When the fixture path is taken, the response includes `source: "demo"` and the UI renders a **Demo** chip.

---

## 2. Fixture Files

### `fixtures/pid_topology_mock.json`

**Backed endpoint:** `GET /documents/{id}/topology`  
**Fires when:** Document is not a `pid_drawing` type, or the topology graph has not been built yet.  
**Mount path:** `fixtures/` is mounted into `kairos-backend-api` and `kairos-celery-worker` at `/app/fixtures/`.

**Schema:**

| Field | Type | Description |
|-------|------|-------------|
| `drawing_id` | string | P&ID drawing reference (e.g. `P-2301`) |
| `title` | string | Drawing title |
| `revision` | string | Revision code |
| `equipment_nodes[]` | array | Equipment items on the drawing |
| `equipment_nodes[].id` | string | Internal topology ID (`TOPO-EQ-*`) |
| `equipment_nodes[].tag` | string | Plant tag number |
| `equipment_nodes[].type` | string | Equipment type (e.g. `centrifugal_pump`) |
| `equipment_nodes[].equipment_class` | string | Class used for asset matching |
| `isolation_valves[]` | array | Isolation valve inventory |
| `isolation_valves[].tag` | string | Valve tag number |
| `isolation_valves[].normally_open` | bool | Default state |
| `instrumentation_loops[]` | array | Control/indication loops |
| `instrumentation_loops[].loop_id` | string | Loop identifier (e.g. `FIC-3047`) |
| `instrumentation_loops[].instruments[]` | string[] | Tag numbers in the loop |
| `isolation_boundaries[]` | array | Isolation boundary definitions |
| `isolation_boundaries[].primary_isolations[]` | string[] | Valve tags forming the boundary |
| `isolation_boundaries[].requires_double_block_bleed` | bool | PTW requirement flag |
| `isolation_boundaries[].regulatory_ref` | string | Regulation clause (e.g. `OISD-117-6.2`) |

**Demo content:** 5 equipment nodes (pump P-101, tank TK-201, heat exchanger HX-301, flow transmitter FT-3047, pressure gauge PG-18), 3 isolation valves, 2 instrumentation loops, 1 isolation boundary with double-block-bleed requirement.

---

### `backend/connectors/fixtures/sample_assets.json`

**Backed endpoint:** `POST /eam/sync` (Go connector)  
**Fires when:** `EAM_ODS_ENDPOINT` env var is not set (default in local dev).  
**Mount path:** Mounted into `kairos-backend-go` at `/app/fixtures/sample_assets.json`. Controlled by `EAM_FIXTURE_PATH` env var.

**Schema** (array of asset objects, matches `POST /assets` request body):

| Field | Type | Description |
|-------|------|-------------|
| `asset_id` | string | Canonical asset ID / tag number |
| `tag_number` | string | Plant tag (same as asset_id in demo) |
| `name` | string | Human-readable asset name |
| `equipment_class` | string | `pump`, `vessel`, `heat_exchanger`, `compressor`, `tank` |
| `criticality` | string | `safety_critical`, `critical`, `non_critical` |
| `site_id` | string | Site identifier (e.g. `SITE_001`) |
| `facility_id` | string | Facility within site (e.g. `FAC_PROCESS_A`) |
| `parent_asset_id` | string\|null | Parent asset for hierarchy |
| `eam_source` | string | Source system (e.g. `SAP_PM`) |

**Demo content:** 5 assets — P-101 (pump, safety_critical), V-201 (vessel, critical), HX-301 (heat exchanger, critical), C-401 (compressor, safety_critical), T-501 (tank, non_critical). All on `SITE_001`.

---

### `fixtures/test.wav`

**Backed endpoint:** `POST /elicitation/{work_order_id}/voice` (voice note upload — the frontend field route `/field/voice` posts here)  
**Fires when:** Used in integration tests and manual dev testing only — not a runtime fallback.  
**Purpose:** A short WAV file for testing the Groq Whisper transcription pipeline without needing a real recording. Feed it via the voice upload endpoint to exercise the full `transcribe_voice_note` Celery task.

---

## 3. Frontend Fixture Fallback (Demo Chip)

All frontend API fetchers in `frontend/src/lib/api.ts` follow this contract:

```ts
// Every fetcher returns { data, source }
// source: "live" | "demo"
try {
  const res = await fetch(url, { signal: AbortSignal.timeout(1500) })
  return { data: await res.json(), source: "live" }
} catch {
  return { data: FIXTURE_DATA, source: "demo" }
}
```

When `source === "demo"`, the page renders a `<DemoChip />` component to make the fixture origin visible. **Never** suppress or hide the Demo chip — it is a safety signal that the data shown is not live.

Frontend fixture data lives in dedicated modules under `frontend/src/lib/` (one per domain), with a few
small inline fixtures alongside their fetcher in `api.ts`:

| Module | Backs |
|--------|-------|
| `fixtures.ts` | `GET /briefs/` (`fixtureBriefs`) |
| `assets.ts` | `GET /assets/`, `/assets/{id}`, `/assets/{id}/knowledge` |
| `compliance.ts` | `GET /compliance/gaps`, `/compliance/dashboard` |
| `copilot.ts` | `POST /search/synthesize` (`answerFor()`) |
| `documents.ts` | `GET /documents/`, `/documents/{id}` |
| `governance.ts` | `GET /governance/conflicts`, `/governance/quarantine` |
| `rca.ts` | `POST /search/rca-pack` (`rcaFor()`) |

See `docs/FRONTEND.md §9` for the full frontend fixture reference.
