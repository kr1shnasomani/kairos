# Conformance work — running change log

Tracks the architecture-conformance workstreams (82% → ~94%). Exists because this work is being
done **without commits**, so there is no git history to bisect. Each entry lists what changed, what
to undo, and how it was verified.

Plan: `~/.claude/plans/okay-make-a-planned-cosmic-orbit.md`
Audit: https://claude.ai/code/artifact/4e0ee83a-7d7a-4c61-b686-714b52f965b5

**Hard constraint in force:** no test writes to Supabase. Every new test is service-free
(mocked, no network). The write-heavy suite is never run.

**Baseline before any change:** service-free tier = **68 passed**. Frontend = **142 passed, 3
pre-existing errors** (unrelated; present on an unmodified tree).

---

## W1 — PTW countersignature ✅ complete

**Why:** Layer 8 / architecture Flow B requires two signatures on a safety-critical brief. `ack`
deliberately withholds `acknowledged_at` for PTW briefs, but no endpoint ever completed that state,
so **a PTW brief could never be acknowledged at all.** A live bug, not just a conformance gap.

The frontend had the matching half of the bug: `brief-detail.tsx` showed a two-step "dual
signature" flow in which step 1 called no API at all and step 2 called `/ack` — two typed names in
one browser session, never two authenticated people.

### Changed

| File | Change |
|---|---|
| `backend/api/routers/briefs.py` | New `POST /briefs/{brief_id}/countersign`. Uses the existing `countersigned_by` / `countersigned_at` columns. Sets `acknowledged_at` only when both signatures exist. Added `countersigned_by`/`countersigned_at` to the list `select`. Corrected the stale "Task 13" comment on `ack_brief`. |
| `infra/policies/kairos.rego` | Added `countersign_brief` to the `reliability` permission set, a `can_countersign_brief` rule, and — critically — to `_sensitive_actions`, without which the catch-all rule would have granted it to every authenticated role including field workers. |
| `frontend/src/lib/api.ts` | New `countersignBrief()`. |
| `frontend/src/lib/types.ts` | `Brief` gains `acknowledged_by`, `countersigned_by`, `countersigned_at`. |
| `frontend/src/components/use-role.ts` | New `useMe()` — identity, not just role, because the countersigner must be compared against the acknowledger by user id. |
| `frontend/src/components/brief-detail.tsx` | Step 1 now actually calls `ackBrief` for PTW too. Step 2 calls `countersignBrief` and is driven by **server truth** (`acknowledged_by` / `countersigned_by`), not local step state, so the two signatures can come from two sessions. Shows an explicit "waiting on a second authority" state otherwise. Removed the typed-name shift-lead input. |
| `frontend/src/components/brief-detail.test.tsx` | Added `countersignBrief`/`getToken` to the module mock (the whole-module mock left `getToken` undefined once `useMe` was pulled in, which threw). Two new cases. |
| `tests/test_briefs_countersign.py` | **New**, service-free: 6 cases. |

### Design decisions

- **No sixth `shift_lead` role.** Reused `PROMOTE_ROLES` (reliability/admin), matching
  `promote_quarantine`. Engineers deliberately *cannot* countersign, so both signatures can never
  come from the issuing role.
- **Identity from the session, never a typed name.** The architecture asks for a signature
  "cryptographically signed with the user's identity"; a free-text name is not that.

### Verified

- Service-free tests: **74 passed** (68 baseline + 6 new).
- OPA against the live container, all five roles: `field_worker=False engineer=False
  reliability=True admin=True compliance=False`. Regression-checked `promote_quarantine`,
  `ack_brief`, `resolve_admin_conflict`, `read_search` — all unchanged.
- Frontend: tsc clean, eslint clean on changed files (one pre-existing `userId` warning in
  `api.ts`, unrelated, left alone). **144 passed** vs 142 baseline, same 3 pre-existing errors.
- Live endpoint after rebuild: registered, and returns
  `403 Role 'engineer' does not have access. Required: ['reliability', 'admin']`.

### To undo

Revert the seven files above and delete `tests/test_briefs_countersign.py`; then
`docker compose up -d --no-deps --build kairos-backend-api` and `docker restart kairos-opa`.
No schema change, no data written.

