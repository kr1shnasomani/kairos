# Phase 5 — Test Pass & Refinement List

Walked every flow against the **live** backend (up during this pass). Reference: `LIVE_VERIFICATION.md`.

**Constraint:** no headless browser installed here — routing, live-data integration, and API/write
contracts are verified via curl; **visual items (dark mode, mobile, hover/focus states) need an eyeball**
and are flagged below.

## Frontend fixes applied this pass (committed)
1. `getRcaPack` — send required `incident_date` (was 422). Backend now 500s (data issue, below) → fixture fallback still covers it.
2. `getComplianceGaps` — empty live gaps (`items: []`) now falls back to curated fixture (demo-primary), matching `getAssets`/`getBriefs`.
3. `synthesize` — live answer `null`/empty with no refusal → fall back to curated answer (no blank copilot bubble). Genuine safety refusals preserved.

## Live integration status (per screen)
| Screen | Data path | Result |
|---|---|---|
| Briefs | live → fixture when governor-suppressed/empty | ✅ shows curated (governor was `suppressed` 20/6) |
| Assets list + detail | **live** | ✅ renders `Feed Pump Alpha`, aliases; empty knowledge handled |
| Documents list + detail | **live** | ✅ renders live DOC-* (351 total), supersede/provenance |
| Compliance | live empty → **fixture** | ✅ curated OISD-117/ISO-45001 gaps |
| Copilot | live null-answer → **fixture** | ✅ curated cited answer (post-fix) |
| RCA | live 500 → **fixture** | ✅ curated pack (backend blocker below) |
| Governance conflicts/quarantine | **live** | ⚠️ renders live but data is test/junk (see blockers) |
| Overview (management) | fixture | ✅ 200 |

Write contracts (resolve/promote/dispute) match the router signatures (verified by code read; not fired to avoid mutating shared live data).

## Backend-data blockers (NOT frontend — need seeding/backend)
- **Junk data**: `/briefs`, `/governance/conflicts` (62), `/governance/quarantine` (324) full of `ASSET-EV-*`, `ASSET-TEST-*`, `ASSET-DEDUP-*`, `ASSET-MGSYYMNZ`. Governance screens show this live noise.
- **Empty datasets**: `/compliance/gaps` = 0, `/assets/P-101/knowledge` `fact_count` = 0, `/search/synthesize` KB empty ("No relevant evidence").
- **`/search/rca-pack` → 500** after valid `incident_date` (backend error).
- **Governor**: `push_count_last_hour: 20`, ceiling 6, `suppressed`.

## Refinement list (deferred → Phase 6)
- **Governance demo data**: live conflicts/quarantine are junk-heavy — either seed curated rows, or add a demo toggle / junk-filter so the dual-track thesis reads cleanly.
- **Buttons/interactions** (original deferred set): hover/active/focus-visible states audit across primary/ghost buttons, filter tabs, feedback chips.
- **Per-page loading skeletons**: currently one shared `(app)/loading.tsx`; tailor per screen if time.
- **Visual eyeball sweep** (needs browser): dark-mode contrast, mobile layout, drawer polish — light+dark+mobile per screen.
- **Client-render confirmation**: compliance/conflicts/quarantine populate via `useEffect` — confirm in-browser (curl only sees SSR shell).
- **Copilot live**: once KB is seeded, drop the null-answer fixture fallback for those queries.

## Not blocking
Demo-primary fixture fallback means every screen renders a clean curated story even with the backend
junky/empty — the app is demo-ready now; the blockers above are for a *fully live* demo.
