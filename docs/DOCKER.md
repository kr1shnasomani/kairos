# KAIROS — Docker & Deployment Reference

> **Single source of truth for the container build system, local vs production
> run modes, and AWS deployment.** Read alongside [`INFRA.md`](./INFRA.md)
> (ports, Redis/Qdrant/ES layout, observability) and [`BACKEND.md`](./BACKEND.md).

---

## 1. Design in one picture

KAIROS runs one container per service (frontend, API, workers, each datastore,
each observability component). Everything is **local containers except the
managed cloud services**:

| Runs as a container (local / on the AWS box) | Managed cloud service (NOT a container) |
|---|---|
| Frontend, API, Celery + Temporal workers, Go connector | **Supabase** — Postgres DB |
| Neo4j, Qdrant, Elasticsearch, Redis | **Supabase** — Storage (the evidence vault, bucket `kairos-vault`) |
| Temporal (+ its own Postgres), Temporal UI | **Supabase** — Auth (JWT) |
| OPA, OTEL Collector, Tempo, Grafana | **Supabase** — Vault (secrets) |
| | NVIDIA NIM · Jina · Groq (inference APIs) |

There is **no HashiCorp Vault container** and **no app Postgres container** —
those roles are cloud Supabase. The only Postgres in the stack is Temporal's
private internal DB.

---

## 2. Two-file Compose model

The stack is defined by **two files** that select the run mode:

| File | Role | Loaded when |
|------|------|-------------|
| `docker-compose.yml` | **Base — production / AWS-safe.** Non-root images, network isolation, resource limits, healthchecks, only ports **3000 + 8000** published, code baked into images. | Always |
| `docker-compose.override.yml` | **Dev.** Source bind-mounts + hot-reload (`uvicorn --reload`, `next dev`, `go run`), runs as root, publishes every datastore/UI port for debugging. | Auto-loaded by plain `docker compose up` |

```bash
# LOCAL DEV  (base + override, auto)          → hot-reload, all debug ports
docker compose up -d --build        #  ==  make dev

# PRODUCTION / AWS  (base only, override skipped)
docker compose -f docker-compose.yml up -d --build   #  ==  make prod
```

Passing `-f docker-compose.yml` explicitly disables the automatic override
merge — that single flag is the entire dev/prod switch.

---

## 3. Container stack

| Container | Image | Published (dev) | Published (prod) | Network |
|-----------|-------|-----------------|------------------|---------|
| `kairos-frontend` | `kairos-frontend:local` (multi-stage) | 3000 | **3000** | edge |
| `kairos-backend-api` | `kairos-backend:local` (multi-stage) | 8000 | **8000** | edge, internal |
| `kairos-celery-worker` | `kairos-backend:local` (shared) | — | — | internal |
| `kairos-temporal-activity-worker` | `kairos-backend:local` (shared) | — | — | internal |
| `kairos-elicitation-worker` | `kairos-backend:local` (shared) | — | — | internal |
| `kairos-backend-go` | `kairos-connector:local` (multi-stage) | 8090 | — | internal |
| `kairos-neo4j` | `neo4j:5.20-community` | 7474, 7687 | — | internal |
| `kairos-qdrant` | `qdrant/qdrant:v1.9.4` | 6333, 6334 | — | internal |
| `kairos-elasticsearch` | `elasticsearch:8.13.4` | 9200, 9300 | — | internal |
| `kairos-redis` | `redis:7.2-alpine` | 6379 | — | internal |
| `kairos-temporal` | `temporalio/auto-setup:1.24.2` | 7233 | — | internal |
| `kairos-temporal-postgres` | `postgres:14-alpine` | — | — | internal |
| `kairos-temporal-ui` | `temporalio/ui:2.26.2` | 8088 | — | internal |
| `kairos-opa` | `openpolicyagent/opa:0.65.0` | 8181 | — | internal |
| `kairos-otel-collector` | `otel/...contrib:0.102.0` | 4317, 4318, 8889 | — | internal |
| `kairos-tempo` | `grafana/tempo:2.4.1` | 3200 | — | internal |
| `kairos-grafana` | `grafana/grafana:11.0.0` | 3001 | — | internal |

**The four Python services share one image** (`kairos-backend:local`), built
once and reused — they differ only by `command:`. In prod, **only the frontend
and API are reachable from the host**; every datastore stays on the internal
network.

---

## 4. Networks