### Note

Backend code is **baked into the image**, not volume-mounted — backend changes need
`docker compose up -d --no-deps --build kairos-backend-api` to take effect. OPA loads policy from a
read-only mount at startup, so policy changes need `docker restart kairos-opa`.

---

## W3 — P&ID element-by-element verification gate ✅ complete (pending rebuild + browser check)

**Why:** the architecture calls this gate non-negotiable regardless of model accuracy — candidate
topology must not be canonical until an engineer confirms it element by element.
`GET /documents/{id}/topology` returned a **hardcoded `"verification_status": "unverified"` string
literal**, and `api.ts` stamped that one document-level value onto every node — so the per-node
colour coding was decorative, and no reviewer action could change anything on screen.

**No new storage was needed.** The ingestion pipeline already writes, per element: a `Concept`
node, an unverified `CONTAINS_TOPOLOGY_ELEMENT` edge, and a `quarantine_items` row. Verification
therefore reuses the quarantine review lifecycle and **promotes the edge that already exists**.

### Changed

| File | Change |
|---|---|
| `backend/api/services/topology.py` | **New.** `TopologyVerificationService` — derives per-element status from each element's `review_status`, rolls up to a drawing-level summary, and applies engineer decisions. `SAFETY_CRITICAL_GROUPS = {isolation_boundaries, instrumentation_loops}` per the architecture. |
| `backend/api/services/graph.py` | New `set_topology_element_verification()` — flips an existing element edge to verified/disputed. Does not create edges. |
| `backend/api/routers/documents.py` | `GET /topology` now returns derived status + per-element map. New `POST /documents/{id}/topology/verify` (engineer/reliability/admin), audited. |
| `frontend/src/lib/api.ts` | `verifyTopologyElements()`; adapter now uses `statusOf(id)` per element instead of one blanket document status (4 call sites). |
| `frontend/src/lib/types.ts` | `TopologyGraph` gains the verification roll-up incl. `canonical_ready`. |
| `frontend/src/app/(app)/documents/[id]/topology/page.tsx` | Confirm/Reject per element (role-gated on `RESOLVE_ROLES`), a canonical-gate panel, and a rewrite onto the shared `useFetch` hook. |
| `.../_components/topo-data.ts` | Deleted the unused `FIXTURE` constant. |
| `.../topology/page.test.tsx` | Mock updated for the new shape + `getToken`. |
| `tests/test_topology_verify.py` | **New**, service-free: 10 cases. |

### Two bugs found and fixed in passing

1. **Live-only policy violation.** The page did `const resolved = data ?? FIXTURE` — a frontend
   fixture fallback that would have rendered fabricated elements, some labelled `"verified"`,
   through the very gate being built. Removed, and the now-orphaned `FIXTURE` deleted.
2. **Page hung forever on the documented normal case.** `getDocumentTopology` throws, and the
   effect had `.then()` with no `.catch()`. `/topology` 404s by design for any non-`pid_drawing`
   document, so opening topology on an ordinary document left the spinner running indefinitely.
   Now an honest error state with retry, via `useFetch`.

### Verified

