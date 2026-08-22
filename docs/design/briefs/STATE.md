# Phase C — consolidated state

**Everything needed to run Phase C is in this file and the five `C*.md` briefs. No conversation
context required.** Written 2026-08-22 after a measurement pass over the live app.

---

## The mistake that caused the confusion — read this first

An earlier audit counted `<th>` elements, found five on `/assets`, and declared review items 8, 14
and part of 32 "already fixed". **That was wrong.** The columns existed in the DOM at **0px width**.
Counting the DOM is not seeing the page.

Everything below is measured with `getBoundingClientRect()` and visibility filters, at 1440px, on the
running app. **The senior review was correct on every point.**

Re-verify any claim here with:

```js
const vis = e => { const r = e.getBoundingClientRect(); return r.width > 4 && r.height > 4; };
[...document.querySelectorAll('th')].filter(vis).length                       // visible columns
[...document.querySelectorAll('[class*="text-accent"]')].filter(vis).length   // accent identifiers
document.body.innerText.match(/\d+\s+of\s+\d+/g)                              // duplicate counts
```

---

## Already fixed — do not redo

| Commit | What |
|---|---|
| `2ed4805` | `--danger` shifted 10.1° → 18.3° off the brand accent; `--link` and `--validation` added in all four scopes; app-wide button `cursor: pointer` |
| `f9f8fba` | Sidebar `md:` → `lg:` — repaired 74px overflow at 768px on every authenticated route |
| `152718d` | `labels.ts` (`label()`, `plural()`); `Timestamp` primitive |
| `790a72d` | `statusTone()`, `Truncate`, `KpiGroup`; global `afterEach(cleanup)` in test setup |
| `f56feed` | `DataTable` honest sort caret + `align`; `--link` applied at 4 call sites |
| **`5788652`** | **Six tables rendered one visible column.** `table-fixed` ignores `max-width`, so `w-full max-w-[Npx]` = `width:100%` and starved every sibling to 0px. Fixed on assets, events, documents, governance/moc, governance/conflicts, compliance/audit-pack, compliance/nonconformance. **Closes review items 8, 14, and the "more than the filename" half of 32.** |

**Baseline to preserve: 179 passed · 1 known failure · 1 expected-fail.**
- Known failure `app/(app)/management/page.test.tsx:61` — pre-existing copy drift, not yours.
- Expected-fail `app/landing-figures.test.ts` — intentional `it.fails()` drift marker.

---

## Phase C — COMPLETE (5 commits, 2026-08-22)

| Commit | Page | What changed |
|---|---|---|
| `28039aa` | `/assets` | `label()` on classes · ids → `--link` · `StatPills` → `KpiGroup` · Register action · dead Site column dropped |
| `34617b2` | `/audit` | exact `Timestamp` · duplicate stat cards removed · filters into table chrome |
| `5e958e2` | `/events` | asset refs → `--link` · counts now state different facts · filters derive from data |
| `6f2bbee` | `/documents` | download column added · ids quiet · exact ingest timestamps |
| `5205bbc` | `/projects` | 66 accent identifiers → 2 |

**Measured before → after** (pre-Phase-C = `5788652`, both sides real captures at 1440px):

| Page | accent | links | raw keys | exact time |
|---|---|---|---|---|
| `/assets` | 12 → **2** | 0 → 10 | 4 → **0** | — |
| `/audit` | 2 → 2 | 25 | 3 | **added** |
| `/events` | 27 → **2** | 0 → 24 | 0 | — |
| `/documents` | 27 → **2** | 0 → 25 | 0 | **added** |
| `/projects` | **66 → 2** | 0 → 50 | 3 | — |

**134 → 10 alarm-coloured identifiers.** Suite **196 passed** (was 145), 1 known failure,
1 expected-fail. tsc clean, overflow 0 everywhere, zero shared-file edits.

### What the parallel run taught

Four agents ran concurrently against written briefs, no collisions, no scope creep. But **three of
five reports contained a claim that did not survive measurement** — one said `/audit` was stuck on a
loading skeleton (it renders fine), two reported `npm test` summaries their sandboxes never produced.
None were dishonest; all were harness limits reported as findings.

**Always re-measure. Never commit on a report alone.** Phase D briefs should say plainly: *report
what you ran and what you could not*, rather than implying a pass.

---

## Phase D — REMAINING (~8 review items)

