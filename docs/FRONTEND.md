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
| `/briefs` | Brief inbox | Live with fixture fallback |
| `/briefs/[id]` | Brief detail + ack + feedback | Live with fixture fallback |
| `/copilot` | Knowledge Q&A chat | Live with fixture fallback |
| `/assets` | Asset list | Live with fixture fallback |
| `/assets/[id]` | Asset detail + aliases + knowledge | Live with fixture fallback |
| `/rca` | RCA pack generator | Live with fixture fallback |
| `/compliance` | Compliance gaps + audit readiness | Live with fixture fallback |
| `/governance` | Hub → all 6 governance surfaces | Live (hub page) |
| `/governance/conflicts` | Conflict list + resolve | Live with fixture fallback |
| `/governance/quarantine` | Quarantine list + promote/dispute/request-info | Live with fixture fallback (role-gated) |
| `/governance/moc` | Management of Change queue | Live with fixture fallback |
| `/governance/moc/[id]` | MoC detail + source comparison + engineer sign-off | Live with fixture fallback (admin-gated write) |
| `/governance/sla` | SLA report — overdue conflicts + quarantine | Live with fixture fallback |
| `/governance/circuit-breaker` | SPC circuit-breaker state by asset class | Live with fixture fallback |
| `/governance/model-gate` | Model gate — P/R/F1 history + validation corpus | Live with fixture fallback |
| `/compliance/audit-pack` | Audit-evidence pack by clause + human sign-off | Live with fixture fallback |
| `/compliance/nonconformance` | Non-conformances (conflicts + failed inspections + disputes) | Composed from existing endpoints |
| `/documents` | Document registry | Live with fixture fallback |
| `/documents/[id]` | Document detail + supersede chain | Live with fixture fallback |
| `/documents/[id]/topology` | P&ID topology graph (React Flow) | Live with fixture fallback |
| `/documents/ingest` | Upload → pipeline-status timeline | Live (role-gated engineer/admin) |
| `/documents/compare` | Side-by-side version / metadata diff | Live with fixture fallback |
| `/assets/bootstrap` | MDM asset identity confirmation | Live (admin-gated) |
| `/projects` | Engineering + procurement registry by equipment class | Composed from documents+assets+events |
| `/graph` | Temporal knowledge graph (React Flow) | Live with fixture fallback |
| `/audit` | Audit trail — entity/action log | Live with fixture fallback |
| `/events` | Operational event surfaces + demo emit forms | Live with fixture fallback |
| `/events/[id]` | Event detail + ack + correlation | Live with fixture fallback |
| `/offboarding` · `/offboarding/[sessionId]` | Retiring-expert knowledge-transfer sessions | Live (role-gated engineer/admin) |
| `/management` | Plant overview — KPIs, alerts, system health | Live with fixture fallback |
| `/management/cross-site` | Cross-site pattern alerts | Demo fixture (Layer-13 API in roadmap) |
| `/management/plant-state` | Plant operating-state control | Live with fixture fallback (admin-gated write) |
| `/field/deviation` | Physical deviation flag (freezes affected asset briefs) | Live (mobile field capture) |
| `/field/elicitation/[workOrderId]` | Knowledge-capture micro-interview | Live with fixture fallback (mobile) |
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

- **Operate:** Briefs · Copilot · Assets · RCA · Graph · Events
- **Assure:** Compliance · Governance · Audit trail · Documents · Projects · Off-boarding
- **Manage:** Overview (management)
- **Footer:** System information (all roles) · System health (**admin only**) · System settings

Active route highlighted with `bg-accent-soft text-accent`. User chip at the bottom shows the live authenticated user's name, role, and site from `GET /auth/me`. Sign-out clears tokens and redirects to `/login`. The sidebar logo is `public/logo.png`, a 30px rounded square.

- **`/system-information`** — static visual architecture explainer (pipeline, 13 layers, stack). Open to all.
- **`/system-health`** — admin-only live dashboard: probes all 11 cheap API surfaces + 5 datastores every 30s, plus an opt-in "AI models" section (NIM/Gemini/Jina/Groq) that probes `GET /health/model?provider=…` once/minute **only when toggled on** (each probe spends provider quota; off by default, persisted in `localStorage`).
- **Login** (`/login`) has a **"Try demo"** button that signs straight into the seeded admin account. Browser tab titles are `Kairos: <page>` (landing = `Kairos`).

**Field bottom tabs** (`FieldBottomTabs` in `app-shell.tsx`) — shown **only for `field_worker`** at mobile width, replacing the sidebar with a fixed bottom bar:

| Tab | Target |
|---|---|
| Briefs | `/briefs` |
| Copilot | `/copilot` |
| Assets | `/assets` |
| Voice | `/field/voice` |
| **Me** | **sign-out** (`onClick={onSignOut}`) — the field app has no profile screen; "Me" logs out |

Role is read from `getMe()` (`FIELD_ROLES = ["field_worker"]`, `isField` gate). Verified against `field_worker@kairos.local`.

---

## 5. Auth

**File:** `src/lib/auth.ts`

Real Supabase-backed login — not a mock bypass.

```
POST /auth/login  →  { access_token, refresh_token, user_id }
```

Tokens stored in `localStorage` under keys `kairos-token` and `kairos-refresh`. `getMe()` calls `GET /auth/me` with `Authorization: Bearer <token>`. `logout()` clears both keys.

