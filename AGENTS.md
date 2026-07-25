# KAIROS — Agent Context

## YOU MUST DO THIS BEFORE EVERY TASK

**1. Run `/ponytail lite`** — mandatory scope gate. No exceptions.  
**2. Match your domain in the table below and invoke ALL listed skills before writing code.** Skills are orders, not suggestions.  
**3. Read every file you will touch. Trace the full call chain.**

---

## Skill Dispatch (MANDATORY — invoke every match before writing)

| Domain | Invoke these skills |
|---|---|
| React / Next.js / RSC / page / component / hook | `vercel-react-best-practices` · `vercel-composition-patterns` |
| Tailwind class / token / `@theme` / CSS variable | `tailwind-4-docs` · `tailwind-design-system` |
| UI primitive / polish / anything in `ui.tsx` | `emil-design-eng` · `baseline-ui` · `web-design-guidelines` |
| Animation / motion / keyframe / skeleton | `review-animations` · `fixing-motion-performance` · `animation-vocabulary` |
| Route / page / view transition | `vercel-react-view-transitions` |
| TypeScript type / interface / generic / review | `typescript-advanced-types` · `typescript-react-reviewer` |
| React Flow / graph canvas / node / edge | `react-flow-code-review` |
| a11y / ARIA / focus / contrast / keyboard / screen reader | `accessibility` · `fixing-accessibility` · `accessibility-compliance` |
| PWA / offline / service worker / IndexedDB | `pwa-development` |
| Performance / CWV / LCP / CLS / INP / bundle | `performance` · `core-web-vitals` |
| Neo4j Cypher / graph query | `neo4j-cypher-skill` |
| Neo4j Python driver / `execute_query` | `neo4j-driver-python-skill` |
| Neo4j Go driver | `neo4j-driver-go-skill` |
| Neo4j GraphRAG / retrieval / document import | `neo4j-graphrag-skill` · `neo4j-document-import-skill` |
| Neo4j CSV import / vector index / GenAI plugin | `neo4j-import-skill` · `neo4j-vector-index-skill` · `neo4j-genai-plugin-skill` |
| Neo4j graph modeling / RBAC / security | `neo4j-modeling-skill` · `neo4j-security-skill` |
| Qdrant client / search / quality | `qdrant-clients-sdk` · `qdrant-search-quality` |
| Qdrant performance / scaling / monitoring | `qdrant-performance-optimization` · `qdrant-scaling` · `qdrant-monitoring` |
| Qdrant model migration / version upgrade | `qdrant-model-migration` · `qdrant-version-upgrade` |
| Redis data model / connections | `redis-core` · `redis-connections` |
| Redis security / monitoring | `redis-security` · `redis-observability` |
| Elasticsearch / ES\|QL / authz | `elasticsearch-onboarding` · `elasticsearch-esql` · `elasticsearch-authz` |
| Grafana dashboard / panel | `grafana-oss` · `dashboarding` |
| Grafana alerting / IRM / SLO | `alerting-irm` |
| Prometheus / PromQL / Loki / Tempo | `prometheus` · `promql` · `loki` · `tempo` |
| OTEL / instrumentation / LLM observability | `opentelemetry` · `observability-edot-python-instrument` · `observability-llm-obs` · `observability-logs-search` |
| FastAPI / Pydantic / new project scaffold | `fastapi` · `fastapi-templates` |
| Python code / design patterns / perf / tests | `python-code-style` · `python-design-patterns` · `python-performance-optimization` · `python-testing-patterns` |
| Celery task / queue / worker | `celery-expert` |
| Go code / errors / performance / tests | `golang-code-style` · `golang-error-handling` · `golang-performance` · `golang-testing` |
| Docker / Compose / multi-stage Dockerfile | `docker-expert` · `multi-stage-dockerfile` |
| GitHub Actions / CI-CD | `github-actions-templates` |
| Temporal workflow / activity / worker | `temporal-developer` |
| Supabase / Postgres query / migration / auth | `supabase` · `supabase-postgres-best-practices` |
| AI model selection / HuggingFace | `huggingface-best` · `huggingface-local-models` |
| Complexity / YAGNI / over-engineering / debt | `ponytail` · `ponytail-review` · `ponytail-audit` · `ponytail-debt` |