| Task | Page | Items | Work |
|---|---|---|---|
| D1 | `/management` | 3, 5, 6 | card scroller → wrap · "Plant state" ghost button → status pill · card-grid alignment · ticker strip (`KpiCard`+`TrendDelta`+`Sparkline`, all already built) |
| D2 | charts | 4, 12, 23, 24 | clipped Y-axis labels · 2-point series → bar not line · x-axis scale + per-bar data labels · donut segment click |
| D3 | `/governance` | 25, 27 | six identical "Open control →" → type-specific CTAs · cards clickable |
| D4 | `/graph` | 16, 17, 19 | node labels wrap + hover · date picker opens from whole field · zoom control / pill overlap |
| D5 | `/offboarding` | 37, 38 | full engineer name (derive from `personnel_email`, there is no `full_name`) · retirement countdown |
| D6 | landing `/` | — | `md:` treatment (59 `sm:`, 12 `lg:`, **zero** `md:`) + entrance motion, all under `prefers-reduced-motion` |
| D7 | nav rail | 2 | collapsible rail at `lg:`+, persisted, invisible scrollbar |

**D5 data note:** the record is `EXPERT-RKUMAR` / `ramesh.kumar@kairos.local`, retiring `2026-09-30`,
**1 of 5 sessions, 20%**. The review mockup's "Raymond Ellison, 2 of 6, 33%" is invented.

**D6 decided:** figures stay hardcoded. "Dynamic" means responsive + motion, not live data.

Phase D parallelises worse than C — each task is a different concern rather than one repeated
pattern. D3, D5 and D7 are cleanly independent; D1 and D2 overlap on charts.

---

## File ownership — no two tasks collide

| Task | Files |
|---|---|
| C1 | `assets/page.tsx` · `assets/asset-registry.tsx` · `assets/page.test.tsx` |
| C2 | `audit/page.tsx` · `audit/page.test.tsx` |
| C3 | `events/page.tsx` · `events/page.test.tsx` |
| C4 | `documents/page.tsx` · `documents/_components/documents-table.tsx` · `documents/page.test.tsx` |
| C5 | `projects/page.tsx` · `projects/_components/class-section.tsx` · `projects/page.test.tsx` |

**Read-only for everyone:** `components/ui.tsx`, `app/globals.css`, `lib/labels.ts`, `lib/format.ts`.
An agent that thinks one needs changing must **stop and report**, not edit.

---

## Data constraints — these override the review's mockups

Full detail in `docs/design/DATA-CONTRACT.md`.

- **`/events` priority is unconstrained.** The DB column is NULL in every row; the API reads
  `payload.priority` with a silent `"normal"` default and no CHECK constraint. Live values: `high`,
  `normal` only. **Derive filter options from the rows received** — a hard-coded four-level filter
  renders two dead options.
- **Events carry no actor field.** No assignee column, no avatar.
- **`documents.ingested_by` is a raw UUID**, not a name. Omit the actor; never print a UUID.
- **`assets.site_id` is `SITE_001` for all 10 rows** — a single-value column is wasted width.
- **`assets.status` is not returned by the list endpoint** and is `active` for every row.
- **Criticality is a 3-level domain** (`safety_critical`, `critical`, `non_critical`); only two appear
  in data. Never hard-code a four-level scale.
- **All 24 documents are `active`.** A hard-coded "Superseded" tab reads 0 forever.

---

## Dispatch

Prompts are in `PROMPTS.md`, one block per task. Paste verbatim.

```bash
cd /home/arnavbansal/kairos/kairos     # the cd matters — blocks use repo-relative paths
codex                                   # Terra is already the configured default
```

Then paste one block. Each tells the agent to read `00-CONTRACT.md`, this file, and its own brief
from disk.

**Order:** C1 alone first — its brief has been corrected twice. If it comes back clean, run C2–C5 in
parallel; they cannot collide.

**Do not let them commit.** Every prompt says so. Review the diffs together, then commit.

---

## Verifying their work — do not trust the reports

```bash
cd frontend
npx tsc --noEmit                                        # 0 errors
npm test 2>&1 | tail -5                                 # 179 / 1 known / 1 expected-fail
node scripts/check-overflow.mjs                         # PASS
cd .. && git diff --stat -- frontend/src/components frontend/src/app/globals.css frontend/src/lib
```

That last command **must print nothing** — it proves no shared file was touched.

Then re-run the measurement snippets at the top of this file. `text-accent` counts must drop; visible
column counts must not regress.

The failure mode to watch for: **a report claiming something the data cannot support.** If an agent
says it added an asset STATUS column or a four-level priority filter, that is fabricated — the API
returns neither.
