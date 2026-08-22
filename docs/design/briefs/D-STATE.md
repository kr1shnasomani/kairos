# Phase D — measured state, 2026-08-22

**Everything here was measured on the running app at 1440px (and 768/1024/1280 where noted), not
read from the senior review.** Where the review's wording and the measurement disagree, the
measurement wins and this file says so.

Read this plus `00-CONTRACT.md` plus your own `D*.md` brief. Nothing else is required.

---

## READ FIRST — the frontend runs in Docker and does NOT hot-reload

`http://localhost:3000` is served by the `kairos-frontend` container. `frontend/src` is bind-mounted
from the host, but **WSL2 file-watch events do not cross into the container**, so Turbopack never
sees your edit. The browser keeps serving the bundle built when the container last started.

**This silently invalidates every measurement you take.** You will edit a file, reload the page, see
no change, and conclude your fix does not work — when the browser is simply showing older code. This
already happened once: a CSS rule was correct in source, `matches()` returned true for its selector,
and the computed style was still the old value, because the rule was absent from the served bundle.

**Before trusting any browser measurement, confirm the running app contains your change:**

```bash
# does the served CSS/JS actually contain the thing you just wrote?
docker exec kairos-frontend grep -c "your-new-class-or-string" /app/src/app/globals.css   # source, in-container
```

…and if the page still disagrees with the source, restart the container and re-measure:

```bash
cd /home/arnavbansal/kairos/kairos      # the cd matters — compose from the wrong directory
docker compose restart kairos-frontend  # fabricates empty mounts and breaks the API
# wait for a 200 before measuring
until [ "$(curl -s -o /dev/null -w '%{http_code}' http://localhost:3000/)" = 200 ]; do sleep 3; done
```

A restart is usually enough. If the served bundle is *still* stale after a restart, say so in your
report rather than fighting it — that is a real finding and the human running you will clear the
Turbopack cache.

**`npx tsc --noEmit` and `npm test` run against the host filesystem and are unaffected.** Only
browser measurements are at risk.

---

## The measurement that must go in every brief

An earlier pass asked for duplicate CTA text on `/governance` and got **zero**. It read `innerText`
of the wrapping `<a>`, which includes the whole card body — so six identical `Open control →` links
looked distinct. A false "already fixed", the same failure as the `<th>` count in a new costume.

**And a second one, found the same way.** This file first claimed the `/management` Y-axis labels were
*absent*, from `.recharts-yAxis .recharts-cartesian-axis-tick-value` returning 0. **That selector can
never match in this Recharts version** — tick `<text>` is a *sibling* of `.recharts-yAxis`, not a
descendant. The D1 agent caught it. Query tick values without the ancestor, then classify by position:

```js
const svg = document.querySelector('.recharts-surface');
[...svg.querySelectorAll('.recharts-cartesian-axis-tick-value')]
  .map(t => { const r = t.getBoundingClientRect(); return { text: t.textContent, left: Math.round(r.left) }; })
  .filter(t => t.left < svg.getBoundingClientRect().left + 60);   // left of the plot = Y axis
```

**Query leaf controls only:**

```js
[...document.querySelectorAll('a,button')]
  .filter(e => !e.querySelector('a,button'))     // leaf controls only
  .map(e => e.innerText.trim()).filter(Boolean)
```

General form — visibility filter on everything:

```js
const vis = e => { const r = e.getBoundingClientRect(); return r.width > 4 && r.height > 4; };
```

---

## Live measurements — the ground truth for Phase D

### `/management`

| Item | Review says | Measured | Verdict |
|---|---|---|---|
| 3 | horizontal scroller in card | overflow **53px, at 1024 only** — `mt-2 min-h-0 flex-1 overflow-y-auto pr-1` in the signals feed. **Not** at 768, 1280, 1440. | **open, single breakpoint** |
| 4 | "Y-axis labels clipped and unreadable" | **The senior was right; this file's first reading was wrong.** Measured both states: with `left: -24` ticks sat **2–13px from the card edge**, inside its 16px padding — cramped and clipped. With `left: 0`, **26–37px**. Cause: `margin={{ left: -24 }}` against `<YAxis width={36}>` in `management/page.tsx:146`. | **FIXED — `f35ff0c`** |
| 5 | "Plant state" orphaned ghost button | confirmed — `<a>` with `border border-line bg-surface text-muted`, text `Plant state`, no status. | **open** |
| 6 | first two cards equal height, third full width | `overview-priority-layout` has **two** children, both **1245px** tall. Equal height already holds; there is no third card. | **partly satisfied — do not "fix" the heights** |

