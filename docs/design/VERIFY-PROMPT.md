# Independent verification prompt — branch `ui-fixes`

Paste the block below into a fresh agent session (Codex with Terra or Luna, or any
agent with shell access to this repo). It is written to be self-contained: the agent
discovers what to check rather than trusting a list I wrote.

```bash
cd /home/arnavbansal/kairos/kairos
codex
```

---

## The prompt

```
You are independently verifying a large frontend change before it merges. I wrote the
change; you are checking it. Assume nothing I say about it is true until you have run
something that proves it.

REPO:   /home/arnavbansal/kairos/kairos
BRANCH: ui-fixes-final  (pushed as origin/ui-fixes)
BASE:   origin/main

There is NO .env file and you will NOT be given secrets. Everything below is designed to
run without them. If a check genuinely requires a secret, say so and skip it — do not
invent credentials, do not create a .env, and do not modify docker-compose files to work
around a missing one.

=== YOUR MOST IMPORTANT INSTRUCTION ===

Report only what you actually ran and observed. If a command fails for environmental
reasons (no network, no Docker, no secrets, sandbox restriction), say exactly that.
"I could not run X because Y" is a useful, welcome answer. A summary of a command you
did not actually execute is worse than no answer at all, because it will be believed.

Do not fix anything. Do not commit. Do not push. You are reporting, not repairing.
If you find a defect, describe it precisely enough that someone else can reproduce it.

=== STEP 1: ESTABLISH THE BASELINE FIRST ===

Do this BEFORE checking the branch. Without it you cannot tell a pre-existing problem
from one this change introduced, and that distinction is the whole point of the exercise.

  git fetch origin
  git worktree add /tmp/kairos-main origin/main
  cd /tmp/kairos-main/frontend
  ln -s /home/arnavbansal/kairos/kairos/frontend/node_modules node_modules   # avoids a slow npm ci
  npx tsc --noEmit          ; echo "main tsc exit=$?"
  npx eslint .              ; echo "main lint exit=$?"
  npm test 2>&1 | tail -5

Write these numbers down. Every later finding must be stated as a DELTA against them.
A warning that exists on main is not a defect in this branch.

=== STEP 2: THE FOUR CI GATES ===

CI is .github/workflows/frontend.yml. Read it yourself and confirm the steps below still
match it — do not trust my transcription. It runs on any change under frontend/**.

  cd /home/arnavbansal/kairos/kairos/frontend
  npx tsc --noEmit                              # must exit 0
  npm run lint                                  # must exit 0 — NOT just "few warnings"
  npm run build                                 # must exit 0, full production build
  npm audit --audit-level=high --omit=dev       # must exit 0

For lint specifically: report the exact error and warning COUNTS on both branches. The
claim being made is "0 errors, 3 warnings, and all 3 also exist on main". Verify both
halves of that independently.

`npm run build` is the gate most likely to catch something the others miss — it is a
real production compile, and type checking alone does not exercise it.

Note: `npm run lint` may print a JSON-parse complaint from a wrapper. If so, run
`npx eslint .` directly and use its exit code, which is what CI actually gates on.

=== STEP 3: THE TEST SUITE ===

  npm test 2>&1 | tail -20

Expected: 212 passed, 1 failed. The one failure should be
src/app/(app)/management/page.test.tsx around line 61, a copy-drift assertion that
predates this branch.

VERIFY THAT CLAIM RATHER THAN ACCEPTING IT:

  git log -1 --format='%h %s' -L61,61:'frontend/src/app/(app)/management/page.test.tsx' origin/main

If that failure traces to a commit on this branch, the claim is false and that matters.
If any OTHER test fails, that is a regression — report it with its full output.

=== STEP 4: DOES THE APP ACTUALLY RUN ===

The stack is Docker Compose. Check whether it is already up:

  docker compose ps

If kairos-frontend and kairos-backend-api are running, use them. If they are NOT running,
DO NOT try to start the full stack — it needs cloud credentials you do not have. Say so
and skip to Step 5.

IMPORTANT TRAP, and it will silently corrupt your results if you miss it: the frontend
container bind-mounts ./frontend/src from the host, but WSL2 file-watch events do not
cross into the container. The page you load may be an older build than the code on disk.
Before trusting ANY browser measurement:

  cd /home/arnavbansal/kairos/kairos
  docker exec kairos-frontend rm -rf /app/.next/dev
  docker compose restart kairos-frontend
  until [ "$(curl -s -o /dev/null -w '%{http_code}' http://localhost:3000/)" = 200 ]; do sleep 3; done

Then smoke every route and report any that do not return 200:

  for r in / /login /management /assets /events /documents /projects /audit /governance \
           /compliance /graph /offboarding /copilot /rca /briefs /settings \
           /management/coverage /system-health; do
    printf "%-24s %s\n" "$r" "$(curl -s -o /dev/null -w '%{http_code}' http://localhost:3000$r)"
  done

A 200 only proves the route responded. To prove a page RENDERS rather than showing an
error boundary, drive it with Playwright (playwright-core is already in frontend/
node_modules — no install needed) and check for the error text:

  const r = await fetch('http://localhost:8000/auth/login', {method:'POST',
    headers:{'Content-Type':'application/json'},
    body: JSON.stringify({email:'admin@kairos.local', password:'KairosAdmin123!'})});
  const {access_token, refresh_token} = await r.json();
  // set localStorage kairos-token / kairos-refresh via addInitScript, then visit routes
  // and assert document.body.innerText does not match /Something went wrong/i

Those are seeded demo credentials, not secrets. If the API is not running, skip this.

=== STEP 5: REGRESSION — DID ANYTHING THAT WORKED BEFORE STOP WORKING ===

This is the most important step and the reason you established a baseline. The question
is NOT "do the new features work". It is "does everything that worked before still work".

Nearly all of this change lives in files that EVERY page imports. That is the risk:

  components/ui.tsx      DataTable, StatusBadge, Modal, Button, Timestamp, Truncate,
                         KpiGroup -- 18 pages render DataTable alone, 6 with clickable rows
  components/app-shell.tsx   the shell every authenticated route mounts inside
  app/globals.css        all four colour scopes: light, dark, sidebar rail, high contrast

A bug here does not break one page. It breaks forty.

--- 5A. THE A/B METHOD (use this, it is far stronger than judging one side alone) ---

Run each flow TWICE -- once against origin/main, once against the branch -- and compare.
You cannot tell "this is broken" from "this was always like that" any other way.

To run main's frontend, stop the current container and start one from the main worktree
you already created in Step 1. Run it on port 3000 (NOT 3001): the backend's CORS only
allows localhost:3000, and on any other port the app silently fails auth and redirects to
/login, which looks exactly like "every page is blank". That has already fooled one
verification attempt.

  cd /home/arnavbansal/kairos/kairos
  docker compose stop kairos-frontend
  docker run -d --name kairos-main --network kairos_edge -p 3000:3000 \
    -e NODE_ENV=development -e NEXT_PUBLIC_API_URL=http://localhost:8000 \
    -e API_INTERNAL_URL=http://kairos-backend-api:8000 \
    -v /tmp/kairos-main/frontend/src:/app/src \
    -v /tmp/kairos-main/frontend/public:/app/public \
    kairos-frontend:local npm run dev
  # wait for 200, run your flows, record results, then:
  docker rm -f kairos-main && docker compose start kairos-frontend

Sanity-check that you really are on main before trusting a single number: main's /assets
renders exactly ONE visible table column. If you see four, you are on the branch.

--- 5B. THE SHELL: every authenticated page mounts inside it ---

I changed SidebarContent, the desktop <aside>, BrandLink and the pre-paint script in
layout.tsx. Everything below shares that file and could have broken. Test each on BOTH
branches:

  1. Command palette      Ctrl+K (Cmd+K on Mac) opens it; typing filters; Enter navigates;
                          Escape closes.
  2. Keyboard shortcuts   the "?" help dialog opens and closes.
  3. Mobile nav           at 390px wide, the menu button opens the drawer, links navigate,
                          and the drawer closes after navigating.
  4. Mini calendar        the calendar button opens it; Escape closes it.
  5. Account menu         opens; "Sign out" actually signs out and lands on /login.
  6. Role gating          this is the one most worth your attention. Sign in as a
                          restricted persona and confirm the sidebar shows FEWER items and
                          that visiting a forbidden route redirects rather than rendering.
                          Roles are engineer / reliability / admin / compliance /
                          field_worker; see components/use-role.ts. If you cannot get
                          credentials for a second persona, say so and skip -- do not guess.
  7. Skip link            Tab once from page load: a "Skip to content" link should appear.
  8. Theme toggle         switch to dark and back. Every route must stay readable. Then
                          RELOAD -- the theme must survive, and must not flash the wrong
                          theme before paint.
  9. Nav rail             collapse it, then reload, then navigate. State must persist. Then
                          check the MOBILE drawer with the rail collapsed: the drawer must
                          still show its text labels. (Desktop and mobile render the SAME
                          component; only the desktop rail carries data-rail. If the mobile
                          drawer loses its labels, that scoping is broken.)

--- 5C. DataTable: 18 pages depend on it ---

I changed its sort caret and added column alignment. For at least four different pages
that use it (/assets, /audit, /documents, /events, /compliance, /governance/quarantine,
/management/coverage, /system-benchmarks):

  - Sorting: click a header. Does the ROW ORDER change? Click again -- does it reverse?
    Does the caret point the same way the data is actually sorted? Do INACTIVE columns
    show no direction?
  - aria-sort: the active header should carry aria-sort="ascending"/"descending".
  - Pagination: on a table with more than 25 rows (/audit, /compliance), do the page
    controls work, and does changing the filter reset you to page 1?
  - Row click: 6 tables navigate on row click. Does it still work, and does clicking a
    LINK inside a row navigate to the link's destination rather than the row's?
    (/documents has a download link inside a clickable row -- exactly this case.)
  - Empty and loading states: does a filter matching nothing show an empty state rather
    than a blank table? Does a loading skeleton have the right column count?

--- 5D. Colour tokens: four scopes, one stylesheet ---

--danger moved hue, --link and --validation are new, and all four scopes changed.

  - Every page readable in dark mode. Look for text that vanished into its background --
    a token defined in only one scope produces exactly that.
  - [data-contrast="high"] still works.
  - The sidebar rail keeps its dark palette in BOTH themes (it is permanently dark).
  - Nothing that should be an alarm turned quiet, and nothing quiet turned into an alarm.
    Red must still mean fault.

--- 5E. Data integrity: the app must not invent anything ---

This product refuses to guess; the UI must not either.

  - Compare a page against its API response directly. Example:
      curl -s localhost:8000/api/v1/assets -H "Authorization: Bearer $TOKEN" | head -c 600
    Every value on screen must trace to that response. No invented names, counts, or dates.
  - /offboarding shows email identifiers like resp_F001AE52@kairos.local. Confirm the UI
    shows the real identifier and has NOT derived a human name from it.
  - Error and retry: stop the backend (docker compose stop kairos-backend-api), reload a
    data page. It must show an error state with a working Retry -- not a blank screen, not
    a permanent skeleton, and NOT fabricated placeholder data. Restart it and confirm
    Retry recovers. This is a core product rule: there are no fixtures to fall back on.
  - Filters derived from data: /events builds its priority and type filters from the rows
    it received. Confirm no filter option renders that matches zero rows.

--- 5F. The specific claims (verify by measuring, never by counting DOM nodes) ---

  const visible = e => { const r = e.getBoundingClientRect(); return r.width > 4 && r.height > 4; };

  1. /assets, /events, /documents render more than ONE visible column:
       [...document.querySelectorAll('th')].filter(visible).length   -> 4, 6, 6
     On main all three return 1. The other columns exist in the DOM at 0px width, which is
     why counting <th> elements gives the wrong answer.
  2. No horizontal page scroll at 360/768/1024/1440:
       node frontend/scripts/check-overflow.mjs      (needs app + api up; must print PASS)
  3. /management/coverage columns sort -- confirm ROW ORDER changes, not just a caret.
  4. /governance shows six DISTINCT calls to action. Compare the LAST LINE of each card,
     not the innerText of the wrapping <a>, which includes the whole card body and looks
     distinct even when all six CTAs read identically -- that error produced a false
     "already fixed" here once:
       [...document.querySelectorAll('[data-testid^="governance-surface-"]')]
         .map(c => c.innerText.trim().split('\n').filter(Boolean).pop())
     Then click each one and confirm it lands on the right page.
  5. /compliance: clicking a donut segment filters the register below; clicking the active
     one clears the filter; the other segments dim.
  6. /management "Plant state" shows a live status from the health endpoint, not a
     hardcoded word. Stop the backend and confirm it degrades honestly.

=== STEP 6: SCOPE AND SAFETY ===

  git diff --stat origin/main..HEAD | tail -5
  git diff --name-only origin/main..HEAD | grep -vE '^(frontend/|docs/|AGENTS.md)' || echo "frontend+docs only"

Confirm and report:
  - Are any BACKEND files touched? (Expected: none.)
  - Any secrets, .env files, keys, tokens, or credentials in the diff?
      git diff origin/main..HEAD | grep -iE '(api[_-]?key|secret|password|token|BEGIN.*PRIVATE)' | head
    Note: the seeded demo login above appears in test scripts. That is expected and fine.
  - Is frontend/src/app/page.tsx byte-identical to origin/main? It is supposed to be —
    the landing page was deliberately taken from main untouched:
      diff <(git show origin/main:frontend/src/app/page.tsx) frontend/src/app/page.tsx && echo IDENTICAL
  - Does the branch sit as ONE commit on top of origin/main?
      git rev-list --count origin/main..HEAD

=== STEP 7: ANYTHING I HAVE NOT THOUGHT OF ===

The steps above encode my assumptions about what could break, which is exactly why they
might miss something. Spend real effort here.

Particularly worth probing:
  - Does the dark theme still work? (localStorage kairos-theme = 'dark'.) The token
    changes touched all four palette scopes and I have checked light far more than dark.
  - Does [data-contrast="high"] still work?
  - Anything that renders correctly at 1440 but breaks at 360 or 768.
  - Any place a loading skeleton never resolves, or an error boundary shows.
  - Keyboard access: can you reach and operate the nav rail toggle, the table sort
    headers, and the governance cards by keyboard alone, with a visible focus ring?

=== HOW TO REPORT ===

Structure it as:

  1. BASELINE      main's tsc / lint / test numbers.
  2. GATES         the four CI commands, exit code for each, on this branch.
  3. DELTA         what changed versus baseline. Errors and warnings separately.
  4. RUNTIME       routes that responded, routes that rendered, anything broken.
  5. REGRESSIONS   the heart of the report. For every flow in 5B-5E, state one of:
                     WORKS ON BOTH          (no regression)
                     BROKEN ON BOTH         (pre-existing, not caused by this change)
                     WORKS ON MAIN, BROKEN HERE   <-- a real regression, report in full
                     COULD NOT TEST         (say why)
                   The third category is what this whole exercise exists to find. If you
                   find none, say so plainly -- that is a valid and useful result.
  6. CLAIMS        each numbered claim in 5F: verified / failed / could-not-check.
  7. SCOPE         backend files touched, secrets found, landing page identical, commit count.
  8. FINDINGS      anything wrong, with a reproduction.
  9. NOT RUN       every check you could not perform, and why.

Section 9 is not an admission of failure — it is the most valuable part of the report,
because it tells me exactly where the verification has holes.

One last thing. If you can only do part of this, prioritise in this order:
  1. The four CI gates (Step 2) -- these block the merge outright.
  2. 5B role gating and sign-out -- a broken auth boundary is the worst possible outcome.
  3. 5C DataTable sorting and row clicks -- 18 pages depend on it.
  4. 5D dark mode -- half the palette work is invisible in light mode.
Everything else is secondary to those four.
```

---

## For reference — what I measured locally

Do not give these to the verifying agent before it runs. Compare afterwards; if its
numbers disagree with mine, its numbers are the ones to trust, because it has no stake
in the answer.

| Gate | Result |
|---|---|
| `npx tsc --noEmit` | 0 errors |
| `npx eslint .` | **exit 0** — 0 errors, 3 warnings |
| `npm run build` | success, all 44 routes compiled |
| `npm audit --audit-level=high --omit=dev` | 0 vulnerabilities |
| `npm test` | 212 passed, 1 known pre-existing failure |
| `check-overflow.mjs` | PASS, 7 routes × 4 widths |

Baseline on `origin/main`: lint exits 0 with **5 warnings**. This branch has 3, all of
which also exist on main. The 2 that are gone were in a file this change owns.

`.github/workflows/tests.yml` only triggers on `backend/**`, `tests/**`, `db/**`,
`fixtures/**` and `docker-compose.yml` — none of which this branch touches, so the
backend suite will not run on this PR at all.
