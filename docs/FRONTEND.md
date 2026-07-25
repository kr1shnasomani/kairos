# KAIROS — Frontend Reference

Next.js 16 · React 19 · TypeScript · Tailwind CSS 4 · Docker

**Local:** `http://localhost:3000` — served by `kairos-frontend` container.

**Design system:** `frontend/DESIGN.md` — Paper theme, colour tokens, typography, component conventions, Refero borrow map. Read before building any new UI component.

---

## 1. Stack

| Concern | Choice |
|---------|--------|
| Framework | Next.js 16 (App Router) |
| UI | React 19, Tailwind CSS 4, custom design tokens |
| Language | TypeScript (strict) |
| Auth | Supabase-backed via `POST /auth/login` |
| API (browser) | `fetch` against `NEXT_PUBLIC_API_URL` (default `http://localhost:8000`) |
| API (SSR) | `fetch` against `API_INTERNAL_URL` (`http://kairos-backend-api:8000` in Docker) |
| Container | `node:20-alpine`; `npm ci` at build time; `src/` + `public/` hot-reloaded via volume mount |

---

## 2. Folder Structure

```
frontend/
├── public/
│   ├── logo.png                    # Brand logo — served at /logo.png; favicon source
│   └── sw.js                        # Service worker (PWA offline shell) — registered PROD-ONLY
├── src/
│   ├── app/
│   │   ├── icon.jpeg                # Auto-favicon (Next.js App Router convention)
│   │   ├── layout.tsx               # Root layout — globals, font, theme, favicon metadata
│   │   ├── page.tsx                 # Root redirect → /briefs
│   │   ├── globals.css              # Design tokens (CSS vars: --accent, --ink, --muted, etc.)
│   │   ├── not-found.tsx            # On-theme 404 page
│   │   ├── login/page.tsx           # Login screen (real auth → POST /auth/login)
│   │   └── (app)/                   # Authenticated route group — wrapped in <AppShell>
│   │       ├── layout.tsx · loading.tsx · error.tsx   # shell · skeleton · error boundary
│   │       ├── briefs/{page,[id]/page}                # inbox · detail+ack+feedback
│   │       ├── copilot/page                           # knowledge copilot (phase-gated synthesis)
│   │       ├── assets/{page,[id]/page,bootstrap/page} # list · detail · MDM identity confirm
│   │       ├── rca/page                               # RCA pack generator
│   │       ├── compliance/{page,audit-pack,nonconformance}
│   │       ├── governance/{page,conflicts,quarantine,moc,moc/[id],sla,circuit-breaker,model-gate}
│   │       ├── documents/{page,[id]/page,[id]/topology,compare,ingest}
│   │       ├── events/{page,[id]/page}                # operational event surfaces
│   │       ├── projects/page                          # engineering + procurement registry
│   │       ├── graph/page · audit/page                # temporal graph · audit trail
│   │       ├── management/{page,cross-site,plant-state}
│   │       ├── field/{deviation,elicitation/[workOrderId],voice,voice/[workOrderId]}  # mobile field capture
│   │       └── (desktop)/offboarding/{page,[sessionId]/page}   # retiring-expert knowledge transfer
│   ├── components/
│   │   ├── app-shell.tsx            # Desktop sidebar + mobile drawer + FieldBottomTabs + auth guard + sign-out
│   │   ├── lazy.tsx                 # "use client" wrapper holding dynamic(ssr:false) imports (Next 16 rule)
│   │   ├── blast-radius-panel.tsx   # React Flow mini-graph of nodes a document/change affects
│   │   ├── knowledge-graph.tsx      # React Flow temporal asset graph (Layer 4)
│   │   ├── supersede-action.tsx     # Document supersede form (client, router.refresh on success)
│   │   ├── voice-recorder.tsx       # Mic capture → Blob (MediaRecorder), used by field voice + copilot
│   │   ├── brief-card.tsx · brief-inbox.tsx · brief-detail.tsx   # brief inbox pieces
│   │   ├── theme-toggle.tsx · skeleton.tsx · stub.tsx
│   │   ├── use-role.ts              # useRole() + ADMIN_ROLES / PROMOTE_ROLES / RESOLVE_ROLES / FIELD_ROLES
│   │   └── ui.tsx                   # Primitives: AuthorityBadge, StatusBadge, FilterTabs, Modal, Button, RefusalCard, DemoChip
│   └── lib/
│       ├── api.ts                   # All fetch helpers — SSR-aware API_BASE, live+fixture fetchers, response normalizers
│       ├── auth.ts                  # login(), getMe(), logout() — Supabase token lifecycle (kairos-token key)
│       ├── types.ts                 # All API-derived TypeScript types (single source of truth)
│       ├── idb.ts                   # IndexedDB offline write-queue (OfflineQueue) — flushed on reconnect
│       ├── utils.ts                 # cn(), relativeTime(), nowMs(), slaCountdown(), overdueHours(), etc.
│       ├── fixtures.ts · assets.ts · compliance.ts · copilot.ts · documents.ts · governance.ts · rca.ts   # demo fallbacks
├── Dockerfile                       # node:20-alpine; NEXT_TELEMETRY_DISABLED=1; npm ci at build
├── DESIGN.md                        # Design system (read before building UI)
└── package.json
```

