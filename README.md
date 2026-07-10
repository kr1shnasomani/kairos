<div align="center">
  <img src="./banner.jpeg" alt="KAIROS logo" width=max />
</div>

<div align="center">

# KAIROS

### Industrial Operational Intelligence Platform

![Python](https://img.shields.io/badge/Python-3.12-3776AB?style=for-the-badge&logo=python&logoColor=white)
![FastAPI](https://img.shields.io/badge/FastAPI-Backend-009688?style=for-the-badge&logo=fastapi&logoColor=white)
![Neo4j](https://img.shields.io/badge/Neo4j-Graph_DB-018BFF?style=for-the-badge&logo=neo4j&logoColor=white)
![Qdrant](https://img.shields.io/badge/Qdrant-Vector_DB-FF0000?style=for-the-badge&logo=qdrant&logoColor=white)
![Elasticsearch](https://img.shields.io/badge/Elasticsearch-Exact_Search-005571?style=for-the-badge&logo=elasticsearch&logoColor=white)
![Supabase](https://img.shields.io/badge/Supabase-Auth_%26_Storage-3ECF8E?style=for-the-badge&logo=supabase&logoColor=white)
![Temporal](https://img.shields.io/badge/Temporal-Workflows-111111?style=for-the-badge)
![Redis](https://img.shields.io/badge/Redis-Streams_%26_Cache-DC382D?style=for-the-badge&logo=redis&logoColor=white)
![Next.js](https://img.shields.io/badge/Next.js-Frontend-000000?style=for-the-badge&logo=nextdotjs&logoColor=white)
![Docker](https://img.shields.io/badge/Docker-Local_Infra-2496ED?style=for-the-badge&logo=docker&logoColor=white)
![Go](https://img.shields.io/badge/Go-OT_Connectors-00ADD8?style=for-the-badge&logo=go&logoColor=white)
![NVIDIA_NIM](https://img.shields.io/badge/NVIDIA_NIM-LLM_Synthesis-76B900?style=for-the-badge&logo=nvidia&logoColor=white)
![Grafana](https://img.shields.io/badge/Grafana-Observability-F46800?style=for-the-badge&logo=grafana&logoColor=white)

**[Quick Start](#quick-start)** · **[Architecture](./docs/ARCHITECTURE.md)** · **[Documentation](#documentation)**

</div>

---

## Overview

Asset-intensive facilities run on knowledge scattered across a dozen disconnected systems — P&IDs in one place, maintenance history in another, procedures in a third, inspection records and regulatory filings elsewhere. The most dangerous gaps are the ones nobody knows to query.

**KAIROS** unifies that fragmented knowledge into a single governed, temporal knowledge graph and delivers the right information to the right person at the moment it is needed — proactively, with a source citation for every claim. It ingests heterogeneous documents (manuals, drawings, scanned forms, spreadsheets), extracts and links entities, tracks how knowledge changes over time, and surfaces answers, briefs, and compliance evidence on any device.

The design principle throughout: **never assert without provenance, never auto-promote unverified input, and refuse rather than hedge on safety-critical questions.**

## Key Capabilities

- **Universal document ingestion** — PDFs, engineering drawings, scanned/handwritten forms, and multi-script (Hindi/Hinglish) text flow through an OCR → NER → graph-linking → indexing pipeline into an immutable, SHA-256-deduplicated vault.
- **Temporal knowledge graph** — every fact is an edge carrying validity windows, authority level, source document, confidence, and verification status, so you can query *what was known on any past date* and see how knowledge was superseded.
- **Expert copilot** — hybrid retrieval (graph + vector + exact) with mandatory citations, confidence scoring, phase-gated synthesis, and explicit refusal on safety-critical queries.
- **Proactive briefs** — operational events (work orders, PTWs, tag-outs, inspections, alarms) assemble contextual briefs, governed by an EEMUA-191 push ceiling and plant-state suppression.
- **Governed accuracy** — dual-track conflict resolution, human-only quarantine promotion, Management-of-Change workflow, SLA escalation, an SPC circuit breaker, and a Layer 0 model gate.
- **Compliance cockpit** — regulatory clauses mapped against current procedures, gap detection, and human-signed audit-evidence packs.
- **Point-of-action interface** — a mobile-first field app and a desktop engineering workspace built from one component set in three palettes (light / dark / sunlight high-contrast), fully offline-capable with a background sync queue.

## Architecture

KAIROS is a 13-layer platform spanning perception, knowledge modelling, retrieval, governance, and delivery. A FastAPI core orchestrates five datastores, durable Temporal workflows, Celery workers, and Go OT connectors, with a Next.js interface on top.

```
Documents / Events / Voice
        │
   Perception (OCR · NER · topology)  ── NVIDIA NIM · Groq Whisper · Jina
        │
   Temporal Knowledge Graph (Neo4j)  ◄──►  Vector (Qdrant) · Exact (Elasticsearch)
        │
   Governance (conflicts · quarantine · MoC · model gate)
        │
   Retrieval & Synthesis (copilot · RCA · briefs)  ── EEMUA governor
        │
   Point-of-Action Interface (Next.js · field + desktop)
```

For the full design — layer breakdown, knowledge-graph mechanics, OT virtualization, and the governance tracks — see **[docs/ARCHITECTURE.md](./docs/ARCHITECTURE.md)**.

## Tech Stack

| Layer | Technology |
|---|---|
| **Backend** | FastAPI (Python 3.12), Temporal, Celery, Go (Gin) OT connectors |
| **Datastores** | Neo4j (graph), Qdrant (vector), Elasticsearch (exact), Redis (streams/cache), Supabase (Postgres · Auth · Storage) |
| **AI models** | NVIDIA NIM (LLM · NER · OCR), Groq Whisper (STT), Jina (embeddings) — cloud-only |
| **Frontend** | Next.js 16, React 19, Tailwind CSS v4, TypeScript strict |
| **Platform** | Docker Compose, OPA (authz), Vault (secrets), OpenTelemetry → Grafana / Prometheus / Tempo |

## Quick Start

The entire stack runs inside Docker — no local Python, Node, or Go required.

**Prerequisites:** Docker Desktop · Make

```bash
# 1. Clone and configure
git clone https://github.com/kr1shnasomani/kairos.git
cd kairos
cp .env.example .env          # add cloud keys (NIM, Groq, Supabase) when ready

# 2. Boot the full platform
make dev

# 3. Initialize datastores and seed reference data (first run, or after `make nuke`)
make init-all
make seed                     # regulatory framework + demo users

# 4. Load the golden demo dataset (optional but recommended)
make load-dataset             # ingest the sample corpus through the real pipeline
#   make load-dataset ARGS=--fast   # structured backbone + events only (fast)
```

Then open the frontend at **[http://localhost:3000](http://localhost:3000)**.

To reset to a clean, deterministic state at any time: `make nuke && make dev && make init-all && make seed && make load-dataset`.

## Local URLs

| Service | URL | Credentials (dev) |
|---|---|---|
| **Frontend** | [localhost:3000](http://localhost:3000) | — |
| **API docs (FastAPI)** | [localhost:8000/docs](http://localhost:8000/docs) | — |
| **Neo4j Browser** | [localhost:7474](http://localhost:7474) | `neo4j` / `kairos_dev_password` |
| **Qdrant Dashboard** | [localhost:6333/dashboard](http://localhost:6333/dashboard) | — |
| **Temporal UI** | [localhost:8088](http://localhost:8088) | — |
| **Grafana** | [localhost:3001](http://localhost:3001) | `admin` / `kairos_dev_password` |
| **Vault UI** | [localhost:8200](http://localhost:8200) | Token: `kairos-dev-root-token` |

## Project Structure

```text
kairos/
├── backend/            # Python app (Docker build context)
│   ├── api/            # FastAPI application (routers, services, models)
│   ├── workers/        # Celery + Temporal activity workers
│   ├── workflows/      # Temporal durable workflows
│   ├── connectors/     # Go OT + EAM connector service
│   └── scripts/        # Init, seed, dataset-load, and cleanup scripts
├── frontend/           # Next.js point-of-action web app
├── dataset/            # Golden demo + benchmark corpus (docs, events, telemetry)
├── db/                 # Neo4j Cypher schema + Supabase SQL migrations
├── fixtures/           # Shared mock data (P&ID topology, EAM assets)
├── infra/              # Grafana, OPA, OTEL, Tempo, Temporal configs
├── tests/              # Integration test suite
├── docs/               # Technical and product documentation
├── docker-compose.yml  # Full local infrastructure
├── Makefile            # Project lifecycle commands
└── README.md
```

## Documentation

| Document | Contents |
|---|---|
| [`docs/PROBLEM_STATEMENT.md`](./docs/PROBLEM_STATEMENT.md) | The problem KAIROS solves |
| [`docs/ARCHITECTURE.md`](./docs/ARCHITECTURE.md) | The complete 13-layer platform design |
| [`docs/API.md`](./docs/API.md) | REST API reference |
| [`docs/BACKEND.md`](./docs/BACKEND.md) | Services, workers, scripts, and infra |
| [`docs/DATABASE.md`](./docs/DATABASE.md) | Schema reference across all five stores |
| [`docs/FRONTEND.md`](./docs/FRONTEND.md) | Routes, components, API wiring, auth flow |
| [`docs/DATASET.md`](./docs/DATASET.md) | The golden demo corpus and how to load it |
| [`docs/TESTS.md`](./docs/TESTS.md) | Integration test suite and data hygiene |
| [`AGENTS.md`](./AGENTS.md) | Contributor guardrails, conventions, and pitfalls |

## Development

```bash
# Backend integration tests (stack must be running)
docker exec kairos-backend-api python -m pytest tests/ -q --timeout=120

# Remove integration-test residue from the databases
make purge-test-data

# Frontend checks (from frontend/)
npx tsc --noEmit && npm run lint && npm run build
```

The test suite cleans up after itself — every test-created entity is purged at the end of the session (see [`docs/TESTS.md`](./docs/TESTS.md)). CI runs typecheck, lint, build, and dependency audit on every change.

## License

Private — KAIROS Platform
