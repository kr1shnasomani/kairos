# Shared contract — Phases C and D

**Every C and D brief depends on this file. Read it once, then read your own brief.**

Phase D agents: also read `D-STATE.md`, which carries the live measurements your brief is built on.

Repo: `/home/arnavbansal/kairos/kairos` · Branch: `feat/beautify` · Work only in `frontend/`.

Phases A and B are **already merged** — the tokens and primitives below exist and are tested. Your
job is to *use* them on one page. Do not modify `ui.tsx`, `globals.css`, or `labels.ts`; if you
believe a primitive needs changing, stop and report it instead.

---

## Hard rules

1. **One scope per brief.** Touch only the files your brief names. If a fix seems to belong in a
   file you do not own, report it — do not edit it.
   **Permanently read-only:** `components/ui.tsx` · `app/globals.css` · `lib/labels.ts` ·
   `lib/format.ts` · `lib/api.ts` · `lib/types.ts` · `components/app-shell.tsx`.
   **Phase D adds:** `components/charts.tsx` and `components/charts/*` belong to **D2 alone** — a task
   that fixes a chart edits its own *call site*, never the shared component.
2. **Tailwind v4 only.** v4 ≠ v3. No `@apply`, no v3-era config assumptions.
3. **Colours from tokens only.** Never a hex literal in a component. Utilities:
   `text-ink text-muted text-link text-danger text-caution text-verified text-info text-validation`,
   `bg-surface bg-surface-2 bg-canvas bg-accent`, `border-line`.
4. **No new npm dependencies.** `@testing-library/user-event` is **not installed** — use
   `fireEvent` from `@testing-library/react`.
5. **Live-only data.** Fetchers throw; a page renders real data, a skeleton, or error+retry.
   Never add a fixture or a mock fallback.
6. **Never render a raw database value.** Every coded value goes through `label()`.
7. **Render only what the data contains.** Derive filter options and legend entries from the rows
   you actually received. Never hard-code a severity or status set.
8. **No `console.log`** in committed code.
9. **TDD.** Write the failing test, run it, implement, re-run.
10. **Do not commit.** Leave your work in the working tree for review.
11. **Report what you actually ran.** If a command could not run in your sandbox, say so plainly.
    Three of five Phase C reports contained a claim that did not survive measurement — none dishonest,
    all harness limits reported as findings. "`npm test` could not run here" is a welcome answer; a
    summary you did not observe is not.
12. **Verify by measuring the rendered page**, never by counting elements or grepping classes:
    `const vis = e => { const r = e.getBoundingClientRect(); return r.width > 4 && r.height > 4; };`
    When querying controls, target leaves — `.filter(e => !e.querySelector('a,button'))` — or a
    wrapping `<a>` will make identical CTAs look distinct.

## Colour semantics — the point of the whole pass

| Use | Token |
|---|---|
| A real fault, refusal, critical severity, missed deadline | `text-danger` |
| **Anything clickable** — evidence IDs, document IDs, filenames, entity refs | `text-link` |
| An identifier that is **not** clickable | `text-ink` (add `tabular` for codes) |
| Secondary/meta text | `text-muted` |
| Brand: filled primary buttons, active nav only | `text-accent` / `bg-accent` |

`--accent` is the brand orange and sits close to red. **Using it for an identifier is the bug this
whole phase exists to fix.** If you are reaching for `text-accent` on anything that is not a primary
action, you want `text-link` or `text-ink`.

## Primitives — exact signatures, verified 2026-08-22

Import from `@/components/ui`:

