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
| API | `fetch` against `NEXT_PUBLIC_API_URL` (default `http://localhost:8000`) |
| Container | `node:20-alpine`; `npm ci` at build time; `src/` + `public/` hot-reloaded via volume mount |

---

## 2. Folder Structure

```
frontend/
├── src/
│   ├── app/
│   │   ├── layout.tsx               # Root layout — globals, font, theme
│   │   ├── page.tsx                 # Root redirect → /briefs
│   │   ├── globals.css              # Design tokens (CSS vars: --accent, --ink, --muted, etc.)
│   │   ├── login/page.tsx           # Login screen (real auth → POST /auth/login)
│   │   └── (app)/                   # Authenticated route group
│   │       ├── layout.tsx           # Wraps all authenticated pages in <AppShell>
│   │       ├── briefs/
│   │       │   ├── page.tsx         # Brief inbox (live + fixture fallback)
│   │       │   └── [id]/page.tsx    # Brief detail
│   │       ├── copilot/page.tsx     # Knowledge copilot chat (fixture stand-in)
│   │       ├── assets/
│   │       │   ├── page.tsx         # Asset list (fixture)
│   │       │   └── [id]/page.tsx    # Asset detail + knowledge edges (fixture)
│   │       ├── rca/page.tsx         # Root Cause Analysis pack (fixture)
│   │       ├── compliance/page.tsx  # Compliance gaps + dashboard (fixture)
│   │       ├── governance/page.tsx  # Stub — conflicts, quarantine, MoC, SLA
│   │       ├── documents/page.tsx   # Stub — document list + status
│   │       └── management/page.tsx  # Overview dashboard (stub)
│   ├── components/
│   │   ├── app-shell.tsx            # Sidebar nav + mobile drawer + user chip
│   │   ├── brief-card.tsx           # Single brief row in the inbox
│   │   ├── brief-inbox.tsx          # List of BriefCards with priority grouping
│   │   ├── brief-detail.tsx         # Full brief view with sources + ack form
│   │   ├── stub.tsx                 # Placeholder component for unbuilt pages
│   │   ├── theme-toggle.tsx         # Light/dark toggle
│   │   └── ui.tsx                   # Shared primitives: AuthorityBadge, StatusBadge, SourceChip
│   └── lib/
│       ├── api.ts                   # fetch helpers, getBriefs, getBrief, postJson, ackBrief, sendBriefFeedback
│       ├── auth.ts                  # login(), getMe(), logout() — Supabase token lifecycle
│       ├── types.ts                 # All API-derived TypeScript types
│       ├── fixtures.ts              # fixtureBriefs — demo BriefsResponse for offline mode
│       ├── assets.ts                # Fixture Asset[] + getAsset() helper
│       ├── compliance.ts            # Fixture ComplianceSummary (OISD-117 + ISO 45001 gaps)
│       ├── copilot.ts               # Fixture CopilotAnswer map + answerFor() matcher
│       ├── rca.ts                   # Fixture RcaPack presets + rcaFor() matcher
│       └── utils.ts                 # cn() — className merge utility
├── Dockerfile                       # node:20-alpine; npm ci at build; dev server at runtime
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
| `/briefs/[id]` | Brief detail + ack | Live with fixture fallback |
| `/copilot` | Knowledge Q&A chat | Fixture stand-in |
| `/assets` | Asset list | Fixture |
| `/assets/[id]` | Asset detail + knowledge | Fixture |
| `/rca` | RCA pack generator | Fixture |
| `/compliance` | Compliance gaps + audit readiness | Fixture |
| `/governance` | Conflicts, quarantine, MoC, SLA | Stub |
| `/documents` | Document list + ingestion status | Stub |
| `/management` | Platform overview | Stub |

---

## 4. Navigation

`AppShell` (`components/app-shell.tsx`) renders a 244px sidebar on desktop and a slide-over drawer on mobile.

**Operate group:** Briefs · Copilot · Assets · RCA

**Assure group:** Compliance · Governance · Documents · Overview

Active route highlighted with `bg-accent-soft text-accent`. User chip at the bottom (hardcoded to "R. Shah / Engineer / SITE_001" — pending real auth integration).

---

## 5. Auth

**File:** `src/lib/auth.ts`

Real Supabase-backed login — not a mock bypass.

```
POST /auth/login  →  { access_token, refresh_token, user_id }
```

Tokens stored in `localStorage` under keys `kairos-token` and `kairos-refresh`. `getMe()` calls `GET /auth/me` with `Authorization: Bearer <token>`. `logout()` clears both keys.

**Login page** (`/login`) pre-fills `engineer@kairos.local / KairosEngineer123!` for dev convenience. All three seeded roles work:

| Email | Password | Role |
|-------|----------|------|
| `admin@kairos.local` | `KairosAdmin123!` | admin |
| `engineer@kairos.local` | `KairosEngineer123!` | engineer |
| `field_worker@kairos.local` | `KairosField123!` | field_worker |

Seed with: `docker exec kairos-backend-api python scripts/seed_users.py`

**Current gap:** The app routes to `/briefs` on successful login but does not yet gate pages by role or attach the Bearer token to non-write API calls. Server-side reads currently rely on the backend's dev-bypass (no auth header = dev-user).

---

## 6. API Client

**File:** `src/lib/api.ts`

| Export | Purpose |
|--------|---------|
| `API_BASE` | `NEXT_PUBLIC_API_URL` env var, falls back to `http://localhost:8000` |
| `getToken()` | Reads `kairos-token` from localStorage |
| `getJson<T>(path)` | Unauthenticated GET with 4s timeout |
| `postJson<T>(path, body)` | Authenticated POST — attaches Bearer token if present |
| `getBriefs()` | `GET /briefs/?unacknowledged_only=false&limit=20` → falls back to `fixtureBriefs` on error or empty |
| `getBrief(id)` | `GET /briefs/{id}` → falls back to fixture match |
| `ackBrief(id, body)` | `POST /briefs/{id}/ack` |
| `sendBriefFeedback(id, rating, notes)` | `POST /briefs/{id}/feedback` |

