# KAIROS — Deployment Guide

Production topology: **frontend on Vercel · backend stack on one AWS EC2 box · datastores on cloud**.
Every command below is exact. Read [Architecture](#0-architecture) first, then work top to bottom.

---

## 0. Architecture

```
                 ┌───────────────────────────┐
   Browser  ───▶ │  Vercel  (Next.js frontend)│
                 └────────────┬──────────────┘
                              │ HTTPS  (NEXT_PUBLIC_API_URL = https://api.YOURDOMAIN.com)
                              ▼
        ┌──────────────────────────────────────────────────────┐
        │  AWS EC2  (Ubuntu 24.04, one box, docker compose)      │
        │                                                        │
        │  Caddy :443 ─▶ kairos-backend-api :8000 (FastAPI)      │
        │                ├─ celery-worker  (6 queues)            │
        │                ├─ temporal-activity-worker             │
        │                ├─ elicitation-worker                   │
        │                ├─ backend-go     (OT connector)        │
        │                ├─ elasticsearch  (local)               │
        │                ├─ redis          (local)               │
        │                ├─ temporal + temporal-postgres (local) │
        │                └─ opa            (local)               │
        └───────────────┬──────────────────────────────────────┘
                        │ outbound HTTPS
                        ▼
   Cloud services (already provisioned, creds in .env):
     • Neo4j Aura      (graph)
     • Qdrant Cloud    (vectors)
     • Supabase        (Postgres · Auth · Storage/Vault)
     • Grafana Cloud   (OTEL traces/metrics)
     • NIM · Groq · Jina · Gemini  (model APIs)
```

**What runs where — and why:** the "backend" is a **12-container compose stack** with stateful services
(Elasticsearch, Temporal + its Postgres, Redis, OPA). That is why it goes on **one EC2 box running the
compose file unchanged**, not on a per-service PaaS. Neo4j/Qdrant/Supabase stay on cloud (creds in `.env`);
their local compose containers are profile-gated and never start in prod. The frontend is static-ish Next.js →
Vercel.

**You need before starting:** an AWS account · a **domain** you control (Route 53, Namecheap, …) · a Vercel
account · the repo on GitHub · your cloud creds already in a working `.env` (Neo4j Aura, Qdrant, Supabase,
NIM, Groq, Jina).

> A domain is **required** — Caddy issues a real Let's Encrypt cert for `api.YOURDOMAIN.com`, and Vercel
> (HTTPS) will refuse to call a non-HTTPS or self-signed API (mixed-content). `*.amazonaws.com` cannot get a
> Let's Encrypt cert, so the EC2 public DNS name will not work.

---

## 1. AWS EC2 — the backend box

### 1.1 Instance sizing (exact)

Sum of the compose memory **limits** for the services that run in prod:

| Service | Limit (MB) |
|---|--:|
| kairos-backend-api | 1500 |
| kairos-celery-worker | 1500 |
| kairos-temporal-activity-worker | 1500 |
| kairos-elicitation-worker | 1024 |
| kairos-elasticsearch (heap `-Xmx1g`) | 2048 |
| kairos-redis | 768 |
| kairos-temporal | 512 |
| kairos-temporal-postgres | 512 |
| kairos-temporal-ui | 256 |
| kairos-backend-go | 256 |
| kairos-opa | 256 |
| kairos-caddy | 256 |
| **Total (ceilings)** | **≈ 10.1 GB** |

Idle usage is ~5–6 GB; the ~10 GB is the worst case under load. So:

| Choice | Instance | vCPU | RAM | Notes |
|---|---|--:|--:|---|
| **Recommended** | **t3.xlarge** | 4 | 16 GB | Fits all limits with headroom, zero tuning |
| **Budget** | **t3.large** | 2 | 8 GB | Works with a **4 GB swap file** (§1.5); credit lasts ~2× longer |

- **AMI:** Ubuntu Server 24.04 LTS (x86_64).
- **Root volume:** **30 GB gp3** (default 8 GB is too small — Docker images + ES data + Temporal Postgres).
- **Region:** any; pick one near your users. Pricing below uses `us-east-1`.

### 1.2 Security group (exact inbound rules)

| Port | Protocol | Source | Why |
|--:|---|---|---|
| 22 | TCP | **My IP** (your laptop only) | SSH |
| 80 | TCP | 0.0.0.0/0 | Caddy ACME challenge + HTTP→HTTPS redirect |
| 443 | TCP | 0.0.0.0/0 | HTTPS API |

**Do not open** 8000, 9200, 6379, 7233, 8181, 8090, 8088. Those are internal to the Docker network; Caddy
reaches the API over the compose network, not the host port. Outbound: leave the default **allow all** (the box
must reach Aura, Qdrant, Supabase, NIM, Groq, Jina, Grafana).

### 1.3 Elastic IP + DNS

1. Allocate an **Elastic IP** and associate it with the instance (so the IP survives reboots).
2. At your DNS provider, create an **A record**: `api.YOURDOMAIN.com` → the Elastic IP.
3. Wait for it to resolve: `dig +short api.YOURDOMAIN.com` should print the Elastic IP.

### 1.4 Install Docker

SSH in (`ssh -i key.pem ubuntu@api.YOURDOMAIN.com`), then:

```bash
curl -fsSL https://get.docker.com | sudo sh
sudo usermod -aG docker $USER
newgrp docker            # or log out/in so the group applies
docker --version && docker compose version   # compose v2 ships with the install
```

### 1.5 Swap (t3.large only — skip on t3.xlarge)

```bash
sudo fallocate -l 4G /swapfile
sudo chmod 600 /swapfile
sudo mkswap /swapfile
sudo swapon /swapfile
echo '/swapfile none swap sw 0 0' | sudo tee -a /etc/fstab
free -h                  # confirm 4.0Gi swap
```

### 1.6 Clone the repo

```bash
git clone https://github.com/kr1shnasomani/kairos.git
cd kairos
```

### 1.7 Two edits to keep the frontend OFF the EC2 box (Vercel hosts it)

The base compose runs a frontend container and Caddy depends on it. Since Vercel serves the frontend, disable
it and point Caddy only at the API.

**Edit A — `docker-compose.yml`, the `kairos-frontend:` service** (~line 56): add a profile so it never starts
by default:

```yaml
  kairos-frontend:
    profiles: ["vercel-hosted"]     # ← ADD THIS LINE. Vercel serves the frontend; don't run it here.
    <<: [*svc]
    ...
```

**Edit B — `docker-compose.yml`, the `kairos-caddy:` service `depends_on`** (~line 441): drop the frontend:

```yaml
    depends_on: [kairos-backend-api]     # ← was [kairos-frontend, kairos-backend-api]
```

**Edit C — replace `infra/caddy/Caddyfile`** with an API-only config (the shipped one is same-origin and
proxies a frontend you no longer run here):

```caddy
# KAIROS — API-only HTTPS (frontend is on Vercel). Auto-TLS via Let's Encrypt.
api.{$KAIROS_DOMAIN} {
	encode zstd gzip
	tls {$KAIROS_TLS_EMAIL}
	reverse_proxy kairos-backend-api:8000
}
```

### 1.8 Create the production `.env`

```bash
cp .env.example .env
nano .env
```

Set these — the API **refuses to boot** in production while any dev default remains (fail-closed guardrail in
`api/config.py`):

```ini
# --- MUST change for prod (guardrail enforces all of these) ---
APP_ENV=production
APP_DEBUG=false
APP_SECRET_KEY=<64+ random chars>                 # e.g.  openssl rand -hex 32
INTERNAL_API_KEY=<32+ random chars>               # openssl rand -hex 24  (its dev default is an admin bypass)

# --- Cloud datastores (paste your real values) ---
NEO4J_URI=neo4j+s://<your-aura-id>.databases.neo4j.io
NEO4J_USERNAME=neo4j
NEO4J_PASSWORD=<your real Aura password>           # NOT kairos_dev_password
NEO4J_DATABASE=<your Aura instance db name, e.g. 2016aa75>   # NOT "neo4j"
QDRANT_URL=https://<your-qdrant>.cloud.qdrant.io:6333
QDRANT_API_KEY=<your qdrant key>
SUPABASE_URL=https://ernffgrvdcikwwhkhiix.supabase.co
SUPABASE_ANON_KEY=<...>
SUPABASE_SERVICE_ROLE_KEY=<...>                    # required
SUPABASE_JWT_SECRET=<...>                          # required

# --- Model APIs ---
NVIDIA_NIM_API_KEY=<...>
JINA_API_KEY=<...>
GROQ_API_KEY=<...>
GEMINI_API_KEY=<...>                               # optional (health probe only)

# --- CORS: allow your Vercel origin (JSON array — pydantic parses it as JSON) ---
CORS_ORIGINS=["https://YOUR-PROJECT.vercel.app","https://api.YOURDOMAIN.com"]

# --- OPA: MUST be the service name in prod (see note below) ---
OPA_URL=http://kairos-opa:8181

# --- Caddy TLS (read by docker-compose) ---
KAIROS_DOMAIN=YOURDOMAIN.com
KAIROS_TLS_EMAIL=you@example.com
```

- **`ELASTICSEARCH_URL`, `REDIS_URL`, `TEMPORAL_ADDRESS`** — leave the `.env.example` localhost values
  **as-is**; the compose `environment:` block hardcodes them to service names (`kairos-elasticsearch:9200`,
  etc.) and `environment` **wins over** `env_file`, so the container never uses `localhost` for these.
- **`OPA_URL` — you MUST change this to `http://kairos-opa:8181`** (as in the block above). Unlike the three
  above, `OPA_URL` is **not** in the compose `environment`, so the `.env` value is what the container uses.
  With `APP_DEBUG=false` the **OPA middleware enforces authz on write routes** and calls `OPA_URL`; the
  `.env.example` default of `http://localhost:8181` would fail inside the container and break every write.
  (In dev this never bites because `APP_DEBUG=true` short-circuits the middleware.)
- You'll add the real Vercel URL to `CORS_ORIGINS` after §2 gives you the exact domain — you can redeploy the
  API (`docker compose ... up -d kairos-backend-api`) once you have it.

### 1.9 Start the stack

```bash
docker compose -f docker-compose.yml --profile prod up -d --build
```

- `-f docker-compose.yml` → **base only**, skips the dev `docker-compose.override.yml` (no bind-mounts, no
  debug ports, non-root, resource limits).
- `--profile prod` → includes **Caddy**. It does **not** start `kairos-frontend` (now `vercel-hosted`
  profile) or the local `kairos-neo4j`/`kairos-qdrant` (`local-stores` profile).

Watch it come up:

```bash
docker compose -f docker-compose.yml ps
docker compose -f docker-compose.yml logs -f kairos-backend-api   # Ctrl-C to exit
```

> The API runs `ensure_indices()` on boot and **exits if Elasticsearch isn't ready yet**. If the API container
> is down shortly after first start, wait for ES to be healthy then `docker restart kairos-backend-api`.

### 1.10 Populate the stores (first deploy only)

The **cloud** stores (Neo4j/Qdrant/Supabase) persist and are likely already seeded from development — but the
**EC2-local Elasticsearch is empty**, so exact search + the validation corpus won't work until you index the
corpus into it.

```bash
# Cloud schema/collections + payload indexes — idempotent, safe to re-run:
docker exec kairos-backend-api python scripts/init_neo4j.py
docker exec kairos-backend-api python scripts/init_qdrant.py

# Only if the cloud is a FRESH/empty project:
docker exec kairos-backend-api python scripts/seed_regulations.py
docker exec kairos-backend-api python scripts/seed_users.py

# Index the golden corpus into the local ES (MERGE-idempotent on cloud stores).
# Re-processes docs through NIM → takes a few minutes + spends model quota:
docker exec kairos-backend-api python scripts/load_demo_dataset.py
# ~30s after it finishes, re-index the validation corpus (needs ES content first):
docker exec kairos-backend-api python scripts/seed_validation_corpus.py
```

### 1.11 Verify the API is live over HTTPS

```bash
curl -s https://api.YOURDOMAIN.com/health/ && echo            # → {"status":"ok",...}
curl -s https://api.YOURDOMAIN.com/health/detailed | head     # pings every store
```

If TLS fails, check: port 80 open, DNS A record resolves to the Elastic IP, `KAIROS_DOMAIN`/`KAIROS_TLS_EMAIL`
set, `docker compose -f docker-compose.yml logs kairos-caddy`.

---

## 2. Vercel — the frontend

1. **New Project** → import the GitHub repo.
2. **Root Directory:** `frontend`  (Framework preset auto-detects **Next.js**; leave build/output defaults).
3. **Environment Variables** (Production):

   | Key | Value |
   |---|---|
   | `NEXT_PUBLIC_API_URL` | `https://api.YOURDOMAIN.com` |
   | `API_INTERNAL_URL` | `https://api.YOURDOMAIN.com` |
   | `NEXT_PUBLIC_KAIROS_PHASE` | `3` |
   | `NEXT_PUBLIC_AUTH_STRICT` | `true` |

   > `NEXT_PUBLIC_*` are baked at **build** time — set them before the first deploy. `API_INTERNAL_URL` is used
   > by server components; on Vercel, SSR runs on Vercel's servers, so it's the **public** API URL (same value).

4. **Deploy.** Vercel gives you `https://YOUR-PROJECT.vercel.app` (or your custom domain).
5. Back on EC2, make sure that exact origin is in `.env` → `CORS_ORIGINS`, then:
   ```bash
   docker compose -f docker-compose.yml --profile prod up -d kairos-backend-api
   ```
   (recreates just the API with the new CORS list.)

---

## 3. Neo4j Aura keep-alive (cron-job.org) — do this LAST

**Why:** Aura **Free pauses the whole instance after 72 h (3 days) of no activity.** A daily query resets that
timer. *(This is separate from the idle-connection `SessionExpired` fix, which is already handled in the driver
config — the cron does nothing for that.)*

**Steps at [cron-job.org](https://cron-job.org):**

1. Sign in → **Create cronjob**.
2. **URL:** `https://api.YOURDOMAIN.com/health/detailed`
   *(Use `/health/detailed`, **not** `/health/` — the plain one never touches Neo4j. `/health/detailed` pings
   Neo4j and needs no auth.)*
3. **Schedule:** every day, e.g. `0 6 * * *` (06:00). Daily = 3 hits inside every 72 h window — safe margin.
4. **Request method:** GET. No headers/body needed.
5. **Notifications:** the endpoint returns **503** if any store is degraded (it still queried Neo4j, so the
   keep-alive works). Set "treat any response as success" or disable failure alerts to avoid noise.
6. Save. Confirm the first execution shows a 200/503 response, not a timeout.

> Only works once the API is public (§1.11). If Aura ever still pauses, switch the cron target to an endpoint
> that runs a real Cypher read (e.g. an authenticated `GET /assets/EQ-101/knowledge` with a token).

---

## 4. Cost (us-east-1, on-demand, approximate)

| Item | Monthly |
|---|--:|
| t3.large (2 vCPU / 8 GB) | ~$61 |
| t3.xlarge (4 vCPU / 16 GB) | ~$122 |
| EBS 30 GB gp3 | ~$2.4 |
| Elastic IP (while attached) | $0 |
| Vercel (Hobby) | $0 |
| Cloud stores (Aura Free / Qdrant free / Supabase free) | $0 |

With the **$120 AWS credit**: t3.large ≈ **~2 months**, t3.xlarge ≈ **~1 month**. Set a **billing alarm at
~$30** (Billing → Budgets) so the credit isn't silently overrun.

---

## 5. Day-2 operations

```bash
# always pass -f docker-compose.yml in prod so the dev override isn't applied
docker compose -f docker-compose.yml ps                    # status
docker compose -f docker-compose.yml logs -f <service>     # tail logs
docker compose -f docker-compose.yml --profile prod up -d --build   # redeploy after `git pull`
docker compose -f docker-compose.yml down                  # stop (keeps data volumes)
```

- **Redeploy backend:** `git pull` → the `up -d --build` line above.
- **Redeploy frontend:** push to the branch Vercel tracks; it rebuilds automatically.
- **Restart just the API** (e.g. after ES was down): `docker restart kairos-backend-api`.

---

## 6. Common issues

| Symptom | Fix |
|---|---|
| API container keeps restarting on boot | ES not ready yet — `docker restart kairos-backend-api` once ES is healthy. |
| API won't boot, logs "insecure defaults remain" | A dev default is still in `.env` — set `INTERNAL_API_KEY`, `APP_SECRET_KEY`, `NEO4J_PASSWORD`, `SUPABASE_SERVICE_ROLE_KEY`, `SUPABASE_JWT_SECRET`, `APP_DEBUG=false`. |
| Frontend loads but every call fails with CORS | Add the exact Vercel origin to `CORS_ORIGINS` (JSON array) and recreate the API. |
| Caddy can't get a cert | Port 80 must be open; DNS A record must resolve to the Elastic IP; `KAIROS_DOMAIN` set. |
| Filtered Qdrant searches 400 | Payload indexes missing — re-run `docker exec kairos-backend-api python scripts/init_qdrant.py`. |
| Search / validation corpus empty | Local ES wasn't populated — run `load_demo_dataset.py` then `seed_validation_corpus.py` (§1.10). |
| Every write 403/500 in prod, OPA errors in logs | `OPA_URL` is still `localhost` — set `OPA_URL=http://kairos-opa:8181` in `.env` and recreate the API (§1.8). |
| Box swapping / sluggish (t3.large) | Confirm the 4 GB swap (§1.5); consider t3.xlarge. |