Full manifest with descriptions: `.agents/SKILL_MANIFEST.md`

---

## Documentation

| Purpose | Path |
|---|---|
| Problem statement | `docs/PROBLEM_STATEMENT.md` |
| 13-layer architecture | `docs/ARCHITECTURE.md` |
| REST API reference | `docs/API.md` |
| Backend services · workers · models · config | `docs/BACKEND.md` |
| Infra: containers · ports · stores · observability · dev cmds | `docs/INFRA.md` |
| **Project status — built · conformance (design vs reality) · pending · known issues** | **`docs/implementation/status.md`** |
| Backend implementation plan | `docs/implementation/BE.md` |
| Database schemas | `docs/DATABASE.md` |
| Frontend routes & wiring | `docs/FRONTEND.md` |
| **Frontend implementation plan** | **`docs/implementation/FE.md`** |
| Mock-data fallbacks + demo chip | `docs/FIXTURES.md` |
| Integration test suite | `docs/TESTS.md` |
| Golden demo dataset + loader | `docs/DATASET.md` |
| Benchmarks + evaluation (harness → `benchmark/`, results → `benchmark/RESULTS.md`) | `docs/BENCHMARKS.md` |
| **Production deploy** (Vercel FE · AWS EC2 backend · cloud stores · Neo4j keep-alive cron) | **`DEPLOY.md`** |

---

## Stack

**Backend:** FastAPI (Python 3.12) · **Neo4j Aura (cloud)** · **Qdrant Cloud** · ES 8.13 · Redis 7.2 · Temporal · Celery · Go (Gin) · OPA · **OTEL → Grafana Cloud** · Supabase (Postgres + Storage + Auth + Vault)  
**Frontend:** Next.js 16 · React 19 · Tailwind CSS **v4** (not v3) · TypeScript strict · `node:20-alpine`  
**Models (cloud only — no local packages):** LLM → NIM `meta/llama-3.1-70b-instruct` | NER → NIM `meta/llama-3.2-11b-vision-instruct` | OCR → NIM `nvidia/nemotron-ocr-v2` | Embed → Jina `jina-embeddings-v3` | STT → Groq `whisper-large-v3` — all names in `.env`

> **Cloud stores:** Neo4j (Aura), Qdrant (Cloud), Supabase, and Grafana (Cloud observability) are cloud
> services — creds in `.env` only. Local Neo4j/Qdrant containers are profile-gated (`--profile local-stores`);
> the Grafana/Tempo/OTEL-collector containers were removed. ES · Redis · Temporal · OPA · Go stay local.

**Ports (local containers):** API `8000` · Frontend `3000` · ES `9200` · Redis `6379` · Temporal `7233/8088` · OPA `8181` · Go `8090` · (Neo4j `7474/7687` + Qdrant `6333` only under `--profile local-stores`)

---

## Dev Commands

Full list: `docs/INFRA.md §9`. Reset to clean state: `make nuke → dev → init-all → seed → load-dataset`.
Gotcha rebuilds: `docker compose up -d --no-deps --build kairos-frontend` (new npm deps) · `--force-recreate kairos-backend-api` (NIM env).

