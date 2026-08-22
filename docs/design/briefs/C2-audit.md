# C2 — `/audit`

**Read `00-CONTRACT.md` and `AUDIT-2026-08-22.md` first.**

**Files you own:**
- `frontend/src/app/(app)/audit/page.tsx` (280 lines — everything is here)
- `frontend/src/app/(app)/audit/page.test.tsx`

## Live state, measured 2026-08-22

Headers: `Recorded · Action · Entity · Performed by · Details`. One `25 of 100` count — no
duplication there. Only **2** `text-accent` elements remain; Phase B already recoloured the entity ID
to `text-ink` and "Raw metadata" to `text-link`. **Verify that still holds and do not revert it.**

Two defects remain.

## 1. Timestamps are relative-only — item 28

The `Recorded` column shows "30m ago" / "2d ago" and nothing else. That is not enough for a
compliance audit: the exact value is the point of the record.

Replace with `<Timestamp value={row.timestamp} />`. Exact UTC becomes primary, the relative form
becomes the hint beneath. `/audit-log` returns ISO-8601 with microsecond precision, so this is pure
formatting.

## 2. Stat cards duplicate the tabs directly beneath them — item 29

The page renders a stat-card row *and* `FilterTabs` (`page.tsx:232`) carrying the same counts
(`All 100 / Query 62 / Asset 36 / …`). One number, one place.

**Delete the stat cards.** Do not replace them with different cards — reclaim the space.

## 3. Density — item 31

Once the cards are gone the table is the page. Cut padding and duplicated chrome; **do not shrink
type**.

## Worth knowing

`audit_log` holds **850 rows, 651 of them `action: "synthesis"` (77%)**. The firehose is a
data-composition fact as much as a layout one. A sensible default filter is the honest fix —
**hiding rows is not**. `docs/BUGS.md` B-6.2.

`details.description` sometimes holds stringified JSON inside the JSON field. Render it as text; do
not try to pretty-print it.

`performed_by` is a real display name here ("Suresh Yadav"), unlike `documents.ingested_by`.

## Tests to add

```tsx
it("shows exact timestamps, not only relative", …)
   // getByText(/\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}/) present

it("does not duplicate the tab counts in cards above them", …)
   // the stat-card row is gone

it("keeps entity ids out of the alarm colour", …)
   // the entity-id cell matches /text-ink/, not /text-danger|text-accent/
```

## Verify before you finish

```bash
cd /home/arnavbansal/kairos/kairos/frontend
npx vitest run <your test file>
npx tsc --noEmit
npm test 2>&1 | tail -5          # 179 passed / 1 known failure / 1 expected-fail
node scripts/check-overflow.mjs  # PASS
cd .. && git diff --stat -- frontend/src/components frontend/src/app/globals.css frontend/src/lib
```

That last command **must print nothing** — it proves you edited no shared file.

**Do not commit.** Leave changes in the working tree and report.
