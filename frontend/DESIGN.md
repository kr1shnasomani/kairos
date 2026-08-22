# KAIROS design system

**Status:** draft for review · written 2026-08-21 · branch `feat/beautify`

This is the design system of record for `frontend/`. Read it before building or changing any UI.

**Its inputs, all verified:**

| Source | What it contributed |
|---|---|
| `docs/design/SENIOR-REVIEW.md` | 38 items across 11 pages — what is wrong today |
| `docs/design/screens/` | 98 screenshots of the running app — what exists today |
| `docs/design/DATA-CONTRACT.md` | 19 tables, 15 enum domains, real value distributions — what may be rendered |
| `docs/design/ARCHETYPES.md` | 9 layout archetypes covering all 44 routes |
| `frontend/src/app/globals.css` | the token system as implemented |
| 13 reference sites/shots (§4b) | aesthetic direction — each opened and examined, not assumed |

**Scope decision.** This is a **discipline pass, not a repaint.** The audit found the app uneven
rather than bad: `/copilot`, `/governance`, `/graph`, `/management/plant-state` and `/projects` are
good work; `/assets` and `/audit` are poor. Nothing in the senior review says the aesthetic is
wrong — every one of the 38 items is about *discipline*: colour semantics, duplication, truncation,
density, chart form. So the palette, type scale and primitives survive; their **application** is what
changes.

**Added to scope by the user, 2026-08-21:** every surface must be genuinely responsive — all 44
routes *and* the landing page, at any resolution. This is not cosmetic. Measurement found every
authenticated route broken at 768px (§4a).

**Authority.** Where this document and a mockup disagree, this document wins on rules and the mockup
wins on layout. Where either disagrees with `DATA-CONTRACT.md`, the data contract wins — always. A
screen that renders data we do not have is a bug regardless of how good it looks.

---

## 1. Principles

Nine themes in the review, plus one finding from measurement, collapse into six rules. Each
names the failure it prevents.

1. **Red means fault. Nothing else.**
   Not links, not identifiers, not branding-adjacent decoration. `/audit` today renders every entity
   ID and every "Raw metadata" link in the alarm colour, so a compliance log — the calmest artefact
   in the product — reads as a screen full of errors.

2. **Exact first, relative second.**
   In an evidence product, the precise value is the point. Full timestamps, full filenames, full
   names. Relative time and truncation are *hints layered on top*, never replacements.

3. **One number, one place.**
   `/audit` shows five stat cards and then repeats the same five counts in tabs directly beneath
   them. Duplicated totals are not redundancy, they are an invitation to distrust both.

4. **Never render a raw database value.**
   `he-3xx_series` and `rotating_centrifugal_pump` are currently printed straight into KPI cards.
   Every coded value passes through a display-name map. This is systemic, not per-page.

5. **Every surface is fluid.**
   Not "has a mobile version" — genuinely usable at any width from 320px up, with no horizontal page
   scroll ever. Today every authenticated route breaks at 768px (§4a). Tablet width is a first-class
   target, not an afterthought.

6. **Show only what the data contains.**
   Legends, filters and badge sets derive from the values present. No hard-coded four-level scales
   when the domain has three and the data has two. The one exception is a deliberate finding — the
   Coverage page keeps "Verified = 0" visible *because* the zero is the point.

---

## 2. Colour

### 2.1 The change: danger moves, the brand does not

