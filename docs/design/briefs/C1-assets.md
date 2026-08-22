# C1 — `/assets`

**Read `00-CONTRACT.md` and `AUDIT-2026-08-22.md` first.**

**Files you own:**
- `frontend/src/app/(app)/assets/page.tsx` (48 lines — header + StatPills)
- `frontend/src/app/(app)/assets/asset-registry.tsx` (the table, filters, sorting)
- `frontend/src/app/(app)/assets/page.test.tsx`

## Read this before you start

**Review item 8 is fixed as of commit `5788652`** — but not the way an earlier audit claimed. The
five columns were always in the DOM; they rendered at **0px** because `table-fixed` ignores
`max-width` and a `w-full` column took 100%. The senior review was right. They now render:

```
Asset · Name · Equipment class · Site · Criticality
```

`asset-registry.tsx:23-35` defines all five. **Do not rebuild the table.** Four smaller defects remain.

## 1. Raw database values reaching the screen

`asset-registry.tsx:26` renders the class key directly:

```tsx
render: (r) => <span className="block truncate text-caption text-muted">{r.equipment_class}</span>
```

so the user sees `he-3xx_series`, `rotating_centrifugal_pump`, `valve_isolation`. Wrap in `label()`
from `@/lib/labels`. The same raw keys appear in the `StatPills` on `page.tsx` — fix both.

Also route the equipment-class **filter options** (`asset-registry.tsx:49`) through `label()` for
display, while still filtering on the raw value.

## 2. The asset ID wears the alarm colour

`asset-registry.tsx:24`:

```tsx
<span className="tabular whitespace-nowrap font-semibold text-accent">{r.asset_id}</span>
```

`--accent` is the brand orange, ~10° from the alarm red. The row is clickable (`onRowClick` routes to
the asset), so the ID is a **navigational identifier**, not a fault → **`text-link`**.
Review items 22/34.

## 3. Total mixed with its own breakdown — item 9

`page.tsx:36` renders one flat `StatPills` row:

```tsx
<StatPills pills={[{ key: "total", label: "Registered", value: ... }, ...classPills]} />
```

so "Registered 10" sits inline with the per-class counts that sum to it, reading as just another
class. Replace with `KpiGroup`:

```tsx
<KpiGroup
  total={{ label: "Registered assets", value: data.total ?? items.length }}
  breakdownLabel="By equipment class"
  breakdown={classPills.map((p) => ({ label: label(p.label), value: p.value }))}
/>
```

## 4. The Site column carries no information

`site_id` is `SITE_001` for **all 10 rows** (`DATA-CONTRACT.md` §3). A single-value column is wasted
width. Remove it — `asset-registry.tsx:27`.

## Item 11 — judgement call, report your reasoning

The review asks for a "Register asset" button on the page. `page.tsx:28` already has an `actions`
slot, but it holds `IdentityConfirmAction` ("Identity confirmation"), not a register action.

**Check whether a register/bootstrap route exists** before adding a button — `/assets/bootstrap` is
referenced in the empty state. If it does, add a secondary action pointing at it. **If there is no
such route, do not invent one** — say so in your report.

## Tests to add

```tsx
it("humanises equipment class rather than printing the raw key", …)
   // queryByText(/he-3xx_series/) is null; getByText(/HE-3xx series/) present

it("renders the asset id as a link colour, not the brand accent", …)
   // the asset-id cell className matches /text-link/ and not /text-accent/

it("separates the registered total from the per-class breakdown", …)
   // getByTestId("kpi-total") contains the total, not "By equipment class"

it("does not render a single-value Site column", …)
   // queryByRole("columnheader", { name: /^site$/i }) is null
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
