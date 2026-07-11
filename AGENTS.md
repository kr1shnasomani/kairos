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
| Backend implementation plan | `docs/implementation/BE.md` |
| Database schemas | `docs/DATABASE.md` |
| Frontend routes & wiring | `docs/FRONTEND.md` |
| **Frontend implementation plan** | **`docs/implementation/FE.md`** |
| Mock-data fallbacks + demo chip | `docs/FIXTURES.md` |
| Integration test suite | `docs/TESTS.md` |
| Golden demo dataset + loader | `docs/DATASET.md` |

---

## Stack

**Backend:** FastAPI (Python 3.12) · Neo4j 5.20 · Qdrant · ES 8.13 · Redis 7.2 · Temporal · Celery · Go (Gin) · OPA · Vault · OTEL → Grafana · Supabase (Postgres + Storage + Auth)  
**Frontend:** Next.js 16 · React 19 · Tailwind CSS **v4** (not v3) · TypeScript strict · `node:20-alpine`  
**Models (cloud only — no local packages):** LLM → NIM `meta/llama-3.3-70b-instruct` | NER → NIM `mistralai/ministral-14b-instruct-2512` | OCR → NIM `nvidia/nemotron-ocr-v2` | Embed → Jina `jina-embeddings-v3` | STT → Groq `whisper-large-v3` — all names in `.env`

**Ports:** API `8000` · Frontend `3000` · Neo4j `7474/7687` · Qdrant `6333` · ES `9200` · Redis `6379` · Temporal `7233/8088` · Grafana `3001`

---

## Dev Commands

Full list: `docs/INFRA.md §9`. Reset to clean state: `make nuke → dev → init-all → seed → load-dataset`.
Gotcha rebuilds: `docker compose up -d --no-deps --build kairos-frontend` (new npm deps) · `--force-recreate kairos-backend-api` (NIM env). Tests: `docker exec kairos-backend-api python -m pytest tests/ -q --timeout=120`.

---

## Non-Negotiable Rules

### Frontend
- **IMPORTANT: Tailwind v4 syntax only.** v4 ≠ v3 — always invoke `tailwind-4-docs` first.
- Colors from `var(--token)` only. Never hardcode hex. One component, two palettes (light/dark tokens).
- No new npm deps unless the task names one. React Flow is the only pre-approved addition.
- SSR: `API_INTERNAL_URL` for server components; `NEXT_PUBLIC_API_URL` for browser. Never hardcode.
- Every fetcher: `try { live } catch { fixture }`, 1500 ms abort, returns `{ data, source }`. Demo chip when `source: "demo"`.
- **Safety-critical = `RefusalCard` only.** Never a hedged answer. Never a fixture masking a real refusal.
- Every answer / brief / RCA hypothesis shows `sources[]` + `AuthorityBadge`. No claim without provenance.
- No `console.log` in committed code.

