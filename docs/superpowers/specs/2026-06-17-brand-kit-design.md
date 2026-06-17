# Brand Kit Design — Business Banking Portal

**Date:** 2026-06-17  
**Status:** SPEC ONLY — implementation deferred to next session  
**Direction:** C (Approachable Advisor) base + B (Modern Analytics) touches

---

## 1. Design Direction

### Voice-to-visual translation

The app's voice is a **trusted advisor who speaks plainly about complex things**. It handles
high-stakes SME credit decisions, so it must feel authoritative — but it serves relationship
bankers, not quants, so it must feel approachable. The two tensions are:

- **Expertise without coldness** → dark teal (depth, seriousness) tempered by cream (warmth,
  space), with amber as the decisive action signal
- **Data-rich without clinical** → Plus Jakarta Sans humanizes headings; Inter keeps body text
  readable at density; Space Grotesk (B-touch) gives large KPI numbers a crisp technical presence
  without making the whole UI feel like a Bloomberg terminal

### What C gives us, what B adds

| Layer | C baseline | B touch |
|-------|-----------|---------|
| Feel | Warm, human, advisory | Modern, precise, interactive |
| Surface | Cream bg, soft card shadows | Retain — no change |
| Headings | Plus Jakarta Sans, rounded feel | Retain |
| Numbers | Inter (body fallback) | **Space Grotesk** for large metrics |
| Radius | `rounded-xl` on cards (16px) | `rounded-md` (6px) on tables/charts |
| Interactive | Teal accent | **Indigo accent** for clicks/hover/focus |
| Motion | Minimal | Subtle — 150ms ease for interactive elements |

---

## 2. Color System

### Brand palette (CSS variable names)

```
--color-brand-primary:       #1C3B38   /* dark forest teal — sidebar, primary surface */
--color-brand-primary-light: #2B5752   /* slightly lighter teal — hover on sidebar items */
--color-brand-accent:        #0E7C66   /* medium teal — active nav state, links, badges */
--color-brand-warm:          #E0913B   /* amber — CTA buttons, highlight, key actions */
--color-brand-warm-light:    #F2C07A   /* pale amber — hover state on warm buttons */
--color-brand-bg:            #F5F0E6   /* cream — page background */
--color-brand-surface:       #FFFFFF   /* white — cards, panels */
--color-brand-muted:         #6B7280   /* slate — secondary text, metadata */
--color-brand-border:        #E5E0D6   /* warm gray — card borders, dividers */
```

### B-touch interactive accent (separates clickable from informational)

```
--color-interactive:         #4F46E5   /* indigo-600 — focus rings, selected tabs, links */
--color-interactive-light:   #EEF2FF   /* indigo-50 — hover bg on interactive rows */
--color-interactive-hover:   #4338CA   /* indigo-700 — pressed state */
```

### Semantic roles

```
--color-success:             #059669   /* emerald-600 — Approve, Clear, Eligible */
--color-success-bg:          #D1FAE5   /* emerald-100 — success badge background */
--color-warning:             #D97706   /* amber-600 — Refer, Moderate risk */
--color-warning-bg:          #FEF3C7   /* amber-100 — warning badge background */
--color-danger:              #DC2626   /* red-600 — Decline, High risk, alert */
--color-danger-bg:           #FEE2E2   /* red-100 — danger badge background */
--color-info:                #2563EB   /* blue-600 — informational callouts */
--color-info-bg:             #DBEAFE   /* blue-100 — info badge background */
```

### Data-viz palette (for Recharts charts — 6 sequential colors)

Used in the EWS trajectory line, Pricing waterfall breakdown, and any future multi-series charts.
Ordered from most-prominent (series 1) to least-prominent.

```
--color-chart-1:             #0E7C66   /* brand-accent teal */
--color-chart-2:             #4F46E5   /* interactive indigo */
--color-chart-3:             #E0913B   /* brand warm amber */
--color-chart-4:             #059669   /* success green */
--color-chart-5:             #7C3AED   /* violet */
--color-chart-6:             #DC2626   /* danger red */
```

A single-series line (e.g., Risk Score Trajectory) uses `--color-chart-1`.

---

## 3. Typography

### Font stack