**Tests — Docker only, never the host.** Host package resolution differs from the pinned images and
produces false results.
- Service-free tier (49 tests, no stack, no secrets, no network — what CI's `unit` job runs):
  `docker compose run --rm --no-deps -e KAIROS_SKIP_TEST_CLEANUP=1 kairos-backend-api pytest -q tests/test_{pii,query_category,search_fusion,ingestion_formats,http_pool,model_validation,pid,auth_cache,config_guardrail}.py`
- Full suite (needs the stack; **local stores only, never cloud**):
  `docker exec kairos-backend-api python -m pytest tests/ -q --timeout=120`
- Compliance Cypher (EXPLAIN + semantics vs local Neo4j): `scripts/verify_compliance_cypher.py`

---

## Non-Negotiable Rules

### Frontend
- **IMPORTANT: Tailwind v4 syntax only.** v4 ≠ v3 — always invoke `tailwind-4-docs` first.
- Colors from `var(--token)` only. Never hardcode hex. One component, two palettes (light/dark tokens).
- No new npm deps unless the task names one. React Flow is the only pre-approved addition.
- SSR: `API_INTERNAL_URL` for server components; `NEXT_PUBLIC_API_URL` for browser. Never hardcode.
- **Live-only data policy.** Fetchers return `{ data, source }`; `useFetch` maps `source:"demo"` (fixture fallback) → **error state** — the app shows real data, a loading skeleton, or error+retry, never a fixture. Reads time out at 4000 ms (`getJson`), writes at 8000 ms (`postJson`). Flatten backend shapes inside the `api.ts` fetcher (adapter layer).
- **A fetcher that does NOT return `Fetched<>` is outside `useFetch`'s guard — it must `throw`.** `synthesize()` and `getRcaPack()` return bare values, so the guard never covered them; they used to return invented answers on failure. Never add a fixture fallback to a bare-value fetcher. `lib/rca.ts` `rcaFor` is **test-only**; importing it from `api.ts` reintroduces the bug.
- **Backend fixture fallbacks must be disclosed in the UI.** A `source:"live"` response can still carry fixture content (P&ID `topology_source: "demo_fixture"`). Surface the flag; don't let it render as extracted data.
- **Safety-critical = `RefusalCard` only.** Never a hedged answer. Never a fixture masking a real refusal.
- Every answer / brief / RCA hypothesis shows `sources[]` + `AuthorityBadge`. No claim without provenance.
- No `console.log` in committed code.

### Backend
- **Neo4j edges — all 6 on every write:** `valid_from · valid_to · authority_level · document_id · confidence · verification_status`
- Vault: permanent. Never delete. Supersede by closing `valid_to`. Supabase Storage: immutable.
- Quarantine: one-way gate. `confidence < 0.7` → quarantine. Human-only promotion. No auto-promote.
- Assets: `MERGE (a:Asset {asset_id: $id}) SET a += $props` — never CREATE.
- Phase 2 synthesis **only** in `POST /search/synthesize` — never auto-triggered. The endpoint **derives `query_category`** when the caller omits it, so the safety-critical refusal gate applies to every caller; the gate clears on confidence ≥ 0.7 **or** authority ≤ 3 (a confidence-only gate refuses everything, since hybrid/graph hits carry no `confidence`).
- **Compliance findings are clause-scoped.** A gap means no document of that clause's `requires_document_type` is linked to the asset — never "the asset has no verified procedure at all", which flagged every (regulation × asset) pair unconditionally.
- **PII redaction runs at export, never at ingestion.** Names are legitimate operational knowledge ("which technician signed off…"); redacting on ingest breaks retrieval. `services/pii.py` → `GET /documents/{id}/redacted`, audited to `audit_log` with type counts only.
- **Outbound model calls use `shared_client()`** (`services/http.py`) — pooled **per event loop**, never a per-call `AsyncClient` and never a global one (Celery runs a fresh loop per task). Always pass an explicit `timeout=` per request; the cached client keeps the first caller's default.
- EEMUA governor: `check_governor(user_id)` before every brief. ≤6/operator/hour. PTW always exempt.
- Celery: lazy imports inside task body. All 6 queues: `ingestion,extraction,attribution,transcription,elicitation,validation`.
- Secrets: never hardcode. All via `api/config.py` Settings → env vars.

### Both
- Root-cause errors — one fix in the shared function beats guards at every caller.
- `structlog` only. Never `print()`, never stdlib `logging`.
- Routers thin: handler → service → result. No business logic in routers.
- Stay in scope. Note unrelated breakage — don't fix it mid-task.

---

## Known Pitfalls

> Grouped by area for scanning; every row is a real gotcha hit during the build. Nothing here is removed — only sorted.

### Backend · database · models · API

| Area | Fix |
|---|---|
| `quarantine_items` FK failure | `asset_id = None`, never `""` |
| Supabase login / refresh error | Fresh anon client — never the service-role client |
| NIM env not picked up | `--force-recreate`, not `--restart` |
| `audit_log` sort failure | Column is `timestamp`, not `created_at` |
| Temporal logger crash | `workflow.logger` is stdlib — f-strings, no kwargs |
| `input_type` CHECK rejected | DROP + re-add constraint to add new enum values |
| KNOWLEDGE_EDGE `valid_to` NULL | Sentinel `datetime(9999,12,31,...)`, never NULL |
| `/documents/{id}/topology` 404 | Only for `pid_drawing` docs; others 404 by design |
| Frontend SSR fetch timeout | Wrong base URL — check `API_INTERNAL_URL` vs `NEXT_PUBLIC_API_URL` |
| Work-order dedup test flake | Unique `asset_id` per run (10-min dedup window) |
| Site-wide brief wrong recipient | `user_id = f"site-{site_id}"` in `BriefEngine.deliver()` |
| NIM OCR wrong base URL | `https://ai.api.nvidia.com/v1/cv/nvidia/nemotron-ocr-v2` |

### Frontend — build & runtime

| Area | Fix |
|---|---|
| `dynamic(ssr:false)` build error | Not allowed in Server Components (Next 16) — put it in a `"use client"` wrapper (`components/lazy.tsx`) |
| eslint `react-hooks/purity` | No `Date.now()`/`new Date()` in render — move clock reads to `lib/utils.ts` (e.g. `nowMs`, `slaCountdown`) |
| eslint `set-state-in-effect` | Wrap async fetch in a `load()`; for mount-once DOM/token sync, scoped `eslint-disable` with a reason |
| DB junk from tests | Suite purges on teardown; `make purge-test-data` or full rebuild — never UI-filter test rows |
| FE type drift (root of most bugs) | FE types were built speculatively and crashed on live data. Verify shapes against live `curl`; `x?.arr.length` still throws when `arr` undefined — guard `?? []`. Fixed: `compliance/dashboard.total_gaps` = `{critical,major,minor}` object (not a number); `SlaReport` = escalation report (`overdue_quarantine_items`, `overdue_*_total`, no on-time tallies); `CircuitBreakerState` = `{states[],halted_count}`, `halted` bool; `ValidationCorpusStats` has no `by_asset_class`. **Now guarded by `tests/test_contract.py`.** |
| Blast-radius / topology are nested | `blast-radius/{id}` → `affected:[{edge,target}]`; `documents/{id}/topology` → nested `topology.{equipment_nodes,isolation_valves,isolation_boundaries,instrumentation_loops}`. Both flattened to the UI shape **inside the `api.ts` fetcher** (adapter). Guarded by `test_contract.py`. |
| Service-worker refresh loop | `public/sw.js` registered **production-only** (`app-shell.tsx` gates on `NODE_ENV`, unregisters in dev); navigations network-first. A dev-cached shell + changed chunk hashes = infinite reload. Bump `SHELL` cache version to bust. |
| Turbopack dev 404s-everything | A tight reload loop can corrupt the dev route manifest → all `(app)/*` 404 while `/` 307s. `docker restart kairos-frontend` clears it; not a code bug. |
| `next build` fails on `/_global-error` (`useContext` null) | Next 16.2.10's **default** global-error page fails to prerender. Fixed by a custom `src/app/global-error.tsx` (client, own `<html>/<body>`, **inline styles only** — no providers/tokens exist at that level). Keep it self-contained; don't import app components or `next/image` there. |
| `next build` exits 137 in the dev container | OOM — `kairos-frontend` is capped at **2 GB**, and a Turbopack production build needs more. Not a code error (compile + prerender succeed). CI (ubuntu-latest ~7 GB) and the Docker image build on the runner, not this container. To build locally, raise the container `mem_limit` or run on the host. |
| `not-found.tsx` uses plain `<img>`, not `next/image` | The root not-found renders inside the `_global-error` boundary at build time, where `<Image>`'s config context is null → prerender crash. Use a plain `<img>` (eslint-disable `no-img-element`), same as `brand-link.tsx`. |
| API boot race on ES | `kairos-backend-api` runs `ensure_indices()` at startup and **exits** if ES isn't ready. If the API is down after `make dev`, `docker restart kairos-backend-api` once ES is healthy. |

### Cloud stores — Neo4j Aura · Qdrant · Supabase

| Area | Fix |
|---|---|
| **Neo4j + Qdrant are CLOUD** (Aura + Qdrant Cloud, via `.env`) | Local `kairos-neo4j`/`kairos-qdrant` containers are **profile-gated** — they do NOT start by default; `docker compose --profile local-stores up` brings them back for offline dev/tests. Cloud creds live in `.env` only (never in compose). Aura DB is named after the instance (e.g. `2016aa75`), **not** `neo4j` — always open sessions with `database=settings.NEO4J_DATABASE` (GraphService defaults to it). Cloud Qdrant **requires payload indexes** on any filter field (`asset_id`, `document_id`, `is_quarantine`) — `init_qdrant.py` creates them; without them filtered searches 400. Every Qdrant client must pass `api_key=settings.QDRANT_API_KEY` or it 403s. |
| **Never run the write-heavy test suite against cloud** | `pytest tests/` creates + purges test entities; the teardown purge is unreliable against cloud Supabase (transient Cloudflare 500s) and **pollutes the golden data**. Run tests with local stores (`--profile local-stores`, point `.env` at them) or in CI. To restore clean golden data: truncate Supabase operational tables + wipe Neo4j/Qdrant/ES, then `init-all → seed → load-dataset`. |
| **`--profile local-stores` Neo4j crash-loops** | Neo4j rejects any initial admin username but literally `neo4j` (`Invalid admin username, it must be neo4j`). Compose used to interpolate `${NEO4J_USERNAME}`, so the local container died whenever `.env` pointed at Aura — exactly when you want local stores. Now hardcoded to `neo4j` + `NEO4J_LOCAL_PASSWORD`. To point the app at it, also set `NEO4J_USERNAME=neo4j` / `NEO4J_PASSWORD=$NEO4J_LOCAL_PASSWORD`. |
| **What the benchmark writes** | `run_benchmark.py` + `verify_layers.py` write **only `audit_log` rows** (one per synthesis, ~26 total) — append-only, no golden data touched, no schema change. `run_model_validation.py` and `run_compliance_eval.py` are read-only. Safe to run against cloud; it does spend NIM/Jina quota. |
| Seed cloud (run once) | `make init-all` (schema + Qdrant collections **+ payload indexes**) → `make seed` (regulations + users) → `make load-dataset`. Idempotent. Doc pipelines are async — re-run `scripts/seed_validation_corpus.py` ~30 s after load (validation_corpus needs ES content indexed first). |
| Neo4j Aura keep-alive | Aura Free pauses after 3 days idle. Point cron-job.org (daily) at `/health/detailed` — it pings Neo4j and resets the timer. |
| Neo4j `SessionExpired` / "defunct connection" | **Different** from the 3-day pause: Aura closes **idle connections** (minutes) → the next query on a stale pooled connection 500s (intermittent on `compliance/dashboard`, `/assets/{id}/knowledge`, graph, blast-radius). Fixed in `dependencies.py` with driver pool hygiene: `liveness_check_timeout=30` + `max_connection_lifetime=300`. The daily cron does **not** fix this — the driver config does. |

### Feature-specific — endpoints, roles & pages

| Area | Fix |
|---|---|
| Asset knowledge shows duplicate facts | The graph can hold multiple physical `KNOWLEDGE_EDGE` relationships sharing one logical `edge_id` (Cypher `DISTINCT` can't collapse them — separate graph elements). `GraphService.get_asset_knowledge_at` dedupes by the `edge_id` property; the frontend graph fetcher also dedupes. |
| Model-gate run "does nothing" | `POST /governance/model-gate/run` only **enqueues** a Celery task that evaluates the NER model over the whole validation corpus (a NIM call per item) — it runs **~2.5 min**. `model_name` is optional (defaults to `NVIDIA_NIM_NER_MODEL`). The page shows a "queued" banner, disables the button, polls history every 20s, and auto-refreshes when the run lands. History endpoint returns raw audit rows `{items}` (contract-locked) → `api.ts` `getModelGateHistory` flattens to `{history:[ModelGateResult]}`. |
| `POST /search/rca-pack` slow (~90s) | NIM 70B; returns empty + `synthesis_available:false` when the graph lacks history → RCA page shows honest "Synthesis unavailable". Not a bug. |
| Off-boarding shapes | List `{items,total}` (item `id`/`total_sessions`); detail adds `session_items[]`. Route `[sessionId]` = **programme id** (select items in-page). Questions are `string[]`; responses `{item_id, responses:[{question_index,answer}]}`. Detail fetch uses a 6 s timeout (slow Supabase). Loader seeds a demo programme. |
| Field routes | `FieldBottomTabs` is `field_worker`-gated (`use-role.ts`). Tabs: Briefs·Copilot·Assets·Voice·**Me (=sign-out)**. `/field/voice` has its own index page. SW offline is prod-only; the IndexedDB write queue (`idb.ts`) is app-level, works in dev. |
| Role-based route access | Enforced centrally in `AppShell` via `routeAllowed(path, role)` + `roleHome(role)` in `use-role.ts` (one guard, not per-page). Staff surfaces need engineer/reliability/admin; `/system-health` is admin-only; a field worker hitting a gated URL is redirected to `/briefs`. Unlisted paths are open to all authed. |
| System Health page | `/system-health` (admin). Probes 11 cheap read-only API GETs + `/health/detailed` every 30s. Search is **excluded** from the always-on set (it embeds via Jina = rate-limited). Opt-in "AI models" section toggles NIM/Gemini/Jina/Groq via `GET /health/model?provider=…` (admin-only, once/min, off by default, `localStorage`-persisted). Never poll model probes by default — they spend provider quota. |
| Sidebar footer | System information (all roles) · System health (admin) · **System settings** (renamed from "Settings"; route stays `/settings`). Help removed. Login has a "Try demo" → admin button. Tab titles = `Kairos: <page>`. |

---

## Where Things Live

| Concern | Path |
|---|---|
| FastAPI entrypoint / config / DI | `backend/api/main.py` · `config.py` · `dependencies.py` |
| Routers / Services / Models | `backend/api/routers|services|models/*.py` |
| Temporal workflow | `backend/workflows/document_pipeline.py` |
| Celery / Temporal workers | `backend/workers/celery_app.py` · `temporal_worker.py` |
| Go OT connectors | `backend/connectors/` |
| Neo4j schema | `db/neo4j/init_schema.cypher` |
| Supabase schema (single source of truth) | `db/schema.sql` · ops SQL in `db/maintenance/` |
| Seed / dataset / cleanup scripts | `backend/scripts/seed_*.py` · `load_demo_dataset.py` · `purge_test_data.py` |
| Golden dataset (mounted `/app/dataset`) | `dataset/` · canon: `dataset/00_Reference/00_KAIROS_CANON.md` |
| Frontend API client | `frontend/src/lib/api.ts` |
| Frontend types | `frontend/src/lib/types.ts` |
| Frontend primitives | `frontend/src/components/ui.tsx` |
| Frontend shell / role hook | `frontend/src/components/app-shell.tsx` · `use-role.ts` |

---

## Tooling & Project Reference

- **`gh`** — GitHub CLI: PRs, issues, CI status.
- **Supabase MCP** (`mcp__claude_ai_Supabase__*`) — SQL, migrations, table inspection. Prefer over `docker exec`.

**Supabase:** project `ernffgrvdcikwwhkhiix` · bucket `kairos-vault` (private, immutable, 500 MB max)  
**Tests:** ~175 passed · 3 skipped · 1 known transient flake (`test_attribution_worker_queues_recheck` — passes in isolation) · incl. `tests/test_contract.py` (response-shape contracts) + `tests/test_model_validation.py` (NER surface-form-overlap matcher) · self-cleans on teardown · Package: `ghcr.io/kr1shnasomani/kairos`

**CI:** `tests.yml` is two tiers — **`unit`** runs 49 service-free tests (PII, query classification, retrieval fusion, spreadsheet/email ingestion, NER matching, P&ID, auth cache, config) with **no secrets and no network**, so it is green on every push and fork PR; **`integration`** runs the full suite against `--profile local-stores` and *skips with exit 0* unless `CI_SUPABASE_*` is set. **Never point CI at the production Supabase / Aura / Qdrant Cloud project** — the suite creates+purges entities and `make init-all` reinitialises schema, so it would corrupt the golden dataset on every push. Use a throwaway Supabase project; `scripts/setup-ci-secrets.sh` sets the secrets. `frontend.yml` (tsc·eslint·build·audit): tsc/eslint/build pass; the **audit step fails on transitive `next`/`sharp` advisories** with no non-breaking fix available upstream.

> Run tests **in Docker**, never on the host: `docker compose run --rm --no-deps -e KAIROS_SKIP_TEST_CLEANUP=1 kairos-backend-api pytest tests/<file> -q`.
> Host runs resolve different package versions and produce false failures (`auth.test.ts` / `api.test.ts` fail on host, pass in-container).  
**Release:** `git tag v{version} && git push origin v{version}`
