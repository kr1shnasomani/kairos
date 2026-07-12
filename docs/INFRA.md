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
| `kairos-neo4j` | neo4j:5.20-community | `7474`, `7687` | Temporal knowledge graph |
| `kairos-qdrant` | qdrant:v1.9.4 | `6333`, `6334` | Vector store (1024-dim embeddings) |
| `kairos-elasticsearch` | elasticsearch:8.13.4 | `9200` | Full-text search |
| `kairos-redis` | redis:7.2-alpine | `6379` | Cache + event streams + Celery broker |
| `kairos-temporal` | temporalio/auto-setup:1.24.2 | `7233` | Durable workflow engine |
| `kairos-temporal_ui` | temporalio/ui:2.26.2 | `8088` | Temporal dashboard |
| `kairos-temporal_postgres` | postgres:14-alpine | — | Temporal internal DB |
| `kairos-otel-collector` | otelcol-contrib:0.102.0 | `4317`, `4318`, `8889` | OTEL collector |
| `kairos-tempo` | grafana/tempo:2.4.1 | `3200` | Distributed trace backend |
| `kairos-grafana` | grafana:11.0.0 | `3001` | Dashboards |
| `kairos-opa` | openpolicyagent/opa:0.65.0 | `8181` | Policy enforcement |

> **Run modes & networks:** the stack is split into a production-safe base
> (`docker-compose.yml`) + an auto-loaded dev override (`docker-compose.override.yml`).
> Secrets/signing use **cloud Supabase Vault** — there is no local Vault container.
> Full build/run/AWS details: [`DOCKER.md`](./DOCKER.md).

---

## 2. Service URLs

| Service | URL |
|---------|-----|
| Frontend | http://localhost:3000 |
| FastAPI docs | http://localhost:8000/docs |
| FastAPI health | http://localhost:8000/health/detailed |
| Temporal UI | http://localhost:8088 |
| Neo4j Browser | http://localhost:7474 |
| Qdrant Dashboard | http://localhost:6333/dashboard |
| Grafana | http://localhost:3001 |
| Tempo | http://localhost:3200/ready |
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
  → (OTLP gRPC 4317)
  → kairos-otel-collector
    → traces → kairos-tempo (port 3200)
    → metrics → Prometheus endpoint (:8889)
              → kairos-grafana
```

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

**URL:** `http://localhost:3001` | **Credentials:** `admin / kairos_dev_password`

| Dashboard | UID | Panels |
|-----------|-----|--------|
| KAIROS — Ingestion Pipeline | `kairos-ingestion` | 6 panels: docs/hr, p50/p95 duration, ingest rate, type breakdown, request rate, error rate |
| KAIROS — Operational Intelligence | `kairos-operational` | 9 panels: briefs/hr, governor suppression, open conflicts, suppression rate, briefs over time, briefs by priority, conflicts by track, governor per-user, traces explorer |

Dashboard JSON + datasource provisioning: `infra/grafana/provisioning/`.

---

## 8. Infra Config Files

| Path | Purpose |
|------|---------|
| `infra/grafana/provisioning/` | Grafana datasources + dashboard JSON |
| `infra/otel/otel-config.yaml` | OTEL collector pipeline config |
| `infra/policies/kairos.rego` | OPA RBAC rules |
| `infra/tempo/tempo.yaml` | Grafana Tempo config |
| `infra/temporal/dynamicconfig.yaml` | Temporal server dynamic config |
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

# Rebuild specific containers
docker compose up -d --no-deps --build kairos-frontend          # new npm deps only
docker compose up -d --no-deps --force-recreate kairos-backend-api  # NIM env changes

# Seed test users (required after make nuke)
docker exec kairos-backend-api python scripts/seed_users.py

# Seed compliance regulations into Neo4j
docker exec kairos-backend-api python scripts/seed_regulations.py

# Run tests
docker exec kairos-backend-api python -m pytest tests/ -q --timeout=120

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