| Network | Members | Purpose |
|---------|---------|---------|
| `edge` | frontend, **api** | Public-facing. Frontend (SSR) reaches the API here. |
| `internal` | **api** + everything else | Datastores, workers, observability. Never published in prod. |

The API is the only bridge (on both networks). The frontend cannot reach Neo4j,
Redis, Elasticsearch, etc. directly — defence-in-depth for the AWS deployment.

---

## 5. Persistent volumes

| Volume | Mounted at | Holds |
|--------|-----------|-------|
| `kairos-neo4j_data` | neo4j `/data` | **Knowledge graph** (was an anonymous volume before — now durable) |
| `kairos-neo4j_logs` | neo4j `/logs` | Neo4j logs |
| `kairos-qdrant_data` | qdrant `/qdrant/storage` | Vectors |
| `kairos-elasticsearch_data` | es `/usr/share/elasticsearch/data` | Full-text indices |
| `kairos-redis_data` | redis `/data` | AOF (streams, cache, Celery) |
| `kairos-temporal_postgres_data` | temporal-pg `/var/lib/postgresql/data` | Temporal history |
| `kairos-tempo_data` | tempo `/var/tempo` | Traces |
| `kairos-grafana_data` | grafana `/var/lib/grafana` | Dashboards/state |

`make nuke` (`docker compose down -v`) destroys all of these. Config files
(`infra/**`) are mounted read-only from the repo, not volumes.

---

## 6. Dockerfiles

### `backend/Dockerfile` — multi-stage, non-root
`builder` installs all deps into `/opt/venv` (with the build toolchain); the
`runtime` stage copies only the venv + the runtime shared libs and runs as user
`kairos` (uid 1001). No `HEALTHCHECK` in the image (it serves both the HTTP API
and non-HTTP workers) — the API's health probe is defined in Compose. Default
`CMD` is the API; workers override `command:`.

### `frontend/Dockerfile` — 4 stages
`deps → dev → builder → runner`. **`dev`** runs `next dev` (used by the dev
override). **`runner`** serves the Next.js **standalone** build (`node server.js`)
as non-root user `nextjs`. Requires `output: "standalone"` in `next.config.ts`.

### `backend/connectors/Dockerfile` — multi-stage, non-root
`builder` compiles a static binary (also used for `go run` in dev). `release`
is a tiny Alpine image with just the binary + `fixtures/`, running as non-root
`kairos`.

**`.dockerignore`** trims each build context: `backend/` keeps `tests/` +
`scripts/` (run inside the container), `frontend/` strips `node_modules`,
`.next`, tests. There is no root `Dockerfile`/`.dockerignore` (removed — no
service builds from the repo root).

---

## 7. Health & startup ordering

Every stateful service has a healthcheck, and dependents wait on
`condition: service_healthy`:

- **API** waits for Neo4j + Qdrant + Elasticsearch + Redis to be *healthy* (this
  fixes the documented "API boots before ES and exits" race — no more manual
  `docker restart kairos-backend-api`).
- Workers wait for their datastores; Temporal workers also wait for Temporal.
- Neo4j now has a `cypher-shell` healthcheck (it had none before).

---

## 8. Resource limits

Base sets memory ceilings (`deploy.resources.limits.memory`), honored by
`docker compose up`. Approximate ceilings: ES 2g · Neo4j 2g · Qdrant 1g ·
API/celery/temporal-worker 1.5g each · elicitation 1g · Redis 768m · frontend
1g · Temporal/Temporal-PG 512m · Grafana/Tempo/OTEL 512m · OPA/Temporal-UI/Go
256m. **Total headroom ≈ 16 GB** — size the AWS host accordingly (see §9).

---

## 9. AWS deployment

**Target:** a single EC2 instance running Docker + Compose v2 (simplest path;
ECS/EKS is a later migration). Recommended: **t3.xlarge / m6i.xlarge (4 vCPU,
16 GB)** with a **≥ 40 GB gp3** EBS volume (images ~5 GB + data).

```bash
# 1. Provision EC2 (Amazon Linux 2023 / Ubuntu 22.04), install Docker + compose plugin.
# 2. Clone the repo onto the instance.
git clone <repo> kairos && cd kairos

# 3. Create the production .env (real secrets — do NOT commit).
cp .env.example .env && $EDITOR .env
#    Set at minimum: SUPABASE_*, NVIDIA_NIM_API_KEY, JINA_API_KEY, GROQ_API_KEY,
#    NEO4J_PASSWORD, INTERNAL_API_KEY, GRAFANA_ADMIN_PASSWORD, APP_SECRET_KEY,
#    APP_DEBUG=False, APP_ENV=production,
#    NEXT_PUBLIC_API_URL=https://<your-domain-or-ALB>  (browser-reachable API URL; build-time value)

# 4. Start production stack (base only — override skipped).
make prod          # == docker compose -f docker-compose.yml up -d --build

# 5. One-time init (runs inside the API container).
make init-all && make seed && make load-dataset
```

