# KAIROS Frontend — Design System

The frontend for KAIROS, an industrial operational-intelligence platform. This document is the
in-repo source of truth for the visual system, component conventions, and data wiring. Design
decisions trace back to `docs/PROBLEM_STATEMENT.md` and `docs/ARCHITECTURE.md` (Layer 12).

Stack: **Next.js 16 · React 19 · Tailwind v4** (CSS-first `@theme`, no `tailwind.config`).

---

## 1. Theme — "Paper"

Warm, editorial, low-fatigue (Claude-calm). Grounded via refero in Claude / Perplexity / Anthropic
(light) and Axiom / Inngest (dark).

### The hard rule: ONE UI, TWO PALETTES
Light and dark are the **same interface recolored** — identical layout, cards, borders, radius,
type, density, spacing, iconography. Toggling changes **only colors, never structure**. A screen
must look like the same screen in both modes. **Light is the default.**

Do not build a "dark version" of a component. Build one component that reads its colors from tokens.

### Brand
Logo = black wordmark + check/A mark on **Kairos Orange `#E8501F`** (brand artwork only). In the
UI the accent token ships as the **accessible variant `#B83D16`** (light) so white-on-accent and
accent-on-surface pass WCAG AA; dark mode uses `#F15A2B`. Orange is the single accent
(actions, focus, identity) in both modes. Black → ink text. The accent doubles as
caution/attention — which is KAIROS's proactive-alert thesis.

**Status colors are separate from the accent** so they never clash with brand orange
(all values are the AA-compliant shipped tokens; light mode):

| Token | Hex | Meaning |
|---|---|---|
| `danger` | `#B42318` | conflict, disputed, refusal, critical |
| `caution` | `#9A5B00` | unverified/quarantine, pending, high priority |
| `verified` | `#216D3B` | verified, resolved, healthy |
| `info` | `#1D4ED8` | informational, quarantined-but-searchable |

Status encodes authority level · verification status · conflict severity. Always pair color with a
non-color cue (dot, label, stripe) — never color alone.

### Palette tokens

Defined in `src/app/globals.css` on `:root` (light) and `:root[data-theme="dark"]` (dark), mapped
to Tailwind utilities via `@theme inline` → `bg-canvas`, `bg-surface`, `text-ink`, `text-muted`,
`border-line`, `bg-accent`, `text-accent`, `bg-accent-soft`, `text-on-accent`, plus the status colors.

| Token | Light | Dark |
|---|---|---|
| `canvas` (page) | `#F5F2EC` cream | `#14110E` warm-black |
| `surface` (card) | `#FDFCFA` | `#1E1A16` |
| `surface-2` (inset) | `#FFFFFF` | `#241F1A` |
| `line` (border) | `#E6E1D6` | `#332C24` |
| `ink` (text) | `#1C1A17` | `#EDE9E2` |
| `muted` (2nd text) | `#6E6A62` | `#9A9186` |
| `accent` | `#B83D16` (AA text/action variant of brand `#E8501F`) | `#F15A2B` (brighter for dark legibility) |
| `accent-soft` | `#FBE8DF` | `#3A241A` |

Depth comes from **tone**, not heavy shadows. Radius: `8px` default, `12px` cards.

---

## 2. Typography

Loaded via `next/font` in `src/app/layout.tsx`; exposed as CSS vars, mapped in `@theme`.

| Role | Family | Usage |
|---|---|---|
| Display | **Newsreader** (serif) | `h1–h3`, brief headlines. Warm/editorial, used with restraint. `.font-display` |
| Body | **Geist** (sans) | all body/UI text. Calm, legible. |
| Data | **Geist Mono** | tags (`P-101`), pressures, confidence, timestamps. `.tabular` (also sets `tabular-nums`) |

Keep body ~65ch, headings `text-wrap: balance`, uppercase labels get letter-spacing.

### Type scale (the only sanctioned sizes)

Defined in `globals.css` `@theme` — use the named utilities, never arbitrary `text-[Npx]`
(canvas node labels at `text-[9px]` are the one deliberate density exception):

| Utility | Size | Role |
|---|---|---|
| `text-display` | 28px | page h1 (workspaces) |
| `text-title` | 20px | detail-page h1, section headlines |
| `text-subtitle` | 15px | card titles, emphasis rows |
| `text-sm` | 14px | prominent body |
| `text-body` | 13px | default body/UI text |
| `text-xs` / `text-caption` | 12px | secondary rows, table cells |
| `text-label` | 11px | eyebrows, badges, metadata labels |
| `text-micro` | 10px | tertiary metadata, axis ticks |

