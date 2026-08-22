# D6 — landing page: responsive `md:` and entrance motion

**Owns exclusively:** `frontend/src/app/page.tsx` · `frontend/src/app/page.test.tsx`

**Read-only:** everything else. Especially `app/globals.css` — the landing palette lives there as a
separate light-only `--lp-*` token set. **Use those tokens; do not add, rename or edit any.**


> **Before trusting any browser measurement, read the "READ FIRST" section at the top of
> `D-STATE.md`.** The frontend runs in a container that does not hot-reload across the WSL2 bind
> mount, so the page you are looking at may not contain your change. `tsc` and `npm test` are
> unaffected; only browser measurements are at risk.

---

## Measured

`app/page.tsx` — **59 `sm:` · 0 `md:` · 12 `lg:`**.

The page jumps straight from small-screen layout to large. Every tablet-width viewport
(768–1023px) renders the `sm:` layout stretched, which is where it looks most like a wireframe.

## Part 1 — the `md:` band

**Fix:** add `md:` treatment so 768–1023 gets a layout of its own rather than a stretched small one.

This is not a mechanical `sm:` → `md:` copy. At each breakpoint ask what the *content* needs:
column counts, type sizes, spacing rhythm, and whether an element that stacks at `sm` should sit
inline at `md`.

**Measure at 768, 900 and 1023** — not just 768. The middle of a band is where a bad fix shows.

**Hard requirement:** zero horizontal page overflow at **360, 768, 1024, 1440**.
`node scripts/check-overflow.mjs` covers `/` and must stay green.

## Part 2 — entrance motion

The page is static. "Dynamic" here means **responsive plus motion** — it does **not** mean live data.

**The benchmark figures stay exactly as they are.** They are hardcoded on purpose for the demo, and
`app/landing-figures.test.ts` carries an intentional `it.fails()` drift marker. **Do not change a
figure, do not wire one to an API, do not touch that test.**

**Fix:** add entrance motion — content arriving as the reader reaches it, not everything at once on
load.

Use what exists. `@/lib/motion` already provides `useScrollReveal` and `useReducedMotion`, and
`app/(app)/management/page.tsx` shows the established pattern:

```tsx
const { ref, revealed } = useScrollReveal<HTMLDivElement>();
const revealCls = (revealed: boolean) =>
  `min-w-0 transition-all duration-500 ${revealed ? "translate-y-0 opacity-100" : "translate-y-3 opacity-0"}`;
```

Follow it. Do not hand-roll an `IntersectionObserver` and **do not add an animation library.**

Rules:
- **Every animation respects `prefers-reduced-motion`.** Not "most". Verify with Playwright's
  `reducedMotion: 'reduce'`.
- Motion is entrance only — a thing appears once and stays. No looping, no bouncing, no parallax, no
  attention-seeking.
- **Content must be readable with JavaScript disabled or the observer never firing.** A reveal that
  starts at `opacity-0` and depends on JS to reach `opacity-100` renders a blank page when it fails.
  This has bitten this project before: a full-page screenshot came back two-thirds empty because
  `IntersectionObserver` never fired.
- Keep the register serious. KAIROS is a safety-critical compliance product; this is a
  first-impression page, not a consumer landing. Restraint reads as confidence.
- Stagger, if you use it, stays small — the reader should not wait on the page.

**Accept when:** at 360/768/1024/1440 the page has no horizontal overflow and no stretched-`sm`
tablet layout; every revealed element is visible and readable under `reducedMotion: 'reduce'`; and a
full-page screenshot at each width shows **all** content, none of it stuck at `opacity-0`.

---

## Constraints

- No new npm dependencies. No animation library.
- The landing palette is the light-only `--lp-*` set. Do not introduce app-palette tokens here and do
  not add a dark variant — this page is deliberately light-only.
- Keep every existing `data-testid`, heading, and link destination.
- `app/page.test.tsx` must keep passing. `app/landing-figures.test.ts` is **not yours**.

## Report

Give the widths you actually loaded and confirm you tested with reduced motion on **and** off. If you
could not run Playwright in your sandbox, say so plainly — do not report a screenshot pass you did not
observe. **Do not commit.**
