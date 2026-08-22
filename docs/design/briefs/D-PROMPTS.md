# Phase D — paste-ready prompts

One block per task. **Paste verbatim** into a Codex chat with the model selected.

```bash
cd /home/arnavbansal/kairos/kairos     # the cd matters — every block uses repo-relative paths
codex                                   # Terra is the configured default
```

**Order:** D1–D6 are independent and may all run at once. **D7 is already done** (collapsible nav
rail, commit `141a023`) — it edited the shell, so it was never dispatched.

**Nobody commits.** Every block says so. Diffs are reviewed together, then committed.

**Before dispatching, make sure the running app is current.** The frontend container does not
hot-reload across the WSL2 bind mount, so agents will otherwise measure a stale bundle:

```bash
cd /home/arnavbansal/kairos/kairos     # compose from the wrong directory fabricates empty mounts
docker exec kairos-frontend rm -rf /app/.next/dev
docker compose restart kairos-frontend
until [ "$(curl -s -o /dev/null -w '%{http_code}' http://localhost:3000/)" = 200 ]; do sleep 3; done
```

---

## D1 — `/management`

```
Read these three files from disk before doing anything:
  docs/design/briefs/00-CONTRACT.md
  docs/design/briefs/D-STATE.md
  docs/design/briefs/D1-management.md

Then implement D1 exactly as briefed. You own only:
  frontend/src/app/(app)/management/page.tsx
  frontend/src/app/(app)/management/_components/*
  frontend/src/app/(app)/management/page.test.tsx
Every other file is read-only. If you believe a read-only file must change, STOP and report it
instead of editing.

Note item 6 is largely already satisfied — the brief tells you what to verify and what to leave
alone. Do not "fix" working code.

DO NOT COMMIT. Leave changes in the working tree.
In your report, state exactly which commands you ran and which you could not run in this sandbox.
Do not report a test summary you did not actually observe.
```

## D2 — chart components

```
Read these three files from disk before doing anything:
  docs/design/briefs/00-CONTRACT.md
  docs/design/briefs/D-STATE.md
  docs/design/briefs/D2-charts.md

Then implement D2 exactly as briefed. You own only:
  frontend/src/components/charts.tsx
  frontend/src/components/charts/*
  frontend/src/app/(app)/system-benchmarks/page.tsx
  frontend/src/app/(app)/events/page.tsx
Every other file is read-only — including app/(app)/compliance/page.tsx and
app/(app)/management/page.tsx, which render your components but are not yours to edit.

These components are shared across /compliance, /system-benchmarks, /governance/circuit-breaker and
/governance/sla. A fix that only holds on one of them is not a fix. Verify on all of them.

DO NOT COMMIT. Leave changes in the working tree.
In your report, name every page you actually loaded. State which commands you ran and which you
could not run in this sandbox.
```

## D3 — `/governance`

```
Read these three files from disk before doing anything:
  docs/design/briefs/00-CONTRACT.md
  docs/design/briefs/D-STATE.md
  docs/design/briefs/D3-governance.md

Then implement D3 exactly as briefed. You own only:
  frontend/src/app/(app)/governance/page.tsx
  frontend/src/app/(app)/governance/page.test.tsx
Every governance subpage and every other file is read-only.

Watch the nested-interactive trap the brief describes: an <a> inside an <a> is invalid HTML, breaks
keyboard navigation, and is what made an earlier audit wrongly conclude this item was already fixed.

DO NOT COMMIT. Leave changes in the working tree.
State which commands you ran and which you could not run in this sandbox.
```

## D4a — graph overlay collision

```
Read these three files from disk before doing anything:
  docs/design/briefs/00-CONTRACT.md
  docs/design/briefs/D-STATE.md
  docs/design/briefs/D4a-graph-overlap.md

Then implement D4a exactly as briefed. You own only:
  frontend/src/components/knowledge-graph.tsx
  frontend/src/components/knowledge-graph.test.tsx

SCOPE IS ITEM 19 ONLY — the coverage pill overlapping the zoom controls.
Review items 16 and 17 (node label wrapping and hover) are PARKED: the live graph renders a single
node, so the defect cannot be reproduced or verified. If you find yourself editing node label
rendering, STOP — you are out of scope. Report it and leave it.

This component renders on both /graph and /documents/[id]/topology. Verify both.

DO NOT COMMIT. Leave changes in the working tree.
Name the routes and viewport widths you actually checked. State which commands you ran and which you
could not run in this sandbox.
```

## D5 — `/offboarding`

```
Read these three files from disk before doing anything:
  docs/design/briefs/00-CONTRACT.md
  docs/design/briefs/D-STATE.md
  docs/design/briefs/D5-offboarding.md

Then implement D5 exactly as briefed. You own only:
  frontend/src/app/(app)/(desktop)/offboarding/**
Every other file is read-only.

IMPORTANT: the senior review's example record ("Raymond Ellison, 2 of 6, 33%") is invented, and the
record earlier briefs named (ramesh.kumar@kairos.local) no longer exists. The live database holds
test-run writes like resp_F001AE52@kairos.local. NEVER fabricate a human name from an email
local-part, initials, or an id. The brief explains what to render instead.

Before implementing item 37, inspect what the API actually returns for a handover record and report
the field names you saw.

DO NOT COMMIT. Leave changes in the working tree.
State which commands you ran and which you could not run in this sandbox.
```

## D6 — landing page

```
Read these three files from disk before doing anything:
  docs/design/briefs/00-CONTRACT.md
  docs/design/briefs/D-STATE.md
  docs/design/briefs/D6-landing.md

Then implement D6 exactly as briefed. You own only:
  frontend/src/app/page.tsx
  frontend/src/app/page.test.tsx
Every other file is read-only, including app/globals.css.

Two hard rules:
  1. The benchmark figures on this page are hardcoded ON PURPOSE for a demo. Do not change any
     figure, do not wire one to an API, and do not touch app/landing-figures.test.ts.
  2. Content must be readable when JavaScript is disabled or IntersectionObserver never fires. A
     reveal that starts at opacity-0 and needs JS to become visible renders a blank page when it
     fails — that has already happened once on this page.

DO NOT COMMIT. Leave changes in the working tree.
Give the widths you loaded and confirm you tested with reduced motion both ON and OFF. If you could
not run Playwright in this sandbox, say so plainly rather than implying a pass.
```

---

## After they return

```bash
cd frontend
npx tsc --noEmit                       # 0 errors
npm test 2>&1 | tail -5                # 200 passed · 1 known failure · 1 expected-fail
node scripts/check-overflow.mjs        # PASS
cd .. && git diff --stat -- \
  frontend/src/components/ui.tsx frontend/src/app/globals.css frontend/src/lib \
  frontend/src/components/app-shell.tsx frontend/src/app/layout.tsx
```

The last command must print nothing — it proves no shared file was touched. Then re-run the per-item acceptance checks in `D-STATE.md`
against the running app. **Never commit on a report alone** — three of five Phase C reports contained
a claim that did not survive measurement.
