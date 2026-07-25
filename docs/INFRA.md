# KAIROS — Infrastructure Reference

> **For AI coding agents:** This document is the single source of truth for every Docker container, service port, data store configuration, network topology, observability pipeline, and dev command in KAIROS. Read alongside `BACKEND.md` (app-level services) and `ARCHITECTURE.md` (layer design).

---

## Table of Contents

1. [Container Stack](#1-container-stack)
2. [Service URLs](#2-service-urls)
3. [Redis DB & Stream Allocation](#3-redis-db--stream-allocation)
4. [Qdrant Collections](#4-qdrant-collections)
5. [Elasticsearch Indices](#5-elasticsearch-indices)
6. [Observability Pipeline](#6-observability-pipeline)
7. [Grafana Dashboards](#7-grafana-dashboards)
8. [Infra Config Files](#8-infra-config-files)
9. [Dev Commands](#9-dev-commands)

---

## 1. Container Stack

All services run as Docker containers. Start with `make dev` (or `docker compose up -d`).

| Container | Image | Port(s) | Purpose |
|-----------|-------|---------|---------| 
| `kairos-frontend` | node:20-alpine (local build) | `3000` | Next.js web app (App Router, dev server) |
| `kairos-backend-api` | Python 3.12 (local build) | `8000` | FastAPI REST API |
| `kairos-celery-worker` | Python 3.12 (local build) | — | Celery workers (ingestion, extraction, attribution, elicitation, transcription, validation) |
| `kairos-temporal-activity-worker` | Python 3.12 (local build) | — | Temporal activity worker (document pipeline) |
| `kairos-elicitation-worker` | Python 3.12 (local build) | — | Temporal worker (elicitation workflows) |
| `kairos-backend-go` | Go 1.22 | `8090` | OT historian + EAM connector |
| `kairos-neo4j` | neo4j:5.20-community | `7474`, `7687` | Temporal knowledge graph — **CLOUD (Neo4j Aura) by default**; local container is profile-gated (`--profile local-stores`) |
| `kairos-qdrant` | qdrant:v1.9.4 | `6333`, `6334` | Vector store — **CLOUD (Qdrant Cloud) by default**; local container is profile-gated |
| `kairos-elasticsearch` | elasticsearch:8.13.4 | `9200` | Full-text search (local container) |
| `kairos-redis` | redis:7.2-alpine | `6379` | Cache + event streams + Celery broker |
| `kairos-temporal` | temporalio/auto-setup:1.24.2 | `7233` | Durable workflow engine |
| `kairos-temporal_ui` | temporalio/ui:2.26.2 | `8088` | Temporal dashboard |
| `kairos-temporal_postgres` | postgres:14-alpine | — | Temporal internal DB |
| `kairos-opa` | openpolicyagent/opa:0.65.0 | `8181` | Policy enforcement |

> **Observability is CLOUD (Grafana Cloud).** The former local `kairos-otel-collector`, `kairos-tempo`,
> and `kairos-grafana` containers were **removed** — the backend exports traces/metrics directly to the
> Grafana Cloud OTLP gateway (`OTEL_EXPORTER_OTLP_ENDPOINT` + `OTEL_EXPORTER_OTLP_HEADERS` in `.env`).
> Setup lives in `api/middleware/telemetry.py` (HTTP OTLP exporter, URL-decodes the auth header, appends
> `/v1/traces` · `/v1/metrics`). No-op if the endpoint is unset.

> **Cloud stores:** **Neo4j (Aura)**, **Qdrant Cloud**, and **Supabase** (Postgres + Storage + Auth +
> Vault) are cloud services, not containers — credentials live in `.env` only. The `kairos-neo4j` and
> `kairos-qdrant` containers above **do not start by default**; `docker compose --profile local-stores up`
> brings them back for offline dev / running the test suite without touching cloud data. Point
> `NEO4J_URI` / `QDRANT_URL` at them to use them.
>
> **`NEO4J_LOCAL_PASSWORD` — why the local container has its own credential.** Neo4j rejects any
> initial admin username other than literally `neo4j` (`Invalid admin username, it must be neo4j`),
> so compose hardcodes the user and takes only the password from `NEO4J_LOCAL_PASSWORD`
> (default `kairos_dev_password`). It previously interpolated `${NEO4J_USERNAME}`, which meant the
> local container **crash-looped whenever `.env` pointed at Aura** — precisely when you want local
> stores. To point the app at the local container, also set `NEO4J_USERNAME=neo4j` and
> `NEO4J_PASSWORD=$NEO4J_LOCAL_PASSWORD` in `.env`.
>
> **Run modes & networks:** the stack is split into a production-safe base
> (`docker-compose.yml`) + an auto-loaded dev override (`docker-compose.override.yml`).
> Full build/run/AWS details: [`DOCKER.md`](./DOCKER.md).

---

## 2. Service URLs

| Service | URL |
|---------|-----|
| Frontend | http://localhost:3000 |
| FastAPI docs | http://localhost:8000/docs |
| FastAPI health | http://localhost:8000/health/detailed |
| Temporal UI | http://localhost:8088 |
| Neo4j Browser | Aura console (cloud) — or http://localhost:7474 with `--profile local-stores` |
| Qdrant Dashboard | Qdrant Cloud console — or http://localhost:6333/dashboard with `--profile local-stores` |
| Grafana / Tempo | Grafana Cloud (hosted — traces + dashboards) |
| OPA | http://localhost:8181/health |
| Go Connector | http://localhost:8090/health |

---

## 3. Redis DB & Stream Allocation

### DB Allocation

| DB | Use |
|----|-----|
| `0` | Application cache + event streams |
| `1` | Celery broker + result backend |
| `2` | Redis Streams (reserved) |

> **Docker note:** Inside containers, `localhost` is not the Redis host. `docker-compose.yml` explicitly sets `REDIS_URL=redis://kairos-redis:6379/0` and `CELERY_BROKER_URL=redis://kairos-redis:6379/1`.

### Redis Streams

| Stream Key | Content |
|------------|---------|
| `kairos:events:work_orders` | WorkOrderEvent payloads |
| `kairos:events:ptw` | PTWEvent payloads |
| `kairos:events:shift_handover` | ShiftHandoverEvent payloads |
| `kairos:events:alarms` | AlarmEvent + DeviationFlagEvent payloads |
| `kairos:events:tag_out` | TagOutEvent payloads |
| `kairos:events:inspections` | InspectionCompleteEvent payloads (non-failed) |
| `kairos:events:briefs` | Assembled brief delivery messages |

---

## 4. Qdrant Collections

| Collection | Dimensions | Purpose |
|------------|-----------|---------| 
| `kairos_documents` | 1024 | Document chunk embeddings (jina-embeddings-v3) |
| `kairos_knowledge` | 1024 | Knowledge graph concept embeddings |

Created on startup by `VectorStoreService.ensure_collections()`.

---

## 5. Elasticsearch Indices

| Index | Content |
|-------|---------|
| `kairos_assets` | Asset tag numbers, names, equipment class |
| `kairos_documents` | Document content + metadata (full-text) |
| `kairos_events` | Operational event log |

Created on startup by `SearchEngineService.ensure_indices()`.

> **Boot race:** `kairos-backend-api` calls `ensure_indices()` on startup and **exits** if Elasticsearch isn't ready yet. After `make dev`, if the API is down, `docker restart kairos-backend-api` once ES is healthy.

---

## 6. Observability Pipeline

```
FastAPI API
  → OTLP/HTTP (api/middleware/telemetry.py)
  → Grafana Cloud OTLP gateway  (OTEL_EXPORTER_OTLP_ENDPOINT + Authorization header, both in .env)
    → traces + metrics, viewed in the hosted Grafana Cloud UI
```

Endpoints are derived as `<endpoint>/v1/traces` and `<endpoint>/v1/metrics`; the auth header is
URL-decoded (`%20` → space) before use. The whole block no-ops if `OTEL_EXPORTER_OTLP_ENDPOINT` is unset.

**FastAPI auto-instrumentation:** `FastAPIInstrumentor`, `RedisInstrumentor`, `HTTPXClientInstrumentor`.

### Custom Metrics (Prometheus)

All exported at `http://localhost:8889/metrics`.

| Prometheus Name | Type | Labels |
|----------------|------|--------|
| `kairos_briefs_delivered_total` | Counter | `priority`, `trigger_event_type` |
| `kairos_governor_suppressed_total` | Counter | `user_id` |
| `kairos_ingestion_duration_seconds` | Histogram | `document_type` |
| `kairos_conflicts_open` | Gauge | `track` |

---

## 7. Grafana Dashboards

**Hosted on Grafana Cloud.** Traces + metrics are exported via OTLP (see §6); view them in your
Grafana Cloud instance. (Pre-cloud, dashboards ran in a local `kairos-grafana` container at `:3001`.)

| Dashboard | UID | Panels |
|-----------|-----|--------|
| KAIROS — Ingestion Pipeline | `kairos-ingestion` | 6 panels: docs/hr, p50/p95 duration, ingest rate, type breakdown, request rate, error rate |
| KAIROS — Operational Intelligence | `kairos-operational` | 9 panels: briefs/hr, governor suppression, open conflicts, suppression rate, briefs over time, briefs by priority, conflicts by track, governor per-user, traces explorer |

The two dashboard JSONs (`infra/grafana/provisioning/dashboards/*.json`) are portable — **import them
into Grafana Cloud** to recreate these dashboards there.

---

## 8. Infra Config Files

| Path | Purpose | Status |
|------|---------|--------|
| `infra/policies/kairos.rego` | OPA RBAC rules | **Active** (mounted by `kairos-opa`) |
| `infra/temporal/dynamicconfig.yaml` | Temporal server dynamic config | **Active** (mounted by `kairos-temporal`) |
| `infra/caddy/Caddyfile` | HTTPS reverse proxy (prod) | **Active** under `--profile prod` |
| `infra/grafana/provisioning/dashboards/*.json` | Grafana dashboard definitions | **Legacy** — not mounted (obs is Grafana Cloud); **keep** — importable into Grafana Cloud |
| `infra/grafana/provisioning/datasources/`, `infra/otel/otel-config.yaml`, `infra/tempo/tempo.yaml` | Local Grafana/OTEL-collector/Tempo configs | **Dead** — their containers were removed; no runtime use |
| `docker-compose.yml` | All service definitions, volumes, networks |
| `backend/.dockerignore` | Strips `__pycache__`, `.pyc`, `.pytest_cache`, `connectors/` from backend build context. Keeps `tests/` + `scripts/` (run inside container). |
| `backend/connectors/.dockerignore` | Strips Go test artifacts and vendor dir from the Go build context. |
| `frontend/.dockerignore` | Strips `node_modules`, `.next`, `*.md`, secrets from frontend build context. |

---

## 9. Dev Commands

```bash
make dev          # Build + start all services (docker compose up -d --build)
make stop         # docker compose down
make nuke         # docker compose down -v  ← destroys ALL data volumes
make init-all     # Apply Neo4j schema + create Qdrant collections
make logs         # Tail all service logs
make ps           # Container status
make seed         # seed_regulations.py + seed_users.py
make load-dataset # Load dataset/ through the real pipeline (ARGS=--fast to skip docs)
make purge-test-data  # Delete ASSET-TEST/DEDUP/EV/ACK-*, WO-*, DOC-* from every store
make verify        # Per-layer smoke + latency (PASS/FAIL table); ARGS=--full adds LLM/VLM checks

# Rebuild specific containers
docker compose up -d --no-deps --build kairos-frontend          # new npm deps only
docker compose up -d --no-deps --force-recreate kairos-backend-api  # NIM env changes

# Seed test users (required after make nuke)
docker exec kairos-backend-api python scripts/seed_users.py

# Seed compliance regulations into Neo4j
docker exec kairos-backend-api python scripts/seed_regulations.py

# NEVER run tests, pytest, npm or tsc on the host — host package resolution differs from the
# pinned images and produces false failures (auth.test.ts / api.test.ts fail on host, pass in
# the container). Everything below runs in Docker.

# Run tests — full suite (needs the stack up; use local stores, never cloud)
docker exec kairos-backend-api python -m pytest tests/ -q --timeout=120

# Run the service-free tests with NO stack running at all (49 tests, no secrets, no network).
# This is what CI's tier-1 `unit` job runs.
docker compose run --rm --no-deps -e KAIROS_SKIP_TEST_CLEANUP=1 kairos-backend-api \
  pytest -q --timeout=120 tests/test_pii.py tests/test_query_category.py \
  tests/test_search_fusion.py tests/test_ingestion_formats.py tests/test_http_pool.py \
  tests/test_model_validation.py tests/test_pid.py tests/test_auth_cache.py \
  tests/test_config_guardrail.py

# Validate the compliance Cypher against a local Neo4j (EXPLAIN + semantics)
docker compose run --rm --no-deps -e NEO4J_URI=bolt://kairos-neo4j:7687 \
  -e NEO4J_USERNAME=neo4j -e NEO4J_PASSWORD=kairos_dev_password -e NEO4J_DATABASE=neo4j \
  kairos-backend-api python scripts/verify_compliance_cypher.py

# AST parse check before waiting on Docker
python3 -c "import ast; ast.parse(open('backend/api/routers/events.py').read())"

# Check logs
docker logs kairos-backend-api 2>&1 | tail -30
docker logs kairos-celery-worker 2>&1 | tail -30
docker logs kairos-temporal-activity-worker 2>&1 | tail -20

# Trigger EAM sync (Go connector)
curl -X POST http://localhost:8090/eam/sync
```

### After `make nuke`

```bash
make dev → make init-all → make seed → make load-dataset
```