| Role | Family | Weights | Usage |
|------|--------|---------|-------|
| Display / Heading | Plus Jakarta Sans | 600, 700 | H1–H3, module titles, card headers |
| Body / UI | Inter | 400, 500, 600 | Body text, labels, table cells, buttons |
| Data / Metric | Space Grotesk | 500, 700 | Large KPI numbers (StatCard values), score bands |

**Google Fonts import (add to `index.html`):**
```html
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600&family=Plus+Jakarta+Sans:wght@600;700&family=Space+Grotesk:wght@500;700&display=swap" rel="stylesheet">
```

### Type scale

```
--text-display:    2.25rem / 700 / 1.2  — page heroes, deck slides only
--text-heading-1:  1.5rem  / 700 / 1.3  — module view titles ("Adjudication")
--text-heading-2:  1.125rem / 600 / 1.4  — card headers, section labels
--text-heading-3:  0.875rem / 600 / 1.4  — sub-labels, table group headers
--text-body:       0.875rem / 400 / 1.6  — body copy, descriptions
--text-body-sm:    0.75rem  / 400 / 1.5  — metadata, timestamps, hints
--text-label:      0.75rem  / 500 / 1.0  — form labels, pill text (uppercase + tracking)
--text-mono:       0.8125rem / 400 / 1.5  — code, IDs (fallback: ui-monospace)
--text-metric:     2rem    / 700 / 1.0  — StatCard numbers (Space Grotesk)
--text-metric-sm:  1.25rem / 700 / 1.0  — smaller metrics (e.g. score band label)
```

---

## 4. Spacing & Radius

### Spacing

Uses standard Tailwind 4px base. No custom spacing tokens needed — the existing Tailwind scale
(p-2, p-4, p-6, gap-4, etc.) is correct. Density rule: **cards use `p-6`; table cells use
`py-3 px-4`; compact badges use `px-2 py-0.5`.**

### Border radius

Two radii, intentionally different by surface type:

```
--radius-card:    1rem   (16px)   — cards, modal panels, sidebar nav items — warm/friendly
--radius-input:   0.5rem (8px)    — inputs, dropdowns, select boxes
--radius-badge:   9999px          — status badges (pill shape)
--radius-data:    0.375rem (6px)  — tables, chart containers — crisper (B-touch)
--radius-button:  0.5rem (8px)    — primary/secondary action buttons
```

In Tailwind class terms: `rounded-2xl` for cards, `rounded-md` for data surfaces, `rounded-full`
for badges.

---

## 5. Shadow & Elevation

Cards have a single subtle shadow (warm-tinted rather than the default cool gray):

```
--shadow-card:    0 1px 3px rgba(28,59,56,0.08), 0 1px 2px rgba(28,59,56,0.06)
--shadow-popover: 0 4px 16px rgba(28,59,56,0.12), 0 2px 6px rgba(28,59,56,0.08)
```

Sidebar has no shadow — it's a solid dark-teal surface. Chart containers use `--shadow-card`.

---

## 6. Motion & Transitions

Minimal, purposeful. Follows the "modern interactive analytics" B-touch without being showy.

```
--transition-interactive: 150ms ease-out   — hover states, focus rings, button presses
--transition-expand:      200ms ease-out   — accordion open, dropdown expand
--transition-page:        none             — view switches are instantaneous (SPA)
```

Apply as: `transition-colors duration-150 ease-out` or `transition-all duration-200 ease-out`.
No transform animations, no bounce, no spring. Data should feel solid, not playful.

---

## 7. Tailwind `theme.extend` Structure

Full mapping of the tokens above into `portal/client/tailwind.config.js`. CSS variables are set
in `index.css`; Tailwind references them so all utility classes work.

### `tailwind.config.js` additions

