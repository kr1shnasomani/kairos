# KAIROS — non-frontend bugs

Found during the frontend beautification pass. **None of these are frontend defects and none have
been touched** — the beautification work is scoped to `frontend/src` only. This file is the handover
to whoever owns the backend and infrastructure.

Ordered by urgency. B-1 is demo-blocking.

**Environment when found:** branch `feat/beautify`, full local stack up
(`docker compose --profile local-stores up -d`), 14 containers healthy, seeded with 10 assets /
24 documents / 21 events / 850 audit rows.

---

## B-1 · Embedding provider unreachable — breaks semantic retrieval and Copilot

**Severity: CRITICAL — demo-blocking** · Found 2026-08-22 00:13

### Symptom

`backend/api` logs, repeating every ~15 s:

```
2026-08-22 00:12:12 [error] embed.ollama_failed  error=All connection attempts failed
2026-08-22 00:12:26 [error] embed.ollama_failed  error=All connection attempts failed
2026-08-22 00:12:41 [error] embed.ollama_failed  error=All connection attempts failed
```

A full benchmark run (`docker compose exec kairos-backend-api python benchmark/run_benchmark.py`)
self-reported:

```
Retrieval (fact reaches context):    2/37  (5%)
Answer quality (facts, not negated): 8/37  (21%)
Provenance (sources cited):          12/37 (32%)
Run validity: INVALID — 29 question(s) returned no answer from any provider
              (infrastructure, not model quality). Do not quote.
```

**Do not read those as scores.** The run disqualified itself. They are the shape of a stack with no
embeddings.

### Impact

- **`/copilot` will fail live.** No embeddings → no vector search → no evidence → the safety gate
  correctly refuses, so the demo's headline feature returns refusals instead of answers.
- `/rca`, `/graph` semantic lookups and any Qdrant-backed retrieval degrade the same way.
- **The benchmark cannot be re-run to validate `RESULTS.md` until this is fixed** — which blocks
  settling the landing-page figure discrepancy in B-4 below.

### Likely cause

`.env` has **`JINA_API_KEY` empty** and **`NVIDIA_NIM_API_KEY` empty**. The documented embedding
provider is Jina (`jina-embeddings-v3`); with no key the cascade falls through to Ollama, and
`OLLAMA_BASE_URL` points at a host that is not running — nothing in the compose file serves Ollama,
and the profile-gated local stores do not include it.

So every embedding call walks the whole cascade and fails at the end of it.

### How to fix

1. **Confirm the intended provider.** `docs/BACKEND.md` and `AGENTS.md` both name Jina
   `jina-embeddings-v3` as the embedding model, with Ollama as a last-resort local fallback.
2. **Populate `JINA_API_KEY`** in `.env` (gitignored — never commit it). Restart the API:
   ```bash
   cd /home/arnavbansal/kairos/kairos
   docker compose --profile local-stores up -d --force-recreate kairos-backend-api
   ```
3. **Verify** the error stops and embeddings succeed:
   ```bash
   docker logs --since 2m kairos-backend-api 2>&1 | grep -c embed.ollama_failed   # expect 0
   ```
4. **Re-run the benchmark** and confirm `Run validity: VALID`:
   ```bash
   docker compose exec -T kairos-backend-api python benchmark/run_benchmark.py
   ```

**If no Jina key is available for the demo**, the fallback options are (a) stand up a local Ollama
reachable at `OLLAMA_BASE_URL` with `OLLAMA_EMBED_MODEL` pulled, or (b) accept that Copilot answers
will be refusals and do not demo that page. **Option (b) needs a product decision, not a silent
degradation** — a refusal looks like correct behaviour on screen, so the failure is invisible to an
audience but the feature is not actually working.

### Note for whoever fixes it

`make benchmark` **does not work** — see B-2. Use the `docker compose exec` form above.

---

## B-2 · `make benchmark` silently does nothing

**Severity: LOW — but it hides B-1** · Found 2026-08-22

