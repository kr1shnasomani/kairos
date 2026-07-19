# Engineer — Manual Testing

Log in as `engineer@kairos.local` / `KairosEngineer123!`. Engineer sees every staff surface **except System Health** (admin-only); Voice/Deviation are field-only (reachable by URL, not in the sidebar).

**Core workspace (Architecture Layer 12):** full graph viz · timeline/time-travel · document comparison · conflict resolution · RCA assembly · audit trail.

| Page | Route | Do this | Expect |
|---|---|---|---|
| Overview | `/management` | Open as home | Plant KPIs, alerts, knowledge-coverage, open-conflict/compliance posture. |
| Briefs | `/briefs`, `/briefs/[id]` | Open a brief, ack, feedback | Brief with `sources[]` + AuthorityBadge; ack + feedback succeed. |
| Copilot | `/copilot` | Ask a normal + a safety-critical question (e.g. max allowable pressure) | Normal: cited answer + confidence. Safety-critical low-confidence: **RefusalCard**, never a hedged answer. |
| Assets | `/assets`, `/assets/[id]` | View list + detail | Registry, aliases, hierarchy, time-travel knowledge (`as_of`). See flag ⚠1 on Identity confirmation. |
| RCA | `/rca` | Generate an RCA pack for an asset + failure code | Failure timeline + ranked hypotheses + supporting docs; honest "synthesis unavailable" if graph lacks history. |
| Graph | `/graph` | Open temporal graph for an asset | React Flow graph, authority-colored edges, `as_of` time-travel. |
| Events | `/events`, `/events/[id]` | View events; open detail | Event list + correlation; demo emitters work. |
| Compliance | `/compliance`, `/compliance/audit-pack`, `/compliance/nonconformance` | Open dashboard + audit pack | Gaps by framework/severity; audit pack shows **mandatory human sign-off** warning. |
| Governance hub | `/governance` | Open | Links to all 6 governance surfaces. |
| Conflicts | `/governance/conflicts` | Resolve an admin-track conflict | Engineer **can** resolve admin-track; engineering-track routes to MoC. Detail shows blast-radius. |
| Quarantine | `/governance/quarantine` | Look for Promote | Promote button is **hidden** for engineer (`PROMOTE_ROLES = reliability, admin`); backend also 403s engineer. Consistent — engineer reviews but does not promote. |
| MoC | `/governance/moc`, `/governance/moc/[id]` | Open a MoC, sign off | Source comparison (joined from the linked conflict) + engineer sign-off. `GET /governance/moc/{id}` + `POST /governance/moc/{id}/approve` (engineer/admin) — approval closes the superseded edge's validity window. |
| SLA | `/governance/sla` | Open | Overdue conflicts + quarantine escalation report. |
| Circuit breaker | `/governance/circuit-breaker` | Open | SPC state per asset class (`halted`, z-score). |
| Model gate | `/governance/model-gate` | Open (read-only for engineer) | History + validation-corpus stats render. **"Run gate now" is hidden for non-admins** (button gated on `isAdmin`) — engineer views only. |
| Documents | `/documents`, `/documents/[id]`, `/documents/[id]/topology` | Open registry + a doc + a P&ID | Metadata, supersede chain, P&ID topology graph. |
| Ingest | `/documents/ingest` | Upload a document | Pipeline-status timeline advances (engineer allowed). |
| Compare | `/documents/compare` | Compare two versions | Side-by-side version/metadata diff. |
| Audit trail | `/audit` | Filter by entity/action | Entity/action log renders and filters. |
| Projects | `/projects` | Open | Engineering + procurement registry by equipment class. |
| Off-boarding | `/offboarding`, `/offboarding/[sessionId]` | Create a programme, open a session | Engineer can start_offboarding + review session items. |
| System Info | `/system-information` | Open | Static architecture explainer. |
| Settings | `/settings` | Open | System settings. |
| System Health | `/system-health` | Navigate by URL | **Redirected away** (admin-only). |

**Cross-cutting (every page):** provenance always (`sources[]` + AuthorityBadge, source links to vault) · safety-critical → RefusalCard · authority ranking L1 > L5, conflicts shown not averaged · Demo chip on fixture fallback · synthesis only in Copilot/RCA.

**Engineer permissions (from `infra/policies/kairos.rego`):** `read_search, read_briefs, ack_brief, ingest_document, read_governance, resolve_admin_conflict, read_assets, write_assets` + MoC approve + deviation-flag resolve. **No** `promote_quarantine`.

## ⚠ Open items — status after the 2026-07-19 reconciliation pass
1. **Identity confirmation button** — admin-only by design. The `/assets/bootstrap` page enforces admin-only internally ("requires the admin role"), so admin-only is the **consistent** choice even though rego gives engineer `write_assets`. **No change** — the UI is intentionally stricter than the backend here. (Note: `POST /assets` accepts engineer too, but the UI never surfaces the action to a non-admin.)
2. **Quarantine Promote — RESOLVED.** Frontend `PROMOTE_ROLES` is `reliability, admin` (engineer excluded), OPA `can_promote_quarantine` is reliability+admin, and the endpoint was reconciled from `require_role("reliability","admin","engineer")` → `require_role("reliability","admin")`. All three now agree; engineer gets a clean 403 and never sees the button.
3. **Model-gate "Run gate now" — RESOLVED.** The Run button is gated on `isAdmin` (non-admins never see it), and the error copy now distinguishes a 403 ("admin-only"), other server errors (shows the status code), and an actual offline backend ("check your connection").

**Resolved this pass:** (a) MoC in-app sign-off now has a real backend (`GET /governance/moc/{id}` detail + `POST /governance/moc/{id}/approve`), previously the UI called endpoints that 404'd; (b) quarantine-promote gating reconciled to reliability/admin across rego, endpoint, and UI; (c) model-gate Run button + error copy fixed. All three ⚠ open items are now closed (item 1 is admin-only by design).