**Auth guard** in `AppShell`: no token → redirect to `/login`. `/login` redirects already-authenticated users to `/briefs`.

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
| `getJson<T>(path)` | Unauthenticated GET — 1500ms abort timeout for fast fixture fallback |
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
| `getBlastRadius` | `{affected:[{edge,target}]}` → `{items:[{item_id,item_type,description,asset_id,flagged_for_review}]}` |
| `getDocumentTopology` | `{topology:{equipment_nodes,isolation_valves,isolation_boundaries,instrumentation_loops}}` → flat `{nodes,edges}` (synthesises boundary→valve/bleed edges) |
| `getOffboardingList` | `{items,total}` → `OffboardingProgramme[]` (unwraps `.items`) |

Types corrected to mirror the real backend contract (verify with a live `curl` before trusting a type):
`ComplianceDashboard.total_gaps` is `{critical,major,minor}` (an object, not a number); `SlaReport` is an
escalation report (`overdue_conflicts[]` · `overdue_quarantine_items[]` · `overdue_*_total` ·
`escalated_this_run` · `checked_at`; no on-time tallies); `CircuitBreakerState` is `{states[],halted_count}`
with boolean `halted`; `ValidationCorpusStats` is `{total_corpus_size,by_entity_type,last_updated_at}` (no
`by_asset_class`).

### Fixture fallback pattern

Every fetcher follows `try { live } catch { fixture }`. If the backend is unreachable, returns too-empty results, or times out (1500ms), the page falls back to curated demo data tagged `source: "demo"`. A source chip (`DemoChip`) in the UI indicates when demo data is active. Guard array reads defensively — `x?.arr.length` still throws when `arr` is `undefined`.

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

`useRole()` — reads role from live user profile via `getMe()`. `PROMOTE_ROLES` exports the list of roles that can promote quarantine items (`["admin", "engineer"]`).

**File:** `src/components/skeleton.tsx`

`PageSkeleton` — shared loading placeholder used by `(app)/loading.tsx`.

---

## 9. Fixture Data

All fixture modules mirror the exact API shapes. They serve two purposes:
1. Offline/demo mode when the backend is unreachable or returns empty data
2. Stand-in for management overview (not yet wired live)

| Module | Stands in for |
|--------|--------------|
| `fixtures.ts` | `GET /briefs/` |
| `assets.ts` | `GET /assets/`, `GET /assets/{id}`, `GET /assets/{id}/knowledge` |
| `compliance.ts` | `GET /compliance/gaps`, `GET /compliance/dashboard` |
| `copilot.ts` | `POST /search/synthesize` |
| `documents.ts` | `GET /documents/`, `GET /documents/{id}` |
| `governance.ts` | `GET /governance/conflicts`, `GET /governance/quarantine` |
| `rca.ts` | `POST /search/rca-pack` |

Fixture assets: `P-101` (Feed Pump A), `EQ-101` (Reactor Feed Unit), `V-247` (Isolation Valve), `HX-301` (Heat Exchanger).

---

## 10. Live vs Demo — Page-by-Page

| Page | Live API calls | Demo fallback |
|------|---------------|----------------|
| `/login` | `POST /auth/login` ✅ | — |
| `/briefs` | `GET /briefs/` ✅ | `fixtureBriefs` (governor suppression / empty) |
| `/briefs/[id]` | `GET /briefs/{id}` ✅ · `POST .../ack` ✅ · `POST .../feedback` ✅ | fixture match by id |
| `/copilot` | `POST /search/synthesize` ✅ | `answerFor()` (empty live answer / backend down) |
| `/assets` | `GET /assets/?limit=100` ✅ | `fixtureAssets` |
| `/assets/[id]` | `GET /assets/{id}` ✅ · `/aliases` ✅ · `/knowledge` ✅ | fixture match by id |
| `/rca` | `POST /search/rca-pack` ✅ | `rcaFor()` (backend 5xx / no timeline) |
| `/compliance` | `GET /compliance/gaps` ✅ | `complianceFixture` (empty live gaps) |
| `/governance` | — | hub page (static links) |
| `/governance/conflicts` | `GET /governance/conflicts` ✅ · `POST .../resolve` ✅ | `conflictsFixture` |
| `/governance/quarantine` | `GET /governance/quarantine` ✅ · `POST .../promote` ✅ · `POST .../dispute` ✅ | `quarantineFixture` |
| `/documents` | `GET /documents/?limit=50` ✅ | `documentsFixture` |
| `/documents/[id]` | `GET /documents/{id}` ✅ | `getDocumentFixture(id)` |
| `/management` | — | fixture (aggregate wiring deferred) |

Write contracts (resolve/promote/dispute) are role-gated: `field_worker` sees read-only view; action buttons are hidden via `useRole()`.

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
| `/management/cross-site` live data | Cross-site pattern aggregation is a **Layer-13 roadmap** feature and needs multi-site data (the demo is single-site). The page renders curated fixtures behind a **DemoChip** — honest, not broken. |
| SSR bearer token | Server components use the backend **dev-bypass** on purpose (fast, demo-friendly). Wire `getToken()` through SSR only if a strict-auth deployment needs it. |
| Offline app-shell | **Prod-only by design** — the service worker is disabled in dev (it fought HMR). The IndexedDB write-queue (`idb.ts`) works in dev. |

**Browser verification:** ✅ complete. Every desktop route + all field routes verified against the golden
dataset (admin + `field_worker` sessions). Seven live-data crashes were found and fixed during the sweep
(now guarded by `tests/test_contract.py`) — see the response-normalizer note in §6 and `AGENTS.md`
"Known Pitfalls".