### AWS security checklist
- **Security Group:** inbound **80/443 only** (to a reverse proxy) — or 3000 +
  8000 if going direct. **Never** open 6379/7687/9200/7474/etc.; in prod they
  are not published at all, but keep the SG tight regardless.
- **TLS / reverse proxy:** put an ALB or nginx in front of 3000 (frontend) and
  8000 (API). Point `NEXT_PUBLIC_API_URL` at the public API URL; the frontend's
  server-side `API_INTERNAL_URL` stays `http://kairos-backend-api:8000`. Public
  Next.js variables are embedded during `next build`, so change the value before
  `make prod`/the frontend image build and rebuild the image to deploy it.
- **Secrets:** load `.env` from AWS SSM Parameter Store / Secrets Manager at
  deploy time; do not bake secrets into images. `APP_DEBUG=False` disables the
  dev auth bypass — verify it is off.
- **ES has `xpack.security.enabled=false`** — safe only because it is unpublished
  and internal-network-only. Do not expose port 9200 on AWS.
- **Persistence:** the named volumes live on the instance's EBS volume. Snapshot
  EBS for backups, or migrate stores to managed services later.

### Rebuild / redeploy
```bash
git pull
docker compose -f docker-compose.yml up -d --build      # rebuild changed images
docker compose -f docker-compose.yml up -d --no-deps --build kairos-frontend   # one service
```

---

## 10. Common operations

```bash
make dev            # local dev stack (hot-reload, all debug ports)
make prod           # production stack (base only)
make stop           # docker compose down
make nuke           # down -v  ← destroys ALL volumes
make ps / make logs # status / tail logs

# Rebuild one service (new deps)
docker compose up -d --no-deps --build kairos-frontend
docker compose up -d --no-deps --build kairos-backend-api

# Validate compose before running
docker compose config >/dev/null                        # dev merge
docker compose -f docker-compose.yml config >/dev/null  # prod
```

### Image sizes (measured)
| Image | Dev target | Prod target |
|-------|-----------|-------------|
| `kairos-backend:local` | ~2.45 GB (single runtime stage; incl. torch/YOLO — see note) | ~2.45 GB |
| `kairos-frontend:local` | ~800 MB (`dev`, full node_modules) | ~250 MB (`runner`, standalone) |
| `kairos-connector:local` | ~880 MB (`builder`, Go toolchain) | ~36 MB (`release`) |

Multi-stage stripped the build toolchain from the backend runtime (~2.88 GB →
~2.45 GB); the remainder is the torch/YOLO stack below.

> **Layer 3 (P&ID drawing parser) note.** `requirements.txt` includes
> `torch`/`torchvision`/`ultralytics`/`layoutparser`/`opencv` for the designed
> YOLOv9 + LayoutLMv3 drawing parser (ARCHITECTURE.md §Layer 3). These are
> currently reserved for that feature and are the bulk of the backend image
> size. When the real parser is built it belongs in its **own GPU-backed
> service**, at which point these deps can move out of the shared API/worker
> image.

---

## 11. What changed from the original single-file setup

| Area | Before | After |
|------|--------|-------|
| Compose | one dev-shaped file | base (prod/AWS) + dev override |
| Root `Dockerfile` / `.dockerignore` | empty + orphaned | removed |
| HashiCorp Vault container | ran, unused | removed (cloud Supabase Vault) |
| Neo4j data | anonymous volume (loss risk) | named volume `kairos-neo4j_data` |
| Backend image | single-stage, root, build tools in runtime | multi-stage, non-root, slim runtime |
| Frontend image | dev server only | multi-stage; standalone non-root prod |
| Go connector (prod) | 880 MB builder stage | 15 MB non-root release stage |
| 4 Python services | 4 separate image builds | one shared image, built once |
| Ports | all datastore ports published | only 3000 + 8000 in prod |
| Networks | one flat network | edge / internal split |
| Healthchecks | missing on Neo4j; API boot race | full coverage + `service_healthy` gates |
| Resource limits | none | memory ceilings on every service |