### Symptom

```bash
$ make benchmark
make: 'benchmark' is up to date.
```

No benchmark runs. Exit code 0, so a script or CI step calling it would pass while doing nothing.

### Cause

The target name `benchmark` collides with the **directory** `benchmark/` at the repo root. Make sees
a file/directory matching the target name, considers it up to date, and skips the recipe. The
Makefile declares no `.PHONY`.

`Makefile:127`:
```make
benchmark:
	docker compose exec kairos-backend-api python benchmark/run_benchmark.py $(ARGS)
```

### How to fix

Add a `.PHONY` declaration. Every target in this Makefile is a command rather than a file, so the
safest fix covers all of them:

```make
.PHONY: help dev prod stop nuke logs ps init-neo4j init-qdrant init-all seed load-dataset \
        purge-test-data wipe-local reset-local test test-api test-connectors verify \
        benchmark model-gate lint format
```

Check for other collisions while you are there — `test/` and `docs/` are also directories, so
`make test` may be affected the same way.

### Verify

```bash
make benchmark    # must actually invoke docker compose exec, not print "up to date"
```

---

## B-3 · `GET /elicitation/offboarding/sessions` returns HTTP 500

**Severity: MEDIUM** · Found 2026-08-21

### Symptom

```bash
TOKEN=$(curl -s -X POST http://localhost:8000/auth/login \
  -H 'Content-Type: application/json' \
  -d '{"email":"admin@kairos.local","password":"KairosAdmin123!"}' \
  | python3 -c 'import sys,json;print(json.load(sys.stdin)["access_token"])')

curl -si -H "Authorization: Bearer $TOKEN" \
  http://localhost:8000/elicitation/offboarding/sessions | head -1
# HTTP/1.1 500 Internal Server Error
```

The sibling endpoint **works**:

```bash
curl -sL -H "Authorization: Bearer $TOKEN" http://localhost:8000/elicitation/offboarding
# 200 — returns one programme
```

### Impact

No frontend surface currently calls `/sessions`, so nothing is visibly broken today. It is a live 500
on a public route, which will fail any endpoint sweep or uptime check.

### How to fix

Start with the traceback:

```bash
docker logs --since 10m kairos-backend-api 2>&1 | grep -A30 'offboarding/sessions'
```

Look at `backend/api/routers/elicitation.py`. Two candidates worth checking first: a route ordering
problem where `/{session_id}` shadows the literal `/sessions` path, or a serialiser expecting a field
that `offboarding_session_items` does not populate — that table has 5 rows with `status` values
`questions_ready` (4) and `completed` (1).

### Verify

```bash
curl -si -H "Authorization: Bearer $TOKEN" \
  http://localhost:8000/elicitation/offboarding/sessions | head -1   # expect 200
```

---

## B-4 · Landing page benchmark figure disagrees with `RESULTS.md`

**Severity: MEDIUM — factual accuracy on a public page** · Found 2026-08-21

### Symptom

`frontend/src/app/page.tsx:112` claims:

```
Answer quality   91%   badge "34/37"
```

`benchmark/RESULTS.md:21` records:

```
| Query answer quality | ... | **33/37 (89.2%)**, 95% CI [79–97%]; run validity VALID |
```

The same file names the four honest misses — **Q02, Q07, Q09, Q29** — so 37 − 4 = **33**. The
landing's 34 is one question that did not pass, not a rounding difference.

The other two bars verify clean: Retrieval 37/37 and Provenance 37/37 both appear in `RESULTS.md`.

### Why it matters

The section is headed *"No empty promises. Provenance at 100%."* on a product whose pitch is refusing
to guess without evidence. A wrong benchmark number there is an integrity issue rather than a typo.

### Status — decided, not open

The user has **chosen to keep 91% for the demo**. The frontend has **not** been changed and
`RESULTS.md` has **not** been touched.

