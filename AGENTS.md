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
| Backend & infra | `docs/BACKEND.md` |
| Database schemas | `docs/DATABASE.md` |
| Frontend routes & wiring | `docs/FRONTEND.md` |
| **Frontend implementation plan** | **`docs/FE_IMP.md`** |
| Integration test suite | `docs/TESTS.md` |

---

## Stack

**Backend:** FastAPI (Python 3.12) · Neo4j 5.20 · Qdrant · ES 8.13 · Redis 7.2 · Temporal · Celery · Go (Gin) · OPA · Vault · OTEL → Grafana · Supabase (Postgres + Storage + Auth)  
**Frontend:** Next.js 16 · React 19 · Tailwind CSS **v4** (not v3) · TypeScript strict · `node:20-alpine`  
**Models (cloud only — no local packages):** LLM → NIM `meta/llama-3.3-70b-instruct` | NER → NIM `mistralai/ministral-14b-instruct-2512` | OCR → NIM `nvidia/nemotron-ocr-v2` | Embed → Jina `jina-embeddings-v3` | STT → Groq `whisper-large-v3` — all names in `.env`

**Ports:** API `8000` · Frontend `3000` · Neo4j `7474/7687` · Qdrant `6333` · ES `9200` · Redis `6379` · Temporal `7233/8088` · Grafana `3001`

---

## Dev Commands

```bash
make dev / stop / nuke / init-all / logs / ps
docker compose up -d --no-deps --build kairos-frontend          # new npm deps only
docker compose up -d --no-deps --force-recreate kairos-backend-api  # NIM env changes
docker exec kairos-backend-api python -m pytest tests/ -q --timeout=120
```

After `make nuke`: `make init-all` → `seed_regulations.py` → `seed_users.py`

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
| Supabase migrations | `db/migrations/` |
| Frontend API client | `frontend/src/lib/api.ts` |
| Frontend types | `frontend/src/lib/types.ts` |
| Frontend primitives | `frontend/src/components/ui.tsx` |
| Frontend shell / role hook | `frontend/src/components/app-shell.tsx` · `use-role.ts` |

---

## Frontend Build Status

| Tasks | Components | TypeScript | Browser verified |
|---|---|---|---|
| 1–4 Foundation (types · api · globals.css · layout · theme) | `ui.tsx` · `theme-toggle.tsx` · `app-shell.tsx` | ✅ clean | ⏳ not yet — needs `make dev` + visual pass |
| 5–7 Field core (briefs page · inbox · card · detail) | `brief-inbox.tsx` · `brief-card.tsx` · `brief-detail.tsx` | ✅ clean | ⏳ not yet — needs `make dev` + visual pass |

**Before marking any task browser-verified:** run `make dev`, load each route in Chrome, confirm DemoChip shows for fixture data, PTW dual-sign flow works, frozen/caution banners render, GovernorPill appears in sidebar, ContrastToggle switches palette, FieldBottomTabs show only on `field_worker` role at mobile width.

---

## Tooling & Project Reference

- **`gh`** — GitHub CLI: PRs, issues, CI status.
- **Supabase MCP** (`mcp__claude_ai_Supabase__*`) — SQL, migrations, table inspection. Prefer over `docker exec`.

**Supabase:** project `ernffgrvdcikwwhkhiix` · bucket `kairos-vault` (private, immutable, 500 MB max)  
**Tests:** 150 passed, 1 flaky · CI: 5 workflows in `.github/workflows/` · Package: `ghcr.io/kr1shnasomani/kairos`  
**Release:** `git tag v{version} && git push origin v{version}` · 7 secrets needed in `tests.yml` (deferred)
