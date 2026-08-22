# D4a — graph overlay collision

**Owns exclusively:** `frontend/src/components/knowledge-graph.tsx` ·
`frontend/src/components/knowledge-graph.test.tsx`

**Read-only:** everything else.

**Correction to an earlier version of this brief:** the two consumers are `/graph` (via
`components/lazy.tsx`) and **`/assets/[id]`** — not `/documents/[id]/topology`, which has its own
ReactFlow canvas and never renders this component.

Review item: **19 only.**


> **Before trusting any browser measurement, read the "READ FIRST" section at the top of
> `D-STATE.md`.** The frontend runs in a container that does not hot-reload across the WSL2 bind
> mount, so the page you are looking at may not contain your change. `tsc` and `npm test` are
> unaffected; only browser measurements are at risk.

---

## Scope — read this before starting

The senior review raises three graph items. **Only 19 is in scope.**

Items **16 and 17** (node labels wrap, hover behaviour) are **parked**. Measured on `/graph`:

```
nodeCount: 1
labels: [{ text: "ASSET\n\nEQ-101", w: 180, h: 101, overflow: "visible", scrollW: 90, clientW: 90 }]
```

One node, not overflowing. Label wrapping cannot be reproduced, so it cannot be verified, so it
cannot be fixed responsibly. **If you find yourself editing node label rendering, stop — you are out
of scope.** Report it and leave it.

## Item 19 — the coverage pill sits on top of the zoom controls

Measured at 1440×1000 on `/graph`:

| Element | Box |
|---|---|
| `.react-flow__controls` | x 364–392, y 917–997 |
| `div.absolute.bottom-12.left-3.z-10` — the `No sensor coverage` pill | overlaps it |

Source: `components/knowledge-graph.tsx:284` (the pill) and `:397` (`<Controls showInteractive={false} />`).

They occupy the same corner. The pill's `z-10` means it wins, so the zoom buttons are partly
unreachable.

**Fix:** separate them so neither covers the other at any viewport. Move one, not both — whichever
produces less disturbance to the existing layout.

Constraints on the fix:
- It must hold at **360, 768, 1024, 1440**. The canvas is fluid; a fix tuned to 1440 is not a fix.
- It must hold on **both** consumers — `/graph` and `/documents/[id]/topology`. They give the canvas
  different heights.
- The pill text is variable-length (`No sensor coverage` is one of several strings around
  `knowledge-graph.tsx:281`). A longer string must not re-create the collision.
- Do not delete the pill and do not hide the controls.

**Accept when**, on both routes and at all four widths:

```js
const a = document.querySelector('.react-flow__controls').getBoundingClientRect();
const b = document.querySelector('.absolute.bottom-12')?.getBoundingClientRect()
       ?? /* wherever you moved it */ null;
// must be true: they do not intersect
!b || a.right < b.left || a.left > b.right || a.bottom < b.top || a.top > b.bottom;
```

…and every zoom button is clickable — verify by actually clicking each one, not by checking that it
exists.

---

## Constraints

- No new npm dependencies. `@xyflow/react` is already present.
- `knowledge-graph.test.tsx` mocks `Controls: () => null`. Your test must still pass under that mock —
  do not write a test that depends on the real `Controls` rendering.
- Both palettes, and `[data-contrast="high"]`.
- Keep every existing `data-testid`.

## Report

Name both routes and all four widths you actually checked. If you could not load one, say so — do not
imply coverage you did not observe. **Do not commit.**
