# Paste-ready prompts

One block per task. Open a chat, select the model, paste the block verbatim. Each is
self-contained — the agent reads the contract and its brief from disk, so nothing needs `cat`ing in.

**Requirement:** the agent needs **local shell + filesystem access** in
`/home/arnavbansal/kairos/kairos`. A browser-only chat cannot do these; they run tests.

**Model:** `gpt-5.6-terra` for all five. These are judgment tasks — deciding whether an identifier is
clickable, spotting that a mockup column cannot be built. Luna tends to take a mockup literally and
build columns the data will not fill. Sol is unnecessary at this scope.

**Order:** run **C1 alone first**. Its brief was wrong once already and the corrected version needs
proving. If C1 comes back clean, run C2–C5 together.

---

## C1 — `/assets`

```
Model: gpt-5.6-terra
Working directory: /home/arnavbansal/kairos/kairos

Read these three files first, in order:
  docs/design/briefs/00-CONTRACT.md
  docs/design/briefs/STATE.md
  docs/design/briefs/C1-assets.md

Then execute C1 exactly as written.

Constraints that override anything you infer:
- Edit ONLY the files C1 names. The table is in asset-registry.tsx, not page.tsx.
- The 5 columns now RENDER (fixed in commit 5788652 — they existed but at 0px).
  Do not rebuild the table. 12 text-accent identifiers and raw snake_case class
  keys are the work.
- Do NOT edit components/ui.tsx, app/globals.css, lib/labels.ts or lib/format.ts.
  If you believe one needs changing, STOP and report instead.
- DO NOT COMMIT. Leave changes in the working tree.
- The stack is live on localhost:8000 and :3000. Query the real API before writing
  columns; if the data disagrees with the brief, the data wins and you say so.

Before you finish, run and paste the output of:
  cd frontend && npx tsc --noEmit && npm test 2>&1 | tail -5
  node scripts/check-overflow.mjs 2>&1 | tail -2
  cd .. && git diff --stat -- frontend/src/components frontend/src/app/globals.css frontend/src/lib

That last command MUST print nothing. If it prints anything, you edited a shared file — revert it.

Report in under 150 words: files changed, review items closed, anything the data
would not support, any test you could not make pass. An honest gap beats a false tick.
```

---

## C2 — `/audit`

```
Model: gpt-5.6-terra
Working directory: /home/arnavbansal/kairos/kairos

Read these three files first, in order:
  docs/design/briefs/00-CONTRACT.md
  docs/design/briefs/STATE.md
  docs/design/briefs/C2-audit.md

Then execute C2 exactly as written.

Constraints that override anything you infer:
- Edit ONLY audit/page.tsx and audit/page.test.tsx. Everything for this page is in
  those two files.
- Do NOT edit components/ui.tsx, app/globals.css, lib/labels.ts or lib/format.ts.
  If you believe one needs changing, STOP and report instead.
- DO NOT COMMIT. Leave changes in the working tree.
- Phase B already recoloured entity_id to text-ink and "Raw metadata" to text-link
  on this page. Verify that still holds; do not revert it.
- The stack is live. audit_log has 850 rows, 651 of them action="synthesis" — a
  default filter is the honest fix, hiding rows is not.

Before you finish, run and paste the output of:
  cd frontend && npx tsc --noEmit && npm test 2>&1 | tail -5
  node scripts/check-overflow.mjs 2>&1 | tail -2
  cd .. && git diff --stat -- frontend/src/components frontend/src/app/globals.css frontend/src/lib

That last command MUST print nothing.

Report in under 150 words: files changed, review items closed, anything the data
would not support, any test you could not make pass.
```

---

## C3 — `/events`

```
Model: gpt-5.6-terra
Working directory: /home/arnavbansal/kairos/kairos

Read these three files first, in order:
  docs/design/briefs/00-CONTRACT.md
  docs/design/briefs/STATE.md
  docs/design/briefs/C3-events.md

Then execute C3 exactly as written.

Constraints that override anything you infer:
- Edit ONLY events/page.tsx and events/page.test.tsx. Leave events/emit-panel.tsx alone.
- Do NOT edit components/ui.tsx, app/globals.css, lib/labels.ts or lib/format.ts.
  If you believe one needs changing, STOP and report instead.
- DO NOT COMMIT. Leave changes in the working tree.
- The 6 columns now RENDER (fixed in commit 5788652). Do not rebuild the table.
  The duplicate "22 of 22" count and 24 text-accent elements are the work.
- CRITICAL: operational_events.priority is NULL in every DB row. The API reads it
  from a JSONB payload with a silent "normal" default and there is no CHECK
  constraint, so the value is unconstrained. Observed live: "high" and "normal"
  only. Derive filter options from the rows you receive — a hard-coded four-level
  filter renders two permanently empty options.
- Events carry no actor field. No assignee column, no avatar. Do not invent one.

Before you finish, run and paste the output of:
  cd frontend && npx tsc --noEmit && npm test 2>&1 | tail -5
  node scripts/check-overflow.mjs 2>&1 | tail -2
  cd .. && git diff --stat -- frontend/src/components frontend/src/app/globals.css frontend/src/lib

That last command MUST print nothing.

Report in under 150 words: files changed, review items closed, anything the data
would not support, any test you could not make pass.
```