---

## 3. Routes

| Route | Page | Status |
|-------|------|--------|
| `/` | Redirect to `/briefs` | Live |
| `/login` | Email + password login | Live (real auth) |
| `/briefs` | Brief inbox | Live |
| `/briefs/[id]` | Brief detail + ack + feedback | Live |
| `/copilot` | Knowledge Q&A chat | Live |
| `/assets` | Asset list | Live |
| `/assets/[id]` | Asset detail + aliases + knowledge | Live |
| `/rca` | RCA pack generator | Live |
| `/compliance` | Compliance gaps + audit readiness | Live |
| `/governance` | Hub → all 6 governance surfaces | Live (hub page) |
| `/governance/conflicts` | Conflict list + resolve | Live |
| `/governance/quarantine` | Quarantine list + promote/dispute/request-info | Live (role-gated) |
| `/governance/moc` | Management of Change queue | Live |
| `/governance/moc/[id]` | MoC detail (sources joined from linked conflict) + engineer/admin sign-off | Live (`GET/POST /governance/moc/{id}` + `/approve`) |
| `/governance/sla` | SLA report — overdue conflicts + quarantine | Live |
| `/governance/circuit-breaker` | SPC circuit-breaker state by asset class | Live |
| `/governance/model-gate` | Model gate — P/R/F1 history + validation corpus. Run is a ~2.5-min async task: button shows a queued banner, polls history, auto-refreshes | Live (Run = admin) |
| `/compliance/audit-pack` | Audit-evidence pack by clause + human sign-off | Live |
| `/compliance/nonconformance` | Non-conformances (conflicts + failed inspections + disputes) | Composed from existing endpoints |
| `/documents` | Document registry | Live |
| `/documents/[id]` | Document detail + supersede chain | Live |
| `/documents/[id]/topology` | P&ID topology graph (React Flow) | Live |
| `/system-benchmarks` | **Admin.** Measured evidence: model-gate F1 trend, per-entity-type F1, compliance posture, datastore health | Live |
| `/documents/ingest` | Upload → pipeline-status timeline | Live (role-gated engineer/admin) |
| `/documents/compare` | Side-by-side version / metadata diff | Live |
| `/assets/bootstrap` | MDM asset identity confirmation | Live (admin-gated) |
| `/projects` | Engineering + procurement registry by equipment class | Composed from documents+assets+events |
| `/graph` | Temporal knowledge graph (React Flow) | Live |
| `/audit` | Audit trail — entity/action log | Live |
| `/events` | Operational event surfaces + demo emit forms | Live |
| `/events/[id]` | Event detail + ack + correlation | Live |
| `/offboarding` · `/offboarding/[sessionId]` | Retiring-expert knowledge-transfer sessions | Live (role-gated engineer/admin) |
| `/management` | Plant overview — KPIs, alerts, system health | Live |
| `/management/cross-site` | Cross-site pattern alerts | Demo fixture (Layer-13 API in roadmap) |
| `/management/plant-state` | Plant operating-state control | Live (admin-gated write) |
| `/field/deviation` | Physical deviation flag (freezes affected asset briefs) | Live (mobile field capture) |
| `/field/elicitation/[workOrderId]` | Knowledge-capture micro-interview | Live (mobile) |
| `/field/voice` | Ad-hoc voice note — tag an asset/WO, record → quarantine | Live (mobile field capture) |
| `/field/voice/[workOrderId]` | Voice note tied to a specific work order | Live (mobile field capture) |

