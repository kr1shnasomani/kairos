# Phase C briefs — parallel execution

Five independent page rebuilds. Each brief touches **one page file plus its test**, so they can run
concurrently without collision.

## Dispatch — how to paste into Codex

**Use `PROMPTS.md`.** It holds one ready block per task. Do not `cat` the briefs into the command —
the blocks tell the agent to read them from disk, which is cheaper and keeps the prompt short.

### Interactive (recommended)

```bash
cd /home/arnavbansal/kairos/kairos     # the cd matters — the blocks use repo-relative paths
codex
```

Terra is already the configured default (`~/.codex/config.toml` → `model = "gpt-5.6-terra"`). Then
**paste one block from `PROMPTS.md` verbatim** and watch it work. Preferred for C1, because you can
course-correct rather than discover a problem in a 70k-token dump.

To force a different model for one session: `codex -m gpt-5.6-terra`

### Headless, for the parallel batch

```bash
cd /home/arnavbansal/kairos/kairos
codex exec --sandbox danger-full-access "$(sed -n '/^## C2/,/^```$/p' docs/design/briefs/PROMPTS.md)" &
```

`--sandbox danger-full-access` is required: the agents call `localhost:8000` for real API shapes and
run the Playwright overflow check. The default `workspace-write` sandbox blocks both.

Simplest reliable route is still one terminal per task with the block pasted in.

### Run order

**C1 alone first.** Its brief has been wrong twice. If it comes back clean, dispatch C2–C5 together —
they touch different files and cannot collide.

## File ownership — no two briefs touch the same file

| Brief | Owns | Review items |
|---|---|---|
| C1 | `assets/page.tsx` · **`assets/asset-registry.tsx`** · test | 8, 9, 11 |
| C2 | `audit/page.tsx` · test | 22, 28, 29, 31, 34 |
| C3 | `events/page.tsx` · test | 14, 15 |
| C4 | `documents/page.tsx` · **`documents/_components/documents-table.tsx`** · test | 32 |
| C5 | `projects/page.tsx` · **`projects/_components/class-section.tsx`** · test | 33, 34, 35 |

**Three of these pages are thin shells** — `assets/page.tsx` is 48 lines, `documents/page.tsx` is 56.
The table lives in the extracted component beside it. A brief that named only `page.tsx` would leave
the actual defect untouched; C1 caught this and correctly refused rather than editing out of scope.

**Shared files are read-only for all five:** `components/ui.tsx`, `app/globals.css`, `lib/labels.ts`,
`lib/format.ts`. An agent that believes one needs changing must **stop and report**, not edit.

## Running them at once

Concurrent `npm test` runs are safe (vitest doesn't lock), but five agents each running the full
suite is slow and noisy. Either:

- **Staggered** — start them a minute apart, or
- **Scoped** — each agent runs `npx vitest run <its own test file>` while working, and the **full**
  suite once before committing.

Git is the real contention point: five agents committing to one branch will race. Either let them
commit sequentially, or have them leave changes uncommitted and commit them yourself after review.

## Baseline every agent must preserve

```
179 passed · 1 known failure · 1 expected-fail marker
```

- Known failure: `app/(app)/management/page.test.tsx:61` — copy drift, pre-existing, **not theirs**.
- Expected-fail: `app/landing-figures.test.ts` — an intentional `it.fails()` drift marker.
- Anything else is a regression.

## Verifying their work

Do not take the reports at face value. For each:

```bash
cd frontend
npx tsc --noEmit                    # 0 errors
npm test                            # baseline held
node scripts/check-overflow.mjs     # PASS
git diff --stat -- src/components/ui.tsx src/app/globals.css src/lib   # MUST be empty
```

That last one is the important check — it proves nobody edited a shared file.

Then open the page. The most common failure mode is an agent reporting success against a mockup
rather than the live data — several review mockups show fields the API does not return, and each
brief names the ones to drop. If a report claims a column the brief said to drop, that is a
fabrication, not a bonus.

## Why these five, and not the other seven list routes

The archetype has 12 routes. These five carry all 7 of Phase C's review items and include the two
pages the review calls worst (`/assets`, `/audit`). The remaining seven inherit most of the benefit
from the shared primitives already landed in Phase B, and can follow once the pattern is proven here.
