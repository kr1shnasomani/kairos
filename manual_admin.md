# Admin — Manual Testing

Log in as `admin@kairos.local` / `KairosAdmin123!`. Admin has `*` in the OPA policy — **full access to every page and every action.** The admin sidebar now surfaces **every option from both engineer and field worker** (Voice + Deviation added), plus the admin-only ones (🔑). Because admin can do everything, this is the role where **every button actually works** — use it to confirm each action functions, separate from role-gating.

| Page | Route | Do this | Expect |
|---|---|---|---|
| 🔑 System Health | `/system-health` | Open; toggle an AI-model probe on | 11 API surfaces + 5 datastores polled every 30s; model probes (NIM/Gemini/Jina/Groq) off by default, opt-in once/min, persisted in localStorage. Engineer/others are redirected away. |
| 🔑 Identity confirmation | `/assets/bootstrap` | Confirm an asset identity | Write succeeds (admin has write_assets). Button visible on `/assets` for admin. |
| 🔑 Plant state | `/management/plant-state` | Set state to turnaround/shutdown/emergency | Write succeeds; non-critical briefs then suppressed at the governor. (Engineer sees "requires admin".) |
| 🔑 Model gate run | `/governance/model-gate` | Click "Run gate now" | Run triggers (admin-only endpoint accepts) → new P/R/F1 result in history. |
| Overview | `/management` | Open as home | Plant KPIs, alerts, coverage, conflict/compliance posture. (`/management/cross-site` = demo fixture.) |
| Briefs | `/briefs`, `/briefs/[id]` | Open, ack, feedback | Brief with `sources[]` + AuthorityBadge; ack + feedback succeed. |
| Copilot | `/copilot` | Ask normal + safety-critical question | Cited answer + confidence; safety-critical low-confidence → **RefusalCard**, never hedged. |
| Voice (field tool) | `/field/voice` | Enter asset/WO tag, record a note | Now in admin sidebar. Whisper transcribes → routed to quarantine (`input_type=voice_note`). |
| Deviation (field tool) | `/field/deviation` | Fill asset + description, raise flag | Now in admin sidebar. Flag raised; briefs for that asset freeze until resolved (24h SLA). |
| Assets | `/assets`, `/assets/[id]` | View list + detail | Registry, aliases, hierarchy, time-travel knowledge (`as_of`). |
| RCA | `/rca` | Generate RCA pack | Timeline + ranked hypotheses + supporting docs; honest "synthesis unavailable" if no history. |
| Graph | `/graph` | Open temporal graph | React Flow, authority-colored edges, `as_of` time-travel. |
| Events | `/events`, `/events/[id]` | View + open detail | Event list + correlation; demo emitters work. |
| Compliance | `/compliance`, `/audit-pack`, `/nonconformance` | Open dashboard + audit pack | Gaps by framework/severity; audit pack shows **mandatory human sign-off** warning. |
| Governance hub | `/governance` | Open | Links to all 6 governance surfaces. |
| Conflicts | `/governance/conflicts` | Resolve an admin-track conflict | Resolves; engineering-track routes to MoC; detail shows blast-radius. |
| Quarantine | `/governance/quarantine` | Promote / dispute / request-info | **Promote succeeds** (admin has the permission — no 403). |
| MoC | `/governance/moc`, `/governance/moc/[id]` | Open + sign off | Source comparison (joined from linked conflict) + sign-off; approval (`POST /governance/moc/{id}/approve`) closes the conflicting edge's validity window. |
| SLA | `/governance/sla` | Open | Overdue conflicts + quarantine escalation report. |
| Circuit breaker | `/governance/circuit-breaker` | Open | SPC state per asset class (`halted`, z-score). |
| Documents | `/documents`, `/[id]`, `/[id]/topology` | Open registry + doc + P&ID | Metadata, supersede chain, P&ID topology graph. |
| Ingest | `/documents/ingest` | Upload a document | Pipeline-status timeline advances. |
| Compare | `/documents/compare` | Compare two versions | Side-by-side version/metadata diff. |
| Supersede | `/documents/[id]` | Supersede a document | Old marked superseded; KNOWLEDGE_EDGE validity windows closed. |
| Audit trail | `/audit` | Filter by entity/action | Log renders and filters; every admin action above appears here. |
| Projects | `/projects` | Open | Engineering + procurement registry by equipment class. |
| Off-boarding | `/offboarding`, `/[sessionId]` | Create programme, open session | Programme created; session items + questions render. |
| System Info | `/system-information` | Open | Static architecture explainer. |
| Settings | `/settings` | Open | System settings. |

**Cross-cutting (every page):** provenance always (`sources[]` + AuthorityBadge, vault source links) · safety-critical → RefusalCard · authority ranking L1 > L5, conflicts shown not averaged · Demo chip on fixture fallback · synthesis only in Copilot/RCA.

**Admin permissions (`infra/policies/kairos.rego`):** `*` — all actions, all sites (`asset_accessible` true for admin regardless of site). Admin is the only role that can run the model gate, set plant state, and access System Health.

> Note: every action resolves as **"works"** for admin — so if an action fails here it's a real bug, not a role-gate issue. Since the 2026-07-19 reconciliation the engineer/backend gaps are closed: quarantine-promote gating is consistent (reliability/admin across rego, endpoint, and UI); MoC in-app sign-off now has real backend endpoints (`GET /governance/moc/{id}` + `POST /governance/moc/{id}/approve`); and the model-gate "Run" button is admin-gated with error copy that distinguishes a 403, a server error, and an offline backend.
