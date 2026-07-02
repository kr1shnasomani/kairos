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

> **[🚀 Jump to Setup Instructions](#quick-start)** | **[📖 Read the Architecture Design](./docs/ARCHITECTURE.md)**

</div>

## What is KAIROS?

**KAIROS** is an industrial operational intelligence platform built on the insight that the most dangerous knowledge gaps in industrial operations are the ones nobody knows to query. It is a system that continuously monitors the operational pulse of any asset-intensive facility, interprets it against a governed temporal knowledge graph, and delivers the right knowledge to the right person at the precise moment it is needed, without being asked.

**For a deep dive into the 13-Layer Architecture, Knowledge Graph Mechanics, OT Virtualization, and Governance Tracks, please see our detailed [ARCHITECTURE.md](./docs/ARCHITECTURE.md).**

## Documentation Index

1. `docs/ARCHITECTURE.md`: The complete 13-layer platform design, constraints, and architecture.
2. `IMPLEMENTATION.md`: Full 34-task implementation spec (the contract for the backend).
3. `docs/API.md`: Complete REST API reference for all 34 tasks.
4. `docs/BACKEND.md`: Services, workers, DB schema, config, and infra reference.
5. `AGENTS.md` / `CLAUDE.md`: Coding guardrails, rules, and required skills for contribution.

## Repository Structure

```text
kairos/
├── backend/
│   ├── api/              # FastAPI application (routers, services, models)
│   ├── workers/          # Celery async task workers
│   ├── workflows/        # Temporal.io durable workflows
│   ├── connectors/       # Go OT + EAM connector service
│   ├── db/               # Schema migrations (Neo4j, Supabase)
│   ├── policies/         # OPA Rego governance policies
│   ├── otel/             # OpenTelemetry collector config
│   ├── grafana/          # Grafana provisioning
│   └── scripts/          # Init + seed scripts
├── docs/                 # Technical and product documentation
├── frontend/             # Next.js 14 Point-of-Action Web App
├── docker-compose.yml    # Main local infrastructure definition
├── Makefile              # Project lifecycle commands
└── README.md
```

## Prerequisites

1. Docker Desktop
2. Make

## Quick Start

The entire infrastructure runs 100% inside Docker (no local Python, Node, or Go dependencies required).

### 1. Clone & Configure

```bash
git clone https://github.com/kr1shnasomani/kairos.git
cd kairos
cp .env.example .env
```

*(Edit `.env` to add any cloud service keys like NVIDIA NIM or Supabase when ready.)*

### 2. Boot the Platform

```bash
make dev
```

This single command automatically builds and launches:
- **Core App**: `kairos-backend-api`, `kairos-temporal-worker`, `kairos-backend-go`, `kairos-frontend`
- **Databases**: `kairos-neo4j`, `kairos-qdrant`, `kairos-elasticsearch`, `kairos-redis`, `kairos-temporal-postgres`
- **Infrastructure**: `kairos-temporal`, `kairos-temporal-ui`, `kairos-opa`, `kairos-vault`, `kairos-grafana`, `kairos-otel-collector`

*(To stop the platform gracefully, press `Ctrl+C` or run `make stop`)*

## Local URLs

Once `make dev` finishes booting up, everything is instantly available locally:

| Service | Local URL | Credentials (Dev) |
|---|---|---|
| **API Docs (FastAPI)** | [http://localhost:8000/docs](http://localhost:8000/docs) | - |
| **Neo4j Browser** | [http://localhost:7474](http://localhost:7474) | `neo4j` / `kairos_dev_password` |
| **Qdrant Dashboard**| [http://localhost:6333/dashboard](http://localhost:6333/dashboard) | - |
| **Temporal UI** | [http://localhost:8088](http://localhost:8088) | - |
| **Grafana** | [http://localhost:3001](http://localhost:3001) | `admin` / `kairos_dev_password` |
| **Vault UI** | [http://localhost:8200](http://localhost:8200) | Token: `kairos-dev-root-token` |
| **Frontend** | [http://localhost:3000](http://localhost:3000) | - |

## License

Private — KAIROS Platform