> **Role-based route access** is enforced centrally in `AppShell`: `routeAllowed(path, role)` +
> `roleHome(role)` in `use-role.ts`. Staff surfaces (`/management`, `/events`, `/rca`, `/graph`,
> `/compliance`, `/governance`, `/audit`, `/documents`, `/projects`, `/offboarding`) require
> engineer/reliability/admin; `/system-health` is **admin-only**. A field worker who navigates to a
> gated URL is redirected to `/briefs`. Open-to-all routes (briefs, copilot, assets, `/field/*`,
> `/settings`, `/system-information`) are unlisted. Field routes render at mobile width; the field
> bottom-tab nav is gated to `field_worker` (see §4).

> Client-only components that must not SSR (React Flow graph, blast-radius, supersede action) are
> loaded via `dynamic(..., { ssr: false })` from the `"use client"` module `components/lazy.tsx` —
> Next 16 disallows `ssr: false` directly inside a Server Component page.

---

## 4. Navigation

`AppShell` (`components/app-shell.tsx`) renders two distinct navigations depending on role and viewport.

**Desktop sidebar** (244px, slide-over drawer on mobile) — shown for `admin` / `engineer` / `reliability`:

- **Operate:** Briefs · Copilot · Assets · RCA · Graph · Events · **Voice · Deviation (admin + field_worker only)**
- **Assure:** Compliance · Governance · Audit trail · Documents · Projects · Off-boarding
- **Manage:** Overview (management)
- **Footer:** System information (all roles) · System health (**admin only**) · System settings

> The field-capture items **Voice** (`/field/voice`) and **Deviation** (`/field/deviation`) are nav-gated to
> `["field_worker", "admin"]` — so the **admin sidebar is a full superset** of every role's navigation.
> Engineer/reliability don't see them (but the header "+" capture button routes anyone to `/field/voice`).

Active route highlighted with `bg-accent-soft text-accent`. User chip at the bottom shows the live authenticated user's name, role, and site from `GET /auth/me`. Sign-out clears tokens and redirects to `/login`. The sidebar logo is `public/logo.png`, a 30px rounded square.

- **`/system-information`** — static visual architecture explainer (pipeline, 13 layers, stack). Open to all.
- **`/system-health`** — admin-only live dashboard: probes all 11 cheap API surfaces + 5 datastores every 30s, plus an opt-in "AI models" section (NIM/Gemini/Jina/Groq) that probes `GET /health/model?provider=…` once/minute **only when toggled on** (each probe spends provider quota; off by default, persisted in `localStorage`).
- **Login** (`/login`) has a **"Try demo"** button that signs straight into the seeded admin account.

