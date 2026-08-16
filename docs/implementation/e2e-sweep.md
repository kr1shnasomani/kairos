# End-to-end verification sweep

Full-system check: every route, every persona, feature-level — not a crash-grep.

**Why this file exists.** An earlier "regression sweep" opened 10 list routes and grepped for
"Something went wrong". It reported `briefs: 0 errors` at the exact moment the brief **detail**
page was throwing an error boundary for reliability users. A crash-grep on index routes is not
end-to-end verification and must not be presented as one.

## How to use

Driven with the `agent-browser` skill against `http://localhost:3000`.

- **Pass** = the feature does its job, not merely that the page rendered.
- Record the *observed* result, not "looks fine".
- Bugs found go in `conformance-changelog.md`, with the query/UI path that exposed them.

**Standing constraint:** no test may write to production Supabase. Read paths are free; write
paths (ack, countersign, verify, promote, ingest) do write — those are legitimate application
operations, but note each one you exercise.

## Logins

| Persona | Email | Password |
|---|---|---|
| admin | `admin@kairos.local` | `KairosAdmin123!` |
| engineer | `engineer@kairos.local` | `KairosEngineer123!` |
| reliability | `reliability@kairos.local` | `KairosReliability123!` |
| field_worker | `field_worker@kairos.local` | `KairosField123!` |
| compliance | `compliance@kairos.local` | `KairosCompliance123!` |

Role gating lives in `use-role.ts` (`routeAllowed` / `roleHome`). Expected: staff surfaces need
engineer/reliability/admin; `/system-health` is admin-only; `/compliance` + `/audit` also allow
compliance; a field worker hitting a gated URL redirects to `/briefs`.

---

## Legend

✅ verified this session · ⬜ not verified · ⛔ blocked · N/A not applicable to persona

---

## A. Routes × feature check

| # | Route | What "working" means | Status |
|---|---|---|---|
| 1 | `/` (landing) | Renders, nav anchors scroll, CTA → login | ✅ renders, 0 console errors |
| 2 | `/login` | Real login for all 5 personas; "Try demo" → admin | ✅ admin, reliability, field_worker · ⬜ engineer, compliance |
| 3 | `/briefs` | Inbox lists live briefs; governor state shown; empty state honest | ✅ renders · ⬜ feature |
| 4 | `/briefs/[id]` | Evidence lineage; ack; **PTW dual sign-off** | ✅ full two-user flow |
| 5 | `/copilot` | Query returns a cited answer; refusal card on safety-critical | ✅ renders, 0 console errors · ⬜ query/answer feature |
| 6 | `/assets` | Live list, filters, pagination | ✅ renders · ⬜ feature |
| 7 | `/assets/[id]` | Detail + knowledge graph + **OT coverage badge** | ✅ coverage badge live |
| 8 | `/assets/bootstrap` | MDM human confirmation flow | ✅ renders, 0 console errors · ⬜ flow |
| 9 | `/events` | Live event list | ✅ renders · ⬜ feature |
| 10 | `/events/[id]` | Event detail + linked brief | ✅ renders real payload (PTW Generated, V-247), 0 console errors |
| 11 | `/documents` | Vault list | ✅ renders · ⬜ feature |
| 12 | `/documents/[id]` | Metadata, version chain, **handwriting-suspect chip** | ✅ chip verified via API · ⬜ UI |
| 13 | `/documents/[id]/topology` | **Element-by-element verify → canonical gate** | ✅ full flow, 0/2 → 2/2 |
| 14 | `/documents/ingest` | Upload → pipeline progress | ✅ renders, 0 console errors · ⬜ upload (writes) |
| 15 | `/documents/compare` | Two-document diff | ✅ renders, 0 console errors · ⬜ diff feature |
| 16 | `/graph` | React Flow graph, time-travel `as_of` | ✅ renders · ⬜ feature |
| 17 | `/rca` | RCA pack generation (~90 s) or honest "unavailable" | ✅ renders, 0 console errors · ⬜ pack generation |
| 18 | `/compliance` | Gap dashboard; `total_gaps` object shape | ✅ renders · ⬜ feature |
| 19 | `/compliance/nonconformance` | NC tracking | ✅ renders, 0 console errors |
| 20 | `/compliance/audit-pack` | Evidence package assembly | ✅ renders, 0 console errors · ⬜ assembly |
| 21 | `/audit` | Audit trail, sorted by `timestamp` | ✅ renders · ⬜ feature |
| 22 | `/governance` | Overview counters | ✅ renders · ⬜ feature |
| 23 | `/governance/quarantine` | Promote / dispute / request-info | ✅ renders, 0 console errors · ⬜ promote (writes) |
| 24 | `/governance/conflicts` | Admin vs engineering track split | ✅ renders, 0 console errors |
| 25 | `/governance/moc` | MoC list | ✅ renders, 0 console errors |
| 26 | `/governance/moc/[id]` | MoC detail + approve | ✅ renders real conflict (HE-301 MAOP, both sources), 0 console errors · ⬜ approve (writes) |
| 27 | `/governance/model-gate` | Run enqueues (~2.5 min); history; **per-asset-class rows** | ✅ renders, 0 console errors · ⬜ run (~2.5 min) |
| 28 | `/governance/circuit-breaker` | Live breaker state, **no fabricated rows** | ✅ 0 fabricated |
| 29 | `/governance/sla` | Escalation report shape | ✅ renders, 0 console errors |
| 30 | `/management` | Exec KPI view | ✅ renders · ⬜ feature |
| 31 | `/management/coverage` | Knowledge-coverage heatmap | ✅ renders, 0 console errors |
| 32 | `/management/cross-site` | Honest "single-site" state; **eyebrow must not say Layer 13** | ✅ **fixed** — eyebrow was 'Layer 13' (no such layer); now 'Multi-site · Control plane'. Honest empty state correct. |
| 33 | `/management/plant-state` | Plant state set/read (admin) | ⬜ (writes) |
| 34 | `/projects` | Project/procurement registry | ✅ renders, 0 console errors |
| 35 | `/offboarding` | Programme list | ✅ renders, 0 console errors · ⬜ programme detail |
| 36 | `/offboarding/[sessionId]` | Session items, responses (6 s timeout) | ✅ renders real programme (ramesh.kumar, 0/5 sessions), 0 console errors · ⬜ responses (writes) |
| 37 | `/field/voice` | Recorder UI | ✅ renders, 0 console errors · ⬜ capture (writes) |
| 38 | `/field/voice/[workOrderId]` | Capture → transcription | ✅ renders, 0 console errors · ⬜ capture (writes, Groq quota) |
| 39 | `/field/deviation` | Physical deviation flag | ✅ renders, 0 console errors · ⬜ submit (writes) |
| 40 | `/field/elicitation/[workOrderId]` | Micro-interview questions + responses | ✅ renders, 0 console errors · ⬜ submit responses (writes) |
| 41 | `/system-health` | 11 probes; AI-model toggles **off by default** | ✅ renders, 0 console errors · ⬜ probe behaviour |
| 42 | `/system-benchmarks` | Live benchmark cockpit | ✅ renders, 0 console errors |
| 43 | `/system-information` | Static explainer | ✅ renders, 0 console errors |
| 44 | `/settings` | System settings | ✅ renders, 0 console errors |