---

## C4 — `/documents`

```
Model: gpt-5.6-terra
Working directory: /home/arnavbansal/kairos/kairos

Read these three files first, in order:
  docs/design/briefs/00-CONTRACT.md
  docs/design/briefs/STATE.md
  docs/design/briefs/C4-documents.md

Then execute C4 exactly as written.

Constraints that override anything you infer:
- Edit ONLY documents/page.tsx, documents/_components/documents-table.tsx and
  documents/page.test.tsx. Do NOT touch documents/[id]/, documents/compare/ or
  documents/ingest/ — those are separate routes.
- Do NOT edit components/ui.tsx, app/globals.css, lib/labels.ts or lib/format.ts.
  If you believe one needs changing, STOP and report instead.
- DO NOT COMMIT. Leave changes in the working tree.
- The 5 columns now RENDER (fixed in commit 5788652), and the tabs and filter box
  already existed. Do not rebuild the table. 26 text-accent identifiers, the
  missing download action, relative-only timestamps and raw snake_case are the work.
- ingested_by is a raw UUID, not a name. Omit the actor; never print a UUID.

Before you finish, run and paste the output of:
  cd frontend && npx tsc --noEmit && npm test 2>&1 | tail -5
  node scripts/check-overflow.mjs 2>&1 | tail -2
  cd .. && git diff --stat -- frontend/src/components frontend/src/app/globals.css frontend/src/lib

That last command MUST print nothing.

Report in under 150 words: files changed, review items closed, anything the data
would not support, any test you could not make pass.
```

---

## C5 — `/projects`

```
Model: gpt-5.6-terra
Working directory: /home/arnavbansal/kairos/kairos

Read these three files first, in order:
  docs/design/briefs/00-CONTRACT.md
  docs/design/briefs/STATE.md
  docs/design/briefs/C5-projects.md

Then execute C5 exactly as written.

Constraints that override anything you infer:
- Edit ONLY projects/page.tsx, projects/_components/class-section.tsx and
  projects/page.test.tsx.
- Do NOT edit components/ui.tsx, app/globals.css, lib/labels.ts or lib/format.ts.
  If you believe one needs changing, STOP and report instead.
- DO NOT COMMIT. Leave changes in the working tree.
- This page has 41 text-accent elements, the most of any page. That colour sweep
  is the bulk of the work, not a side task.
- Review item 33 claims a monospace/normal font mismatch. VERIFIED: there is no
  font-mono in either file. Find the real cause, and if the four figures already
  share one style, say so and skip the item rather than inventing a change.
- Item 34's three call sites carry line numbers in the brief. Check they still
  match before editing.

Before you finish, run and paste the output of:
  cd frontend && npx tsc --noEmit && npm test 2>&1 | tail -5
  node scripts/check-overflow.mjs 2>&1 | tail -2
  cd .. && git diff --stat -- frontend/src/components frontend/src/app/globals.css frontend/src/lib

That last command MUST print nothing.

Report in under 150 words: files changed, review items closed, anything the data
would not support, any test you could not make pass.
```

---

## Baseline every agent must hold

```
179 passed · 1 known failure · 1 expected-fail marker
```

- Known failure: `app/(app)/management/page.test.tsx:61` — pre-existing copy drift. **Not theirs.**
- Expected-fail: `app/landing-figures.test.ts` — an intentional `it.fails()` drift marker.
- Anything else is a regression.

## Before you dispatch

A broken skill file errors on every Codex start and is eating the skills budget:

```
failed to load skill .agents/skills/qdrant-search-quality/search-strategies/
  relevance-feedback/SKILL.md: invalid YAML: unknown escape character, line 2 col 50
```

Codex also reports *"Skill descriptions were shortened to fit the skills context budget"* — 80 skills
crowd out the task itself. Worth pruning to what this repo actually uses.