```js
theme: {
  extend: {
    fontFamily: {
      display: ['"Plus Jakarta Sans"', 'sans-serif'],
      body:    ['Inter', 'sans-serif'],
      data:    ['"Space Grotesk"', 'sans-serif'],
      mono:    ['ui-monospace', 'SFMono-Regular', 'monospace'],
    },
    colors: {
      brand: {
        primary:       'var(--color-brand-primary)',
        'primary-lt':  'var(--color-brand-primary-light)',
        accent:        'var(--color-brand-accent)',
        warm:          'var(--color-brand-warm)',
        'warm-lt':     'var(--color-brand-warm-light)',
        bg:            'var(--color-brand-bg)',
        surface:       'var(--color-brand-surface)',
        muted:         'var(--color-brand-muted)',
        border:        'var(--color-brand-border)',
      },
      interactive: {
        DEFAULT: 'var(--color-interactive)',
        light:   'var(--color-interactive-light)',
        hover:   'var(--color-interactive-hover)',
      },
      chart: {
        1: 'var(--color-chart-1)',
        2: 'var(--color-chart-2)',
        3: 'var(--color-chart-3)',
        4: 'var(--color-chart-4)',
        5: 'var(--color-chart-5)',
        6: 'var(--color-chart-6)',
      },
      // Semantic — override Tailwind's emerald/amber/red to use our vars:
      success:  'var(--color-success)',
      warning:  'var(--color-warning)',
      danger:   'var(--color-danger)',
      info:     'var(--color-info)',
    },
    borderRadius: {
      card:   '1rem',
      data:   '0.375rem',
      input:  '0.5rem',
      button: '0.5rem',
    },
    boxShadow: {
      card:    '0 1px 3px rgba(28,59,56,0.08), 0 1px 2px rgba(28,59,56,0.06)',
      popover: '0 4px 16px rgba(28,59,56,0.12), 0 2px 6px rgba(28,59,56,0.08)',
    },
    fontSize: {
      'metric':    ['2rem',     { lineHeight: '1', fontWeight: '700' }],
      'metric-sm': ['1.25rem',  { lineHeight: '1', fontWeight: '700' }],
    },
  },
},
```

### `index.css` CSS variable block (insert above the `@tailwind` directives)

```css
:root {
  /* Brand palette */
  --color-brand-primary:       #1C3B38;
  --color-brand-primary-light: #2B5752;
  --color-brand-accent:        #0E7C66;
  --color-brand-warm:          #E0913B;
  --color-brand-warm-light:    #F2C07A;
  --color-brand-bg:            #F5F0E6;
  --color-brand-surface:       #FFFFFF;
  --color-brand-muted:         #6B7280;
  --color-brand-border:        #E5E0D6;

  /* Interactive (indigo) */
  --color-interactive:         #4F46E5;
  --color-interactive-light:   #EEF2FF;
  --color-interactive-hover:   #4338CA;

  /* Semantic */
  --color-success:   #059669;
  --color-success-bg:#D1FAE5;
  --color-warning:   #D97706;
  --color-warning-bg:#FEF3C7;
  --color-danger:    #DC2626;
  --color-danger-bg: #FEE2E2;
  --color-info:      #2563EB;
  --color-info-bg:   #DBEAFE;

  /* Data-viz */
  --color-chart-1: #0E7C66;
  --color-chart-2: #4F46E5;
  --color-chart-3: #E0913B;
  --color-chart-4: #059669;
  --color-chart-5: #7C3AED;
  --color-chart-6: #DC2626;
}
```

---

## 8. Component-Level Notes

These describe the *intent* for the key components. Implementation translates these into Tailwind
class changes on the existing JSX — no new component files needed.

### Sidebar (`Sidebar.jsx`)

- Background: `bg-brand-primary` (dark teal `#1C3B38`)
- Logo / app name text: white, `font-display font-bold`
- Nav item default: `text-white/70 hover:bg-brand-primary-lt hover:text-white`, `rounded-card`
  padding `px-3 py-2`
- Nav item active: `bg-brand-accent text-white font-medium` (teal active state)
- Group headers ("ANALYSIS MODULES"): `text-white/40 text-label uppercase tracking-wider`
- No shadow on sidebar — it's the primary surface

### StatCard (`Dashboard.jsx` tiles)

- Card: `bg-brand-surface rounded-card shadow-card p-6`
- Label: `text-body-sm text-brand-muted font-label uppercase tracking-wide`
- Value: `font-data text-metric text-brand-primary` (Space Grotesk, dark teal)
- Sub-text: `text-body-sm text-brand-muted`
- Accent bar (optional): a 3px left border in the relevant semantic color (e.g., success for
  Clears Hurdle, danger for High Risk)

