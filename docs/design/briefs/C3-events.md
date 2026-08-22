# C3 — `/events`

**Read `00-CONTRACT.md` and `AUDIT-2026-08-22.md` first.**

**Files you own:**
- `frontend/src/app/(app)/events/page.tsx` (198 lines)
- `frontend/src/app/(app)/events/page.test.tsx`

Leave `events/emit-panel.tsx` alone — separate concern.

## Read this before you start

**Review item 14 is fixed as of commit `5788652`** — the six columns were in the DOM but rendering at
0px (`table-fixed` ignores `max-width`; a `w-full` column took 100%). They now render:

```
Occurred · Priority · Type · Asset · Description · Status
```

**Do not rebuild the table.** Two defects remain.

## 1. The count is printed twice — item 15

Confirmed in the DOM: `document.body.innerText.match(/\d+\s+of\s+\d+/g)` returns
**`["22 of 22", "22 of 22"]`**.

Find both and delete the one further from the table. Do not keep a header count "for context" — the
duplication *is* the defect.

## 2. Twenty-four elements wear the brand accent

`document.querySelectorAll('[class*="text-accent"]').length` → **24** on this page.

For each: is it a **primary action** (keep `text-accent`), **clickable** (`text-link`), a **fault**
(`text-danger`), or a **plain identifier** (`text-ink tabular` / `text-muted`)?

Asset tags linking to `/assets/{id}` are the common case → `text-link`. Review items 22/34.

## Priority filters — do not hard-code

`operational_events.priority` is **NULL in every DB row**. The API reads it from a JSONB payload with
a silent `"normal"` default (`backend/api/routers/events.py:887`) and there is **no CHECK
constraint**, so the value is unconstrained. Live data has **`high` and `normal` only**.

Derive filter options from the rows you receive. A hard-coded four-level filter renders two
permanently empty options. `docs/BUGS.md` B-6.1.

**Events carry no actor field.** No assignee column, no avatar. Do not invent one.

## Tests to add

```tsx
it("shows the record count exactly once", …)
   // getAllByText(/\d+ of \d+/) has length 1

it("derives priority filter options from the data, not a fixed list", …)
   // with only "high" and "normal" present, no "critical" or "low" option renders

it("renders asset references as links, not in the brand accent", …)
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
