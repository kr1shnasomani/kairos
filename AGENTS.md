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
| Golden demo dataset + loader | `docs/DATASET.md` |

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
make seed                 # seed_regulations.py + seed_users.py
make load-dataset         # load dataset/ through the real pipeline (ARGS=--fast to skip docs)
make purge-test-data      # delete ASSET-TEST/DEDUP/EV/ACK-*, WO-*, DOC-* from every store
docker compose up -d --no-deps --build kairos-frontend          # new npm deps only
docker compose up -d --no-deps --force-recreate kairos-backend-api  # NIM env changes
docker exec kairos-backend-api python -m pytest tests/ -q --timeout=120
```

After `make nuke`: `make dev` → `make init-all` → `make seed` → `make load-dataset`

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
| `GET /compliance/dashboard` `total_gaps` | Backend returns `{critical,major,minor}` object, not a number — sum the keys; never render it directly. `ComplianceDashboard` type in `types.ts` reflects this. |
| **Frontend types must mirror the real backend contract** | Several FE types were built speculatively and crashed on live data. Verify against a live `curl` before trusting. Fixed: `SlaReport` (backend is an *escalation* report: `overdue_conflicts[]` + `overdue_quarantine_items[]` + `overdue_*_total` + `escalated_this_run` + `checked_at`; NO on-time/total tallies), `CircuitBreakerState` (`{states[], halted_count}`, entry `halted` is boolean not `status`), `ValidationCorpusStats` (`{total_corpus_size, by_entity_type, last_updated_at}` — NO `by_asset_class`). Guard array reads with `?? []` — `x?.arr.length` still throws when `arr` is undefined. |
| Blast-radius / topology API is nested | `/governance/blast-radius/{id}` returns `affected:[{edge,target}]` and `/documents/{id}/topology` returns `{topology:{equipment_nodes,isolation_valves,isolation_boundaries,instrumentation_loops}}` — both normalised to the flat `{items}`/`{nodes,edges}` UI shape **inside the `api.ts` fetcher** (adapter pattern), so components stay dumb. |
| Service worker refresh loop | `public/sw.js` must be registered **production-only** (`app-shell.tsx` gates on `NODE_ENV`; dev actively unregisters). Navigations are **network-first** (cache is offline fallback only) — a cached HTML shell + changed chunk hashes = infinite reload. Bump `SHELL` cache version to bust a poisoned cache. |
| Turbopack dev 404s-everything | A tight reload loop (e.g. the SW bug above) can corrupt the dev route manifest → every `(app)/*` route 404s while `/` still 307s. `docker restart kairos-frontend` clears it; it is not a code bug. |
| API boot race on ES | `kairos-backend-api` calls `ensure_indices()` on startup and **exits** if Elasticsearch isn't ready yet. After `make dev`, if the API is down, `docker restart kairos-backend-api` once ES is healthy. |
| `POST /search/rca-pack` is slow (~90s) | NIM 70B synthesis. Returns 200 with empty `timeline`/`hypotheses` + `synthesis_available:false` when the graph lacks history — the RCA page shows "Synthesis unavailable" honestly (no fabrication). Not a bug. |
| Off-boarding shapes (fully aligned 2026-07-11) | Backend truth: list `{items,total}` (items use `id`, `total_sessions`, `sessions_completed`, `completion_pct`); detail adds `session_items[]` (`id`, `session_number`, `equipment_family`, `status`, `scheduled_for`); the route param `[sessionId]` is really the **programme id** (select session items in-page, don't route per item); questions are a **`string[]`** per item (not structured `ElicitationQuestion`); responses POST `{item_id, responses:[{question_index, answer}]}` to `/offboarding/{programme_id}/responses`. Frontend types + both pages now match. Detail fetches use a **6 s** `getJson` timeout (slow Supabase + per-item counts blew the default 1500 ms → false "not found" / empty questions). Loader seeds a demo programme (`create_offboarding`), so the flow is demoable. |
| Field routes need `field_worker` role + mobile | Field *pages* have NO role gate (accessible to any auth'd user) and render at mobile viewport. Only the `FieldBottomTabs` nav chrome is gated (`FIELD_ROLES=["field_worker"]` in `use-role.ts`, `isField` in `app-shell.tsx`). **Verified** via `field_worker@kairos.local` login: tabs = Briefs · Copilot · Assets · Voice · **Me (= sign-out)**. The "Voice" tab links to bare `/field/voice` — added a `field/voice/page.tsx` index (ad-hoc capture, asset/WO tag input) since only `[workOrderId]` existed (was a dead 404 link). |
| Offline shell (Task 11) is prod-only | The SW is now registered production-only (dev refresh-loop fix), so app-shell offline caching only works in a prod build. The IndexedDB write queue (`idb.ts` / `OfflineQueue`) is app-level and still works in dev. |

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

| Tasks | Components | TypeScript | Browser verified |
|---|---|---|---|
| 1–4 Foundation (types · api · globals.css · layout · theme) | `ui.tsx` · `theme-toggle.tsx` · `app-shell.tsx` | ✅ clean | ✅ verified |
| 5–7 Field core (briefs page · inbox · card · detail) | `brief-inbox.tsx` · `brief-card.tsx` · `brief-detail.tsx` | ✅ clean | ✅ verified |
| 8 Elicitation micro-interview | `field/elicitation/[workOrderId]/page.tsx` | ✅ clean | ✅ verified (mobile, flow works) |
| 8b Off-boarding knowledge transfer | `offboarding/page.tsx` · `offboarding/[sessionId]/page.tsx` | ✅ clean | ✅ verified end-to-end (list · detail · interview · submit; seeded demo programme) |
| 9 Voice note capture | `VoiceRecorder` component | ✅ clean | ✅ verified (mobile, recorder renders) |
| 10 Deviation flag | `field/deviation/page.tsx` | ✅ clean | ✅ verified (mobile, form renders) |
| 11 Offline shell + sync queue | Service Worker · IndexedDB · `OfflineQueue` | ✅ clean | ✅ FieldBottomTabs verified (field_worker) · SW offline prod-only |
| 12 Voice search / Copilot voice | `VoiceRecorder` integration in copilot | ✅ clean | ✅ verified (same recorder) |
| 13 Copilot phase-gated synthesis | `copilot/page.tsx` with `RefusalCard` | ✅ clean | ✅ verified |
| 14 Inline annotation | `AnnotationPanel` · `POST /annotations` | ✅ clean | ✅ verified (on doc detail) |
| 15 Knowledge graph canvas | `knowledge-graph.tsx` (React Flow) | ✅ clean | ✅ verified |
| 16 Time-travel timeline | time-travel input on `graph/page.tsx` | ✅ clean | ✅ verified |
| 17 P&ID topology viewer | `topology/page.tsx` · `blast-radius-panel.tsx` | ✅ clean | ✅ verified (fixed) |
| 18 Asset bootstrap | `assets/bootstrap/page.tsx` | ✅ clean | ✅ verified |
| 19 Document comparison | `documents/compare/page.tsx` | ✅ clean | ✅ verified |
| 20 Document detail depth | `documents/[id]/page.tsx` enhancements | ✅ clean | ✅ verified (fixed) |
| 20b Document ingestion | `documents/ingest/page.tsx` | ✅ clean | ✅ verified |
| 20c MDM identity confirmation | `assets/bootstrap/page.tsx` MDM section | ✅ clean | ✅ verified |
| 21 Governance conflicts depth | `governance/conflicts/page.tsx` | ✅ clean | ✅ verified |
| 22 Quarantine reviewer UI | `governance/quarantine/page.tsx` | ✅ clean | ✅ verified |
| 23 Timestamp drift review | `audit/page.tsx` filtered view | ✅ clean | ✅ verified |
| 24 Compliance cockpit | `compliance/page.tsx` · `compliance/audit-pack/page.tsx` | ✅ clean | ✅ verified |
| 25 Audit-pack assembly | `compliance/audit-pack/page.tsx` | ✅ clean | ✅ verified |
| 26 Non-conformance tracking | `compliance/nonconformance/page.tsx` | ✅ clean | ✅ verified |
| 27 MoC UI | `governance/moc/page.tsx` · `governance/moc/[id]/page.tsx` | ✅ clean | ✅ verified |
| 28 SLA report | `governance/sla/page.tsx` | ✅ clean | ✅ verified (fixed) |
| 29 Circuit breaker | `governance/circuit-breaker/page.tsx` | ✅ clean | ✅ verified (fixed) |
| 30 Model gate | `governance/model-gate/page.tsx` | ✅ clean | ✅ verified (fixed) |
| 31 Governance index | `governance/page.tsx` — all 6 surfaces live | ✅ clean | ✅ verified |
| 32 Management overview | `management/page.tsx` — live KPIs, parallel fetch | ✅ clean | ✅ verified |
| 33 Cross-site alerts | `management/cross-site/page.tsx` | ✅ clean | ✅ verified |
| 34 Plant-state control | `management/plant-state/page.tsx` — admin-gated 2-step confirm | ✅ clean | ✅ verified |
| 35 Event surfaces | `events/page.tsx` · `events/[id]/page.tsx` | ✅ clean | ✅ verified |
| 36 A11y + responsive + multi-script sweep | Devanagari font stack · aria-labels · audit/quarantine/moc fixes | ✅ clean | ✅ verified (via shell) |
| 31b Project & procurement registry (FE_IMP Task 31) | `projects/page.tsx` — composes documents+assets+events by equipment class | ✅ clean | ✅ verified |
| — RCA workspace | `rca/page.tsx` — honest "synthesis unavailable" when graph lacks history | ✅ clean | ✅ verified |

> **Status note (2026-07-11):** Full admin-account browser sweep complete — every desktop route now verified against the golden dataset (10 assets, 20 docs). Six live crashes found + fixed this pass (all frontend-type-vs-backend-contract mismatches, plus one infra bug):
> 1. **Service-worker refresh loop** — the PWA SW cached the app shell and fought HMR in dev → infinite reload (looked like "page won't load, only refreshes"). Fixed: SW registers **production-only** + unregisters in dev (`app-shell.tsx`); `sw.js` navigations are now **network-first** with `SHELL` bumped to v2. A side effect had corrupted the Turbopack route manifest (all `(app)/*` → 404); `docker restart kairos-frontend` cleared it.
> 2. **SLA report** crashed (`overdue_quarantine` undefined) — backend is an escalation report (`overdue_quarantine_items`, `overdue_*_total`, `escalated_this_run`, no on-time tallies). Rewrote `SlaReport` type + page.
> 3. **Circuit breaker** crashed (`state.entries` undefined) — backend is `{states[], halted_count}` with boolean `halted`. Rewrote type + page.
> 4. **Model gate** crashed (`Object.entries(corpus.by_asset_class)`) — corpus is `{total_corpus_size, by_entity_type, last_updated_at}`, no `by_asset_class`. Rewrote type + page.
> 5. **Blast radius** (doc + asset detail) crashed (`report.items` undefined) — backend `affected:[{edge,target}]`; normalised in the `getBlastRadius` fetcher.
> 6. **P&ID topology** crashed (`topo.nodes` undefined) — backend groups elements into 4 category arrays; normalised into `{nodes,edges}` in the `getDocumentTopology` fetcher (synthesises boundary→valve/bleed edges).
>
> Field routes (8–12) still require a `field_worker` role + mobile viewport (deferred to the multi-account pass). Frontend CI green: `tsc` (0) + `eslint` (0 errors, 10 warnings) + `next build` all pass.

**Before marking any task browser-verified:** run `make dev`, load each route in Chrome, confirm DemoChip shows for fixture data, PTW dual-sign flow works, frozen/caution banners render, GovernorPill appears in sidebar, ContrastToggle switches palette, FieldBottomTabs show only on `field_worker` role at mobile width.

---

## Tooling & Project Reference

- **`gh`** — GitHub CLI: PRs, issues, CI status.
- **Supabase MCP** (`mcp__claude_ai_Supabase__*`) — SQL, migrations, table inspection. Prefer over `docker exec`.

**Supabase:** project `ernffgrvdcikwwhkhiix` · bucket `kairos-vault` (private, immutable, 500 MB max)  
**Tests:** 150 passed, 1 flaky · suite self-cleans on teardown (`scripts/purge_test_data.py`) · CI: 6 workflows in `.github/workflows/` (`frontend.yml` — tsc · eslint · build · audit — **green**) · Package: `ghcr.io/kr1shnasomani/kairos`  
**Release:** `git tag v{version} && git push origin v{version}` · 7 secrets needed in `tests.yml` (deferred)
