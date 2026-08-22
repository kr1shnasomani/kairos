# C5 — `/projects`

**Read `00-CONTRACT.md` and `AUDIT-2026-08-22.md` first.**

**Files you own:**
- `frontend/src/app/(app)/projects/page.tsx` (130 lines — header + the four-figure stat strip)
- `frontend/src/app/(app)/projects/_components/class-section.tsx` (per-class cards, evidence IDs, filenames)
- `frontend/src/app/(app)/projects/page.test.tsx`

## This page has the worst of the colour problem

`document.querySelectorAll('[class*="text-accent"]').length` → **41**, the highest of any page.
That is the review's "document is full of errors in red" (item 34), and it is the bulk of the work here.

Three call sites are confirmed in `_components/class-section.tsx` — **check the line numbers still
match before editing**:

| Line | Current | Should be | Why |
|---|---|---|---|
| 34 | `text-accent` on the equipment-class eyebrow | `text-muted` | a label, not an action |
| 61 | `text-accent underline` on a `<Link>` to `/documents/{id}` | **`text-link`**, underline on hover only | a real link wearing the alarm-adjacent brand colour *and* a permanent underline |
| 92 | `text-accent` on `{e.asset_id}` | `text-ink tabular` | not clickable |

Then sweep the remaining `text-accent` on the page by the same rule: primary action → keep,
clickable → `text-link`, fault → `text-danger`, plain identifier → `text-ink`/`text-muted`.

Add `data-testid="evidence-id"` to line 61's link so the test can assert it.

## Item 33 — the review named the wrong cause

The review says one summary figure uses "a code font while the other stats used the normal font".
**Verified: there is no `font-mono` in either file.**

So: compare the four figures' actual classes in `page.tsx` and find the real difference — one may use
`tabular` while the others do not, or a different size or weight. Then make all four consistent;
`KpiGroup` is the natural fit.

**If the four already share one style, say so in your report and skip the item.** A false tick is
worse than an honest gap.

While you are there, fix pluralisation with `plural()` from `@/lib/labels`:

```tsx
plural(signalCount, "maintenance signal")   // "1 maintenance signal", never "1 signals"
plural(revisionCount, "retained revision")
```

`revisionCount` is computed at `page.tsx:60`.

## Item 35 — whole filenames

Show the full name with the source after a dot
(`seal_series_MS44_service_bulletin_r3.pdf · OEM_portal`). Use `Truncate` so the full value stays on
hover, and truncate only when a name is genuinely extreme.

## Tests to add

```tsx
it("renders evidence ids as links, not in the brand accent", …)
   // getAllByTestId("evidence-id")[0].className matches /text-link/, not /text-accent/

it("pluralises correctly", …)
   // queryByText(/^1 signals$/) is null

it("shows the whole filename", …)
   // getByTitle(<a full filename from the live data>)
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
