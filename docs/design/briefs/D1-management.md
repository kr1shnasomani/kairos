# D1 — `/management` overview

**Owns exclusively:** `frontend/src/app/(app)/management/page.tsx` ·
`frontend/src/app/(app)/management/_components/*` · `frontend/src/app/(app)/management/page.test.tsx`

**Read-only:** everything else. Especially `components/charts.tsx` and `components/charts/*` — those
belong to D2. You fix a chart *call site*, never the chart component.

Review items: **3, 4, 5, 6.** All four were measured on the live app — see `D-STATE.md`.


> **Before trusting any browser measurement, read the "READ FIRST" section at the top of
> `D-STATE.md`.** The frontend runs in a container that does not hot-reload across the WSL2 bind
> mount, so the page you are looking at may not contain your change. `tsc` and `npm test` are
> unaffected; only browser measurements are at risk.

---

## Item 4 — the Y axis has no labels at all

The review says "clipped and unreadable". Measurement is stronger:
`document.querySelectorAll('.recharts-yAxis .recharts-cartesian-axis-tick-value').length` is **0**.

Cause, `management/page.tsx:146`:

```tsx
<AreaChart data={trend ?? []} margin={{ top: 4, right: 4, left: -24, bottom: 0 }}>
```

`left: -24` against `<YAxis {...AXIS} allowDecimals={false} width={36} />` leaves 12px for the tick
text, so recharts drops it entirely.

**Fix:** remove the negative left margin (`left: 0`), keep `width={36}` or raise it until ticks
render. Do not add a wrapper, do not touch `AXIS`.

**Accept when:** the selector above returns **> 0**, and the tick text is fully inside the card —
compare each tick's `getBoundingClientRect().left` against the card's.

`system-benchmarks/page.tsx:133` has the same `left: -18` defect. **It is D2's file. Leave it.**

## Item 5 — "Plant state" is an orphaned ghost button

Measured: `<a>` with `border border-line bg-surface px-3 text-caption font-medium text-muted`, text
`Plant state`, top-right of the page header. No status, no grouping, no affordance.

The mockup asks for a status pill: `● Plant state  Nominal`.

**Fix:** render it as a status pill — a tone dot, the label, and the current state — while keeping it
a link to `/management/plant-state`.

**The state must come from data you already fetch.** `getHealthDetailed` is already wired into this
page (`healthState` / `health`). Derive the word from it. If health has not resolved, show the label
without a fabricated state; if it errored, say so. **Never hardcode "Nominal".**

Reuse the existing tone vocabulary (`verified` / `caution` / `danger` / `info`) — the same tones
`MetricCard` takes. Do not invent a colour and do not import from `ui.tsx` anything that is not
already exported.

**Accept when:** the pill shows a state derived from `healthState`, the loading and error paths are
visibly different from the healthy one, and the link still navigates.

## Item 3 — a horizontal scroller, at 1024 only

Measured: **53px** of horizontal overflow inside `mt-2 min-h-0 flex-1 overflow-y-auto pr-1` — the
scroll region in the signals feed. **Only at 1024.** Clean at 768, 1280 and 1440.

The review (and the bug-report PDF, for "Recent signals") wants the text to **wrap to the next line**
instead of scrolling sideways.

**Fix:** let the row content wrap. The usual cause is a flex row whose children cannot shrink —
`min-w-0` on the shrinking child, and wrapping rather than `whitespace-nowrap`, is normally the whole
fix. Do not solve it by hiding overflow: hidden text is a worse defect than a scrollbar.

**Accept when:** the overflow query in `D-STATE.md` returns 0 **at 1024**, and no signal row has
clipped or truncated text at 768, 1024, 1280, 1440.

## Item 6 — mostly already satisfied; read before you touch it

Measured: `[data-testid="overview-priority-layout"]` has **two** children, **both 1245px** tall.

- "First two cards equal height" — **already true.** Do not re-engineer it.
- "Second vertically scrollable" — already true (that is the `overflow-y-auto` from item 3).
- "Third card full width" — **there is no third card.** The mockup describes a three-child grid that
  this page does not have.

**Do only this:** confirm the two columns stay equal-height after your item-3 fix, and that
`HealthStrip` sits flush under `AttentionList` with no stranded gap. If your fix changes either
height, correct it. Otherwise **change nothing for item 6 and say so in your report.**

Fixing working code is a defect. Phase C's worst error was the mirror of this — declaring broken code
fixed — and both come from not measuring.

---

## Constraints

- No new npm dependencies. `@testing-library/user-event` is **not** installed — use `fireEvent`.
- Live data only. No fixtures, no mock rows, no `DataSource` beyond `"live"`.
- Keep every existing `data-testid`.
- All motion under `prefers-reduced-motion` — this page already uses `useScrollReveal` and
  `useReducedMotion` from `@/lib/motion`. Follow that pattern.
- Tests: extend `management/page.test.tsx`. **`management/page.test.tsx:61` already fails** —
  pre-existing copy drift, not yours. Do not fix it, do not delete it, do not let it grow to two.

## Report

State what you ran and what you could not. If `npm test` cannot run in your sandbox, **say that** —
do not summarise a run you did not observe. **Do not commit.**
