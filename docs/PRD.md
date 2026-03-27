# Wassily — OKLCH Color Ramp Generator

## What It Is

A precision color instrument disguised as a blank screen. You click, a ramp appears. You interact with the ramp directly. Every pixel of UI exists only in service of the output. No chrome, no panels, no labels until you need them.

It's opinionated — it knows what makes a ramp beautiful and does that by default. You override when you want to, not because you have to.

Named for Wassily Kandinsky.

---

## Core Interaction Model

**The screen is empty. Dark. You click.**

A seed color appears where you clicked. A full ramp unfolds from it — 11 stops, 50 through 950, stretching horizontally. The ramp is the interface. Each swatch is alive.

### Swatch Interactions

- **Click** → copies oklch value to clipboard (toast: just the value)
- **Shift+Click** → copies hex (for Figma)
- **Cmd+Click** → copies CSS custom property (`--blue-500: oklch(...)`)
- **Drag vertical** → adjust that stop's lightness, neighbors interpolate to stay smooth
- **Drag horizontal** → nudge chroma
- **Scroll on swatch** → rotate hue (subtle, for hue-shift effects)

### Ramp-Level Interactions

- **Click empty space** → new ramp appears (multiple ramps stack vertically)
- **Double-click a ramp** → select it, subtle outline appears
- **Delete/Backspace** → remove selected ramp
- **Drag ramp vertically** → reorder

### Copy All

- **Cmd+Shift+C** → copies entire ramp as CSS custom properties
- **Right-click a ramp** → context menu with export formats

---

## The Opinions (What Makes Ramps Beautiful)

The generator encodes taste, not just math:

### 1. Chroma Contouring

Chroma follows a bell curve peaking around stops 400-500. Extremes (50, 900+) desaturate naturally. Vivid in the workhorse range, gentle at the edges.

### 2. Warm Shadow Drift

Dark stops (700-950) shift hue slightly warm (+3-8deg toward orange/red). Creates depth and richness instead of dead, flat darks. Subtle — you feel it more than see it.

### 3. Cool Highlight Lift

Light stops (50-200) shift hue slightly cool (-2-5deg). Creates crispness and air in the highlights.

### 4. Gamut-Aware Chroma Maximization

At each stop, chroma is pushed as high as possible while remaining in sRGB gamut. The tool knows that yellow at L=0.9 can handle massive chroma while blue cannot, and shapes each ramp accordingly. No clipping. Ever.

### 5. Non-Linear Lightness Distribution

More stops compressed in the usable middle range (300-700). The extremes (50, 900, 950) have wider lightness gaps — you rarely need fine gradations at the edges.

### 6. Perceptual Evenness

Adjacent stops maintain roughly equal deltaE (perceptual distance). No muddy middles, no jarring jumps.

---

## Auto Dark Mode

Every ramp has light and dark mode variants, generated simultaneously.

### How It Works

- Dark mode backgrounds use stops 900-950 (deep, rich)
- Dark mode foreground text uses stops 50-200
- Accent colors (400-600) shift slightly: higher lightness, slightly reduced chroma to avoid vibrating on dark backgrounds
- Neutral/gray ramps invert with a warm tint in dark mode

### In the UI

- Press **D** to toggle the canvas between light and dark
- Background shifts, every ramp re-renders its dark mode variant
- Swatches now copy the dark-mode-appropriate values
- Both variants export together (light + dark CSS with `prefers-color-scheme`, or separate token sets)

---

## WCAG AA — Built In, Not Bolted On

No compliance dashboard. No audit panel.

### Swatch Dots

Each swatch shows a tiny dot in its corner:
- **White dot** → passes AA contrast (4.5:1) as text on white
- **Black dot** → passes AA as text on black
- **Both dots** → works on either
- **No dot** → fails both (transitional middle stops — expected)

When dark mode is active, dots recalculate against the dark background (950 stop).

### Hover Enhancement

Hover a swatch → subtle tooltip shows exact contrast ratio against white and black.

### Pairing Hint

Hover one swatch, then hover another → a thin line connects them showing mutual contrast ratio. Solid line = passes AA. Dashed = fails.

---

## Multi-Ramp Harmony

### Auto-Alignment

All ramps' 500-stops calibrated to the same perceptual lightness. Blue-500, red-500, green-500 all feel like the same "weight." Automatic.

### Neutral Companion

When you create a chromatic ramp, a matched neutral (gray with a hint of that hue) appears as a ghost ramp below it. Click the ghost to materialize it.

---

## Export

Right-click a ramp or **Cmd+E**:

| Format | Output |
|--------|--------|
| CSS Custom Properties | `--{name}-{stop}: oklch(...)` with hex comment |
| CSS with Dark Mode | Light + dark in `prefers-color-scheme` blocks |
| Tailwind v4 `@theme` | Ready to paste into theme.css |
| Hex List | One hex per line (Figma-friendly) |
| JSON Tokens | W3C DTCG format |

Ramp name auto-generated from hue (e.g., "blue", "amber", "rose") but editable — click the subtle label at the left edge of the ramp.

---

## Shareable State

Entire canvas state encodes into the URL hash. Bookmark a palette. Send a link. No backend, no accounts.

---

## Technical Stack

- **Vite + React + TypeScript**
- **culori** — OKLCH conversions, gamut mapping (CSS Color L4 algorithm), deltaE
- **CSS/DOM** for swatches, Canvas for any visualizer overlays
- **URL hash** encoding for state persistence (base64 compressed JSON)
- **Static deployment** — Vercel/Netlify/GitHub Pages
- **Zero backend**

---

## Out of Scope

- Color space education / visualizers
- User accounts or saved palettes (URL hash is persistence)
- Mobile (desktop precision tool)
- Public-facing accessibility of the tool itself

---

## Future Considerations

- **Reference import** — paste hex values, reverse-engineer OKLCH curves, tweak from there
- **Ramp presets** — keyboard shortcuts for common palette families
- **Colorblind preview** — press V to cycle through simulation modes