### Backend
- **Neo4j edges — all 6 on every write:** `valid_from · valid_to · authority_level · document_id · confidence · verification_status`
- Vault: permanent. Never delete. Supersede by closing `valid_to`. Supabase Storage: immutable.
- Quarantine: one-way gate. `confidence < 0.7` → quarantine. Human-only promotion. No auto-promote.
- Assets: `MERGE (a:Asset {asset_id: $id}) SET a += $props` — never CREATE.
- Phase 2 synthesis **only** in `POST /search/synthesize` — never auto-triggered.
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
| `dynamic(ssr:false)` build error | Not allowed in Server Components (Next 16) — put it in a `"use client"` wrapper (`components/lazy.tsx`) |
| eslint `react-hooks/purity` | No `Date.now()`/`new Date()` in render — move clock reads to `lib/utils.ts` (e.g. `nowMs`, `slaCountdown`) |
| eslint `set-state-in-effect` | Wrap async fetch in a `load()`; for mount-once DOM/token sync, scoped `eslint-disable` with a reason |
| DB junk from tests | Suite purges on teardown; `make purge-test-data` or full rebuild — never UI-filter test rows |
| FE type drift (root of most bugs) | FE types were built speculatively and crashed on live data. Verify shapes against live `curl`; `x?.arr.length` still throws when `arr` undefined — guard `?? []`. Fixed: `compliance/dashboard.total_gaps` = `{critical,major,minor}` object (not a number); `SlaReport` = escalation report (`overdue_quarantine_items`, `overdue_*_total`, no on-time tallies); `CircuitBreakerState` = `{states[],halted_count}`, `halted` bool; `ValidationCorpusStats` has no `by_asset_class`. **Now guarded by `tests/test_contract.py`.** |
| Blast-radius / topology are nested | `blast-radius/{id}` → `affected:[{edge,target}]`; `documents/{id}/topology` → nested `topology.{equipment_nodes,isolation_valves,isolation_boundaries,instrumentation_loops}`. Both flattened to the UI shape **inside the `api.ts` fetcher** (adapter). Guarded by `test_contract.py`. |
| Service-worker refresh loop | `public/sw.js` registered **production-only** (`app-shell.tsx` gates on `NODE_ENV`, unregisters in dev); navigations network-first. A dev-cached shell + changed chunk hashes = infinite reload. Bump `SHELL` cache version to bust. |
| Turbopack dev 404s-everything | A tight reload loop can corrupt the dev route manifest → all `(app)/*` 404 while `/` 307s. `docker restart kairos-frontend` clears it; not a code bug. |
| API boot race on ES | `kairos-backend-api` runs `ensure_indices()` at startup and **exits** if ES isn't ready. If the API is down after `make dev`, `docker restart kairos-backend-api` once ES is healthy. |
| `POST /search/rca-pack` slow (~90s) | NIM 70B; returns empty + `synthesis_available:false` when the graph lacks history → RCA page shows honest "Synthesis unavailable". Not a bug. |
| Off-boarding shapes | List `{items,total}` (item `id`/`total_sessions`); detail adds `session_items[]`. Route `[sessionId]` = **programme id** (select items in-page). Questions are `string[]`; responses `{item_id, responses:[{question_index,answer}]}`. Detail fetch uses a 6 s timeout (slow Supabase). Loader seeds a demo programme. |
| Field routes | Field *pages* have no role gate (render for any auth'd user); only `FieldBottomTabs` is `field_worker`-gated (`use-role.ts`). Tabs: Briefs·Copilot·Assets·Voice·**Me (=sign-out)**. `/field/voice` has its own index page. SW offline is prod-only; the IndexedDB write queue (`idb.ts`) is app-level, works in dev. |

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

## Frontend Build Status

All FE tasks (1–36 + projects registry + RCA) are **built, `tsc`/`eslint`-clean, `next build` passes, and browser-verified** against the golden dataset — desktop routes via admin/engineer, field routes 8–12 via a real `field_worker` session at mobile width (FieldBottomTabs confirmed). Per-task plan + verification steps: `docs/implementation/FE.md`.

Verification surfaced 7 live-data crashes — all frontend-type-vs-backend-contract mismatches (compliance-dashboard, SLA, circuit-breaker, model-gate, blast-radius, topology, offboarding) plus a prod-only service-worker fix. Root causes are in Known Pitfalls above; the contract is now guarded by `tests/test_contract.py`.

**FE "done" checklist:** DemoChip on fixture data · PTW dual-sign · frozen/caution banners · GovernorPill in sidebar · ContrastToggle · FieldBottomTabs only on `field_worker` at mobile width.

---

## Tooling & Project Reference

- **`gh`** — GitHub CLI: PRs, issues, CI status.
- **Supabase MCP** (`mcp__claude_ai_Supabase__*`) — SQL, migrations, table inspection. Prefer over `docker exec`.

**Supabase:** project `ernffgrvdcikwwhkhiix` · bucket `kairos-vault` (private, immutable, 500 MB max)  
**Tests:** ~157 passed (incl. `tests/test_contract.py` — response-shape contract tests that pin the endpoints which drift) · self-cleans on teardown · CI: `frontend.yml` (tsc·eslint·build·audit) **green**; `tests.yml` needs 7 secrets (deferred) · Package: `ghcr.io/kr1shnasomani/kairos`  
**Release:** `git tag v{version} && git push origin v{version}` · 7 secrets needed in `tests.yml` (deferred)
