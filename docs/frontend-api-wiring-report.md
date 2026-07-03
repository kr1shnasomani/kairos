# Frontend API Wiring Report

## Supabase Requirement

Real auth requires Supabase access in the current backend:

- `POST /auth/login` signs in through Supabase Auth.
- Bearer token verification uses Supabase.
- Role-gated behavior depends on Supabase user metadata, especially `role` and `site_id`.
- Backend data clients require `SUPABASE_URL`, `SUPABASE_ANON_KEY`, and `SUPABASE_SERVICE_ROLE_KEY`.

Dev bypass or `INTERNAL_API_KEY` can exercise some protected endpoints, but they do not validate the real login, stored token, refresh, or user role flow.

## Current Frontend Wiring

| Area | Frontend status | API calls |
| --- | --- | --- |
| Auth | Demo bypass only | Planned: `POST /auth/login`, `POST /auth/refresh`, `GET /auth/me` |
| Briefs | Live client with fixture fallback | `GET /briefs/?unacknowledged_only=true&limit=20`, `GET /briefs/{id}` |
| Brief actions | Local optimistic state | Planned: `POST /briefs/{id}/ack`, `POST /briefs/{id}/feedback` |
| Copilot | Fixture/stub UI | Planned: `GET /search/?q=...`, `POST /search/synthesize` |
| Assets | Fixture data | Planned: `GET /assets/`, `GET /assets/{id}`, `GET /assets/{id}/aliases`, `GET /assets/{id}/knowledge` |
| RCA | Fixture data | Planned: `POST /search/rca-pack` |
| Compliance | Fixture data | Planned: `GET /compliance/dashboard`, `GET /compliance/gaps`, `GET /compliance/frameworks`, `GET /compliance/audit-pack` |
| Governance | Stub UI | Planned: `GET /governance/conflicts`, `GET /governance/quarantine`, `GET /governance/moc`, `GET /governance/sla-report`, `POST /governance/quarantine/{item_id}/promote` |
| Documents | Stub UI | Planned: `GET /documents/` plus document status/extraction/topology calls when IDs exist |
| Management | Hard-coded status UI | Planned: aggregate health, assets, compliance, governance, documents, and briefs |

## Endpoint Notes

| Endpoint | Method | Purpose | Supabase needed |
| --- | --- | --- | --- |
| `/auth/login` | POST | Real user login | Yes |
| `/auth/refresh` | POST | Refresh auth session | Yes |
| `/auth/me` | GET | Resolve current user and role | Yes for real token flow |
| `/briefs/` | GET | Brief inbox | Yes for live data |
| `/briefs/{id}` | GET | Brief detail | Yes for live data |
| `/briefs/{id}/ack` | POST | Acknowledge brief | Yes |
| `/briefs/{id}/feedback` | POST | Submit brief feedback | Yes |
| `/search/` | GET | Search documents/events/assets | Yes for complete live results |
| `/search/synthesize` | POST | Copilot synthesis | Partially; full flow depends on live search/data |
| `/search/rca-pack` | POST | RCA pack generation | Yes for full live data/audit path |
| `/compliance/dashboard` | GET | Compliance summary | Not always, but needs seeded live data |
| `/compliance/gaps` | GET | Compliance gaps | Not always, but needs seeded live data |
| `/compliance/frameworks` | GET | Framework list | No for static list |
| `/compliance/audit-pack` | GET | Audit pack export | Not a POST in current backend |
| `/governance/conflicts` | GET | Governance conflicts | Yes for live data |
| `/governance/quarantine` | GET | Quarantine queue | Yes for live data |
| `/governance/moc` | GET | MOC items | Yes for live data |
| `/governance/sla-report` | GET | SLA report | Yes for live data |
| `/governance/quarantine/{item_id}/promote` | POST | Promote quarantined item | Yes, plus graph dependencies |
| `/documents/` | GET | Document list | Yes |
| `/assets/` | GET | Asset list | Not necessarily for empty response, but yes for meaningful live data |
| `/assets/{id}` | GET | Asset detail | Yes for live data |
| `/assets/{id}/aliases` | GET | Asset aliases | Yes for live data |
| `/assets/{id}/knowledge` | GET | Asset knowledge graph | Graph/live data required |

## Known Mismatches

- Compliance audit pack is currently `GET /compliance/audit-pack`, while the planned write-action list described it as a POST.
- The frontend API helper does not yet attach an Authorization header.
- Brief ack and feedback are currently local UI state, not backend writes.
- The Management page can show service status that is not derived from live backend health.

## Recommended Later Changes

- Add a frontend auth client that logs in through `/auth/login`, stores access/refresh tokens, refreshes sessions, and attaches `Authorization: Bearer <token>` to API requests.
- Replace demo-bypass routing with role-aware navigation for `admin`, `engineer`, and `field_worker`.
- Wire write actions to real endpoints and show server-confirmed success/error states.
- Keep fixtures as explicit offline fallback, but label fallback state consistently across list and detail screens.
- Confirm whether frontend roles should include backend roles such as `reliability` and `compliance`, which appear in backend authorization policy.