```tsx
export function Timestamp({ value, relative = true, className }: {
  value: string | null | undefined;      // ISO-8601
  relative?: boolean;                     // false = exact only, no "3h ago" hint
  className?: string;
})
// Renders exact UTC "2026-08-18 09:12:41" as primary, "3h ago" beneath.
// Em dash for null/unparseable. Full ISO on title.

export function Truncate({ text, lines = 1, className }: {
  text: string | null | undefined;
  lines?: 1 | 2;                          // 2 = line-clamp-2 instead of truncate
  className?: string;
})
// Always sets title={text}. Em dash for absent.

export function KpiGroup({ total, breakdown, breakdownLabel }: {
  total: { label: string; value: React.ReactNode };
  breakdown: { label: string; value: React.ReactNode }[];
  breakdownLabel?: string;
})
// A total and its own breakdown as visually distinct regions (review item 9).
// data-testid: "kpi-total" and "kpi-breakdown".

export function statusTone(status: string | null | undefined): Tone
// "open"|"overdue"|"critical"|"disputed"|"rejected"|"safety_critical" -> "danger"
// "pending"|"pending_approval"|"pending_moc"|"quarantined"|"high"|"major"|"draft" -> "caution"
// "monitor"|"in_progress"|"scheduled"|"normal" -> "info"
// "validation"|"under_review"|"questions_ready" -> "validation"
// "verified"|"approved"|"promoted"|"active"|"completed"|"resolved" -> "verified"
// "low"|"non_critical"|"archived"|"superseded"|"cancelled" -> "neutral"
// anything else -> "neutral"

export function StatusBadge({ tone, children, dot = true, pulse = false }: {
  tone: Tone;                             // pass statusTone(value), never hand-pick
  children: React.ReactNode;
  dot?: boolean;
  pulse?: boolean;                        // reserve for overdue/critical
})

export function PageHeader({ eyebrow, title, lede, actions, compact, className }: {
  eyebrow?: string; title: React.ReactNode; lede?: React.ReactNode;
  actions?: React.ReactNode;              // page-level buttons go here
  compact?: boolean; className?: string;
})

export function EmptyState({ message, action }: {
  message: string;
  action?: { label: string; onClick: () => void } | { label: string; href: string };
})
```

**Canonical badge usage:**
```tsx
<StatusBadge tone={statusTone(row.status)}>{label(row.status)}</StatusBadge>
```

## `DataTable`

```tsx
export interface TableColumn<T> {
  key: string;
  label: string;
  render?: (row: T) => React.ReactNode;
  className?: string;
  sortValue?: (row: T) => string | number;   // enables sort; defaults to row[key]
  sortable?: boolean;
  align?: "left" | "right";                  // applies to BOTH th and td
}

<DataTable
  columns={TableColumn<T>[]}
  rows={T[]}
  keyFn={(row) => string}          // REQUIRED, stable id — never the array index
  emptyState={<EmptyState … />}
  pageSize={number}                // optional client pagination
  onRowClick={(row) => void}       // adds cursor-pointer + hover automatically
  loading={boolean}                // renders TableSkeleton at the right column count
  toolbar={<…/>}                   // filter/search row inside the table chrome
/>
```

Sorting, `aria-sort`, row hover and the sort caret are handled for you. **Right-align numeric
columns** with `align: "right"`.

## Labels

Import from `@/lib/labels`:

```tsx
label(value: string | null | undefined): string
// "deviation_flag" -> "Deviation flag";  "he-3xx_series" -> "HE-3xx series"
// "non_critical" -> "Non-critical";      null/"" -> "—"

plural(count: number, singular: string, pluralForm?: string): string
// plural(1, "signal") -> "1 signal";  plural(3, "signal") -> "3 signals"
```

## Getting the real data shape

The stack is live. **Check the actual response before writing columns** — several review mockups
show fields that do not exist:

```bash
TOKEN=$(curl -s -X POST http://localhost:8000/auth/login \
  -H 'Content-Type: application/json' \
  -d '{"email":"admin@kairos.local","password":"KairosAdmin123!"}' \
  | python3 -c 'import sys,json;print(json.load(sys.stdin)["access_token"])')

curl -sL -H "Authorization: Bearer $TOKEN" http://localhost:8000/<path> | python3 -m json.tool | head -40
```

`docs/design/DATA-CONTRACT.md` records the full audit. **If the data disagrees with your brief, the
data wins — say so in your report.**

## Verification — required before you commit

```bash
cd /home/arnavbansal/kairos/kairos/frontend
npx vitest run <your test file>      # your tests pass
npx tsc --noEmit                     # 0 errors
npm test                             # see baseline below
node scripts/check-overflow.mjs      # PASS — no horizontal scroll at any width
```

**Test baseline: 200 passed · 1 known failure · 1 expected-fail marker.**
(179 was the Phase C baseline; Phase C added 17 tests and D7 added 4.)
- The known failure is `src/app/(app)/management/page.test.tsx:61` — copy drift, pre-existing, not
  yours. Leave it.
- The expected-fail is `src/app/landing-figures.test.ts` — an intentional `it.fails()` drift marker.
- **Any other failure is a regression you caused.** Fix it before committing.

## Commit format

```
feat(<page>): <what changed>

Review items N, N. <One line on why it was wrong.>

<Anything you could not build, and why.>
```

End every commit body with:
```
Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
```

## Report back

Under 150 words: files changed, review items addressed, **anything the data would not support**, and
any test you could not make pass. An honest gap is worth more than a false tick — the reviewer will
verify against the live app.