**Browser tab titles** — `Kairos: <page>` on every app route (landing/`/login` = `Kairos`). Resolved
server-side by `generateMetadata` in `(app)/layout.tsx`, which reads an `x-pathname` request header set by
**`src/proxy.ts`** (Next 16's renamed middleware — it must set the header on the *request*, not the
response, or `headers()` can't read it, which is why refresh used to fall back to bare "Kairos").

> **Field bottom tabs** (`FieldBottomTabs`) are currently **commented out** in `app-shell.tsx` (mobile UX
> being revisited) — `field_worker` currently uses the same desktop sidebar. The component + `FIELD_ROLES`
> gating remain in code for when it's re-enabled.

---

## 5. Auth

**File:** `src/lib/auth.ts`

Real Supabase-backed login — not a mock bypass.

```
POST /auth/login  →  { access_token, refresh_token, user_id }
```

Tokens stored in `localStorage` under keys `kairos-token` and `kairos-refresh`. `getMe()` calls `GET /auth/me` with `Authorization: Bearer <token>`. `logout()` clears both keys.

**Auth guard** in `AppShell`: no token → redirect to `/login`. `/login` redirects already-authenticated
users to `/briefs`. **Expired/invalid token** (e.g. Supabase JWT past its 1-hour TTL): even in dev
(non-strict) the shell now **clears the session and redirects to `/login`** rather than silently falling
back to the engineer dev-default — that used to read as a surprise role downgrade (`field_worker → engineer`).

**Login page** (`/login`) pre-fills `engineer@kairos.local / KairosEngineer123!` for dev convenience:

| Email | Password | Role |
|-------|----------|------|
| `admin@kairos.local` | `KairosAdmin123!` | admin |
| `engineer@kairos.local` | `KairosEngineer123!` | engineer |
| `field_worker@kairos.local` | `KairosField123!` | field_worker |

Seed with: `docker exec kairos-backend-api python scripts/seed_users.py`

---

## 6. API Client

**File:** `src/lib/api.ts`

### SSR-aware base URL

Server components (assets, briefs, documents, governance/conflicts) run `fetch()` inside the Docker container. `API_BASE` resolves differently depending on environment:

```typescript
export const API_BASE =
  typeof window === "undefined"
    ? (process.env.API_INTERNAL_URL ?? process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000")
    : (process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000");
```

| Context | URL used |
|---------|----------|
| Browser (client components) | `NEXT_PUBLIC_API_URL` = `http://localhost:8000` |
| Server (SSR inside container) | `API_INTERNAL_URL` = `http://kairos-backend-api:8000` |

### Exports

| Export | Purpose |
|--------|---------|
| `API_BASE` | SSR-aware base URL (see above) |
| `getToken()` | Reads `kairos-token` from localStorage; returns null server-side |
| `getJson<T>(path, timeoutMs?)` | Unauthenticated GET — **4000ms** default abort (slow cold Neo4j/Supabase); a genuine failure surfaces as error+retry, never a fixture. `getComplianceGaps` passes 5000ms. |
| `getArtifactUrl(documentId)` | `GET /documents/{id}/artifact-url` — short-lived Supabase **signed URL** to open a vault artifact in the browser (the stored `vault_url` is the auth-only endpoint a plain link can't open). |
| `postJson<T>(path, body)` | Authenticated POST — attaches Bearer token if present |
| `getBriefs()` | `GET /briefs/?unacknowledged_only=false&limit=20` |
| `getBrief(id)` | `GET /briefs/{id}` |
| `getAssets()` | `GET /assets/?limit=100` |
| `getAsset(id)` | `GET /assets/{id}` |
| `getAssetAliases(id)` | `GET /assets/{id}/aliases` |
| `getAssetKnowledge(id)` | `GET /assets/{id}/knowledge` |
| `getComplianceGaps(fw?)` | `GET /compliance/gaps` |
| `getConflicts()` | `GET /governance/conflicts?limit=50` |
| `getQuarantine()` | `GET /governance/quarantine?limit=50` |
| `resolveConflict(id, body)` | `POST /governance/conflicts/{id}/resolve` |
| `promoteQuarantine(id, body)` | `POST /governance/quarantine/{id}/promote` |
| `disputeQuarantine(id, reason)` | `POST /governance/quarantine/{id}/dispute` |
| `getDocuments()` | `GET /documents/?limit=50` |
| `getDocument(id)` | `GET /documents/{id}` |
| `synthesize(query)` | `POST /search/synthesize` |
| `getRcaPack(assetId, code)` | `POST /search/rca-pack` |
| `ackBrief(id, body)` | `POST /briefs/{id}/ack` |
| `sendBriefFeedback(id, rating, notes)` | `POST /briefs/{id}/feedback` |
| `getMoc(id)` | `GET /governance/moc/{id}` |
| `getMocs()` | `GET /governance/moc` |
| `approveMoc(id, note?)` | `POST /governance/moc/{id}/approve` |
| `getSlaReport()` | `GET /governance/sla-report` |
| `getCircuitBreaker()` | `GET /governance/circuit-breaker` |
| `getModelGateHistory()` | `GET /governance/model-gate/history` |
| `runModelGate()` | `POST /governance/model-gate/run` |
| `getValidationCorpusStats()` | `GET /governance/validation-corpus/stats` |
| `getKnowledgeGraph(assetId, asOf?)` | `GET /graph/asset/{id}?as_of=…` |
| `getAuditLog(entityId?, type?)` | `GET /audit/log` |
| `getDocumentTopology(id)` | `GET /documents/{id}/topology` |
| `getPlantState(siteId)` | `GET /events/plant-state/{site_id}` |
| `setPlantState(body)` | `POST /events/plant-state` |
| `getComplianceDashboard()` | `GET /compliance/dashboard` |
| `getBlastRadius(documentId)` | `GET /governance/blast-radius/{doc_id}` — **normalized** (see below) |
| `getAuditPack(framework)` | `GET /compliance/audit-pack?framework=…` |
| `getEvents()` / `getEvent(id)` / `ackEvent(id)` | operational event surfaces |
| `postTagOut / postAlarm / postShiftHandover / postInspectionComplete / postDeviationFlag` | demo event emitters |
| `getMocList()` / `getMoc(id)` / `approveMoc(id)` | Management of Change |
| `ingestDocument(form)` / `getDocumentStatus(id)` / `supersedeDocument(id, form)` | document ingest + pipeline status + supersede |
| `confirmAssetIdentity(...)` | MDM identity confirmation (asset bootstrap) |
| `triggerElicitation / getElicitationQuestions / submitElicitationResponses` | field micro-interview |
| `getOffboardingList / getOffboarding / getOffboardingQuestions / submitOffboardingResponses / createOffboarding` | retiring-expert knowledge transfer |
| `submitVoiceNote(id, blob, user)` | `POST /elicitation/{id}/voice` (field name `file`) |
| `createAnnotation / getAnnotations / getAnnotationStats` | inline document annotation |
| `getGovernorState / getPlantState / setPlantState / getHealthDetailed / getOtCoverage` | ops + system state |

### Response normalizers

Several backend endpoints return a shape that does not match the flat type the UI consumes. Rather than
scatter mapping logic across components, the **fetcher normalizes the response** (adapter pattern) so
components stay dumb:

| Fetcher | Backend shape → UI shape |
|---|---|
| `getBlastRadius` | `{affected:[{edge,source,target}]}` → `{items:[{item_id,item_type,description,asset_id,flagged_for_review}]}`. The affected entity is the edge **source** (e.g. the asset), not the target (the document node); items are deduped by `edge_id` server-side. |
| `getDocumentTopology` | `{topology:{equipment_nodes,isolation_valves,isolation_boundaries,instrumentation_loops}}` → flat `{nodes,edges}` (synthesises boundary→valve/bleed edges) |
| `getOffboardingList` | `{items,total}` → `OffboardingProgramme[]` (unwraps `.items`) |

Types corrected to mirror the real backend contract (verify with a live `curl` before trusting a type):
`ComplianceDashboard.total_gaps` is `{critical,major,minor}` (an object, not a number); `SlaReport` is an
escalation report (`overdue_conflicts[]` · `overdue_quarantine_items[]` · `overdue_*_total` ·
`escalated_this_run` · `checked_at`; no on-time tallies); `CircuitBreakerState` is `{states[],halted_count}`
with boolean `halted`; `ValidationCorpusStats` is `{total_corpus_size,by_entity_type,last_updated_at}` (no
`by_asset_class`).

### Live-only data policy (no fabricated data)

The app **never renders a fixture**. Read fetchers still return `{ data, source }` and a fixture is still
computed on failure, but the UI discards the `source: "demo"` path — the user always sees **real data**, a
**loading skeleton**, or an **error + retry**:

- **`useFetch` maps `demo` → `error`** (client pages) → their error+retry state; loading → skeleton.
- **Server pages `throw` on `demo`** → shared `(app)/error.tsx` + `(app)/loading.tsx`. `(app)/layout.tsx`
  exports `dynamic = "force-dynamic"` so these render per request (a build-time prerender would otherwise
  hit the throw with no backend).
- **Custom-client pages** show an inline "unavailable — retry".
- **`getComplianceGaps`** treats empty live results as valid (no fixture on empty) and uses a 5 s timeout.
- **`/management/cross-site`** shows an honest "no data in single-site deployment" state (it has no backend).
- **`synthesize()` and `getRcaPack()` throw** — they return a bare value, not `Fetched<>`, so
  `useFetch`'s guard never covered them. They previously returned a hardcoded answer with invented
  document IDs on any failure, rendered identically to a real cited answer. `/copilot` now shows a
  per-turn `AnswerError` (`role="alert"` + Retry) and `/rca` its existing `failed` state. Zero
  search results is a real outcome: `{answer: null, sources: []}`, never a fixture.
- **`/documents/[id]/topology` discloses backend fixture use.** The ingest pipeline falls back to
  `fixtures/pid_topology_mock.json` when the vision model is unreachable, stamping
  `topology_source: "demo_fixture"`. That returns `source: "live"` with plausible-looking elements,
  so it used to render as if the drawing had been parsed. `getDocumentTopology` now carries the flag
  through and the page badges it **"Fixture — vision model unavailable"**.

Default read timeout is **4 s** (`getJson`). Guard array reads defensively — `x?.arr.length` still throws
when `arr` is `undefined` (use `?? []`). The `DemoChip` primitive and remaining `lib/*.ts` fixture modules
are effectively dead (optional cleanup); the copilot fixtures were deleted outright and `rcaFor` is
test-only — see `FIXTURES.md`.

---

## 7. Types

**File:** `src/lib/types.ts` — single source of truth derived from the backend Pydantic shapes.

Key types:

| Type | Description |
|------|-------------|
| `Role` | `"admin" \| "engineer" \| "reliability" \| "field_worker"` |
| `AuthorityLevel` | `1–5` (lower = higher authority, per Architecture Layer 4) |
| `Brief` | Full brief shape including sources, warnings, countersignature flag, freeze state |
| `BriefsResponse` | Brief list + `governor_state` + `suppressed_count` + `next_delivery_allowed_at` |
| `GovernorState` | `push_count_last_hour`, `ceiling`, `state` |
| `Asset` / `AssetDetail` | Asset list item vs full detail with `open_work_orders_count`, `compliance_gap_count` |
| `KnowledgeConflict` / `QuarantineItem` | Governance types with `sla_due_at`, `is_overdue` |
| `VaultDocument` | Document with `vault_url`, `ocr_confidence`, supersede chain |
| `SynthesizeResponse` | Copilot answer shape from `POST /search/synthesize` |
| `RcaPack` | Timeline + hypotheses + supporting docs from `POST /search/rca-pack` |
| `ListEnvelope<T>` | `{ items, total, limit, offset }` — standard list shape |

---

## 8. Shared UI Primitives

**File:** `src/components/ui.tsx`

| Component | Props | Renders |
|-----------|-------|---------|
| `AuthorityBadge` | `level: AuthorityLevel` | Coloured badge: L1=verified green → L5=unverified orange |
| `StatusBadge` | `tone: "verified" \| "caution" \| "danger" \| "neutral"` | Pill badge |
| `SourceChip` | `quarantine?: boolean` | Document ID chip; orange ring if quarantine |
| `Modal` | `open, onClose, title, children` | Overlay modal for promote/dispute actions |
| `Button` | `variant, size, onClick` | Primary/ghost button with active press state |

**File:** `src/components/use-role.ts`

`useRole()` — reads role from live user profile via `getMe()`. `PROMOTE_ROLES = ["reliability", "admin"]`
(matches OPA `can_promote_quarantine` — engineers resolve conflicts but do **not** promote quarantine).
`ADMIN_ROLES = ["admin"]` gates Identity confirmation, plant-state write, model-gate Run, System Health, and System Benchmarks.

**`SystemTabs` (`components/system-tabs.tsx`)** joins the four system surfaces — Information · Health · Benchmarks · Settings — into one tabbed section, rendered at the top of each. Admin-only tabs are hidden for non-admins; `routeAllowed` remains the enforcement point. `usePathname()` is guarded with `?? ""` because it returns null without router context.

**File:** `src/components/skeleton.tsx`

`PageSkeleton` — shared loading placeholder used by `(app)/loading.tsx`.

---

## 9. Fixture Data

> **⚠️ Live-only (see §6).** These fixture modules are **no longer rendered** — the app shows real data, a
> skeleton, or an error+retry. They remain in the tree as dead code (optional cleanup). Listed here for
> reference only.
>
> **Exceptions to the list below:** `copilot.ts` no longer contains fixtures at all — the `SEAL`,
> `PRESSURE_REFUSAL`, `ISOLATION`, `GENERIC` answers and `answerFor()` were deleted, leaving types and
> `SUGGESTIONS`. `rca.ts` keeps `rcaFor()` and its packs but they are **TEST-ONLY** (mocking
> `getRcaPack` in `rca/page.test.tsx`); importing them from `api.ts` would reintroduce fabricated
> hypotheses on failure.

All fixture modules mirror the exact API shapes.

| Module | Stands in for |
|--------|--------------|
| `fixtures.ts` | `GET /briefs/` |
| `assets.ts` | `GET /assets/`, `GET /assets/{id}`, `GET /assets/{id}/knowledge` |
| `compliance.ts` | `GET /compliance/gaps`, `GET /compliance/dashboard` |
| `copilot.ts` | `POST /search/synthesize` |
| `documents.ts` | `GET /documents/`, `GET /documents/{id}` |
| `governance.ts` | `GET /governance/conflicts`, `GET /governance/quarantine` |
| `rca.ts` | `POST /search/rca-pack` |

Fixture assets (legacy; the golden dataset uses `EQ-101`, `HE-301`, `V-247`, `PG-18` — some fixtures were
realigned to those canonical tags, `P-101` is a confirmed alias of `EQ-101`).

---

## 10. Data source — live-only

Every data page is **live** (real backend data). There is no "demo fallback" column anymore: when a fetch
fails, the page shows a **loading skeleton** then an **error + retry**, never a fixture (see §6). The
`/management` overview aggregates **5 core live fetches** (conflicts · quarantine · SLA · compliance · events);
**system health is fetched separately** on its own `useFetch` so a slow/failed cloud ping (`/health/detailed`
pings every store, ~2.5s) shows an inline "unavailable" strip instead of blanking the whole page. `/governance`
hub + `/management/cross-site` are the only surfaces with no primary data fetch (hub = static links;
cross-site = honest "no data in single-site").

Write contracts (resolve/promote/dispute, ingest, sign-off) are role-gated: `field_worker` sees a read-only
view; action buttons are hidden via `useRole()`. **Quarantine promote** is `reliability`/`admin` only
(matches OPA); **model-gate Run** and **asset Identity confirmation** are `admin` only.

---

## 11. Design Tokens

Defined in `globals.css` as CSS custom properties, available to all Tailwind utilities.

| Token | Role |
|-------|------|
| `--canvas` | Page background |
| `--surface` | Card/sidebar background |
| `--surface-2` | Nested card background |
| `--line` | Border colour |
| `--ink` | Primary text |
| `--muted` | Secondary text |
| `--accent` | Brand colour (Kairos Orange) |
| `--accent-soft` | Tinted accent background |
| `--on-accent` | Text on accent backgrounds |
| `--verified` | Green (authority verified) |
| `--caution` | Amber (unverified / warning) |
| `--danger` | Red (refused / critical) |

Light and dark values are set via `[data-theme=light]` / `[data-theme=dark]` on `<html>`. Theme is persisted in `localStorage` under `kairos-theme`.

---

## 12. Docker

```dockerfile
FROM node:20-alpine
ENV NEXT_TELEMETRY_DISABLED=1
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci                      # deps installed at image build time
COPY . .
EXPOSE 3000
CMD ["npm", "run", "dev"]       # Next.js dev server with HMR
```

**docker-compose mounts** (hot-reload without reinstalling deps):
```yaml
volumes:
  - ./frontend/src:/app/src
  - ./frontend/public:/app/public
  # node_modules stays inside the image layer
```

**Env vars:**
```
NEXT_PUBLIC_API_URL=http://localhost:8000   # browser → host port-mapping; embedded at next build
API_INTERNAL_URL=http://kairos-backend-api:8000  # SSR → Docker internal network
NODE_ENV=development
```

Healthcheck polls `http://localhost:3000` every 30s; 90s start period for initial `npm run dev` boot.

**Rebuild required** when `package.json` or `package-lock.json` changes:
```bash
docker compose up -d --no-deps --build kairos-frontend
```

---

## 13. CI/CD

`.github/workflows/frontend.yml` runs on every push/PR that touches `frontend/` or the workflow file itself. Four jobs, all path-filtered:

| Job | Command | What it checks |
|-----|---------|----------------|
| `typecheck` | `npx tsc --noEmit` | TypeScript strict — zero errors required |
| `lint` | `npm run lint` | ESLint (Next.js config) — zero errors required |
| `build` | `npm run build` | Full Next.js production build — catches missing imports, invalid RSC boundaries |
| `audit` | `npm audit --audit-level=high` | Dependency CVEs at high/critical severity |

All four jobs run in parallel on `ubuntu-latest` with `node:20` and `npm ci` from the lockfile. No secrets are needed for these checks.

---

## 14. Quality Status

| Check | Status |
|-------|--------|
| TypeScript strict (`tsc --noEmit`) | ✅ 0 errors |
| No `console.log` in src | ✅ clean |
| No hardcoded hex in DOM (canvas exempt) | ✅ clean |
| No `key={index}` on dynamic lists | ✅ clean |
| `useEffect` cleanup (`alive` pattern) | ✅ all async effects have cleanup |
| `h-screen` → `h-dvh` | ✅ converted |
| Token colors only (no `bg-white`, `text-gray-*`) | ✅ clean |
| `@xyflow/react` in `package-lock.json` | ✅ resolved |
| All 36 FE tasks TypeScript-clean | ✅ verified in container |

---

## 15. Progressive Web App / Offline

The offline shell is a **production-only** feature. `public/sw.js` is registered from `AppShell`
**only when `process.env.NODE_ENV === "production"`**; in development it is actively unregistered,
because a cached app shell fights Next.js HMR (stale chunk hashes trigger a hard reload that re-serves
the stale cache — an infinite refresh loop). The service worker uses **network-first for navigations**
(cache is an offline fallback only) and stale-while-revalidate for static assets; bump the `SHELL`
cache version to bust a poisoned cache.

The IndexedDB write-queue (`lib/idb.ts`, `OfflineQueue`) is app-level (not the SW) and works in dev:
writes made offline are queued and flushed on the `online` event; the queued count shows in the shell.

---

## 16. Intentional Non-Goals

These are deliberate decisions, not open gaps — the UI handles each honestly today:

| Item | Decision |
|------|----------|
| `/management/cross-site` live data | Cross-site pattern aggregation is a **Layer-13 roadmap** feature and needs multi-site data. This is a single-site deployment, so the page shows an honest **"No cross-site data in this deployment"** empty state — no fabricated alerts. |
| SSR bearer token | Server components use the backend **dev-bypass** on purpose (fast, demo-friendly). Wire `getToken()` through SSR only if a strict-auth deployment needs it. |
| Offline app-shell | **Prod-only by design** — the service worker is disabled in dev (it fought HMR). The IndexedDB write-queue (`idb.ts`) works in dev. |

**Browser verification:** ✅ complete. Every desktop route + all field routes verified against the golden
dataset (admin + `field_worker` sessions). Seven live-data crashes were found and fixed during the sweep
(now guarded by `tests/test_contract.py`) — see the response-normalizer note in §6 and `AGENTS.md`
"Known Pitfalls".