The loudest complaint in the review ("remove the red", "swap the alarming red IDs", "leave red free
for actual faults") has a measurable root cause:

```
accent  #d93400   hue  14.4°   contrast 4.73 on white
danger  #b42318   hue   4.2°   contrast 6.57      →  10.1° apart
```

The brand accent is functionally the alarm colour. Recolouring IDs alone leaves every accent-tinted
element still reading faintly alarming.

**The obvious fix — move the accent — does not work.** Orange is squeezed into a 31° corridor
between danger (4°) and caution (35°). Every candidate tested either collided with caution or fell
below 4.5:1 contrast. Verified, not assumed.

**So danger moves instead.** It stays unmistakably safety-red, and the brand is untouched:

| | Before | After | Effect |
|---|---|---|---|
| `--danger` light | `#b42318` (4.2°) | **`#a81f28`** (356.1°) | separation **10.1° → 18.3°**, contrast **6.57 → 7.26** |
| `--danger` dark | `#e4574c` (4.3°) | **`#e85a63`** (356.2°) | separation **15.7° → 23.9°**, contrast **4.75 → 5.33** |

Deliberate: danger also gets *darker* than the accent, so hue and lightness both separate them.

### 2.2 Tokens

Light is default; `[data-theme="dark"]` recolours and never restructures. All contrast figures are
against `--canvas` (light) and `--surface` (dark), AA for small text is 4.5.

**Surfaces and text** — unchanged. Note this is a **white** palette; the older cream "Paper" values
are gone from `main`.

| Token | Light | Dark |
|---|---|---|
| `--canvas` | `#ffffff` | `#0a0a0a` |
| `--surface` | `#ffffff` | `#141414` |
| `--surface-2` | `#f8f8f8` | `#1c1c1c` |
| `--line` | `#e5e3df` | `#ffffff1f` |
| `--ink` | `#0b1015` | `#f5f5f4` |
| `--muted` | `#3f3f3f` | `#a3a09b` |

**Brand** — unchanged.

| Token | Light | Dark |
|---|---|---|
| `--accent` | `#d93400` (4.73) | `#ff6a1f` |
| `--accent-fill` | `#d93400` | `#d93400` |
| `--accent-soft` | `#fff0eb` | — |
| `--on-accent` | `#ffffff` | `#ffffff` |

`--accent-fill` exists because the bright dark-mode orange fails contrast behind white label text;
`.bg-accent.text-on-accent` swaps to it. **Keep that rule** — removing it breaks button contrast.

**Sidebar** — a third palette, permanently dark in every theme, remapped via `.sidebar-scope`:

| Token | Value |
|---|---|
| `--sidebar` | `#0a0a0a` |
| `--sidebar-hover` | `#141414` |
| `--sidebar-line` | `#ffffff1f` |
| `--sidebar-fg` | `#f5f5f4` |
| `--sidebar-muted` | `#a3a09b` |
| `--sidebar-accent` | `#ff6a1f` |
| `--sidebar-active` | `#3a1b0d` |

`.sidebar-scope` reassigns the generic tokens locally, so every utility inside the rail recolours
with no markup change. **Any new token must be given a `.sidebar-scope` value if it will ever render
inside the rail**, and a `[data-contrast="high"]` value.

**Status scale** — two changes, two additions.

| Token | Light | Dark | Meaning |
|---|---|---|---|
| `--danger` | **`#a81f28`** (7.26) | **`#e85a63`** (5.33) | fault, refusal, critical, overdue |
| `--caution` | `#9a5b00` (4.86) | `#f5a623` | unverified, pending, warning |
| `--verified` | `#216d3b` (5.67) | `#4fa96b` | verified, approved, healthy |
| `--info` | `#1d4ed8` (6.00) | `#5b8def` | informational status, monitoring |
| **`--link`** *(new)* | `#1d4ed8` | `#7aa2f7` | **clickable** — identifiers, evidence IDs, filenames |
| **`--validation`** *(new)* | `#6d28d9` | `#a78bfa` | under validation / review |

`--link` and `--info` share a light value today. They are **separate tokens because they are separate
roles** — one means "you can click this", the other means "this is informational". Either may move
without disturbing the other. Never substitute one for the other.

The industrial safety convention (red = danger, amber = caution, green = safe, blue = information)
is load-bearing in this domain. **Do not reassign these meanings.**

### 2.3 Assignment rules

**`--accent` is only ever:** filled primary buttons · the active nav item · brand marks · a
genuine call-to-action. It is the rarest colour on any screen. If a page has more than two or three
accent elements, something is wrong.

**`--danger` is only ever:** a real fault, refusal, critical severity, or a missed deadline. Never
decoration, never emphasis.

**`--link` is:** every clickable identifier — evidence IDs, document IDs, framework names, filenames,
entity references. This single rule resolves review items 22, 32 and 34.

**Identifiers that are not clickable are `--ink` or `--muted`**, optionally monospace. They are never
accent, and never red.

**Overdue** uses `--danger`; it is a *state*, not a sixth colour. The review's "dark red" is satisfied
by `--danger` now being the darkest hue in the scale.

Status mapping requested in review item 26, resolved against real tokens:

| Status | Token |
|---|---|
| Open | `--danger` |
| Pending | `--caution` |
| Monitor | `--info` |
| Overdue | `--danger` (darker weight / stronger label) |
| Validation | `--validation` |

### 2.4 High contrast

`[data-contrast="high"]` stays as implemented. Any token added here must also be given a
high-contrast value — no exceptions.

---

## 3. Typography

Fonts, unchanged: **DM Sans** body (`--font-dm`), **Instrument Sans** display (`--font-instrument`),
**Geist Mono** (`--font-geist-mono`), **Noto Sans Devanagari** for Devanagari content.

**The scale is closed.** These are the only sanctioned sizes:

| Token | px | Use |
|---|---|---|
| `--text-micro` | 10 | dense table meta, dot-pill labels |
| `--text-label` | 11 | uppercase eyebrows, column headers |
| `--text-caption` | 12 | secondary/meta text |
| `--text-body` | 13 | body copy, table cells |
| `--text-subtitle` | 15 | card titles |
| `--text-title` | 20 | page titles |
| `--text-display` | 28 | KPI figures, hero numerals |

An arbitrary `text-[Npx]` is drift. Add a step here instead. **Two documented exceptions:** graph
canvas node labels (`text-[9px]`) for density, and the landing page, which is a separate system
(§9).

**Monospace is for machine-readable values only** — asset tags (`EQ-101`), document IDs
(`DOC-P101-FAILURE-HIST`), hashes, sequence numbers, exact timestamps. It is **never** used for a
stat-card figure. Sibling numbers rendered in different families stop reading as one set — this is
review items 33 and 36, and it is currently a 4-occurrence problem in the codebase.

---

## 4. Density and layout

The review asks for compactness five separate times. Compactness here means **cutting duplicated
chrome and dead padding, not shrinking type**. Type stays legible; the page loses the parts that were
never carrying information.

- Table rows: comfortable vertical padding, hairline `--line` separators. Density comes from
  restraint, not compression.
- Never give a column width to a single-value field. Today `site_id` is `SITE_001` for all 10 assets
  and `assets.status` is `active` for all 10 — both are pure waste. See `DATA-CONTRACT.md` §4.
- A card whose content overflows **wraps**; it does not grow a horizontal scrollbar. Horizontal
  scroll inside a card is a defect (review item 3, and one of the deferred bug-report items).
- Radius: `--radius` 8px, `--radius-lg` 12px. Unchanged.

---

## 4a. Responsive — every surface, every resolution

**In scope for this pass: all 44 routes and the landing page must work at any viewport width.** Not
"has a mobile variant" — genuinely fluid between and beyond the breakpoints.

### The bug this rule exists to prevent

Measured 2026-08-21 across 8 widths (360 · 390 · 768 · 1024 · 1280 · 1440 · 1920 · 2560):

```
route           360   390   768  1024  1280  1440  1920  2560
/                ok    ok    ok    ok    ok    ok    ok    ok
/management      ok    ok   +74    ok    ok    ok    ok    ok
/assets          ok    ok   +74    ok    ok    ok    ok    ok
/audit           ok    ok   +74    ok    ok    ok    ok    ok
/governance      ok    ok   +74    ok    ok    ok    ok    ok
/copilot         ok    ok   +74    ok    ok    ok    ok    ok
/graph           ok    ok   +74    ok    ok    ok    ok    ok
```

**Every authenticated route overflows by exactly 74px at 768px** — iPad portrait, the single most
common tablet width. Cause, `components/app-shell.tsx:506`:

```tsx
<aside className="sidebar-scope hidden w-[316px] shrink-0 border-r border-line md:block">
```

The 316px sidebar switches on at `md:` (768px), leaving 452px for content that needs ~526px. The
drawer that should serve this width is `md:hidden`, so it is already gone.

**Fix:** the persistent sidebar starts at `lg:` (1024px), not `md:`. Below that, the drawer. One
change in one file repairs all 44 routes.

### Rules

1. **No horizontal page scroll at any width, ever.** `document.scrollWidth` must equal
   `clientWidth` on every route from 320px up. This is a release gate, not an aspiration.
2. **Breakpoints are Tailwind defaults** — `sm` 640 · `md` 768 · `lg` 1024 · `xl` 1280 · `2xl` 1536.
   Treat `md` as the tablet band and design it deliberately; it is currently the least-tested width
   in the app and the only one that is broken.
3. **Fluid between breakpoints.** Layout uses `max-w-*` + `mx-auto` containers, flex/grid with
   wrapping, and relative units. The existing `mx-auto max-w-[1400px]` content container is the
   correct pattern — keep it. Above 1440px the page centres rather than stretching.
4. **A card never grows a horizontal scrollbar** (§4). Wide *tables* may scroll inside their own
   `overflow-x-auto` container; the page body may not. Seven files use `overflow-x-auto` today —
   each must be a deliberate table/canvas container, not a leak.
5. **Touch targets ≥ 44×44px** below `lg`. Actions must stay thumb-reachable on field routes.
6. **Tables degrade, they do not shrink.** Below `md`, drop to the priority columns or a stacked
   card row. Never compress a 6-column table into 360px.
7. **Test at 360, 768, 1024 and 1440 minimum.** 768 is mandatory in every verification pass — it is
   where this class of bug lives.

### The landing page is in scope too

`/` is currently clean at all eight widths, but it carries **59 `sm:` and 12 `lg:` classes and zero
`md:` or `xl:`** — so the 768–1024 band inherits stretched small-screen styles rather than a designed
layout. It does not break; it is simply untreated. Give it real `md:` treatment, and verify its
oversized composed sections (the 13-layer diagram, the product screenshots, the benchmark bars) hold
up at tablet width.

**Open question — the landing page's numbers are hardcoded.** `app/page.tsx` performs **zero**
fetches and hard-codes its headline figures (`100%`, `91%`, `13 / 13`, `0% errors`). If "make the
landing dynamic" also means *live data*, that is a separate and larger change: real measured values
exist in `benchmark/RESULTS.md` and behind `/system-benchmarks`. There is a real argument for
leaving marketing figures static and version-controlled — a landing page that reports live degraded
numbers is a liability. **Flagged for a decision; not assumed either way.**

---

## 4b. Reference material — what transfers, what does not

Reviewed 2026-08-21. Every reference below was actually opened and examined, not inferred from its
title. They are grouped by how much of each is safely borrowable.

### The one that is KAIROS-shaped

**[Stock Trading platform — Musemind](https://dribbble.com/shots/19745585-Stock-Trading-platform-UI-UX-Design)**
is the closest analog we have found: dark, extremely dense, data-heavy, professional in tone, and
using colour semantically (green up / red down) rather than decoratively. It proves the thing we most
need to prove — **you can put a great deal on one screen without it feeling cramped.** Borrow:

- **The top ticker strip** — instrument · value · signed delta · inline sparkline, repeated
  horizontally. This is precisely what `/management`'s KPI strip wants to become, and it answers the
  review's ask for a range toggle and trend context in one pattern.
- **Sparklines as a table column** — a mini chart inside the row rather than a separate chart block.
  Directly applicable to `/assets` (failure history) and `/events`.
- **Horizontal bar list with value + percentage on each bar** — exactly the fix review item 23 asks
  for on Compliance's "Gaps by framework".
- **Tight, legible row rhythm in a dark theme** — useful evidence for our dark palette work.

### Useful in parts

**[Digesto AI Dashboard](https://dribbble.com/shots/23132907-Digesto-AI-Dashboard)** — the
**before → after pattern** (`102 words → 51 words`) maps well onto document supersede chains, and its
radial usage gauge is a candidate for Coverage. Its grouped sidebar with small-caps section labels
validates what `app-shell.tsx` already does.

**[Online Course AI Dashboard — Fireart](https://dribbble.com/shots/25816466-Online-Course-AI-Dashboard)**
— the **timeline with a live "now" marker** is genuinely applicable to `/audit` and brief history.
One dark contrast card among light ones is an effective way to mark the single most important panel.

### What must not be copied

**These are consumer engagement products. KAIROS is a safety-critical compliance product.** Three
specific traps:

1. **Decorative multi-colour cards.** Digesto's stat cards are peach, blue and grey with no semantic
   meaning. In KAIROS, colour carries meaning — red *is* fault. Decorative colour would destroy the
   semantic system in §2 and re-create the exact confusion the senior review is complaining about.
2. **Encouraging, gamified copy.** "You're on fire!", "Keep sharpening your skills!", streak
   counters, emoji. Wrong register entirely for a product whose job is refusing to guess about
   pressure ratings. Our copy stays factual.
3. **Soft consumer geometry.** Both light references use ~16–20px radius and soft shadows. KAIROS is
   at 8/12px with hairline borders. Going softer reads as friendly-consumer and fights the evidence
   tone. **Radius and border treatment stay as they are.**

### What all references agree on

Fewer colours · more whitespace · stronger type hierarchy · one confident accent. KAIROS today has
the opposite — many colours (because accent ≈ danger blurs the semantics), compressed spacing, and a
flat type hierarchy. §2 and §3 exist to close that gap; the references confirm the direction rather
than redirect it.

**Ranking, for when time is short:** Trading (structure and density) > Stripe (calm) > Rocketlane
(list patterns) > Stackwise (KPI-over-table) > everything else.

### Where these land — and why they are cheaper than they look

The senior review is a **defect list**; the references are **enhancement**. They are different kinds
of work and the phase plan originally had no home for the second kind. It does now.

**The decisive fact:** the primitives these patterns need already exist in `ui.tsx` — and are barely
used. Measured 2026-08-21 across all 44 routes:

| Primitive | Built | Actually used in |
|---|---|---|
| `TrendDelta` | yes | **0 files** — only its own definition |
| `Sparkline` | yes | **1 file** |
| `KpiCard` | yes | 2 of 44 routes |
| `Timeline` | yes | 5 files |
| `DataTable` | yes | 14 files |

`TrendDelta` already handles semantic colour correctly, including an `invert` flag for metrics where
down is good. It has never been rendered.

So the trading dashboard's ticker strip is **`KpiCard` + `TrendDelta` + `Sparkline` composed** — not
new components. These patterns are mostly a matter of **adopting primitives that were built and then
abandoned**, which is why they add hours rather than days.

| Reference pattern | Phase | What it actually costs |
|---|---|---|
| Ticker strip — value · delta · sparkline | **B** compose, **D** apply to `/management` | Compose three existing primitives |
| Sparkline as a table column | **B** (`DataTable` column type), **C** apply | New column renderer; `Sparkline` exists |
| Bar list with value + % per bar | **D** | Already review item 23 — no extra scope |
| Before → after pair | **C** (`/documents` supersede) | Small composition |
| Timeline with "now" marker | **C** (`/audit`) | `Timeline` exists in 5 files already |
| Dense legible dark rhythm | **A/B** | Guidance, not a component |

Nothing here changes the phase count or the estimate materially. The three **prohibitions** above
(no decorative colour, no gamified copy, no soft geometry) cost nothing — they are constraints on
what B, C and D may do, not extra work.

---

## 5. Data display rules

Most of the review lands here. These rules are the reason the app will feel different.

### 5.1 Timestamps

Exact value is primary, relative is the hint beneath it:

```
2026-08-18 09:12:41      ← --ink, monospace, primary
1h ago                   ← --muted, --text-caption
```

Never relative-only. `/audit` today shows only "30m ago" / "2d ago" on a compliance record. The data
supports this fully — every endpoint returns ISO-8601 with microsecond precision (`DATA-CONTRACT.md`
§5), so this is pure frontend formatting.

### 5.2 Truncation

Truncate only when genuinely necessary, and **every truncation carries the full value on hover** via
`title` or a tooltip. Filenames and person names are the fields most damaged by truncation — they are
the field that says what the thing *is*. Prefer wrapping to two lines over an ellipsis.

### 5.3 Counts

A count appears **once** per view. If a tab row already carries per-filter counts, the stat cards
above it are duplication — remove them or repurpose the space.

### 5.4 Coded values

Every enum passes through a shared display-name map before render:

```
he-3xx_series             → HE-3xx series
rotating_centrifugal_pump → Rotating centrifugal pump
deviation_flag            → Deviation flag
non_critical              → Non-critical
```

One map, shared. Not per-page string munging. This is a **new module**, and it is the single most
systemic fix in this document.

### 5.5 Severity and enum rendering

Render only values present in the data. The declared domains (`DATA-CONTRACT.md` §2) tell you what to
*support*; the data tells you what to *show*.

Specifically: **criticality is a 3-level scale** (`safety_critical` · `critical` · `non_critical`),
not the mockup's four. Event priority is **unconstrained** — it is read from a JSONB payload with a
silent `"normal"` default, so treat any value as possible and never hard-code the set.

### 5.6 Charts

- Chart form must fit the data. A two-point series is a bar chart, not a time series.
- Axes are labelled and never clipped. Y-axis labels clipped to unreadability is review item 4.
- Bars carry data labels with the exact value.
- Series colour follows the status scale when the series *is* a severity; otherwise a single accent.
- Never plot a level the data does not contain.

### 5.7 Identity and attribution

Actor identity is inconsistent across the backend and must degrade gracefully:

| Source | Available |
|---|---|
| `quarantine.submitted_by`, `audit_log.performed_by` | real name ("Suresh Yadav") |
| `documents.ingested_by` | raw UUID |
| `operational_events` | **nothing** |

So: name → initials avatar; UUID → omit the avatar; absent → omit. **The avatar is an optional
per-row element, never a fixed column.** The mockups show avatars on every row; the data cannot
support that. Never fabricate an identity.

### 5.8 Calls to action

A CTA names its action and its object: "Review 3 conflicts →", not "Open control →". Six identical
CTAs on one screen (review item 27) tell the user nothing about where each goes.

---

## 6. Primitives

All 17 live in `components/ui.tsx`. Extend these; do not build page-local variants.

`StatusBadge` · `AuthorityBadge` · `SourceChip` · `Modal` · `Button` · `PhaseBadge` · `TrendDelta` ·
`Sparkline` · `KpiCard` · `DataTable` · `FilterTabs` · `Timeline` · `EvidenceLineage` ·
`ConfidenceMeter` · `RefusalCard` · `PageHeader` · `EmptyState`

Changes required by this document:

- **`StatusBadge`** — adopt the §2.3 mapping; add `--validation`. Dot + label, never colour alone.
- **`DataTable`** — real columns, sortable headers whose indicator matches actual sort state, row
  hover, `cursor: pointer` on clickable rows, aligned headers. Single-column tables are a bug.
- **`KpiCard`** — a total and its own breakdown must be visually distinct groups, not inline
  siblings (review item 9). Figures use the sans display size, **never monospace**.
- **`Timestamp`** *(new)* — implements §5.1. One component so no page re-invents it.
- **`DisplayName`** *(new, or a `lib/labels.ts` map)* — implements §5.4.
- **`Button`** — `cursor: pointer` on everything clickable. Tailwind v4 leaves buttons at
  `cursor: default`; the landing page already patches this once, the app needs the same.

---

## 7. Archetype layout contracts

Nine archetypes cover all 44 routes (`ARCHETYPES.md`). The rules above apply to all; these are the
per-archetype shapes.

1. **KPI dashboard** — eyebrow / title / description, KPI strip, chart, then content regions. KPI
   cards carry a severity left-rule. `/management`, `/governance`, `/compliance`.
2. **List + filters** — header, optional KPI strip, filter row with result count, one table. The
   biggest repair surface: 12 routes, and where all the jank is concentrated.
3. **Detail + evidence** — summary header, then evidence, then history. Provenance always visible.
4. **Canvas** — controls must not overlap content (review item 19). Labels wrap to two lines with
   hover for the full value.
5. **Conversational** — `/copilot` is the strongest page in the app. Leave it alone.
6. **Mobile field** — 390px, thumb-reachable actions, no horizontal scroll.
7. **Form / wizard** — one decision per step, explicit consequences.
8. **System / status** — honest live status; static explainers stay static.
9. **Public entry** — landing and login. Separate token system (§9), but the same responsive bar as
   everything else (§4a) — including the `md:` band it currently skips.

---

## 8. States

The app is **live-only**. `DataSource` has one member; there are no fixtures. Every screen shows real
data, a skeleton, or an error with retry.

- **Loading** — skeletons matching final layout. No spinners on full pages.
- **Empty** — say what is absent and what the user can do. An empty state that reflects a real
  finding (`/management/cross-site`, Coverage's "Verified = 0") states the finding rather than
  apologising.
- **Error** — what failed plus a retry. Never a blank region.
- **Refusal** — safety-critical answers use `RefusalCard`. Never a hedged answer.
- **Narrow** — every state above must hold at 360px as well as 1440px. A skeleton that overflows is
  still a defect.

Every answer, brief and RCA hypothesis shows `sources[]` and an `AuthorityBadge`. No claim without
provenance.

---

## 9. The landing page is a separate system

`/` uses `--lp-*` tokens scoped to `.landing`, is **deliberately light-only** (its dark bands are
composition, not a theme), and carries three accent variants for contrast reasons documented in
`docs/FRONTEND.md` §11. Its 126 arbitrary type sizes are outside the app scale **by design**.

Do not unify it with the app system. Do not add a theme toggle to it without first building an
`--lp-*` dark tier — the toggle is not the missing piece, the palette is.

Three `globals.css` gotchas that will waste your afternoon, carried over from `docs/FRONTEND.md` §11:

1. An unlayered `* { border-color: var(--line) }` outranks every Tailwind `border-*` utility
   regardless of specificity. The landing is excluded via `*:not(.landing, .landing *)`.
2. `.landing` uses `overflow-x: clip`, not `hidden` — `hidden` makes it a scroll container and breaks
   the sticky header.
3. Tailwind v4 leaves `<button>` at `cursor: default`; `.landing button` restores it once.

---

## 9a. Verifying visual claims

**Measure the rendered page. Never count elements, never grep classes.**

A DOM query proves markup exists. It does not prove a user can see it. The two diverge constantly in
CSS, and when they do, the element count is the reassuring answer and the wrong one.

```js
// visible columns — not the same as the number of <th> elements
const visible = e => { const r = e.getBoundingClientRect(); return r.width > 4 && r.height > 4; };
[...document.querySelectorAll('th')].filter(visible).length

// identifiers wearing the brand accent
[...document.querySelectorAll('[class*="text-accent"]')].filter(visible).length

// duplicated counts
document.body.innerText.match(/\d+\s+of\s+\d+/g)

// horizontal overflow — the release gate in 4a
document.documentElement.scrollWidth - document.documentElement.clientWidth
```

### The failure this rule is made of

The senior review reported `/assets` as "a single Name column stretched across the full width". An
audit counted five `<th>` elements, concluded the item was already fixed, and told five agents not to
rebuild tables that were never broken.

Measuring widths showed the truth:

```
/assets     Name 1058px | Asset, Equipment class, Site, Criticality  0px
/events     Description 1058px | Occurred, Priority, Type, Asset, Status  0px
/documents  Document 1058px | Type, Authority, State, Updated  0px
```

**One cause, six tables.** `DataTable` renders `table-fixed`, and in fixed table layout `max-width`
on a cell is **ignored** — only `width` counts. A column with `className: "w-full max-w-[320px]"`
therefore resolves to `width: 100%`, claims the entire table, and starves every sibling to zero. The
cap that was meant to constrain it does nothing.

Three lessons, in order of how much they cost:

1. **Measure geometry, not markup.** `getBoundingClientRect()`, not `querySelectorAll().length`.
2. **`table-fixed` ignores `max-width`.** Use an explicit percentage. Documented on `TableColumn`.
3. **When a reviewer's claim and your reading of the code disagree, the reviewer looked at the
   screen.** Reproduce what they saw before deciding they are out of date.

Fixed in commit `5788652`. Full measurements in `docs/design/briefs/STATE.md`.

---

## 10. Motion and accessibility

- One shared enter idiom for overlays; route entrance via `(app)/template.tsx`.
- Everything neutralised under `prefers-reduced-motion`.
- AA contrast (4.5 small text, 3.0 large) for every token pair — figures in §2.2.
- Colour is never the sole carrier of meaning: dot + label, icon + text.
- Keyboard reachable, visible focus, correct roles. `cursor: pointer` wherever click works.

---

## 11. Out of scope

- **The 7 deferred bugs** in `kairos - bug report.pdf` — behavioural, fixed after beautification.
  Two overlap with review items (the `/management` horizontal scrollbar, the quarantine action panel).
- **Backend changes.** One is worth requesting: add `open_work_orders_count` and
  `compliance_gap_count` to the `/assets` **list** serialiser. They exist on the detail endpoint
  already; without them the OPEN ISSUES column costs an N+1 or gets dropped.
- **`GET /elicitation/offboarding/sessions` returns HTTP 500** — a live bug, flagged, not ours here.
- **The Vercel dev toolbar** (review item 1) is not KAIROS UI and does not appear in production.

---

## Appendix A — review coverage

All 38 items from `SENIOR-REVIEW.md`, mapped to the rule that resolves each.

| Items | Rule |
|---|---|
| 22, 32, 34 — red IDs, alarming red, links look like errors | §2.3 `--link` for clickable identifiers, `--ink`/`--muted` otherwise |
| 26 — status badge colours | §2.3 mapping, `--validation` added |
| 13 — `low` rendered black | §2.3 + §5.5 severity tracks severity |
| 28, 32, 35, 37 — truncated/relative timestamps, names, filenames | §5.1, §5.2 |
| 15, 29, 9 — duplicated counts, total mixed with breakdown | §5.3, §6 `KpiCard` |
| 33, 36 — mixed fonts in stat cards | §3 monospace rule |
| 16, 18 — truncation without hover | §5.2 |
| 12, 23, 24, 4 — chart form, axes, labels, clipping | §5.6 |
| 7, 8, 10, 20 — sort indicator, single-column table, header alignment | §6 `DataTable` |
| 27 — six identical CTAs | §5.8 |
| 25, 30 — cards clickable, pointer cursor | §6 `Button`, §10 |
| 2, 3, 6, 21, 31 — nav minimise, card scroller, alignment, density | §4 |
| 5 — orphaned "Plant state" ghost button | §7 archetype 1 |
| 11 — add Register asset button to page | §7 archetype 2 |
| 17, 19 — date picker hit area, overlapping canvas controls | §7 archetype 4, §10 |
| 38 — retirement deadline needs prominence | §7 archetype 8 |
| 1 — Vercel toolbar | §11 out of scope |

Added beyond the review, from measurement rather than the document:

| Finding | Rule |
|---|---|
| Every authenticated route overflows 74px at 768px (`app-shell.tsx:506`, sidebar at `md:`) | §4a — sidebar moves to `lg:` |
| Landing has zero `md:`/`xl:` classes — 768–1024 band untreated | §4a |
| Landing hard-codes its headline figures, fetches nothing | §4a open question |
| `--accent` sits 10.2° from `--danger`; no orange clears both neighbours | §2.1 — danger moves instead |

## Appendix B — where the mockups exceed the data

**The mockups' layouts are authoritative. Their sample values are not.** Full detail in
`DATA-CONTRACT.md` §4. Summary:

| Mockup shows | Reality |
|---|---|
| Criticality: 4 levels | Domain has 3, data has 2 |
| Asset STATUS column | Not exposed by API; all rows `active` — **drop it** |
| Asset SITE column | All rows `SITE_001` — **drop it** |
| Asset OPEN ISSUES | Detail endpoint only; needs a backend change |
| Documents "Superseded 1" | 24 documents, all `active`, zero superseded |
| "Raymond Ellison, 2 of 6, 33%" | Ramesh Kumar, 1 of 5, 20% — and no `full_name` field exists |
| Avatars on every row | Events carry no actor at all |
| Events: 4 priority levels | Unconstrained JSONB with a silent `"normal"` default |

So `/assets` gets **4 real columns** (asset+tag · class · criticality · open-issues-if-exposed), not
seven. Still a decisive improvement on today's single stretched "Name" column.

---

## Appendix C — the 38 review items by implementation phase

Appendix A maps each item to the **rule** that governs it. This maps each to the **phase** that ships
it. All 38 accounted for; none dropped.

| Phase | Items | Count |
|---|---|---|
| **A** — palette + tokens | *(none directly — see note)* | 0 |
| **B** — shared primitives (`ui.tsx`) | 7, 9, 10, 13, 18, 20, 21, 22, 25, 26, 28, 30, 31, 33, 34, 36 | **16** |
| **C** — list archetype (12 routes) | 8, 11, 14, 15, 29, 32, 35 | 7 |
| **D** — dashboards, charts, canvas, page-specific | 2, 3, 4, 5, 6, 12, 16, 17, 19, 23, 24, 27, 37, 38 | 14 |
| **out of scope** | 1 (Vercel dev toolbar) | 1 |

**Phase A ships zero review items, and is still first.** It creates `--link`, `--validation` and the
shifted `--danger` that items 13, 22, 26 and 34 all depend on. Ordering here is about
*blocking-ness*, not item count — B cannot be done correctly before A exists.

**Phase B is the leverage.** Sixteen of 38 items — 42% — are fixed inside `ui.tsx`, once, and every
one of the 44 routes inherits the result. This is why the effort estimate (~25–35 hrs) is smaller
than the build was: most of the work is shared code, not per-page edits.

Phase E ships no items; it verifies all of them across both themes, 44 routes and four widths.

### Per-item detail

| # | Item | Phase | Lands in |
|---|---|---|---|
| 1 | Vercel toolbar hide is permanent | — | out of scope (dev-only) |
| 2 | Nav rail minimise + invisible scroll | D | `app-shell.tsx` |
| 3 | Card horizontal scroller → wrap | D | `/management` |
| 4 | Graph Y-axis labels clipped | D | chart axis |
| 5 | "Plant state" orphaned ghost button | D | `/management` header |
| 6 | Card grid alignment | D | `/management` grid |
| 7 | Sort indicator contradicts data | B | `DataTable` |
| 8 | Single "Name" column full width | C | `/assets` |
| 9 | KPI cards mix total with breakdown | B | `KpiCard` |
| 10 | Table header alignment | B | `DataTable` |
| 11 | Add "Register asset" button to page | C | `/assets` |
| 12 | Empty chart → priority bar | D | chart form |
| 13 | Wrong legend colours (`low` = black) | B | `StatusBadge` + tokens |
| 14 | Single "Description" column | C | `/events` |
| 15 | Redundant counts (×3) | C | `/events` |
| 16 | Node labels truncate → wrap + hover | D | graph canvas |
| 17 | Date picker only opens from icon | D | graph control |
| 18 | Hover shows full text | B | shared truncation |
| 19 | Zoom control / pill overlap | D | graph canvas |
| 20 | Apply sort for columns | B | `DataTable` → `/coverage` |
| 21 | Square badges + compact table | B | `StatusBadge` + density |
| 22 | Remove red from non-link text | B | `--link` rule |
| 23 | X-axis values + bar data labels | D | charts |
| 24 | Donut segment click → pop + count | D | chart interaction |
| 25 | Cards clickable → detail | B | card affordance |
| 26 | Status badge colour mapping | B | `StatusBadge` |
| 27 | Six identical "Open control" CTAs | D | `/governance` copy |
| 28 | Exact timestamps, not relative | B | new `Timestamp` |
| 29 | Cut duplicate stat cards | C | `/audit` |
| 30 | Pointer cursor where clickable | B | global + `Button` |
| 31 | Compact design | B | density → `/audit` |
| 32 | Documents: status/type/timestamp/search/download | C | `/documents` |
| 33 | Summary numbers mismatched fonts + singular | B | `KpiCard` mono rule |
| 34 | Evidence IDs red → blue links | B | `--link` rule |
| 35 | Show whole filename | C | `/projects` |
| 36 | Off-boarding numbers two fonts + singular | B | `KpiCard` mono rule |
| 37 | Engineer's name cut off | D | `/offboarding` |
| 38 | Retirement deadline + countdown | D | `/offboarding` |

### What else each phase carries

The 38 review items are not the whole of the work. Two other streams ride along:

**Findings from measurement** (not in the review):

| Finding | Phase |
|---|---|
| 768px sidebar break — one class change, all 44 routes | **A** |
| Display-name map for coded values | **B** |
| Identity/attribution degradation (name → initials → omit) | **B** |
| Landing page `md:` treatment | **D** |
| Full responsive sweep, 4 widths × 44 routes | **E** |

**Reference-derived patterns** (§4b) — cheap, because the primitives already exist and are unused:

| Pattern | Phase |
|---|---|
| Ticker strip (`KpiCard`+`TrendDelta`+`Sparkline`) | **B** compose · **D** apply |
| Sparkline as a `DataTable` column | **B** · **C** apply |
| Before → after pair (supersede chains) | **C** |
| Timeline "now" marker | **C** |
| Bar data labels | **D** *(= review item 23)* |

So each phase carries three streams: review items, measured defects, and reference patterns. The
totals in the table above count only the review items — they are the floor, not the ceiling.

---
