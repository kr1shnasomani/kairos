# D3 — `/governance` controls grid

**Owns exclusively:** `frontend/src/app/(app)/governance/page.tsx` ·
`frontend/src/app/(app)/governance/page.test.tsx`

**Read-only:** everything else — including every `governance/*/` subpage. Your file is the index only.

Review items: **25 (open)** and **27 (already satisfied — verify only).**


> **Before trusting any browser measurement, read the "READ FIRST" section at the top of
> `D-STATE.md`.** The frontend runs in a container that does not hot-reload across the WSL2 bind
> mount, so the page you are looking at may not contain your change. `tsc` and `npm test` are
> unaffected; only browser measurements are at risk.

---

## Measured

Six leaf controls, **every one reading `Open control →`**:

| Group | Card | Count shown |
|---|---|---|
| ADJUDICATION | Conflicts | 45 open |
| ADJUDICATION | Quarantine | 189 pending |
| ADJUDICATION | Management of Change | 0 pending |
| OVERSIGHT | SLA report | 0 overdue |
| SAFEGUARDS | Circuit Breaker | Monitor |
| SAFEGUARDS | Model Gate | Validation |

Verified with the leaf-control query in `D-STATE.md`. (An earlier pass read `innerText` of the
wrapping `<a>`, got six *different* strings because the card body came along, and wrongly concluded
the item was fixed. Use the leaf query.)

## Item 25 — six identical CTAs

Six controls doing six different things all say the same six words. The label carries no information;
the user has to read the card body to know what the button does.

**Fix:** give each card a CTA naming its own action. The verb should match what the destination
actually does — review evidence, make a decision, inspect a safeguard. Take the wording from the
card's own description, which already distinguishes them:

- Conflicts — *"Resolve administrative contradictions or route engineering-track decisions through
  Management of Change."*
- Quarantine — *"Review unverified field inputs before they can enter the canonical knowledge graph."*
- Management of Change — *"Review engineering-track changes, blast radius, and the human sign-off
  that closes old facts."*
- SLA report — *"Track overdue governance decisions, countdowns, and escalation state."*
- Circuit Breaker — *"Inspect anomaly gates that halt ingestion until an administrator reviews the
  affected asset class."*
- Model Gate — *"Review validation precision and recall before a model moves into production."*

Keep them short and factual. This is a safety-critical compliance product: no marketing verbs, no
encouragement, no exclamation. "Review 45 conflicts" is right; "Let's resolve conflicts!" is not.

A CTA that names a count must use the **live** count already on the card — never a hardcoded number.
When the count is 0 the label must still make sense.

## Item 27 — ALREADY SATISFIED. Verify, do not rebuild.

**Measured in the source, `governance/page.tsx:140-153`.** Each card is already a single `<Link>`
wrapping the whole tile:

```tsx
<Link key={surface.key} href={surface.href} data-testid={`governance-surface-${surface.key}`}
  className="group flex min-h-44 flex-col rounded-xl border border-line bg-surface p-5 shadow-sm
             transition duration-150 hover:-translate-y-0.5 hover:border-… hover:shadow-md">
  …
  <span className="mt-auto pt-4 text-caption font-semibold text-accent">Open control <span …>→</span></span>
</Link>
```

- Whole card is the target ✓
- One tab stop per card ✓ — the CTA is a `<span>`, not a nested `<a>`
- Hover state on the whole card ✓

**Do not restructure this.** Confirm only that your item-25 change does not break it: still one
`<Link>` per card, still one tab stop, focus ring still visible. If nothing needs changing, **say so
in your report.**

An earlier version of this brief told you to make the cards clickable. That was written before the
source was read, and it was wrong. Fixing working code is a defect.

## Accept when

```js
// The CTA is the LAST line of each card. Compare those — NOT the innerText of the
// wrapping <a>, which differs per card even when all six CTAs are identical. That
// exact mistake is why an earlier pass reported this page already fixed.
const ctas = [...document.querySelectorAll('[data-testid^="governance-surface-"]')]
  .map(c => c.innerText.trim().split('\n').filter(Boolean).pop());
console.log(ctas);                       // read them
new Set(ctas).size === ctas.length;      // must be true — six distinct CTAs
```

…and tabbing through the grid stops **six** times, once per card, with a visible ring each time.

## One colour note

The CTA currently renders `text-accent` — the brand orange, which sits close to the alarm red and is
the whole reason Phases A–C existed. On a call-to-action rather than a data identifier this is
defensible, so **it is not part of your task**. If your rewording keeps `text-accent`, that is fine.
Do not move it to `--danger` under any circumstances.

---

## Constraints

- No new npm dependencies. `@testing-library/user-event` is **not** installed — use `fireEvent`.
- Live data only — counts come from the existing fetch. No fixtures.
- Keep every existing `data-testid`, and every destination route unchanged.
- Colour carries meaning here: `--accent` is the brand orange and sits close to the alarm red. **Do
  not** put accent or danger colour on a CTA that is not an alarm. Read `frontend/DESIGN.md` §2 before
  choosing any colour.
- Both palettes, and `[data-contrast="high"]`.

## Report

Say what you ran and what you could not. **Do not commit.**
