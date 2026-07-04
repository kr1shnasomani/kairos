# Live Verification

## Summary

| Area | Result | Notes |
|---|---|---|
| Backend startup | Pass | `rtk docker compose up -d --build` completed; backend left running. |
| Health check | Pass | `/health/detailed` returned HTTP `200`, status `ready`. |
| GET endpoints | Partial pass | All requested GETs returned `200`; some live datasets are empty or junk-heavy. |
| POST endpoints | Partial pass | `/search/synthesize` returned `200`; `/search/rca-pack` returned `422` for missing `incident_date`. |
| Junk row check | Fail | `/briefs` contains seeded/test asset IDs with blocked prefixes. |

## Health Check

| Check | Status | Notes |
|---|---|---|
| `docker compose up -d --build` | Pass | Images built/reused; API and workers recreated; compose stack running. |
| `localhost:8000/health/detailed` | 200 | Status `ready`; 5 health checks present. |

## GET Endpoints

| Endpoint | HTTP | Real Data | Count | Notes |
|---|---:|---|---:|---|
| `/briefs/?unacknowledged_only=false&limit=20` | 200 | mixed | 20 | Live response, but many briefs reference `ASSET-EV-*`, `ASSET-TEST-*`, or `ASSET-DEDUP-*`. Governor state shows `suppressed`. |
| `/compliance/gaps` | 200 | no | 0 | Live endpoint responds, but no gap rows returned. |
| `/compliance/dashboard` | 200 | no | 0 | Live endpoint responds; `total_gaps` all zero and no framework breakdown. |
| `/assets/` | 200 | yes | 4 | Curated assets present: `HX-301`, `V-247`, `EQ-101`, `P-101`. |
| `/assets/P-101` | 200 | yes | 1 | Returns `Feed Pump Alpha`, class `pump`, criticality `safety_critical`. |
| `/assets/P-101/knowledge` | 200 | no | 0 | Endpoint responds, but `fact_count` is `0`. |
| `/assets/P-101/aliases` | 200 | yes | 4 | Aliases returned: `SITE-001`, `EQ-101`, `PUMP`, `FEEDPUMP`. |
| `/governance/conflicts` | 200 | yes | 50 | Live list returned; total reported `62`. |
| `/governance/quarantine` | 200 | yes | 50 | Live list returned; total reported `324`. |
| `/documents/` | 200 | yes | 50 | Live list returned; total reported `351`. |

## POST Endpoints

| Endpoint | HTTP | Result | Notes |
|---|---:|---|---|
| `POST /search/synthesize` | 200 | Partial | Request accepted, but answer was empty: `No relevant evidence found in the knowledge base.` |
| `POST /search/rca-pack` | 422 | Fail | Request shape mismatch: backend requires `incident_date` in body. |

## Junk Row Check

| Source | Junk Rows Found | IDs / Notes |
|---|---|---|
| `/briefs` | Yes | Found `ASSET-EV-*`, `ASSET-TEST-*`, and `ASSET-DEDUP-*` references in returned briefs. Examples: `ASSET-EV-29324A3B`, `ASSET-DEDUP-A3DB32BF`, `ASSET-TEST-2BD801C8`. |
| `/assets` | No | Returned asset IDs were only `HX-301`, `V-247`, `EQ-101`, `P-101`. |

## Governor / Redis Notes

No Redis reset performed. `/briefs` was not empty, so the requested reset condition did not apply. Response governor state showed `push_count_last_hour: 20`, `ceiling: 6`, `state: suppressed`.

## Final Notes

Backend is running and most read endpoints are reachable. Main blockers for realistic live wiring are missing P-101 knowledge facts, empty compliance gaps/dashboard, junk brief references, and `/search/rca-pack` request contract mismatch.