**Fixture fallback pattern** (Briefs only, all other pages use fixtures directly):
- Backend unreachable → fixture
- Backend returns empty `briefs[]` → fixture (governor suppression or cold start)
- Backend returns data → live, tagged `source: "live"`

A `source: "demo"` badge appears in the brief inbox when running on fixture data.

---

## 7. Types

**File:** `src/lib/types.ts` — single source of truth derived from `docs/API.md`.

Key types:

| Type | Description |
|------|-------------|
| `Role` | `"admin" \| "engineer" \| "field_worker"` |
| `AuthorityLevel` | `1–5` (lower = higher authority, per Architecture Layer 4) |
| `Brief` | Full brief shape including sources, warnings, countersignature flag |
| `BriefsResponse` | Brief list + `governor_state` + `suppressed_count` + `next_delivery_allowed_at` |
| `GovernorState` | `push_count_last_hour`, `ceiling`, `state` |
| `SynthesizeResponse` | Copilot answer shape from `POST /search/synthesize` |
| `RcaPack` | Timeline + hypotheses + supporting docs from `POST /search/rca-pack` |
| `ListEnvelope<T>` | `{ items, total, limit, offset }` — standard list shape for assets/governance/compliance |

---

## 8. Shared UI Primitives

**File:** `src/components/ui.tsx`

| Component | Props | Renders |
|-----------|-------|---------|
| `AuthorityBadge` | `level: AuthorityLevel` | Coloured badge: L1=verified green → L5=unverified orange |
| `StatusBadge` | `tone: "verified" \| "caution" \| "danger" \| "neutral"` | Pill badge |
| `SourceChip` | `quarantine?: boolean` | Document ID chip; orange ring if quarantine |

---

## 9. Fixture Data

All fixture modules mirror the exact API shapes. They serve two purposes:
1. Offline/demo mode when the backend is unreachable
2. Stand-in while live API wiring is incomplete for a given page

