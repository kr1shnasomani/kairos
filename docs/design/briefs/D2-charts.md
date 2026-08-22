# D2 — chart components

**Owns exclusively:** `frontend/src/components/charts.tsx` · `frontend/src/components/charts/*` ·
`frontend/src/app/(app)/system-benchmarks/page.tsx` · `frontend/src/app/(app)/events/page.tsx`

**Read-only:** everything else, including `app/(app)/management/page.tsx` and
`app/(app)/compliance/page.tsx`. You will fix the components those pages *render*; you do not edit
the pages themselves.

Review items: **12, 23, 24.** Plus the sibling half of item 4.

**These components are shared. Verified consumer list — check it before changing any signature:**

| Component | Consumers |
|---|---|
| `BarList` | `/compliance` · `/system-benchmarks` · `/governance/circuit-breaker` · **`/rca`** (`rca/_components/hypotheses-panel.tsx`) |
| `Donut` | `/compliance` **only** |

`/governance/sla` does **not** use the shared `Donut` — it has its own `PieChart` in
`governance/sla/_components/plots.tsx`. That file is **not yours**; leave it alone.

Every change must hold on every consumer above. A fix that only works for `/compliance` is not a fix,
and `/rca` is the one that gets forgotten.


> **Before trusting any browser measurement, read the "READ FIRST" section at the top of
> `D-STATE.md`.** The frontend runs in a container that does not hot-reload across the WSL2 bind
> mount, so the page you are looking at may not contain your change. `tsc` and `npm test` are
> unaffected; only browser measurements are at risk.

---

## Item 23 — ranked bars carry no value and no scale

Measured on `/compliance` → "Gaps by framework": bars render for `ISO-45001` and `OISD-117` with
**no numeric value, no percentage, no x-axis** — nothing that says how big a bar is.

Cause, `components/charts/bar-list.tsx:30`:

```tsx
<XAxis type="number" hide />
```

and no `LabelList` on the `<Bar>`.

The reference pattern the design doc asks for is *value on the bar*: `label ────────  12  (23%)`.

**Fix:** put the value on each bar via recharts' `LabelList` (already available — no new dependency),
respecting the existing `valueFormat` prop where callers pass one. Add the x-axis scale **only if it
survives every call site** — `/governance/circuit-breaker` passes σ values, `/system-benchmarks`
passes 3-decimal scores, and `/rca` passes hypothesis weights, so a scale tuned to integer gap counts
will read wrong on three of the four. If the axis cannot be made honest across all three, **keep it hidden and put the value on the
bar** — that alone closes the item.

Percentage-of-total is only meaningful when the bars *are* a whole. They are not, everywhere.
**Compute it only if the caller opts in** — an optional prop, defaulting off.

**Accept when:** every visible bar has a readable value on **all four** consuming pages, no label
overflows its card, and the label is legible against both bar fill and card background in **light and
dark**.

## Item 24 — donut segments are not clickable

Measured: `.recharts-pie-sector` has `cursor: default`; there is no `onClick`.

**Fix:** add an **optional** `onSliceClick?: (slice: DonutSlice) => void`. When passed, sectors get
`cursor: pointer` and fire it. When not passed, behaviour is exactly as today — `cursor: default`,
no handler.

Do not wire any page to it: `/compliance` is not your file. Ship the capability; the page adopts it
later.

**Accessibility is not optional here.** A click target that only exists as an SVG path is unusable by
keyboard and screen reader. When `onSliceClick` is passed, the slices must be reachable and
activatable by keyboard. If recharts cannot express that cleanly, put the interaction on the legend
entries instead and say so in your report — a keyboard-reachable legend is a better answer than an
inaccessible pie.

**Accept when:** with a handler, sectors show `cursor: pointer`, fire on click, and are
keyboard-operable; without one, nothing changed.

## Item 12 — a 2-point series drawn as a line

Measured on `/events` — and it is **worse than the review states**:

```
.recharts-line-curve  → 0        // no curve is drawn AT ALL
.recharts-line-dot    → 2        // two dots, one per series
legend                → High, Normal
```

Two series, **one data point each**. Not "a line between two points" — a line chart with nothing to
draw a line between. `.recharts-xAxis .recharts-cartesian-axis-tick-value` also returns **0**.

A line implies a trend. One sample cannot support one.

**Before you change anything, measure how many points the series actually has.** `/events` at
`app/(app)/events/page.tsx:162` builds `trend` from live data — the count varies with what is in the
database, and the DB currently holds test-run writes (see `D-STATE.md`).

**Fix:** switch on the real point count. **≤ 2 points → bars. More → keep the line.** Put the
threshold in one named constant with a comment saying why, so the next reader does not treat it as
arbitrary.

The point count is **live** and will change once the polluted test data is cleaned (see B-7 in
`docs/BUGS.md`) — so the switch must be computed from the data at render time, never hardcoded to
what you observe today.

Also confirm the x-axis ticks render. `tickFormatter={(d) => String(d).slice(5)}` with
`minTickGap={24}` can drop every tick on a short series. Ticks that do not render are the same defect
as item 4 on `/management`.

**Accept when:** with the live series, the chart type matches the point count, and
`.recharts-xAxis .recharts-cartesian-axis-tick-value` returns **> 0**.

## Item 4, sibling — the other negative margin

`system-benchmarks/page.tsx:133`:

```tsx
<LineChart data={runs} margin={{ top: 8, right: 12, bottom: 0, left: -18 }}>
```

Same defect that erased the Y-axis labels on `/management`. **Measure that page's Y ticks first** —
if they render, leave the margin alone and report that; if they do not, set `left: 0`.

Two call sites is not enough to justify changing `ChartCard`'s defaults. **Do not** add a margin
default to the shared card — the margin is passed by the caller straight to recharts, and a default
there would silently override every future call site.

---

## Constraints

- No new npm dependencies. `recharts` is already present; `@testing-library/user-event` is **not** —
  use `fireEvent`.
- Both palettes. Colours come from `var(--token)` — SVG presentation attributes resolve CSS custom
  properties live, which is why light/dark works with no JS. **Never hardcode a hex.**
- Respect `useReducedMotion()` — every animated chart in this codebase already does.
- Keep `ChartTone`, `TONE_VAR`, `SERIES`, `AXIS`, `GRID`, `TOOLTIP` exports and their shapes intact;
  pages outside your ownership import them.
- Do not remove the `downsample()` call in `BarList`.

## Report

Name every page you actually loaded to verify a shared component. If you could not load one, say so.
Do not report a `npm test` summary your sandbox did not produce. **Do not commit.**
