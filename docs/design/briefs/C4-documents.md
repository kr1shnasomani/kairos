# C4 — `/documents`

**Read `00-CONTRACT.md` and `AUDIT-2026-08-22.md` first.**

**Files you own:**
- `frontend/src/app/(app)/documents/page.tsx` (56 lines — thin shell)
- `frontend/src/app/(app)/documents/_components/documents-table.tsx` (the real work)
- `frontend/src/app/(app)/documents/page.test.tsx`

Do **not** touch `documents/[id]/`, `documents/compare/` or `documents/ingest/` — separate routes.

## Read this before you start

**Item 32's columns now render as of commit `5788652`** — they were in the DOM at 0px. Plus the tabs
and filter box already existed:

```
Document · Type & source · Authority · State · Updated
```

plus All/Active/Superseded tabs with counts and a filter box. **Do not rebuild the table.** Item 32
asks for five things; three are done. Four targeted changes remain.

## 1. Document IDs wear the alarm colour — 26 elements on this page

`documents-table.tsx:18`:

```tsx
<span className="tabular block truncate text-label font-medium text-accent">{r.document_id}</span>
```

`--accent` is the brand orange, ~10° from the alarm red — this is the review's "alarming red IDs".
The ID here is **not** a link → `text-muted tabular`. Check the other 25 `text-accent` elements on the
page the same way: primary action → keep, clickable → `text-link`, fault → `text-danger`, plain
identifier → `text-ink`/`text-muted`.

## 2. No download action

`grep -c 'vault_url\|download' documents-table.tsx` → **0**. Item 32 asks for one per row.

Add a `Get` column: a link to `r.vault_url`, `text-link`, accessible name containing "Download",
`align: "right"`. **Render nothing when `vault_url` is absent** — never a dead link.

## 3. The Updated column is relative-only

Use `<Timestamp value={r.ingested_at} />` so the exact UTC value is primary.

## 4. Filenames truncate without a hover

`documents-table.tsx:17` uses a raw `truncate` span. Wrap in `Truncate` so the full name stays
available on hover — the filename is the one field that says what the document is.

## Data notes

- All 24 documents are `status: "active"`. A hard-coded "Superseded" tab reads 0 forever — deriving
  the tab set from the data is a nice-to-have, not required here.
- **`ingested_by` is a raw UUID**, not a name. Omit the actor; never print a UUID. `docs/BUGS.md` B-6.4.
- `file_size_bytes` is available — `fmtCompact` exists in `@/lib/format`, check it before writing your own.

## Tests to add

```tsx
it("renders document ids quietly, not in the brand accent", …)
it("gives each row a download action", …)          // name: /download/i
it("shows the exact ingest timestamp", …)
it("does not render the raw ingested_by UUID", …)  // queryByText(/^[0-9a-f]{8}-/) is null
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