| Module | Stands in for |
|--------|--------------|
| `fixtures.ts` | `GET /briefs/` |
| `assets.ts` | `GET /assets/`, `GET /assets/{id}`, `GET /assets/{id}/knowledge` |
| `compliance.ts` | `GET /compliance/gaps`, `GET /compliance/dashboard` |
| `copilot.ts` | `GET /search/` + `POST /search/synthesize` |
| `rca.ts` | `POST /search/rca-pack` |

Fixture assets: `P-101` (Feed Pump A), `EQ-101` (Reactor Feed Unit), `V-247` (Isolation Valve), `HX-301` (Heat Exchanger).

---

## 10. Live vs Stub — Page-by-Page

| Page | Live API calls | What's stubbed |
|------|---------------|---------------|
| `/login` | `POST /auth/login` ✅ | Role-aware routing after login |
| `/briefs` | `GET /briefs/` ✅ | — |
| `/briefs/[id]` | `GET /briefs/{id}` ✅ · `POST .../ack` ✅ · `POST .../feedback` ✅ | — |
| `/copilot` | none | `GET /search/` + `POST /search/synthesize` |
| `/assets` | none | `GET /assets/` |
| `/assets/[id]` | none | `GET /assets/{id}`, `/aliases`, `/knowledge` |
| `/rca` | none | `POST /search/rca-pack` |
| `/compliance` | none | `GET /compliance/dashboard`, `/gaps`, `/frameworks` |
| `/governance` | none | `GET /governance/conflicts`, `/quarantine`, `/moc`, `/sla-report`, `POST .../promote` |
| `/documents` | none | `GET /documents/` |
| `/management` | none | Aggregate from `/health/detailed`, `/assets/`, `/briefs/`, `/compliance/dashboard` |

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
| `--accent` | Brand colour (blue) |
| `--accent-soft` | Tinted accent background |
| `--on-accent` | Text on accent backgrounds |
| `--verified` | Green (authority verified) |
| `--caution` | Amber (unverified / warning) |
| `--danger` | Red (refused / critical) |

Light and dark values are set via `[data-theme=light]` / `[data-theme=dark]` on `<html>`.

---

## 12. Docker

```dockerfile
FROM node:20-alpine
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

**Env var:**
```
NEXT_PUBLIC_API_URL=http://localhost:8000
```

Healthcheck polls `http://localhost:3000` every 30s; 90s start period for initial `npm run dev` boot.

---

## 13. Wiring Remaining Pages (To-Do)

Priority order for live wiring:

1. **Copilot** — `GET /search/?q=...` then `POST /search/synthesize` with the search hits as context. Map `SynthesizeResponse` into `CopilotAnswer`. Attach Bearer token on the POST.
2. **Assets list** — `GET /assets/?limit=50` → `ListEnvelope<Asset>`. Replace fixture `assets` array.
3. **Asset detail** — parallel: `GET /assets/{id}`, `GET /assets/{id}/aliases`, `GET /assets/{id}/knowledge`.
4. **RCA** — `POST /search/rca-pack` with `{ asset_id, incident_date, failure_code }`. `refused=true` → show refusal UI already in place in fixtures.
5. **Compliance** — `GET /compliance/dashboard` + `GET /compliance/gaps` → replace `complianceSummary` fixture.
6. **Governance** — remove `<Stub>`, wire `GET /governance/conflicts` + `/quarantine` + `/moc` + `/sla-report`. Add `POST .../promote` action (admin/engineer only).
7. **Documents** — `GET /documents/?limit=50`. Link to `GET /documents/{id}/status` for pipeline state.
8. **Management** — fan-out: `/health/detailed`, `/assets/?limit=1` (total), `/briefs/`, `/compliance/dashboard`.
9. **Auth gates** — call `getMe()` on mount in `AppShell`; redirect to `/login` if null; show real user name/role/site in the user chip; hide write actions for `field_worker` role.