### Charts (shared components)

| Item | Measured | Where |
|---|---|---|
| 23 | `/compliance` "Gaps by framework" renders bars with **no value, no percentage, no x-axis** — `<XAxis type="number" hide />` and no `LabelList`. | `components/charts/bar-list.tsx:30` |
| 24 | donut sectors have `cursor: default`, no `onClick` — segments are not clickable. | `components/charts/donut.tsx` |
| 12 | `/events`: **each series is a SINGLE POINT.** `.recharts-line-curve` → **0**, `.recharts-line-dot` → **2**, legend `High` / `Normal`. Not a two-point line — two one-point series drawn as lines with no curve at all. | `app/(app)/events/page.tsx:162` |
| 4 (sibling) | second negative left margin: `system-benchmarks/page.tsx:133` `left: -18`. Same defect class. | fix with 23/24 |

### `/governance`

Six leaf CTAs, **all reading `Open control →`**: Conflicts · Quarantine · Management of Change ·
SLA report · Circuit Breaker · Model Gate. Confirmed. Items 25 and 27 are **open**.

### `/graph`

| Item | Measured | Verdict |
|---|---|---|
| 19 | pill `absolute bottom-12 left-3 z-10` ("No sensor coverage") **overlapped** `.react-flow__controls` at x 364–392, y 917–997. Moved to `left-14`. | **FIXED — `f35ff0c`** |
| 16, 17 | `nodeCount: 1` — a single `ASSET / EQ-101` node, 180×101, `overflow: visible`, `scrollWidth == clientWidth`. Label wrapping **cannot be reproduced or verified** with one node. | **PARKED** |

**Do not write or accept a fix for 16/17.** A defect that cannot be reproduced cannot be verified,
and guessing at it is exactly how the first C1 brief went wrong twice. Re-open when the graph
renders a multi-node result.

### `/offboarding` — the review's data no longer exists

Live page text:

```
17 active programmes · 101 TOTAL SESSIONS · 1 of 101 sessions CAPTURED · 0 COMPLETE
RF  resp_F001AE52@kairos.local     Retires 21 Sept 2026  In progress  0 of 6 sessions  0%
QF  qtest_F0D6129E@kairos.local    Retires 6 Oct 2026    In progress  0 of 6 sessions  0%
D7  detail_79365ED2@kairos.local   Retires 21 …
```

- The review's mockup ("Raymond Ellison, 2 of 6, 33%") is **invented**.
- `EXPERT-RKUMAR` / `ramesh.kumar@kairos.local` is **NOT gone** — an earlier version of this file
  said so and was wrong. It is record **17 of 17**, pushed to the end by 16 test-run rows. Confirmed
  against `/elicitation/offboarding`.
- `resp_F001AE52@`, `qtest_F0D6129E@`, `detail_79365ED2@` are **test-run writes**, not seed data.
  Same pollution shows as `ASSET-TEST-4AFBE` in the `/management` signals feed, and in the inflated
  counts (45 conflicts, 189 quarantine, 101 sessions).

**Consequence:** "derive the full name from `personnel_email`" is undeliverable — there is no name in
`resp_F001AE52@`. D5 is re-scoped to the fix that is correct either way: **render the identifier
honestly and degrade gracefully when no human name exists. Never fabricate one.**

The pollution itself is a backend/data problem → logged in `docs/BUGS.md`, not fixed here.

### Nav rail

`width 316` · `overflowY: visible` · `scrollHeight == clientHeight` · **no collapse control**.
Item 2 open. `scrollHeight == clientHeight` means the "invisible scrollbar" half currently has
nothing to hide — implement it so it stays hidden when the rail *does* overflow.

### Landing

