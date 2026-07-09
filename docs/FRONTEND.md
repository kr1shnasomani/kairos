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
│   └── logo.jpeg                    # Brand logo — served at /logo.jpeg; favicon source
├── src/
│   ├── app/
│   │   ├── icon.jpeg                # Auto-favicon (Next.js App Router convention)
│   │   ├── layout.tsx               # Root layout — globals, font, theme, favicon metadata
│   │   ├── page.tsx                 # Root redirect → /briefs
│   │   ├── globals.css              # Design tokens (CSS vars: --accent, --ink, --muted, etc.)
│   │   ├── not-found.tsx            # On-theme 404 page
│   │   ├── login/page.tsx           # Login screen (real auth → POST /auth/login)
│   │   └── (app)/                   # Authenticated route group
│   │       ├── layout.tsx           # Wraps all authenticated pages in <AppShell>
│   │       ├── loading.tsx          # Shared page skeleton (Next.js Suspense boundary)
│   │       ├── error.tsx            # Shared error boundary (role=alert + reset)
│   │       ├── briefs/
│   │       │   ├── page.tsx         # Brief inbox (live + fixture fallback)
│   │       │   └── [id]/page.tsx    # Brief detail + ack + feedback
│   │       ├── copilot/page.tsx     # Knowledge copilot (live POST /search/synthesize + fixture fallback)
│   │       ├── assets/
│   │       │   ├── page.tsx         # Asset list (live GET /assets/ + fixture fallback)
│   │       │   └── [id]/page.tsx    # Asset detail + aliases + knowledge (live + fixture fallback)
│   │       ├── rca/page.tsx         # RCA pack (live POST /search/rca-pack + fixture fallback)
│   │       ├── compliance/page.tsx  # Compliance gaps + dashboard (live + fixture fallback)
│   │       ├── governance/
│   │       │   ├── page.tsx         # Governance hub — links to conflicts + quarantine
│   │       │   ├── conflicts/page.tsx   # Conflict list + resolve action (live + fixture fallback)
│   │       │   └── quarantine/page.tsx  # Quarantine list + promote/dispute (live + fixture fallback, role-gated)
│   │       ├── documents/
│   │       │   ├── page.tsx         # Document registry (live GET /documents/ + fixture fallback)
│   │       │   └── [id]/page.tsx    # Document detail + supersede chain (live + fixture fallback)
│   │       └── management/page.tsx  # Overview dashboard (fixture)
│   ├── components/
│   │   ├── app-shell.tsx            # Sidebar nav + mobile drawer + user chip + auth guard + sign-out
│   │   ├── blast-radius-panel.tsx   # React Flow mini-graph showing documents/assets affected by a conflict
│   │   ├── brief-card.tsx           # Single brief row in the inbox
│   │   ├── brief-inbox.tsx          # List of BriefCards with priority grouping
│   │   ├── brief-detail.tsx         # Full brief view with sources + ack form
│   │   ├── knowledge-graph.tsx      # React Flow temporal asset graph (Layer 4)
│   │   ├── skeleton.tsx             # Shared PageSkeleton component
│   │   ├── stub.tsx                 # Placeholder component for unbuilt pages
│   │   ├── theme-toggle.tsx         # Light/dark toggle
│   │   ├── use-role.ts              # ADMIN_ROLES, PROMOTE_ROLES, RESOLVE_ROLES constants + useRole() hook
│   │   └── ui.tsx                   # Shared primitives: AuthorityBadge, StatusBadge, FilterTabs, Modal, Button, RefusalCard
│   └── lib/
│       ├── api.ts                   # All fetch helpers — SSR-aware API_BASE, live+fixture fetchers, postJson
│       ├── auth.ts                  # login(), getMe(), logout() — Supabase token lifecycle
│       ├── types.ts                 # All API-derived TypeScript types (single source of truth)
│       ├── fixtures.ts              # fixtureBriefs — demo BriefsResponse for offline mode
│       ├── assets.ts                # Fixture Asset[] + getAsset() helper
│       ├── compliance.ts            # Live/fixture ComplianceGapsResponse (OISD-117 + ISO 45001)
│       ├── copilot.ts               # Fixture CopilotAnswer map + answerFor() matcher
│       ├── documents.ts             # Fixture DocumentsResponse + getDocumentFixture()
│       ├── governance.ts            # Fixture conflictsFixture + quarantineFixture
│       ├── rca.ts                   # Fixture RcaPack presets + rcaFor() matcher
│       └── utils.ts                 # cn(), relativeTime(), triggerLabel(), criticalityMeta()
├── Dockerfile                       # node:20-alpine; NEXT_TELEMETRY_DISABLED=1; npm ci at build
├── .dockerignore
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
| `/documents` | Document registry | Live with fixture fallback |
| `/documents/[id]` | Document detail + supersede chain | Live with fixture fallback |
| `/documents/[id]/topology` | P&ID topology graph (React Flow) | Live with fixture fallback |
| `/graph` | Temporal knowledge graph (React Flow) | Live with fixture fallback |
| `/audit` | Audit trail — entity/action log | Live with fixture fallback |
| `/management` | Plant overview — KPIs, alerts, system health | Live with fixture fallback |
| `/management/cross-site` | Cross-site pattern alerts | Demo fixture (Layer-13 API in roadmap) |
| `/management/plant-state` | Plant operating-state control | Live with fixture fallback (admin-gated write) |

---

## 4. Navigation

`AppShell` (`components/app-shell.tsx`) renders a 244px sidebar on desktop and a slide-over drawer on mobile.

**Operate group:** Briefs · Copilot · Assets · RCA

**Assure group:** Compliance · Governance · Documents · Graph · Audit trail

**Manage group:** Overview (management)

Active route highlighted with `bg-accent-soft text-accent`. User chip at the bottom shows the live authenticated user's name, role, and site from `GET /auth/me`. Sign-out button clears tokens and redirects to `/login`. Staff-only routes (RCA, Compliance, Governance, Documents, Overview) are hidden for `field_worker` role.

The sidebar logo is `public/logo.jpeg` (the Kairos orange brand mark), rendered as a 30px rounded square.

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
| `getBlastRadius(documentId)` | `GET /governance/blast-radius/{doc_id}` |

### Fixture fallback pattern

Every fetcher follows `try { live } catch { fixture }`. If the backend is unreachable, returns too-empty results, or times out (1500ms), the page falls back to curated demo data tagged `source: "demo"`. A source chip in the UI indicates when demo data is active.

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
NEXT_PUBLIC_API_URL=http://localhost:8000   # browser → host port-mapping
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

## 15. Remaining Work

| Item | Notes |
|------|-------|
| Bearer token on SSR reads | Server components rely on backend dev-bypass. Wire `getToken()` for SSR when `NEXT_PUBLIC_AUTH_STRICT=true` |
| Browser verification pass | Run `make dev`, load every route in Chrome, confirm DemoChip, PTW flow, GovernorPill, ContrastToggle |