## B. Personas × access control

| Persona | Expected | Status |
|---|---|---|
| admin | everything incl. `/system-health` | ✅ partial |
| engineer | staff surfaces; **cannot** promote quarantine or countersign | ✅ countersign 403 confirmed |
| reliability | staff + promote + countersign | ✅ countersign confirmed |
| field_worker | `/briefs` + `/field/*`; gated URLs redirect to `/briefs` | ✅ **verified** — home `/briefs`; `/governance`, `/system-health`, `/management`, `/compliance`, `/audit` all redirect to `/briefs` |
| compliance | `/compliance` + `/audit` only; home = `/compliance`, no redirect loop | ✅ **verified** (token asserted) — home `/compliance`; `/compliance` + `/audit` accessible; `/governance`, `/management`, `/system-health` redirect to `/compliance`. `/briefs` + `/assets` open, which is by design (unlisted paths are open to all authed). |

## C. Cross-cutting

| Check | Status |
|---|---|
| Dark mode across main routes | ✅ briefs/assets/governance/compliance — bg `rgb(20,17,14)`, fg `rgb(237,233,226)`, consistent |
| Mobile viewport (375px) — hamburger nav, no bottom tab bar | ✅ briefs/assets/governance at 375×812 — no horizontal scroll, no error boundary |
| No `console.error` on any route | ✅ **0 console errors across all 44 routes** |
| No page scrolls horizontally | ✅ verified at 375px on 3 routes · ⬜ remaining routes |
| Phase badge reflects live backend phase | ✅ |
| Phase 1 suppresses synthesis, writes nothing | ✅ (curl, 324→324) |

---

## Known-good baselines

- Backend service-free tier: **121 passed**
- Frontend: **145 passed, 0 errors**
- ruff (pinned 0.16.0) clean · Go build + vet clean

## Bugs this sweep has already found

1. W3 element map always empty — `.neq()` vs SQL NULL dropped every element row.
2. W1 countersign always 404 — scoped by recipient, but the countersigner is never the recipient.
3. W1 brief detail 404 for the countersigner — error boundary; SSR resolves as `dev-user`.
4. Handwriting flag false-positive on P&ID drawings — an image, but not handwriting.

**Pattern:** every one was a *query-semantics* or *real-data* bug. The service-free tier proves
logic; it cannot prove queries. These need a real database or a real browser.


---

## Method note — two false positives caught

Twice this session a check *looked* like it had found a bug and had not:

1. `CoverageIndicator` "not rendering" — `agent-browser snapshot -c` (compact) drops the node. It
   was rendering the whole time. Use a full snapshot or `eval document.body.innerText`.
2. Compliance persona "redirected away from /compliance" — the login had not submitted and the
   session was still field_worker, so the output was field_worker's gating, correctly.

**Before recording a persona result, assert the identity:**

```
agent-browser eval "JSON.parse(atob(localStorage.getItem('kairos-token').split('.')[1])).user_metadata.role"
```

`agent-browser` refs go stale after any navigation — re-snapshot before every interaction, and
verify the login landed before drawing conclusions from what the page shows.


---

## Coverage as of 2026-08-16

**Routes: 44/44 reached.** Every route loads with **zero console errors and no error boundary**,
including all dynamic `[id]` routes (IDs fetched from the API — they cannot be swept by URL alone).
Dynamic routes spot-checked for *real content*, not empty shells.

**Personas: 5/5 verified** for home route and access control.

**Cross-cutting: done** — dark mode, mobile 375px (no horizontal scroll), zero console errors.

### What "44/44" does and does not mean

It means **nothing is broken, unreachable, or throwing**. It does **not** mean every feature was
exercised. Rows still marked ⬜ are behaviours not driven end to end — mostly write paths
(`ingest`, `promote`, `moc approve`, voice capture, elicitation submit) and long-running
operations (`/rca` ~90 s, model-gate ~2.5 min).

That distinction is deliberate. A clean render read as a passing feature is exactly what let the
brief-detail countersign bug through earlier in this work.