- Service-free tests: **84 passed** (68 baseline + 6 W1 + 10 W3).
- Frontend: tsc clean, eslint clean on changed paths, **144 passed / 3 errors** — the same 3
  pre-existing errors as baseline. (They briefly went to 4: `useRole` pulls in `getToken`, which
  the topology test's whole-module mock left undefined. Fixed in the mock, same as W1.)

### To undo

Revert the files above, delete `backend/api/services/topology.py` and
`tests/test_topology_verify.py`, restore the `FIXTURE` constant, rebuild the API image.
No schema change, no data written.

### Known-unrelated, NOT fixed

`frontend/src/app/(app)/governance/circuit-breaker/page.tsx:44` has the same
`state.data ?? FIXTURE` live-only violation. Out of scope for this workstream — flagged, not
touched. **Recorded in `docs/implementation/status.md`** under the live-only cleanup section so it
is not lost.

---

## W2 — Real instrumentation coverage map ✅ complete (pending rebuild + browser check)

**Why:** `getInstrumentationCoverage` in the Go connector returned hardcoded
`{asset}-VIBE` / `{asset}-TEMP` / `seal_housing` / `75%` for **every** asset, on **both** branches
— including the one labelled `source: "knowledge_graph"`. Undisclosed fabrication presented as
derived data, and a direct breach of the disclosure rule in `CLAUDE.md`.

Its consumer made this consequential rather than cosmetic: `attribution.py` gated Layer 10's
telemetry check on `coverage_percent == 0`, which could never be true, so telemetry was **always**
treated as primary evidence and the brownfield downgrade the architecture spends two paragraphs on
was unreachable code.

### Corrections to the original audit

Two claims in the published audit were wrong, both from a `grep` that silently failed on a shell
glob error:

1. *"Only a dead `OtCoverage` type remains… no frontend code imports the type."* Wrong. The type is
   consumed by `CoverageIndicator` in `knowledge-graph.tsx`, via `getOtCoverage()`.
2. That made it worse, not better: `getOtCoverage()` requested **`/ot/coverage/{id}`**, a route that
   exists on the **Go connector (:8090)**, not on the FastAPI base URL the browser client uses. So
   every call 404'd, the fetcher threw, and the `.then()` had no `.catch()` — the coverage indicator
   silently never rendered, on an unhandled rejection.

### Changed

| File | Change |
|---|---|
| `backend/api/services/ot_coverage.py` | **New.** Derives coverage from **engineer-verified** P&ID topology: verified `instrumentation_loops[].instruments[]` are the sensor tags. Supabase-only, so the Celery worker can use it without an HTTP hop. |
| `backend/api/routers/assets.py` | New `GET /assets/{asset_id}/ot-coverage`. |
| `backend/workers/attribution.py` | Calls the service directly. Implements the brownfield downgrade: no direct sensors → telemetry demoted to `evidence_role: "supporting"`, `primary_evidence: "work_order_closeout_attestation"`. Removed the hardcoded `[asset_id + "-VIBE"]` fallback tag. |
| `backend/connectors/cmd/connector/main.go` | **Deleted** `getInstrumentationCoverage` and its route. Go still builds (verified). |
| `backend/scripts/load_demo_dataset.py` | New `_verify_demo_topology()` — the sequencing guard. |
| `frontend/src/lib/api.ts` | `getOtCoverage` now calls `/assets/{id}/ot-coverage`. |
| `frontend/src/lib/types.ts` | `OtCoverage` gains provenance (`derived_from`, `source_documents`, `unverified_topology_present`). |
| `frontend/src/components/knowledge-graph.tsx` | Added the missing `.catch()`. |
| `tests/test_ot_coverage.py` | **New**, service-free: 6 cases. |

### The honesty rule this encodes

`coverage_type: "none"` means *no verified drawing establishes instrumentation* — **not** "this
equipment has no sensors". `unverified_topology_present` distinguishes review backlog from genuine
absence. Only engineer-verified topology counts: an unverified drawing is a model's candidate
reading, and treating it as coverage would launder an extraction into a telemetry claim.

### Sequencing guard (the High risk in the plan)

W2 had to land **after** W3, and the demo dataset had to have verified topology first — otherwise
every asset would report `none`, and attribution would stop running its telemetry check across the
board. `load_demo_dataset.py` now confirms the demo drawing's elements at the end of a load
(idempotent, demo drawings only), standing in for an engineer walking the review queue.

### Verified

- Service-free tests: **90 passed** (68 baseline + 6 W1 + 10 W3 + 6 W2).
- `ruff check` against the **pinned 0.16.0**: all checks passed.
- Go: `go build ./...` exit 0 after handler deletion.
- Frontend: tsc clean, eslint clean on changed files, **144 passed / 3 pre-existing errors**.

### To undo

Revert the files above, delete `backend/api/services/ot_coverage.py` and
`tests/test_ot_coverage.py`, restore the Go handler from git, rebuild both images.
No schema change, no data written.

---

## W4 — Real phase gating ✅ complete

**Why:** the architecture treats the deployment phases as *release gates embedded in the software*.
They were a label only — `PhaseBadge` read `NEXT_PUBLIC_KAIROS_PHASE`, defaulted to `"3"`, and no
backend code consulted it. **And the badge was never rendered anywhere**, so the phase was not
merely unenforced, it was invisible.

### Changed

| File | Change |
|---|---|
| `backend/api/config.py` | `KAIROS_PHASE: int = 3`. **Default 3 — behaviour unchanged unless a deployment deliberately steps back.** |
| `backend/api/routers/search.py` | Phase 1 → `/search/synthesize` returns the retrieved sources with `answer: null` and an explanatory `message`. The answer surface degrades; it does not break. |
| `backend/api/services/brief_engine.py` | Phase < 3 → the brief is still **persisted and readable in the inbox**, only the Redis push is suppressed. Suppressing assembly instead would be indistinguishable from the feature not existing. |
| `backend/api/routers/health.py` | `/health/detailed` now returns `phase` + `phase_enforced{synthesis, proactive_delivery}`. |
| `backend/api/routers/governance.py` | New `GET /governance/push-volume-gate` — the EEMUA 191 pilot gate. |
| `frontend/src/components/ui.tsx` | `PhaseBadge` reads the **live** phase from `/health/detailed`; renders nothing until known, so it can never assert an unconfirmed phase. |
| `frontend/src/components/app-header.tsx` | Actually renders the badge. |
| `tests/test_phase_gate.py` | **New**, service-free: 6 cases, including that the default is inert. |

### The pilot gate reports, it does not block

`push-volume-gate` computes **peak** per-operator-per-hour volume over a rolling window (an average
would hide exactly the bursts EEMUA 191 exists to prevent) and returns
`enforcement: "advisory_only"`. Wiring it as a runtime block would mean a deployment with under 30
days of history could not deliver briefs at all — a worse failure than the one it prevents. Phase
activation stays a deliberate config decision, informed by this number.

---

## W7 — Extraction path flagging ✅ complete

**Why:** the architecture asks for handwritten content to carry "lower initial confidence scores,
flagged explicitly in the extraction output". **The flag is the requirement; the score change is
not** — scaling `overall_confidence` down would push image-path extractions under the `< 0.7`
quarantine threshold and silently move real facts out of the canonical graph. The golden dataset's
`handwritten_inspection_note.png` and `handwritten_shift_log.png` are exactly what that would have
hit, thinning the graph mid-demo for no conformance gain.

### Changed

| File | Change |
|---|---|
| `backend/api/services/ocr.py` | Every return envelope (5 of them) now carries `extraction_path: "ocr" \| "native" \| "unknown"` and `handwriting_suspect`. Confidence untouched. |
| `backend/api/models/document.py` · `routers/documents.py` | `ExtractionResult` surfaces both. Derived from the vault's stored `mime_type` rather than a new column — **the zero-migration promise holds**. |
| `tests/test_extraction_path.py` | **New**, service-free: 5 cases, including one asserting every envelope carries the field (the classic "one branch forgot it" KeyError). |

### Verified (W4 + W7)

- Service-free tests: **101 passed** (68 baseline + 33 new across W1/W3/W2/W4/W7).
- `ruff check` on pinned 0.16.0: all checks passed.
- Frontend: tsc clean, eslint clean on changed files, **144 passed / 3 pre-existing errors**.

---

## Remaining

| Workstream | State |
|---|---|
| **W6** timestamp drift normalization | Not started. Report-only by design (`TIMESTAMP_DRIFT_ENFORCE=False`). |
| **W5** per-asset-class model gate | Not started. Report-only by design (`MODEL_GATE_ENFORCE=False`). |
| **W9** connector registry / OPC-UA | Deferred to last by explicit instruction. |
| Browser E2E | Pending — validates W1–W4 + W7 against the running stack. |

Both remaining workstreams are report-only and invisible in a demo; they are the designated first
cuts if time runs short.

---

## Bug found by browser E2E — W3 element map was always empty (2026-08-16)

**Symptom:** the topology page rendered "Safety-critical: 0/0" and `elements_total: 0` for a
drawing that plainly had four elements. Every element showed `unverified` and no Confirm action
could have matched an element id.

**Cause: SQL NULL semantics.** `_element_rows` excluded the manifest with

```
.neq("session_context->>element_type", "topology_manifest")
```

Element rows carry **no** `element_type` key, so that expression compares against SQL `NULL`.
`NULL != 'topology_manifest'` evaluates to `NULL`, not `TRUE`, and PostgREST therefore dropped
**every element row** — the exact opposite of the intent. The manifest was excluded correctly and
so was everything else.

**Fix:** fetch by `source_document_id` only and exclude the manifest in Python.

**Why the unit tests missed it:** the fake Supabase implements `.neq()` as a no-op passthrough, so
it could not reproduce a filter whose bug *is* its filtering behaviour. Only a real database — or
the browser talking to one — would show it. This is the case for keeping the E2E pass in the plan:
the service-free tier proves logic, not query semantics.

Regression test added (`test_manifest_row_is_excluded_but_element_rows_are_not`) asserting both
halves: the manifest is excluded **and** the element rows survive.

---

## W6 — Timestamp alignment across source systems ✅ complete

**Why:** the architecture calls this a first-class ingestion requirement. Brownfield plants run
EAM, DMS, SCADA and email archives on unsynchronised clocks; unreconciled skew corrupts temporal
ordering and therefore time-travel RCA. Nothing implemented it.

### The comparison that matters

**Drift = the same correlated event, reported by two different source systems, at two different
times.** It is emphatically **not** `occurred_at` vs `ingested_at` — a golden-dataset document
legitimately occurring months before ingestion is history, not skew, and that comparison would have
flagged essentially the entire corpus and buried the real signal. The plan originally specified the
wrong comparison; it was caught before implementation.

Correlation is **not re-derived**: Layer 8 already groups the same physical action under a shared
`compound_event_id`, so the alignment pass reuses that grouping.

### Changed

| File | Change |
|---|---|
| `backend/api/services/timestamp_alignment.py` | **New.** Cross-system pairwise drift, normalisation to the best-synchronised clock (historian is site-canonical per the architecture). |
| `backend/api/config.py` | `TIMESTAMP_DRIFT_TOLERANCE_MINUTES = 60`, `TIMESTAMP_DRIFT_ENFORCE = False`. |
| `backend/api/services/event_bus.py` | Alignment runs at `correlate_events` — the exact point a multi-source event is formed. Wrapped so a data-quality check can never drop an operational event. |
| `backend/api/routers/governance.py` | New `GET /governance/timestamp-drift`. |
| `tests/test_timestamp_alignment.py` | **New**, service-free: 9 cases. |

Notable cases covered: two events from the *same* source are two events, not skew (otherwise
ordinary event volume manufactures drift); unparseable timestamps are skipped rather than read as
epoch-zero (which would report ~56 years of drift).

---

## W5 — Per-asset-class model gate ✅ complete

**Why:** the architecture is explicit — "a model that passes on global metrics but fails on a
specific asset class is blocked for that class until retrained". The gate scored per *entity type*
only and recorded `passed: false` while blocking nothing. The hard deployment gate was a report.

### Changed

| File | Change |
|---|---|
| `backend/workers/model_validation.py` | Partitions the corpus by `equipment_class` (via `document_asset_links → assets`) and scores each class. Emits `by_asset_class`, `regressed_asset_classes`, `blocked_asset_classes`. New `_document_asset_classes()` helper. |
| `backend/api/services/circuit_breaker.py` | `check()` now has two inputs and one outcome: SPC z-score **or** a Layer 0 per-class regression. New `model_gate_block()`. |
| `backend/api/config.py` | `MODEL_GATE_ENFORCE = False`. |
| `tests/test_model_gate_classes.py` | **New**, service-free: 6 cases. |

### Two design points

- **Partitioning costs no extra model calls.** Each document belongs to exactly one class, so
  every document is still evaluated once — the per-class breakdown is free.
- **Enforcement routes through the circuit breaker, not a parallel gate.** The breaker already
  halts extraction per asset class and is already consulted by the extraction path; a second
  mechanism would mean two places to check and two ways to disagree.
- **Fails open.** A model-gate history lookup is advisory; letting its failure halt extraction
  would turn an observability problem into an outage. Covered by test.

### Verified (W6 + W5)

- Service-free tests: **117 passed** (68 baseline + 49 new).
- `ruff check` on pinned 0.16.0: all checks passed.
- Both ship **report-only** (`TIMESTAMP_DRIFT_ENFORCE=False`, `MODEL_GATE_ENFORCE=False`), so
  neither changes behaviour until deliberately enabled.

---

## W9 — Connector registry + honest OPC-UA ✅ complete

**Why:** Layer 5 claims "new connector types are added without changing the core layer". This makes
that inspectable instead of asserted.

| File | Change |
|---|---|
| `backend/connectors/cmd/connector/main.go` | New `GET /ot/connectors` — every supported historian with its config state and the exact env var that activates it. Reports whether the mock historian is serving. |
| `backend/connectors/internal/ot/client.go` | **OPC-UA `Query` now fails loudly.** It previously returned an *empty slice with a nil error* once an endpoint was configured — indistinguishable from "the historian has no readings for this tag". A caller would have recorded an absence of data as evidence. An unimplemented connector must be impossible to mistake for a working one that found nothing. |
| `backend/api/routers/health.py` | `GET /health/connectors` passthrough. A connector service that is down returns 503, not an empty registry that would read as "no connectors supported". |

Live: `PI Web API not_configured · OPC-UA / Uniformance / GraphQL registered · serving mock: true`.

## Circuit-breaker fixture fallback ✅ fixed

`governance/circuit-breaker/page.tsx` did `state.data ?? FIXTURE`, inventing halted breakers for
"Valve" and "Separator" — fabricated governance state on the page whose entire job is reporting
whether extraction has actually been halted.

The test asserted the fabrication (`getByText("Separator")` against a `data: null` mock). Following
the precedent in `status.md`, it was **inverted rather than deleted**: one case renders real live
data, a second pins the guarantee that an empty live response renders **no** invented rows.

## Demo topology verification ✅ run for real

`_verify_demo_topology()` had been added but never executed. Run against the live stack:
`applied=4, unknown=0, canonical_ready=True`. Re-ran to confirm idempotency — same result.

End state: `DOC-ZQ2AMQWFDMZW` is `verified` (4/4, safety-critical 2/2, `canonical_ready: true`) and
`V-247` coverage is `direct` with real drawing tags `FT-3047`, `FV-3047`.

Also corrected stale copy on the topology page pointing reviewers at the quarantine queue —
confirmation happens on that page now.

### Final counts

Backend **117 passed** · frontend **145 passed / 3 pre-existing errors** · ruff clean (0.16.0) ·
Go build + vet clean.

---

## Bug found by real two-user E2E — W1 countersign was unreachable (2026-08-16)

**The feature did not work in production**, despite passing six unit tests, an OPA policy check
across five roles, and a live 403 check.

**Symptom:** engineer acknowledges a PTW brief → `200 pending_countersignature`. Reliability user
countersigns → **`404 Brief not found`**.

**Cause:** `countersign_brief` scoped its read with
`.in_("recipient_user_id", _brief_recipients(current_user))`, copied from `ack_brief`. But Flow B's
countersigner is **by definition a different person from the recipient** — the issuing engineer
acknowledges, a second authority signs. That filter therefore matched nothing, always. The dual
sign-off I had just "fixed" was still impossible, in a different way.

`GET /briefs/{id}` had the same problem: the second authority could not even open the brief they
were required to review.

**Fix:** authorisation by role, not by delivery address. `countersign` no longer filters on
recipient (role is enforced by `require_role` + OPA `can_countersign_brief`). `get_brief` keeps
recipient ownership but adds one narrow exception — a reliability/admin user may open a **PTW**
brief addressed to someone else, because they cannot countersign what they are forbidden to read.
The inbox listing is unchanged.

**Why every earlier check missed it:** the fake Supabase implements `.in_()` as a passthrough, so
it cannot reproduce a filter whose bug *is* its filtering — the identical blind spot as the
`.neq()` NULL-semantics bug in W3. The 403 check passed because 403 is thrown before the query
runs. Only two real users against a real database exposed it.

Regression test added (`test_countersigner_is_not_the_recipient_and_must_still_succeed`) with a
third-party recipient, so the fake now models the case the passthrough hid.

> **Pattern worth remembering:** every bug this project's unit tests missed has been a *query
> semantics* bug — `.neq()` against NULL, `.in_()` against a set the fake ignores. The service-free
> tier proves logic. It cannot prove queries. Those need a real database or a real browser.

## Bug 2 — brief detail unreadable by the countersigner (2026-08-16)

Found immediately after fixing the countersign scoping: the reliability user hit
**"Something went wrong"** opening the brief. Console showed `HTTP 404` from
`environmentName: "Server"`.

**Root cause is a pre-existing dev-mode quirk, not introduced here.** `briefs/[id]/page.tsx` is a
**server component**; in dev the SSR fetch carries no Authorization header, so the backend resolves
it as `dev-user` / `engineer` regardless of who is logged into the browser. My first exception
allowed only reliability/admin, so SSR 404'd for everyone.

**Fix:** a PTW brief is readable by any **staff** role. A permit-to-work brief is a posted safety
document for a work area, not private correspondence — Flow B needs at least two people to read it,
and anyone working that isolation reasonably needs to. Narrow by design: PTW briefs only, staff
roles only, inbox listing unchanged, and **signing rights untouched** (reliability/admin via
`require_role` + OPA).

Also replaced a raw UUID in the countersign button label with "Countersign permit" plus the
signer's email underneath.

### Verified end-to-end through the real UI, two real users

`reliability opens brief 200` → `engineer ack → pending_countersignature` → `engineer self-sign 403`
→ `reliability clicks Countersign permit` → backend `ack_at set, ack_by ff28c093 ≠ cs_by 80491482`
→ reload renders **"PTW signed off — acknowledged by … · countersigned by …"** from server truth
→ `double-countersign 409`.

## Frontend test errors ✅ fixed

The 3 long-standing unhandled errors were the same `getToken` trap, in
`app/(app)/assets/page.test.tsx`. Worth naming why it mattered: those tests **passed while
throwing**, so a real failure in the same effect would have been equally invisible.

**Final: backend 118 passed · frontend 145 passed, 0 errors · ruff clean · Go build+vet clean.**

### Still NOT verified end-to-end (honest list)

- Phase 1 actually suppressing synthesis — unit-tested only; needs a `KAIROS_PHASE=1` run.
- The `CoverageIndicator` fix in `knowledge-graph.tsx` — never observed rendering. It did not
  appear on `/assets/V-247`; it may only mount on a graph surface. Unconfirmed either way.
- W7's handwriting-suspect flag in the UI.

Remaining eslint: 3 warnings, 0 errors — all pre-existing (`userId` unused at `api.ts:970`, two
`exhaustive-deps` in a table component). Untouched.

---

## Post-verification follow-ups (2026-08-16)

### Task 3 — `CoverageIndicator`: no bug. My measurement was wrong.

I reported it as "never seen rendering, possibly a second bug". It renders correctly:

```
"Direct sensors · FT-3047, FV-3047"
```

Confirmed on `/assets/V-247` via full accessibility snapshot **and** `document.body.innerText`.
The network trace shows `GET /assets/V-247/ot-coverage → 200`. My earlier check used
`agent-browser snapshot -c` (compact), which drops the node — a false negative from my own tooling
flag, not from the code. Real tags, derived from engineer-verified topology, end to end.

### Task 4 — W7 handwriting flag now surfaced in the UI

The backend fields existed but **nothing consumed them** — `/documents/{id}/extraction` is not
called by the frontend at all, so the flag was invisible.

Rather than add a fetcher, the flag is now a `computed_field` on `VaultDocument`, which the
document detail page already loads. Derived server-side so the rule has **one definition** instead
of being duplicated in the adapter.

| File | Change |
|---|---|
| `backend/api/models/document.py` | `VaultDocument.extraction_path` + `.handwriting_suspect` as computed fields off `mime_type`. |
| `frontend/src/lib/types.ts` | Both fields, optional. |
| `frontend/src/app/(app)/documents/[id]/page.tsx` | Caution chip: "Handwriting suspect · read from image". |

### Task 2 — skipped, deliberately

Testing Phase 1 suppression means calling `POST /search/synthesize`, which writes an `audit_log`
row. Append-only and harmless, but it is still a write to the production Supabase, and the standing
constraint is that verification must not touch it. Phase gating remains **unit-tested only**
(`tests/test_phase_gate.py`, 6 cases) and unproven against a running stack.
