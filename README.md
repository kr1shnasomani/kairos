# KAIROS

**Industrial Operational Intelligence Platform** — proactive, event-driven knowledge delivery for asset-intensive industries.

> Built on the insight that the most dangerous knowledge gaps in industrial operations are the ones nobody knows to query.

---

## Quick Start

### 1. Clone & Configure

```bash
git clone https://github.com/kr1shnasomani/kairos.git
cd kairos
cp .env.example .env
```

*(Edit `.env` to add any cloud service keys like NVIDIA NIM or Supabase when ready.)*

### 2. Boot the Entire Infrastructure

Everything runs 100% inside Docker (no local Python, Node, or Go dependencies required).

```bash
make dev
```

This single command automatically builds and launches the entire platform:
- **Core App**: `kairos-backend-api`, `kairos-temporal-worker`, `kairos-backend-go`, `kairos-frontend`
- **Databases**: `kairos-neo4j`, `kairos-qdrant`, `kairos-elasticsearch`, `kairos-redis`, `kairos-temporal-postgres`
- **Infrastructure**: `kairos-temporal`, `kairos-temporal-ui`, `kairos-opa`, `kairos-vault`, `kairos-grafana`, `kairos-otel-collector`

### 3. Access the Services

Once `make dev` finishes booting up, everything is instantly available locally:

| Service | Local URL | Credentials (Dev) |
|---|---|---|
| **API Docs (FastAPI)** | http://localhost:8000/docs | - |
| **Neo4j Browser** | http://localhost:7474 | `neo4j` / `kairos_dev_password` |
| **Qdrant Dashboard**| http://localhost:6333/dashboard | - |
| **Temporal UI** | http://localhost:8088 | - |
| **Grafana** | http://localhost:3001 | `admin` / `kairos_dev_password` |
| **Vault UI** | http://localhost:8200 | Token: `kairos-dev-root-token` |

*(To stop the platform gracefully, press `Ctrl+C` or run `make down`)*

---

## Architecture

KAIROS is organized into **13 layers**. See [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) for the complete design.

```
Layer 0   Empirical Validation Plane (rolling model validation gate)
Layer 1   Deterministic MDM Backbone (asset identity from EAM/ERP)
Layer 2   Immutable Evidence Vault (Supabase Storage, SHA-256)
Layer 3   Multimodal Perception Engine (PaddleOCR, mXLM-RoBERTa, YOLOv9)
Layer 4   Temporal Reality Graph (Neo4j, time-bounded knowledge edges)
Layer 5   Zero-Copy OT Virtualization (Go connectors, PI Web API, OPC-UA)
Layer 6   Quarantine Knowledge Layer (unverified field inputs)
Layer 7   Dual-Track Governance Plane (admin + MoC tracks)
Layer 8   Operational Event Subscription + Proactive Delivery (Redis Streams)
Layer 9   Structured Knowledge Elicitation Engine
Layer 10  Telemetry-Grounded Outcome Attribution
Layer 11  Reasoning and Synthesis Layer (NVIDIA NIM / Ollama)
Layer 12  Phased Deployment + Point-of-Action Interface (Next.js)
```

---

## Tech Stack

| Category | Technology |
|---|---|
| Vault / DB | Supabase Storage + PostgreSQL |
| Graph | Neo4j 5.x (local) → AuraDB (production) |
| Vector search | Qdrant |
| Exact search | Elasticsearch |
| Cache / Events | Redis + Redis Streams |
| Workflows | Temporal.io |
| Governance | Open Policy Agent |
| Secrets | HashiCorp Vault |
| API | FastAPI (Python) |
| OT Connectors | Go |
| Async tasks | Celery |
| LLM Synthesis | NVIDIA NIM (Llama 3.1 70B) / Ollama (Qwen 2.5 14B) |
| OCR | PaddleOCR 3.0 |
| NER | mXLM-RoBERTa |
| Voice | Whisper |
| Observability | OpenTelemetry + Grafana |
| Frontend | Next.js 14 (later phase) |

---

## Project Structure

```
kairos/
├── backend/
│   ├── api/              # FastAPI application
│   │   ├── routers/      # Route handlers (one per domain)
│   │   ├── services/     # Business logic + external clients
│   │   ├── models/       # Pydantic models
│   │   └── middleware/   # Auth, telemetry
│   ├── workers/          # Celery async task workers
│   ├── workflows/        # Temporal.io durable workflows
│   ├── connectors/       # Go OT + EAM connector service
│   ├── db/               # Schema migrations (Neo4j, Supabase)
│   ├── policies/         # OPA Rego governance policies
│   ├── otel/             # OpenTelemetry collector config
│   ├── grafana/          # Grafana provisioning
│   ├── temporal/         # Temporal dynamic config
│   └── scripts/          # Init + seed scripts
├── docs/
│   ├── ARCHITECTURE.md
│   └── DATABASE.md
├── docker-compose.yml
├── Makefile
└── .env.example
```

---

## Development Phases

| Phase | Weeks | Focus |
|---|---|---|
| **1** | 1 | Supabase + Ingestion pipeline (upload → OCR → NER → Neo4j + Qdrant) |
| **2** | 2 | Query interface + NIM synthesis + compliance gap detection |
| **3** | 3 | Redis Streams events + proactive brief engine + auth |
| **4** | 4 | Demo polish + Grafana + architecture diagrams + frontend |

---

## License

Private — KAIROS Platform