### DecisionBadge (`components/DecisionBadge.jsx`)

Current: Tailwind `bg-emerald-100 text-emerald-800` etc.
Replace with semantic vars:

| Decision | bg | text |
|----------|----|------|
| Approve | `bg-[var(--color-success-bg)]` | `text-[var(--color-success)]` |
| Refer   | `bg-[var(--color-warning-bg)]` | `text-[var(--color-warning)]` |
| Decline | `bg-[var(--color-danger-bg)]`  | `text-[var(--color-danger)]`  |

Shape: `rounded-full px-2 py-0.5 text-label font-medium uppercase tracking-wide`

### RiskTierBadge (`components/RiskTierBadge.jsx`)

Same treatment — map High/Medium/Low to danger/warning/success semantic vars.

### PassFailBadge (`components/PassFailBadge.jsx`)

Pass → success vars; Fail → danger vars. Same pill shape.

### Tables (Watchlist, Candidates)

- Container: `rounded-data overflow-hidden border border-brand-border`
- Header row: `bg-brand-bg text-brand-muted text-body-sm font-medium`
- Body row default: `bg-brand-surface`
- Body row hover: `bg-interactive-light transition-colors duration-150`
- Cell padding: `py-3 px-4`
- Selected / active row: left border `border-l-2 border-interactive`

### Charts (Recharts — Risk Trajectory, Pricing Waterfall)

- Chart container card: `rounded-data shadow-card` (not `rounded-card`)
- Line / bar colors: use `--color-chart-*` vars via `stroke=` and `fill=` props
- Grid lines: `stroke={brand-border}` — warm gray, not cool gray
- Tooltip: white background with `shadow-popover`, `rounded-data`
- Axis labels: `font-body text-body-sm fill-brand-muted`

### EntitySelect / Lookup inputs

- `<select>` and `<input>`: `border border-brand-border rounded-input bg-brand-surface
  focus:border-interactive focus:ring-1 focus:ring-interactive transition-colors duration-150`
- "Look up" button: `bg-brand-warm hover:bg-brand-warm-lt text-white font-medium rounded-button
  px-4 py-2 transition-colors duration-150`

### Primary action buttons (generic)

- Primary (CTA): `bg-brand-warm hover:bg-brand-warm-lt text-white rounded-button`
- Secondary: `bg-brand-surface border border-brand-border hover:bg-brand-bg text-brand-primary rounded-button`
- Destructive: `bg-danger hover:opacity-90 text-white rounded-button`

---

## 9. Migration Strategy (for implementation session)

The existing code has all colors hardcoded as Tailwind utility strings (`bg-emerald-100`,
`text-slate-700`, `bg-amber-500`, etc.) scattered across ~15 component files. The clean
migration path:

1. **Add font imports** to `index.html` (one `<link>` tag).
2. **Update `index.css`** — insert the `:root {}` CSS variable block above `@tailwind base`.
3. **Update `tailwind.config.js`** — replace the empty `extend: {}` with the full block in §7.
4. **Update `Sidebar.jsx`** — the largest visual change; converts all sidebar color classes.
5. **Update shared badge components** — `DecisionBadge`, `RiskTierBadge`, `PassFailBadge` —
   three small files, high visual impact.
6. **Update `StatCard` / Dashboard** — switches the metric number font to Space Grotesk.
7. **Update table rows** across Watchlist, Candidates, Segments views.
8. **Update chart props** (Recharts `stroke`/`fill` attributes) in EWS and Pricing views.
9. **Full Playwright gate** after each step (or at end as a batch) — testids are stable.

The `constants.js` DECISION_COLORS / RISK_TIER_COLORS objects use Tailwind class strings
directly (`'bg-emerald-100 text-emerald-800'`). During implementation, replace those string
values with the brand-var equivalents or switch to inline style objects using the CSS vars.

---

## 10. What This Does Not Cover

- Dark mode — not in scope; the portal is an internal tool used in office lighting.
- Mobile layout — not in scope; this is a desktop analytics portal.
- Icon set changes — lucide-react icons remain; no new icon library.
- New component creation — spec applies to existing components only.
- Animation beyond 150–200ms transitions — no skeleton loaders, no page transitions.