A guard test now makes the drift visible instead of silent:
`frontend/src/app/landing-figures.test.ts`. It is written as `it.fails()` — it passes while the drift
exists and starts **failing** the moment the two agree, which is the signal to delete the marker. A
permanently red test would just be broken CI.

### How to resolve properly

Fix **B-1** first, then re-run the benchmark to get a valid measurement:

```bash
docker compose exec -T kairos-backend-api python benchmark/run_benchmark.py
```

- If the valid run scores **34/37 or better** → update `RESULTS.md`; the landing is already correct.
- If it scores **33/37** → the discrepancy is real; the number on the landing needs a decision from
  whoever owns the claim.

**Do not change either number without a valid benchmark run.** The 2026-08-22 attempt was INVALID
(see B-1) and settles nothing.

---

## B-5 · `/assets` list endpoint omits the issue counts

**Severity: LOW — feature-blocking, not a defect** · Found 2026-08-21

Not a bug in the strict sense — the endpoint does what it was written to do. It blocks a column the
design review asks for.

`GET /assets/` does not return `open_work_orders_count` or `compliance_gap_count`. Both **already
exist** on `GET /assets/{asset_id}`.

Full specification, including the SQL sketch, the aggregate-query requirement (no N+1), the
zero-not-null contract and copy-paste verification commands, is written up separately in
**`docs/design/BACKEND-ASK.md`**.

The frontend ships `/assets` with three columns without it, so this is not blocking the beautification
work.

---

## B-6 · Data-quality observations

**Severity: INFORMATIONAL** · Found 2026-08-21 during the data audit

Not bugs to fix blind — each is a decision for whoever owns the data model. Recorded because each one
constrains what the UI is allowed to render, and the reasoning is captured in
`docs/design/DATA-CONTRACT.md`.

| # | Observation | Consequence for the UI |
|---|---|---|
| 1 | **`operational_events.priority` is NULL in all 21 rows.** The API reads `payload.priority` from JSONB instead (`backend/api/routers/events.py:887`), defaulting to `"normal"` when the key is absent. The column has no CHECK constraint, so the value is unconstrained. | Priority filters must derive from the data present. A hard-coded four-level set would render dead options. `models/event.py:29` documents "critical, high, normal, low" but nothing enforces it. |
| 2 | **`audit_log` is 77% one action** — 651 of 850 rows are `synthesis`. | `/audit` reads as a repetitive firehose. A default filter helps, but the signal-to-noise is a data-composition decision. |
| 3 | **`audit_log.details.description` contains stringified JSON inside a JSON field** — a nested escaped blob rather than structured data. | Cannot be rendered as structured detail without double-parsing. |
| 4 | **Actor identity is inconsistent across tables.** `quarantine.submitted_by` and `audit_log.performed_by` store display names ("Suresh Yadav"); `documents.ingested_by` stores a raw UUID; `operational_events` has no actor field at all. | The UI must degrade per row: name → initials avatar, UUID → omit, absent → omit. An avatar cannot be a fixed column. |
| 5 | **`offboarding_sessions` has no `full_name` field** — only `personnel_id` and `personnel_email`. | The review mockup shows a full name. **Superseded by B-7:** the local-part is no longer human-readable (`resp_F001AE52@kairos.local`), so a name cannot be derived at all. The UI must render the identifier honestly and never fabricate one. |
| 6 | **Single-value columns**: `assets.status` (`active` ×10), `assets.site_id` (`SITE_001` ×10), `assets.eam_source` (`manual` ×10), `documents.status` (`active` ×24). | These get no column width. Two of the review mockup's `/assets` columns were dropped for this reason. |
| 7 | **`ner_annotations` and `brief_feedback` are empty** (0 rows). | Any UI built on them shows an empty state only. |

---

## B-7 · Test-run writes have polluted the demo database

**Severity: HIGH — demo-visible** · Found 2026-08-22 while measuring Phase D pages

### Symptom

Records created by automated test runs are present in the demo data and render on screen.

`/offboarding`, measured live:

