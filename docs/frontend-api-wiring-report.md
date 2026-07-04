# Frontend API Wiring Report

> Current wiring state as of the `frontend-ui` merge (July 2026). For component-level detail, see `docs/FRONTEND.md`.

## Auth

Real Supabase auth is fully wired. The frontend stores JWT access/refresh tokens in `localStorage`, attaches `Authorization: Bearer <token>` on every API call, and calls `GET /auth/me` to resolve the user's role and `site_id`.

Dev bypass (`APP_DEBUG=True` + no token) still works — backend returns `role: engineer` dev defaults, so an unauthenticated demo session still renders all pages.

## Wiring Status

| Area | Status | API calls |
|------|--------|-----------|
| Auth | **Live** | `POST /auth/login`, `POST /auth/refresh`, `GET /auth/me` |
| Briefs | **Live** (fixture fallback) | `GET /briefs/`, `GET /briefs/{id}` |
| Brief ack / feedback | **Live** | `POST /briefs/{id}/ack`, `POST /briefs/{id}/feedback` |
| Copilot | **Live** (fixture fallback) | `GET /search/`, `POST /search/synthesize` |
| Assets | **Live** (fixture fallback) | `GET /assets/`, `GET /assets/{id}`, `GET /assets/{id}/aliases`, `GET /assets/{id}/knowledge` |
| RCA | **Live** (fixture fallback) | `POST /search/rca-pack` |
| Compliance | **Live** (fixture fallback) | `GET /compliance/dashboard`, `GET /compliance/gaps`, `GET /compliance/frameworks` |
| Governance conflicts | **Live** (fixture fallback) | `GET /governance/conflicts`, `POST /governance/conflicts/{id}/resolve` |
| Governance quarantine | **Live** (fixture fallback) | `GET /governance/quarantine`, `POST /governance/quarantine/{item_id}/promote` |
| Documents | **Live** (fixture fallback) | `GET /documents/`, `GET /documents/{id}` |
| Management overview | **Fixture** | Aggregate health/counts not yet wired to live endpoints |

## Fixture Fallback Pattern

All API fetchers in `frontend/src/lib/` use `try { live API } catch { fixture }` with a 1500ms abort timeout. Pages degrade gracefully to demo data when the backend is unreachable — no page crashes on failed fetch.

## SSR Routing

Server components (App Router, no `"use client"`) run `fetch()` inside the Docker container. `API_BASE` in `frontend/src/lib/api.ts` uses `typeof window === "undefined"` to select the Docker-internal URL (`API_INTERNAL_URL=http://kairos-backend-api:8000`) for SSR and the public URL (`NEXT_PUBLIC_API_URL=http://localhost:8000`) for browser clients.

## Remaining Work

- **Management page** — `/management` still shows fixture health cards. Needs wiring to `GET /health/detailed`, asset counts, compliance gap counts, brief counts, and open conflict counts.
- **MoC detail** — no `/management/moc/{id}` detail page yet.
- **SLA report page** — `GET /governance/sla-report` exists on the backend but has no dedicated frontend page.
- **Role expansion** — `reliability` and `compliance` roles are defined in OPA policy but the frontend nav only gates on `engineer`, `admin`, `reliability`. Confirm whether standalone pages are needed for those roles.