`app/page.tsx` — **59 `sm:` · 0 `md:` · 12 `lg:`**. Confirmed.

---

## Task table

| Task | Owns (exclusive) | Items | Independent? |
|---|---|---|---|
| D1 | `app/(app)/management/page.tsx` · `management/_components/*` · `management/page.test.tsx` | 3, 4, 5, 6 | ✅ |
| D2 | `components/charts.tsx` · `components/charts/*` · `app/(app)/system-benchmarks/page.tsx` · `app/(app)/events/page.tsx` | 12, 23, 24 | ✅ |
| D3 | `app/(app)/governance/page.tsx` · `governance/page.test.tsx` | 25, 27 | ✅ |
| D4a | `components/knowledge-graph.tsx` · `knowledge-graph.test.tsx` | 19 | ✅ |
| D5 | `app/(app)/(desktop)/offboarding/**` | 37, 38 | ✅ |
| D6 | `app/page.tsx` · `app/page.test.tsx` | landing `md:` + motion | ✅ |
| ~~D7~~ | ~~`components/app-shell.tsx`~~ | ~~2~~ | **DONE** — commit `141a023` |

**All of D1–D6 are cleanly independent.** STATE.md's claim that "D1 and D2 overlap on charts" is
wrong: split by *file ownership* rather than concern and the overlap disappears — D1 owns the
management call site, D2 owns the shared chart components.

D7 is complete (collapsible nav rail, commit `141a023`). It edited the shell, so it was never
dispatched. `components/app-shell.tsx`, `app/layout.tsx` and `components/brand-link.tsx` are now
**read-only to every D agent.**

---

## Read-only for every D agent

`components/ui.tsx` · `app/globals.css` · `lib/labels.ts` · `lib/format.ts` · `lib/api.ts` ·
`lib/types.ts` · `lib/motion.ts` · `components/app-shell.tsx` · `app/layout.tsx` ·
`components/brand-link.tsx`

**Plus:** any file another task owns in the table above. `components/charts*` belongs to D2 alone —
D1 must not touch it even though D1 fixes a chart.

An agent that believes a read-only file must change **stops and reports**. It does not edit.

---

## Reporting rule — added after Phase C

Three of five Phase C reports contained a claim that did not survive measurement: one said `/audit`
was stuck on a loading skeleton (it renders fine), two reported `npm test` summaries their sandboxes
never produced. None were dishonest — they were harness limits reported as findings.

**Report what you actually ran and what you could not run.** Do not imply a pass you did not observe.
"`npm test` could not run in this sandbox" is a useful, welcome answer. A fabricated summary is not.

---

## Verification — run before accepting any D work

```bash
cd frontend
npx tsc --noEmit                       # 0 errors
npm test 2>&1 | tail -5                # 200 passed · 1 known failure · 1 expected-fail
node scripts/check-overflow.mjs        # PASS
cd .. && git diff --stat -- frontend/src/components/ui.tsx frontend/src/app/globals.css frontend/src/lib
```

That last command **must print nothing**.

Baseline: **200 passed**, 1 known failure (`management/page.test.tsx:61`, pre-existing copy drift),
1 expected-fail (`app/landing-figures.test.ts`, intentional `it.fails()` drift marker).

### Per-item acceptance checks (measured, not counted)

```js
// item 4 — Y-axis labels must EXIST
document.querySelectorAll('.recharts-yAxis .recharts-cartesian-axis-tick-value').length > 0

// item 3 — at 1024 specifically
[...document.querySelectorAll('*')].filter(e => {
  const cs = getComputedStyle(e);
  return (cs.overflowX === 'auto' || cs.overflowX === 'scroll') && e.scrollWidth - e.clientWidth > 4;
}).length === 0

// items 25/27 — leaf CTAs must all differ
const t = [...document.querySelectorAll('a,button')].filter(e => !e.querySelector('a,button'))
  .map(e => e.innerText.trim()).filter(Boolean);
new Set(t).size === t.length

// item 19 — no overlap with the zoom controls
// item 24 — sectors clickable
[...document.querySelectorAll('.recharts-pie-sector')].every(s => getComputedStyle(s).cursor === 'pointer')
```
