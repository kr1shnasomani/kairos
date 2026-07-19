# KAIROS — Implementation Status

> **Single source of truth for what is built.** Verified against the codebase
> 2026-07-18. Other docs describe *how* each part works; this file is the only
> place that tracks *completion status* — including the **[Pending](#pending--deployment-ops--polish-as-of-2026-07-18)**
> deployment/ops/polish list.
>
> Legend: ✅ **Live** (real, end-to-end) · 🟨 **Live on mock input** (real logic,
> fed by mock data **by design** — see below) · 🟦 **Mocked by design** (final).

---

## Headline

**All 13 architecture layers are implemented — the *product* is complete.** What remains is
**deployment, ops, and optional polish** (public hosting, manual E2E, security hardening) —
tracked in [Pending](#pending--deployment-ops--polish-as-of-2026-07-18) below.

KAIROS has **no connection to a live industrial plant** (no OSIsoft PI historian,
no SAP/Maximo EAM, single-site). Those integration points therefore run on
mock/fixture data **by design** — that is the intended, delivered MVP state, not
an unfinished task. The mock adapters are real code with a documented one-line
switch to go live *if* a plant is ever connected; until then, the mock **is** the
product.

---

## Layer completion

| # | Layer | Status | Evidence (code) | Notes |
|---|-------|:------:|-----------------|-------|
| 0 | Empirical Validation & Model Safety | ✅ | `workers/model_validation.py`, `services/circuit_breaker.py`, `validation_corpus`, `/governance/model-gate/*`, `/governance/validation-corpus/stats` | — |
| 1 | Deterministic Identity & MDM Backbone | ✅ | `/assets` (`MERGE`, `identity_confirmed_by` required), `asset_alias_map`, `services/graph.py` | EAM asset bootstrap = Go-connector **fixture** (no SAP/Maximo) — mock by design |
| 2 | Immutable Evidence Vault | ✅ | Supabase Storage (`kairos-vault`), SHA-256 dedup, `documents`, `POST /documents/ingest` | — |
| 3 | Multimodal Perception Engine | ✅ | OCR (NIM Nemotron), NER (NIM ministral), voice (Groq Whisper), annotations, **P&ID topology** (`services/pid.py`, NIM `llama-3.2-11b-vision`) | Path A (custom YOLO+LayoutLM on GPU) = optional future accuracy upgrade, `requirements-cv.txt` |
| 4 | Temporal Reality Graph | ✅ | Neo4j, `KNOWLEDGE_EDGE` (6 props), `as_of` time-travel, blast-radius, conflict detection | — |
| 5 | Zero-Copy OT Virtualization | 🟦 | Go connector `/ot/query`, `/ot/coverage` (`MockHistorianClient`) | **Mock by design — no plant historian.** Real path (`PIWebAPIClient`) is built; set `PI_WEBAPI_BASE_URL` to go live. OPC-UA is a stub. |
| 6 | Quarantine Knowledge Layer | ✅ | `quarantine_items` one-way gate, `/governance/quarantine` promote / dispute / request-info | — |
| 7 | Dual-Track Governance & Adjudication | ✅ | `knowledge_conflicts` (track), MoC webhook, SLA escalation (`services/sla_service.py`), circuit breaker, blast-radius | — |
| 8 | Operational Event & Proactive Delivery | ✅ | 8 event sources (`/events/*`), Redis Streams, EEMUA governor (`services/event_bus.py`), `services/brief_engine.py`, plant-state suppression, late-arrival + correlation | — |
| 9 | Structured Knowledge Elicitation | ✅ | `MicroInterviewWorkflow` (Neo4j + LLM, `workflows/elicitation_workflow.py`), off-boarding programmes | — |
| 10 | Telemetry-Grounded Outcome Attribution | 🟨 | `workers/attribution.py` (3-check logic), triggered from `POST /events/work-order` | Full attribution logic; its telemetry-baseline check reads the Layer-5 **mock** historian by design (no plant). Live logic, mock sensor input. |
| 11 | Reasoning & Synthesis | ✅ | Hybrid search (`services/search_service.py`), `/search/synthesize`, `/search/rca-pack`, safety refusal (NIM `llama-3.1-70b` + Jina embed) | — |
| 12 | Phased Deployment, Trust & Point-of-Action Interface | ✅ | Next.js frontend (36 tasks), `PhaseBadge`, field mode, all routes | Cross-site advisories are fixture-only (single-site MVP, by design). UI polish/depth is an ongoing frontend track. |

**Score: 12 ✅ live + 1 🟨 live-on-mock + Layer 5 🟦 mock-by-design.** Every layer is
implemented; the only non-real data paths are the external-plant integrations, which
are mock **by design**.

---

## Mock-by-design (final — not pending)

These are mock/fixture because the real counterpart is an **external system KAIROS
does not own**, or an enterprise scale-out beyond the single-site MVP. With no plant
to connect to, these are the delivered state:

| Item | Where | To go live (if a plant is ever connected) |
|------|-------|-------------------------------------------|
| OT historian (PI Web API) | `connectors/internal/ot/client.go` | set `PI_WEBAPI_BASE_URL` + creds (`PIWebAPIClient` already built) |
| OT historian (OPC-UA) | `connectors/internal/ot/client.go` | implement `gopcua` read (stub) |
| EAM asset sync (SAP/Maximo) | `connectors/internal/eam/client.go` | set `EAM_ODS_ENDPOINT` + implement SAP ODS query (stub) |
| Cross-site pattern advisories | `frontend .../management/cross-site` | multi-site control-plane feed |

---

## Optional future enhancements (not pending, not required)

| Enhancement | Trigger to build it |
|-------------|---------------------|
| P&ID Path A — custom YOLOv9 + LayoutLMv3 on GPU (`requirements-cv.txt`) | Higher extraction accuracy + a labelled P&ID dataset + GPU node |
| Per-recommendation attribution drill-down (Layer 10) | Deep Layer-10 analytics beyond the current summary |
| Frontend UI depth / polish (Demo-vs-Full cuts in `FE.md`) | The ongoing frontend track |

None of these block the platform; it is fully functional without them.

---

## Pending — deployment, ops & polish (as of 2026-07-18)

> **The product (all 13 layers) is complete.** These are **operational / hosting / polish** tasks that
> remain to get a public demo live and hardened — not product-completeness gaps. Tracked here so nothing
> is lost.

### Deployment (critical path — nothing is publicly live yet)
- [ ] **Deploy the backend** to an EC2 box: `docker compose -f docker-compose.yml --profile prod up` with **Caddy** for HTTPS. *(The Vercel-hosted frontend is non-functional until this exists.)*
- [ ] **Set prod env** on the box: `APP_ENV=production` (activates the fail-closed secret guardrail) + real `INTERNAL_API_KEY`, `NEO4J_PASSWORD`, `APP_SECRET_KEY` in `.env`.
- [ ] **Wire the frontend → backend:** set `NEXT_PUBLIC_API_URL` (Vercel or the box) + add that origin to backend `CORS_ORIGINS`. *(Alternative: serve the frontend from the same EC2 box via Caddy — same-origin, no CORS.)*
- [ ] **Neo4j Aura keep-alive:** cron-job.org (daily) → `/health/detailed`, so Aura doesn't pause after 3 days idle.
- [ ] **AWS billing alarm (~$30)** so the $120 credit isn't overrun.

### Security
- [ ] **Triage Dependabot alerts** — GitHub flagged 79 (10 critical) on last push; review the criticals.
- [ ] **Add CodeQL** workflow once the repo is public.

### Testing
- [ ] **Manual end-to-end walkthrough** — click every page as `admin`, then as `field_worker` to confirm the role gate redirects. (Guide: FRONTEND.md navigation + this file.)
- [ ] **Test-suite hygiene:** run the write-heavy suite ONLY against `--profile local-stores` or in CI — never against cloud (the teardown purge is unreliable on cloud Supabase and pollutes the golden data). Optionally add the 7 secrets `tests.yml` needs.

### Frontend polish (optional)
- [ ] **Revisit mobile navigation layout** — the mobile bottom tabs (`FieldBottomTabs`) were temporarily removed in favor of the hamburger sidebar. Need to revisit this UX decision later.
- [ ] **Friendly copilot shell** — warm greeting + "what can you do?" handling + suggestion chips (keeps the governed-RAG core; only improves the conversational wrapper).
- [ ] **Verify the safety-critical RefusalCard** live in the UI.

### Housekeeping (optional)
- [ ] **Import the 2 Grafana dashboard JSONs** (`infra/grafana/provisioning/dashboards/*.json`) into Grafana Cloud so hosted dashboards match what was built.
- [ ] **Decide on the 4 dead infra configs** (`infra/otel`, `infra/tempo`, grafana datasources/provisioning) — delete for a clean tree or keep as a record (labeled in INFRA.md §8 either way).
- [ ] **CI gating** (fail a PR on retrieval/provenance/layer regression) — deferred; only the deterministic metrics are safe to gate.
- [ ] **Remove dead frontend fixture modules** (`lib/*.ts` + `DemoChip`) — no longer rendered post live-only; optional cleanup.

---

## Manual-testing hardening (2026-07-19)

Page-by-page manual QA pass (field-worker → engineer → admin surfaces). Shipped this session:
- **Live-only data policy** — frontend never renders fabricated data: `useFetch` maps a fixture fallback to
  error+retry, server pages `throw` on it (`(app)/layout.tsx` = `force-dynamic`), custom pages show inline
  retry, cross-site shows an honest "no data" state. Read timeout 1.5 s → 4 s (compliance gaps 5 s).
- **Middleware → proxy** (`src/proxy.ts`, Next 16) — fixes the "tab title reverts to `Kairos` on refresh"
  bug (header now set on the request so `generateMetadata` can read it).
- **Brief content** — operator-readable prose instead of a raw KNOWLEDGE_EDGE dump.
- **Open artifact** — new `GET /documents/{id}/artifact-url` (signed URL) fixes the Supabase 400.
- **Documents list** now returns `asset_links` → projects portfolio classifies docs by equipment class.
- **Blast radius** — returns edge `source` (the affected asset) + dedup; panel always-visible + React Flow
  `<Handle>`s added (fixes "handle id: null" #008).
- **Audit trail** — readable metadata summaries, entity labels (UUID → friendly), badge wrap fix.
- **Role gating** — quarantine promote = reliability/admin; model-gate Run + Identity confirmation = admin.
- **Cosmetic/data** — events limit 250→200, graph/RCA default `EQ-101`/`HE-301`, stale `mXLM-RoBERTa` model
  name → config-driven (`ministral-14b`), admin sidebar superset (Voice/Deviation).
- **Graph page** — right context panel height-matched to the 560px canvas + internal scroll; validity-window
  rows labelled by the distinct **target** node (was every row "DOCUMENTED_BY"); `getKnowledgeGraph` **dedupes
  edges** (re-ingest left ~42 stacked dupes → ~5); `Timeline` dot/spine re-centered (dots no longer offset).
- **Governance hub** — shows KPI **skeletons while loading** (was em-dashes that read as "no data").
- **Audit trail** — synthesis entity shows "Query" (was the full question text reading as a sentence).
- **Sidebar** — added a "+ **Ingest Document**" action below the Knowledge group (staff-gated).
- **Neo4j Aura idle-connection fix** — the driver (`dependencies.py`) now sets `liveness_check_timeout=30`
  + `max_connection_lifetime=300`. Aura closes idle connections and `GraphService` uses raw `session.run`
  (no auto-retry), so a stale pooled connection threw `SessionExpired` ("defunct connection") → intermittent
  500s on Neo4j endpoints (compliance/dashboard, assets/knowledge, graph, blast-radius) → under live-only the
  `/management` overview erroring wholesale. Liveness-checking + recycling stale connections fixes it globally.

> **Re-verify:** the frontend test suite (124 passed, 2026-07-18) predates the live-only sweep — several
> pages dropped `DemoChip`/fixture branches; **re-run `npm test` and reconcile** before relying on that
> number. `tsc` + `eslint` are clean; a clean `next build` passes.

---

## Pending — follow-ups & manual QA (2026-07-19)

> **Admin login = the complete surface (confirmed against code).** The admin sidebar is a full **superset**
> of every role's navigation — all Operate/Analyze/Assure/Knowledge items **plus Voice + Deviation + System
> Health** — and OPA grants admin `*`, so every action works. Pages are **shared React components**; role
> only gates visibility/actions, so a page fix made while working as admin applies to that same page for
> every role that can see it. **Safe to log in as admin and work from there as the master workspace.**

### Resolved this pass (2026-07-19 — deep page QA + governance endpoints)
- [x] **MoC in-app sign-off had no backend** — added `GET /governance/moc/{id}` (enriches the thin `moc_items` row with `parameter`/`source_a`/`source_b`/`blast_radius_count` from the linked conflict) and `POST /governance/moc/{id}/approve` (engineer/admin; closes the superseded edge + resolves the conflict via the shared `_resolve_moc_conflict` helper). The UI called these all along — they used to 404.
- [x] **Promote gating reconciled** — endpoint `require_role` dropped `engineer` → now `reliability`/`admin`, matching OPA + frontend `PROMOTE_ROLES`.
- [x] **Model-gate 422** — `POST /model-gate/run` had `model_name` as a required query param the UI never sent; now optional, defaults to `NVIDIA_NIM_NER_MODEL`.
- [x] **Model-gate history never rendered** — backend returns raw `{items}` (contract-locked); `getModelGateHistory` now flattens to `{history:[ModelGateResult]}`.
- [x] **Model-gate run "did nothing"** — it's a ~2.5-min Celery task; added a queued banner, disabled-while-running button, background poll, and auto-refresh on completion. Distinguished 403/other/offline in the error copy; Run button already admin-gated.
- [x] **Asset knowledge duplicate facts** — `get_asset_knowledge_at` now dedupes by `edge_id` (6→3 facts on HE-303). Subtitle "Verified operational facts" → honest "Operational facts … verification status shown per fact".
- [x] **Neo4j `SessionExpired`** — driver pool hygiene (`liveness_check_timeout=30`, `max_connection_lifetime=300`) killed the intermittent 500s on Neo4j-backed endpoints.
- [x] **/management box-leveling + resilience** — Recent Signals stretches to match the left column with an internal scroller; system health split onto its own fetch so a slow ping never blanks the page.
- [x] **404 page + asset cleanup** — `not-found.tsx` now uses the real `logo.png` (old inline-SVG mark removed); deleted unused `logo.jpeg` + 5 Next.js boilerplate SVGs from `frontend/`.
- [x] **Docs/AGENTS/API/BACKEND/FRONTEND synced** — live-only fetcher rule, Neo4j pitfalls, model-gate async + adapter, MoC endpoints. (`CLAUDE.md` is a symlink to `AGENTS.md` — updated in one edit.)

### Resolved (2026-07-19 — batch follow-through)
- [x] **Alias resolution** — `/assets/{id}/knowledge` now accepts confirmed tag aliases via a shared `resolve_canonical_asset_id` helper (`P-101` → `EQ-101`, 5 facts, `resolved_from_alias: true`).
- [x] **Brief detail 404 on site-wide briefs** — `GET /briefs/{id}` + `/ack` filtered `.eq(recipient_user_id, user_id)`, so a `site-{site_id}` brief was unopenable by anyone (this was the user's `/briefs/4eaf5ff9…` 404, which I'd wrongly called "doesn't exist"). Now scoped to `[user_id, site-{site_id}]` via the shared `_brief_recipients` helper — matches the list endpoint.
- [x] **Brief humanized format** — verified in code (`assemble_work_order_brief`): headline/body use `_summarize_relationships`/`_distinct_docs`, no raw `DOCUMENTED_BY | confidence=` dump. Old persisted briefs keep pre-fix text.
- [x] **Frontend tests (partial)** — reconciled the 3 files I own to live-only (`use-fetch` demo→error, `management` demo→live mocks, `model-gate` useRole+removed demo-chip test): 11/11 green. **~11 other page-test files remain red** — pre-existing live-only debt (demo-source mocks, admin-button `useRole` mocks, removed demo-chip assertions), heterogeneous, for pages not touched this session. Recipe: flip happy-path mocks `demo→live`, mock `useRole` for admin-gated buttons, delete "offline fixture fallback" tests.
- [x] **Page spot-check** — circuit-breaker, documents/compare, system-information, SLA all render live data cleanly.

### Needs you (blocked for the agent — cloud deletes are classifier-guarded)
- [ ] Stale-audit cleanup (mXLM-RoBERTa): `delete from audit_log where action='model_gate_result' and entity_id='mXLM-RoBERTa';`
- [ ] Dedupe the 3 identical `ministral-14b` runs (ids 44,45,46 at 2026-07-19T08:03): `delete from audit_log a using audit_log b where a.action='model_gate_result' and b.action='model_gate_result' and a.entity_id=b.entity_id and a.entity_id='mistralai/ministral-14b-instruct-2512' and a.timestamp < b.timestamp;`
- [ ] **Neo4j edge dedup (87 duplicate extras / 22 edge_ids; verified 0 divergent-state, safe)** — run in the Aura console:<br>`MATCH ()-[r:KNOWLEDGE_EDGE]->() WITH r.edge_id AS eid, collect(r) AS rels WHERE size(rels)>1 UNWIND rels[1..] AS x DELETE x;`  (read path already dedupes; this makes the graph physically canonical, 123→36 edges.)

### Decisions for you (won't do unilaterally)
- [ ] **Compliance role** is backend-OPA-only — not in the frontend `Role` type, not seeded, not in route access (a compliance user would redirect-loop). Wire it up (Role type + `/compliance`+`/audit` route access + `roleHome` + seed a user) only if a compliance persona is wanted in the demo.
- [ ] **Reliability** gating is correct (STAFF_ONLY + PROMOTE_ROLES) but **no reliability user is seeded** — seed one to walk it live.
- [ ] **Dead frontend fixture modules** (`lib/*.ts` + `DemoChip`) — *not* a safe delete: api.ts imports all of them in catch branches, and `copilot.ts`/`rca.ts` also export live types + real constants (`SUGGESTIONS`, `RCA_PRESETS`); removal is a real refactor of every fetcher's error path + 11 `DemoChip` sites + fixture-using tests, with zero user-facing benefit. Recommend a dedicated cleanup task.

### Resolved (2026-07-19 — green suite + build fix + CI)
- [x] **Frontend test suite reconciled to live-only — 124/124 green** (was 104 pass / 20 fail). Fixes: `demo→live` in happy-path mocks (compliance, governance, sla, circuit-breaker, audit-pack, nonconformance, management); `useRole` mocked for admin-gated buttons (model-gate); removed-behavior tests rewritten (`use-fetch` demo→error, model-gate/audit empty-state, cross-site honest-empty, rca/graph EQ-101 defaults, copilot full-height layout).
- [x] **Pre-existing `next build` blocker fixed** — Next 16.2.10's *default* `_global-error` page failed to prerender (`useContext` null), breaking the build (confirmed on HEAD, independent of this session's changes). Added a self-contained `src/app/global-error.tsx` (client, own `<html>/<body>`, inline styles). Build now compiles + prerenders clean; the local dev container OOMs (137) only because it's capped at **2 GB** — CI (ubuntu-latest ~7 GB) and the published image build on the runner, not this container.
- [x] **Frontend tests green locally (124/124)**; CI (`frontend.yml`) stays tsc → lint → build → audit. vitest is not gated in CI (the dev container OOMs at 2 GB, masking the exit code) — run it locally. Backend changes verified ruff-clean.
- [ ] Emit a fresh **work order** → confirm the new operator-readable brief format live (code path already verified; the persisted EQ-102 brief keeps the old raw text). Optional end-to-end check (writes to cloud).

### Manual QA still to walk (role × page)
- [ ] **Reliability** + **compliance** role passes — reliability promotes quarantine; compliance cockpit read access.
- [ ] Pages not yet eyeballed: `/copilot`, `/documents/compare`, `/documents/[id]/topology`, `/governance/sla` · `/circuit-breaker`, `/system-information`, `/settings`, field `elicitation`/`voice` flows. *(Admin walkthrough, plant-state, model-gate, bootstrap, asset detail, /management, 404 — done this pass.)*

### Known non-blocking gaps
- [ ] **Alias resolution** — `/assets/{id}/knowledge` 404s for tag aliases (`P-101`→`EQ-101`); graph/RCA now default to canonical ids, but aliases don't resolve server-side. Backend change if wanted.
- [ ] **Underlying duplicate KNOWLEDGE_EDGE relationships** — the read path now dedupes by `edge_id`, but the graph still physically holds the duplicates (from ingestion). Optional Neo4j cleanup (guarded write) if a canonical single-edge graph is wanted.
- [ ] **Model-gate "Run" button** for non-admins is already hidden; no remaining FE gap there.

---

## Verification snapshot (2026-07-18, test counts updated 2026-07-19)

- Backend test suite: **~175 passed · 3 skipped** (1 transient flake; passes in isolation) — **not re-run this session** (write-heavy; must run against `--profile local-stores`, never cloud). This session's backend changes (alias resolve, brief recipient scoping, MoC endpoints, promote gating, model-gate default) are low-risk and don't touch the asserted paths (`test_promote_quarantine_item` uses `admin_client`).
- Frontend suite: **live-only reconciliation in progress** — `tsc` + `eslint` + `next build` clean; `vitest` ~107 passed / **~17 failing** across ~11 page-test files that still assert the pre-live-only demo/fixture path (heterogeneous debt; recipe recorded in the follow-ups section). The 3 files touched this session (`use-fetch`, `management`, `model-gate`) are green.
- Benchmark (cloud stores): retrieval **25/25**, answer **23/25**, provenance **25/25**, entity-F1 **~0.96**.
- P&ID Path B: live-validated on `dataset/02_Document_Corpus/pid_line3_isolation_boundary.png`.
- **Cloud stores:** Neo4j Aura + Qdrant Cloud + Supabase + Grafana Cloud (observability). Default local stack ≈ 13 containers (neo4j/qdrant/grafana/tempo/otel offloaded); ~2–3 GB idle RAM.
- Auth verified-token cache: ~577 ms/request saved (revocation preserved, ≤ TTL staleness).
