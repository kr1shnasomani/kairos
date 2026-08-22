# D5 — `/offboarding` expert handover cards

**Owns exclusively:** `frontend/src/app/(app)/(desktop)/offboarding/**`

**Read-only:** everything else.

Review items: **37, 38** — **re-scoped.** Read the next section before touching anything.


> **Before trusting any browser measurement, read the "READ FIRST" section at the top of
> `D-STATE.md`.** The frontend runs in a container that does not hot-reload across the WSL2 bind
> mount, so the page you are looking at may not contain your change. `tsc` and `npm test` are
> unaffected; only browser measurements are at risk.

---

## The review's data no longer exists

The senior review's mockup names *"Raymond Ellison, 2 of 6 sessions, 33%"*. Earlier briefs named
`EXPERT-RKUMAR` / `ramesh.kumar@kairos.local`, 1 of 5, 20%.

**Both are gone.** Measured live:

```
17 active programmes · 101 TOTAL SESSIONS · 1 of 101 sessions CAPTURED · 0 COMPLETE
RF  resp_F001AE52@kairos.local     Retires 21 Sept 2026  In progress  0 of 6 sessions  0%
QF  qtest_F0D6129E@kairos.local    Retires 6 Oct 2026    In progress  0 of 6 sessions  0%
D7  detail_79365ED2@kairos.local   Retires 21 …
```

`resp_…`, `qtest_…`, `detail_…` are **test-run writes** that reached the demo database. Logged in
`docs/BUGS.md` for the backend owner. **Not your problem to fix, and not a reason to stop** — the
frontend must render whatever it is given, honestly.

**The consequence that changes your task:** *"derive the engineer's full name from `personnel_email`"*
is **undeliverable**. There is no name inside `resp_F001AE52@kairos.local`.

## Item 37 — re-scoped: identify the person honestly

**Do not fabricate a name.** Not from the local-part, not from the initials, not from the session id.
This is a knowledge-transfer record in a safety-critical system; a plausible-looking wrong name is
worse than an ugly right one.

**Fix:**
1. If the API returns a real human name field, use it. **Check first** — inspect the response shape
   rather than assuming. If such a field exists and is populated, that is the answer.
2. If it does not, show the identifier the record actually has, formatted for reading rather than
   dumped raw.
3. The card must degrade gracefully across all three cases: real name · email only · neither. No
   layout jump, no empty slot, no `undefined`.

Whatever you show must be the **same string a user could search for** and find this record. That is
the test of an honest identifier.

## Item 38 — retirement countdown

Cards show `Retires 21 Sept 2026` — an absolute date with no urgency. The review asks for a
countdown, and this is the one screen where time pressure is the entire point: knowledge capture that
finishes after the expert leaves has failed.

**Fix:** show remaining time alongside the date. Not instead of it — this is a compliance record and
the absolute date must stay readable and unambiguous.

The `Timestamp` primitive in `components/ui.tsx` already establishes the house pattern: **exact value
primary, relative hint secondary, full value in `title`.** Follow it. It is read-only to you — use
it, do not edit it, and if it does not fit, say so rather than forking it.

Requirements:
- Handle a date **in the past** — some records will have passed their retirement date. "Retired 3
  days ago" is correct; a negative countdown is not.
- Handle a missing or unparseable date without crashing the card.
- Urgency may be expressed with tone, but **read `frontend/DESIGN.md` §2 first.** `--danger` is
  reserved for faults. A near retirement date is a schedule pressure, not an alarm. `--caution` is
  the likelier fit. Never use `--accent` on data.

**Accept when:** every card shows both the absolute date and remaining time; past dates read
correctly; a record with no date still renders.

---

## Also measured, decide and report

The header shows `1 of 101 sessions CAPTURED` beside `0 COMPLETE` and `101 TOTAL SESSIONS`. Three
figures, overlapping meanings, no statement of how they relate — the same defect Phase C fixed on
`/events` and `/audit` (review items 15 and 29).

If your reading of the data confirms these restate one another, fix it the way Phase C did: **each
figure states a different fact, or it goes.** If they are genuinely distinct, leave them and say so
in your report. Do not guess — check what the API returns.

---

## Constraints

- No new npm dependencies. `@testing-library/user-event` is **not** installed — use `fireEvent`.
- Live data only. **No fixtures, no sample expert, no placeholder name.**
- `label()` and `plural()` in `lib/labels.ts` are read-only — use them for any enum or count wording.
- Keep every existing `data-testid` and every route unchanged.
- Both palettes, and `[data-contrast="high"]`. Responsive at 360/768/1024/1440.

## Report

State what the API actually returned for a handover record — the field names you saw. That is the
most useful thing you can hand back, because it settles item 37 for good. Say what you ran and what
you could not. **Do not commit.**