Eyebrows are always `text-label font-bold uppercase tracking-[0.1em]` — one tracking value app-wide.
Page headers use the shared `PageHeader` primitive (`ui.tsx`); don't hand-roll the eyebrow/h1/lede stack.

### Container widths

`max-w-md` forms/auth · `max-w-3xl` reading/detail · `max-w-4xl` tables/dashboards · `max-w-5xl` canvases (graph/topology).
All pages share `px-5 py-8 sm:px-8 sm:py-10`.

---

## 3. Component conventions

Shared primitives live in `src/components/ui.tsx`. **Reuse them — do not re-style badges/buttons ad hoc.**

- `StatusBadge` — pill with a dot; tones `danger|caution|verified|info|neutral`.
- `AuthorityBadge` — neutral mono chip, `L{n} · {name}` (1 Regulation → 5 Field).
- `SourceChip` — mono document-id chip; accent-tinted, or caution-tinted when quarantine.
- `Button` — `variant="primary"` (orange) or `"ghost"` (bordered).

Other shared pieces: `theme-toggle.tsx`, `app-shell.tsx` (sidebar + mobile drawer), `stub.tsx`
(placeholder for not-yet-built screens). Helpers in `src/lib/utils.ts`
(`cn`, `relativeTime`, `priorityMeta`, `authorityLabel`, `triggerLabel`).

Principles: encode state in **form** (stripe/dot/pill) not just color; summary before detail;
generous spacing (calm, not cluttered); visible keyboard focus; respect `prefers-reduced-motion`.

---

## 4. Refero borrow map

Every component is grounded in a real reference (design rule: consult refero per component).

| Component | Reference | What we take |
|---|---|---|
| Copilot chat + citations | Claude · Rox · Gemini | centered feed, source cites, feedback, sticky rounded composer |
| Shell / sidebar | Perplexity · Linear | slim icon+label rail, grouped nav, calm density |
| Copilot empty state | Perplexity | centered anchor + suggestion chips |
| Brief inbox | Linear inbox / Twist | list feed, priority + metadata rows, right-aligned time; (todo: filter tabs + priority grouping) |
| Dashboards (compliance, KPI) | Axiom · Resend · n8n | KPI cards, mono numerals, threshold lines |
| Data tables (governance) | Linear · Hashnode | dense rows, overflow menus, status badges |
| RCA / timeline | Sentry trace · n8n | chronological event spine, evidence-weighted hypotheses |
| Login | Claude · The Org | centered card, warm bg, dark primary button |

---

## 5. Data layer

- `src/lib/types.ts` — TS types derived from `docs/API.md`.
- `src/lib/api.ts` — fetch client. Base URL `NEXT_PUBLIC_API_URL` (default `http://localhost:8000`).
  **Dev mode:** no `Authorization` header → backend treats caller as `dev-user`/`engineer`.
  Each call tries live, falls back to fixtures, and returns `source: "live" | "demo"` so the UI can
  honestly badge demo data.
- `src/lib/fixtures.ts`, `src/lib/copilot.ts` — realistic demo data (P-101 seal, V-247 PTW, HX-301)
  matching exact API shapes, drawn from the ARCHITECTURE flows.

CORS already allows `localhost:3000`. When the backend is up (`make dev` in repo root), the app
switches to live data with no code change.

---

## 6. Screen inventory & status

Tiered build: theme all 31 screens; build a **demo tier** deep, stub the rest as navigable shells.

**Demo tier:** Briefs (inbox + detail) ✅ · Copilot ✅ · RCA ⬜ · Compliance dashboard ⬜ ·
Management KPI ⬜ · Login ⬜ · Asset detail ⬜.

**Stubs (navigable, shallow):** assets, rca, compliance, governance, documents, management, and the
long-tail engineer/quality/procurement screens (see the plan file for the full 31-screen inventory).

Routing: `src/app/(app)/` route group wraps every screen in `AppShell`. `/` → redirect `/briefs`.

---

## 7. Run

```bash
npm run dev      # dev server → http://localhost:3000
npm run build    # production build
npx tsc --noEmit # typecheck
```

Theme preset: **Paper** only for now. A second "Console" preset (cooler, denser) may be added later
as a user-selectable theme — each preset keeps its own light + dark under the same one-UI rule.