```
17 active programmes · 101 TOTAL SESSIONS · 1 of 101 sessions CAPTURED · 0 COMPLETE
RF  resp_F001AE52@kairos.local     Retires 21 Sept 2026  In progress  0 of 6 sessions  0%
QF  qtest_F0D6129E@kairos.local    Retires 6 Oct 2026    In progress  0 of 6 sessions  0%
D7  detail_79365ED2@kairos.local   Retires 21 Sept 2026  In progress  0 of 6 sessions  0%
```

`/management` signals feed shows asset ids of the form `ASSET-TEST-4AFBE`.

Counts have inflated well past the documented seed set:

| Entity | `DATA-CONTRACT.md` (2026-08-21) | Measured 2026-08-22 |
|---|---|---|
| Offboarding sessions | 5 | **101** |
| Open conflicts | — | **45** |
| Pending quarantine | — | **189** |

The `resp_`, `qtest_`, `detail_` prefixes and the `TEST` infix are generated identifiers, not seed
data. The seed record the design docs were written against — `EXPERT-RKUMAR` /
`ramesh.kumar@kairos.local` — is no longer present in the list.

### Impact

1. **Demo-visible.** `qtest_F0D6129E@kairos.local` and `ASSET-TEST-4AFBE` appear on two screens a
   viewer is likely to open.
2. **The knowledge-transfer story breaks.** `/offboarding` reads `1 of 101 sessions captured` and
   `0 complete` — a programme that looks abandoned rather than in progress.
3. **`docs/design/DATA-CONTRACT.md` is now partly stale.** Its distributions were measured on
   2026-08-21 and Phase C briefs relied on them. Phase D briefs measure per page instead.
4. **One design item became undeliverable.** Review item 37 asks for the expert's full name;
   `resp_F001AE52@` contains no name, so the frontend now renders the identifier honestly rather
   than fabricating one. See `docs/design/briefs/D5-offboarding.md`.

### Likely cause

Tests are writing against the same database the demo reads, with no teardown and no separate
schema/instance. Every run leaves its records behind, which is consistent with the mixed prefixes
(`resp_`, `qtest_`, `detail_` look like different test modules) and with counts that grow rather
than reset.

### Fix

Two parts, and the second matters more than the first.

1. **Clean the demo data.** Remove records whose identifiers match the generated patterns — e.g.
   `personnel_email LIKE 'resp\_%' OR LIKE 'qtest\_%' OR LIKE 'detail\_%'`, and assets matching
   `ASSET-TEST-%`. **Confirm the pattern list against the test suite before deleting anything** —
   deleting by guessed prefix risks removing real seed rows. Re-seed afterwards if the seed set is
   reproducible.
2. **Stop it recurring.** Point the test suite at its own database (or a transactional fixture that
   rolls back), so a test run cannot mutate demo state. Without this, part 1 has to be repeated
   before every demo.

### Verification

```bash
# 1 — no generated identifiers remain
psql "$DATABASE_URL" -c "SELECT count(*) FROM offboarding_sessions WHERE personnel_email ~ '^(resp|qtest|detail)_';"
psql "$DATABASE_URL" -c "SELECT count(*) FROM assets WHERE asset_id LIKE '%TEST%';"
# both must return 0

# 2 — counts back at seed scale
psql "$DATABASE_URL" -c "SELECT count(*) FROM offboarding_sessions;"   # expect ~5, not 101

# 3 — the guarantee that matters: run the suite, then re-check
make test && psql "$DATABASE_URL" -c "SELECT count(*) FROM offboarding_sessions;"
# the count must be UNCHANGED by the test run
```

Step 3 is the real acceptance test. Steps 1 and 2 only prove the symptom was swept up; step 3 proves
the cause is gone.

---

## Reporting conventions

New entries go at the end with the next `B-n` number. Each one should carry: symptom with the exact
command and output, impact, likely cause with a file reference where known, a fix, and a verification
command. A bug report without a verification step is a rumour.
