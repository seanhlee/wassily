# Wassily

## What It Is

A color moodboard that thinks in OKLCH.

Collect colors from anywhere — paste a hex from a screenshot, drop a photograph, click and stumble into something new. Every color that enters is purified to its ideal expression. Arrange them spatially. Connect them to see relationships. When you're ready, promote a color into a full ramp and export production tokens.

The canvas is the collection. The collection is the tool.

It's opinionated — it knows what makes color beautiful and does that by default. You override when you want to, not because you have to.

Named for Wassily Kandinsky.

---

## Canvas Objects

Four things can exist on the canvas:

### 1. Swatch

A single color. The atomic unit. A small filled square. Click the canvas and one appears, random hue, purified to its ideal OKLCH expression. Paste a hex from a screenshot and a swatch appears, purified. Swatches are free-floating — place them anywhere.

### 2. Ramp

A linked strip of colors generated from a swatch. Select a swatch, press **R**, and it transforms — expanding into a continuous band of stops, light to dark, with all the opinions applied. A ramp is a promoted swatch.

### 3. Connection

A thin line between any two swatches (loose or inside ramps). Shows their contrast ratio, hue distance, or perceptual delta. Connections update live as you adjust colors. They're the tool's way of making relationships visible.

### 4. Reference Image

A dropped photograph, screenshot, or artwork. Dimmed, pinned to the canvas as a source for color extraction. Click it to sample colors. Persists in the session but not in shared URLs — the extracted colors are the artifact, not the image.

---

## Core Interaction Model

### The Spatial Canvas

The screen is empty. Dark (`oklch(0.13 0 0)`). Infinite in every direction. No instructions, no logo.

Pan with **Space+drag** or **middle-click drag**. Zoom with **scroll** on empty space, or **pinch**. Colors and ramps live as objects in this space — place them anywhere, group them as you think about them.

### Creating Colors

| Action | Result |
|--------|--------|
| **Click empty space** | New swatch at random hue, placed where you clicked |
| **Cmd+V** | New swatch from pasted color (hex, oklch, rgb, hsl — any CSS format), purified |
| **Right-click empty space** | Minimal input field — type a value, press Enter |

Every new swatch is purified automatically (see Color Purification). The color you get is the best version of the color you asked for.

### Selecting

| Action | Result |
|--------|--------|
| **Click a swatch** | Select it. Subtle highlight appears. |
| **Click a ramp** | Select the whole ramp. |
| **Click a swatch inside a ramp** | Select that individual stop. |
| **Shift+Click** | Add to selection (multi-select) |
| **Click empty space** | Deselect all |
| **Cmd+A** | Select everything on canvas |

### Copying Values

A selected swatch or stop shows its value. Copy with:

| Action | Copies |
|--------|--------|
| **C** | oklch value (e.g., `oklch(0.55 0.229 261.3)`) |
| **Shift+C** | hex value (e.g., `#0059E9`) |
| **Cmd+C** | CSS custom property (e.g., `--blue-500: oklch(0.55 0.229 261.3)`) |

Toast confirms what was copied. Brief, then gone.

### Adjusting Colors

Works on any swatch (loose or inside a ramp):

| Action | Effect |
|--------|--------|
| **Scroll on swatch** | Rotate hue. Inside a ramp: all stops shift together. |
| **Drag vertical on swatch** | Adjust lightness. Inside a ramp: neighbors interpolate. |
| **Drag horizontal on swatch** | Nudge chroma. |

### Promoting to Ramp

Select a swatch. Press **R**. The swatch transforms into a ramp — expanding from a single color into a continuous strip of stops. The original swatch becomes the anchor stop (closest to 500), and the ramp builds around it.

**Default: 11 stops** (Tailwind: 50, 100, 200, 300, 400, 500, 600, 700, 800, 900, 950).

**Hold R** → a small picker appears: **3 · 5 · 7 · 9 · 11** or type a custom number. Release to generate.

After generation, **+/-** keys add or remove stops at the extremes. A 5-stop ramp can grow to 7, then 9. A 11-stop can shrink to 7.

### Connections

Connections make relationships between colors visible.

Select two swatches (Shift+Click), press **L** (link). A thin line appears between them, labeled with:
- **Contrast ratio** (e.g., `4.7:1 ✓ AA`)
- **Hue distance** (e.g., `Δ120°`)
- **Perceptual delta** (e.g., `ΔE 42`)

Connections persist. They update live as you adjust either color. Select a connection line and press **Delete** to remove it.

**Quick peek** (non-persistent): hover one swatch, then hover another — a temporary connection line appears. Move away and it vanishes.

### Moving and Organizing

| Action | Effect |
|--------|--------|
| **Drag a swatch** | Move it freely on the canvas |
| **Drag a ramp (by its label)** | Move the whole ramp |
| **Cmd+0** | Zoom to fit everything |

### Keyboard Summary

| Key | Effect |
|-----|--------|
| **R** | Promote selected swatch to ramp (11 stops). Hold for stop picker. |
| **+/-** | Add/remove stops from selected ramp |
| **D** | Toggle light/dark mode |
| **M** (hold) | Peek at pure math mode (release to return) |
| **H** | Harmonize selected swatches/ramps |
| **L** | Link selected swatches (create connection) |
| **C** | Copy oklch value |
| **Shift+C** | Copy hex value |
| **Cmd+C** | Copy CSS custom property |
| **Cmd+Shift+C** | Copy selected ramp as full CSS block |
| **Cmd+E** | Export menu |
| **Cmd+V** | Paste color → new purified swatch |
| **Cmd+Z / Cmd+Shift+Z** | Undo / redo |
| **Cmd+L** | Generate shareable URL |
| **Cmd+0** | Zoom to fit |
| **Delete / Backspace** | Remove selected |
| **Space+drag** | Pan canvas |

### Context Menus (Right-Click)

Every keyboard action has a right-click equivalent. The menu is minimal — no icons, no subgroups, just text.

**Right-click a swatch:**
- Copy oklch
- Copy hex
- Copy CSS property
- Generate ramp → (11 stops) / 3 / 5 / 7 / 9 / 11 / Custom...
- Link to... (then click another swatch)
- Harmonize with... (then click another swatch)
- Delete

**Right-click a ramp:**
- Copy all (CSS)
- Copy all (hex list)
- Export... → CSS / CSS + Dark / Tailwind / JSON
- Add stops / Remove stops
- Rename
- Delete

**Right-click a connection:**
- Delete

**Right-click a reference image:**
- Sample color (then click)
- Re-extract palette
- Delete

**Right-click empty space:**
- New color (random)
- New color from value...
- Drop image...
- Paste (Cmd+V)
- Zoom to fit

**Cmd+Click** mirrors the most common right-click action for the target:
- Cmd+Click swatch → Copy CSS property
- Cmd+Click ramp → Copy all (CSS)

---

## Color Purification

Every color that enters Wassily is purified. This is automatic, silent, and fundamental.

Most colors in the wild are compromised — screenshot compression, sRGB clipping, bad conversions, design drift. They're detuned. Wassily finds the true note.

### The Algorithm

Given any input color:

1. **Convert to OKLCH** — extract hue (H), lightness (L), chroma (C)
2. **Hold the hue sacred** — H is the color's identity. Purification never changes it.
3. **Maximize chroma** — at the current L, find the maximum C that stays in sRGB gamut for this H. The input might be at C=0.06 when the gamut allows C=0.18. Push it.
4. **Check for chroma valleys** — some L values are unlucky for certain hues (low max chroma). If the input sits in a valley, nudge L toward the "chroma peak" — the lightness where this hue achieves its absolute maximum chroma.

### The Purification Moment

When a swatch appears from a paste (Cmd+V), a brief visual beat: the swatch renders at the original color, then shifts to the purified version. You see the murk burn off. If the color was already near-optimal, the shift is imperceptible.

For random clicks (no input color), the swatch is born purified — generated directly at peak chroma for its random hue.

---

## Image Extraction

Drop an image onto the canvas — a photograph, a screenshot, a painting, anything. Wassily extracts its palette.

### What Happens

1. **The image appears on the canvas** as a dimmed, pinned reference object. It's a real canvas object — move it, resize it, keep it around.
2. **Dominant colors are extracted automatically.** 3-7 purified swatches appear in a row beside the image, depending on the image's chromatic complexity. A moody monochrome photo yields 3. A vibrant street market yields 7.
3. **Click anywhere on the image to manually sample more.** Each click = a new purified swatch placed near the image.

### The Extraction Algorithm

- Convert pixels to OKLCH (clustering in perceptual space, not RGB)
- K-means clustering with adaptive k (3-7) based on chromatic variance
- Sort clusters by perceptual prominence (not just pixel count — a small vivid accent outranks a large neutral background)
- Purify each cluster center (maximize chroma at that hue/lightness)
- Merge near-duplicates (deltaE < 5)
- Filter out near-neutrals if chromatic alternatives exist (unless the image IS mostly neutral — then honor that)

### Smart Single-Color Detection

If the dropped image has very low variance (a swatch screenshot, a solid crop, a color sample), Wassily detects this and produces a single purified swatch instead of a row. No unnecessary clustering on what's obviously one color.

### Image as Canvas Object

The reference image persists on the canvas. You can:
- **Move it** (drag)
- **Resize it** (drag corners)
- **Keep sampling** (click to pull more colors at any time)
- **Delete it** when you're done

**State caveat:** images live in the current session (memory / localStorage) but do NOT encode into the URL hash — they're too large. When sharing a URL, extracted swatches and ramps are included (they're just colors). The reference image is not. This is the right tradeoff — the colors are the artifact, the image was the source material.

---

## Ramp Generation

### The Opinions

When a swatch is promoted to a ramp, six opinions shape every stop:

#### 1. Chroma Contouring

Chroma follows a bell curve. Peak vibrancy near the anchor, gentle rolloff at extremes.

For an 11-stop ramp:
```
Stop:    50    100   200   300   400   500   600   700   800   900   950
Factor:  0.15  0.30  0.55  0.80  0.95  1.00  0.95  0.85  0.70  0.50  0.30
```

Factor × gamut_max_chroma(L, H) at each stop. For ramps with fewer stops, the curve is sampled at the appropriate positions (always peaking at the anchor).

#### 2. Warm Shadow Drift

Dark stops shift hue toward warm (+3° to +8° toward orange/red). Creates depth. You feel it more than see it.

#### 3. Cool Highlight Lift

Light stops shift hue toward cool (-2° to -5° toward blue/cyan). Crispness in the highlights.

#### 4. Non-Linear Lightness

For 11 stops:
```
Stop:    50    100   200   300   400   500   600   700   800   900   950
L:       0.97  0.93  0.87  0.78  0.68  0.55  0.45  0.37  0.28  0.20  0.14
```

More resolution in the workhorse middle range (300-700). For other stop counts, lightness is distributed with the same principle: compressed midtones, wider extremes.

#### 5. Gamut Safety

Every color is in-gamut for sRGB. When desired chroma exceeds the boundary, chroma is reduced (never lightness). No clipping, ever.

#### 6. No Muddy Middle

The middle stops get special attention. If deltaE between adjacent stops drops below a threshold, lightness is nudged apart. The middle of a ramp never feels flat.

### Variable Stop Counts

The opinions scale to any stop count:

| Count | Stops | Use Case |
|-------|-------|----------|
| **3** | 200, 500, 800 | Quick light/base/dark |
| **5** | 100, 300, 500, 700, 900 | Compact design system |
| **7** | 100, 200, 400, 500, 600, 800, 900 | Mid-range system |
| **9** | 50, 100, 300, 400, 500, 600, 700, 900, 950 | Material-like |
| **11** | 50, 100, 200, 300, 400, 500, 600, 700, 800, 900, 950 | Tailwind |

The anchor stop is always included. Lightness distribution, chroma contouring, and hue drift interpolate smoothly regardless of count.

### Pure Mode (Hold M)

Hold **M** to temporarily see every ramp rendered in pure math mode:

- **Lightness:** Linear interpolation from L=0.97 to L=0.14
- **Chroma:** 85% of gamut max at each stop
- **Hue:** Constant (no warm/cool drift)

Release **M** to return to opinionated. The comparison reveals what the opinions buy you — warmth, contour, life.

---

## Harmonization

Select two or more swatches or ramps. Press **H**. Wassily nudges their hues toward the nearest pleasing geometric relationship.

### The Algorithm

1. Extract hue angles from all selected objects
2. Find the nearest harmonic relationship:

| Relationship | Angle | Feel |
|-------------|-------|------|
| Analogous | 30° | Gentle, cohesive |
| Triadic | 120° | Balanced, colorful |
| Split-complementary | 150° | Contrast with nuance |
| Complementary | 180° | High contrast, vibrant |
| Tetradic | 90° | Rich, complex |

3. Minimize total displacement — the smallest collective hue nudge to reach harmony
4. Apply. All selected objects shift. (Lock any object's hue by double-clicking its label.)

### In the UI

- Select 2+ objects → subtle arc appears showing current hue angle
- **H** → objects animate to harmonized positions. Arc becomes solid, labeled (e.g., "complementary · 180°")
- **H** again → cycle to the next nearest relationship
- **Cmd+Z** to revert

---

## Auto Dark Mode

Press **D**. The canvas background shifts. Every ramp re-renders its dark variant.

### How It Works

Dark mode generates a second, parallel set of values for each ramp — not a remapping, a distinct generation with dark-background-aware rules:

| Zone | Dark Adjustment |
|------|----------------|
| **Light stops** (50-200) | Lightness reduced slightly (0.97→0.93). Avoids harsh pure-white on dark. |
| **Accent stops** (400-600) | Lightness bumped +0.05-0.08. Chroma reduced 10-15%. Prevents vibration on dark backgrounds. |
| **Dark stops** (900-950) | Chroma boosted slightly. Adds subtle color to near-blacks. Warm drift increased. |

For individual swatches (not ramps), dark mode changes the canvas background so you see how the color reads on dark. WCAG dots recalculate against the dark surface.

### In the UI

- **D** toggles canvas and all ramps between light and dark
- Swatches display and copy the active mode's values
- Export includes both variants

---

## WCAG AA — Built In

No dashboard. No audit panel.

### Swatch Dots

Each swatch has a small indicator:
- **White dot** → passes AA (4.5:1) as text on white (or current canvas background)
- **Black dot** → passes AA as text on black
- **Both** → works on either
- **None** → fails both

In dark mode, dots recalculate against the dark surface.

### Connections Double as Contrast Checks

Every connection line between swatches shows contrast ratio. Solid = passes AA. Dashed = fails. This means WCAG checking is just... connecting two colors and reading the line. No separate tool.

---

## Multi-Ramp Harmony (Automatic)

Always-on behaviors when multiple ramps exist:

### Perceptual Alignment

All ramps' anchor stops (500 or equivalent) are calibrated to the same perceptual lightness. Blue-500 and red-500 feel like the same "weight."

### Neutral Companion

Promote a swatch to a ramp → a ghost ramp appears nearby. It's a neutral tinted with the parent's hue:
- Same lightness distribution
- Chroma: `0.015` (barely there — enough to feel warm/cool)
- Click to materialize

---

## Ramp Naming

Auto-generated from hue:

| Hue Range | Name |
|-----------|------|
| 0-15 | red |
| 15-40 | orange |
| 40-65 | amber |
| 65-80 | yellow |
| 80-105 | lime |
| 105-150 | green |
| 150-180 | teal |
| 180-210 | cyan |
| 210-250 | blue |
| 250-280 | indigo |
| 280-310 | violet |
| 310-340 | pink |
| 340-360 | rose |

Duplicates append a number: `blue`, `blue-2`. Click label to rename.

---

## Export

**Cmd+E** on a selection. Works on single swatches, single ramps, or multi-selections.

### Single Swatch
- oklch value
- hex value
- CSS custom property

### Single Ramp

| Format | Output |
|--------|--------|
| CSS Custom Properties | `--{name}-{stop}: oklch(...)` with hex comment |
| CSS with Dark Mode | Light + dark in `prefers-color-scheme` blocks |
| Tailwind v4 `@theme` | Ready to paste |
| Hex List | One per line (Figma) |
| JSON Tokens | W3C DTCG format |

### Multi-Ramp (Full Palette)

Same formats, all ramps combined:
- CSS: all custom properties in one block, grouped by ramp name
- Tailwind: single `@theme` with all color families
- JSON: nested by ramp name
- Hex: grouped sections with ramp name headers

### Quick Copy

- **C / Shift+C / Cmd+C** on a selected swatch (see Copying Values)
- **Cmd+Shift+C** on a selected ramp → copies full CSS block

---

## Persistence

Two layers. No backend. No accounts.

### Local (your working board)

The canvas auto-saves to **localStorage** continuously (debounced). Close the tab, close the browser, come back tomorrow — everything's where you left it. This is your living moodboard.

Undo history also lives in localStorage. Cmd+Z works across sessions.

### Shareable (snapshots)

Press **Cmd+L** to generate a shareable URL. The current canvas state encodes into the URL hash (compressed with lz-string):

`https://wassily.app/#eyJyYW1wcy...`

This is a snapshot — a frozen moment of the board. Opening the link loads that state without overwriting the recipient's local board (it opens as a separate view; they can cherry-pick colors into their own canvas).

Reference images are NOT included in shared URLs (too large). Extracted swatches and ramps are.

### Browser back/forward

Each meaningful action pushes to the browser history stack. Back/forward acts as coarse undo/redo for canvas-level changes (new swatch, delete, ramp promotion). Fine adjustments (drag-to-tweak lightness) are batched.

---

## Visual Form

### Level of Detail (Zoom)

The canvas has two visual levels. The transition is a smooth crossfade, not a snap.

**Overview** (below ~1.5x zoom) — just color. No text, no values, no labels on swatches. You're scanning, feeling the palette as a whole. WCAG dots still visible (they're tiny and non-textual). Ramp name labels visible (they help you orient).

**Detail** (above ~1.5x zoom) — values fade in. Hex appears below each swatch. oklch appears on hover. Stop numbers appear below ramp stops. The text is low-contrast (`oklch(0.45 0 0)` on the dark canvas) so it never competes with the color.

That's it. Two levels. No controls emerge from zooming — fine-tuning is always gesture-based (drag, scroll) at any zoom level. The LOD is purely informational. The color is always the loudest thing on screen.

### Typography

**IBM Plex Mono** everywhere. One typeface, one weight (400), one size (11px). Two treatments:

- **Labels** (ramp names, relationship tags, section headers in export menus): uppercase, `letter-spacing: -0.55px`. Quiet authority. Museum specimen energy.
- **Values** (oklch, hex, contrast ratios, stop numbers, toasts): default tracking. Hex is uppercase (`#0059E9`). CSS functions stay lowercase because that's valid syntax (`oklch(0.55 0.229 261.3)`). Contrast ratios and stop numbers are just numerals.

No bold. No italics. No size hierarchy. The color is the hierarchy.

### Swatch

- **48×48px** at 1x zoom
- Filled square, slight corner radius (2px)
- No border, no label at overview zoom
- At detail zoom: hex value fades in below (11px Plex Mono, low contrast)
- Selected: 1px white outline
- Hover: tooltip with oklch + hex + contrast ratios

### Ramp

- **Continuous strip** — stops touch (0 gap), reads as a gradient bar
- Height: 48px. Width: 48px × stop count (e.g., 528px for 11 stops)
- Slight corner radius on the first and last stops (2px) — the strip has rounded ends
- **Name label**: 11px, left-aligned above the strip, 4px gap. `oklch(0.45 0 0)` on dark canvas.
- **Stop numbers**: hidden at overview zoom. At detail zoom, numbers fade in below each stop.
- Selected: 1px white outline around the entire strip
- Selected stop within a ramp: that stop gets a brighter outline

### Connection

- 1px line, `oklch(0.35 0 0)` — visible but quiet
- Label at midpoint: contrast ratio + pass/fail indicator
- Solid if passes AA (≥ 4.5:1), dashed if not

### Toast

- Fixed to bottom-center of viewport (not in canvas space)
- Minimal: just the copied value in monospace, dark translucent background
- Fades after 1.5s

### Canvas

- Default background: `oklch(0.13 0 0)` (dark)
- **D** toggles to light: `oklch(0.98 0 0)`
- The default is dark because most of the time you're crafting colors, not checking them on white. D is for when you need that check.

---

## Technical Stack

- **Vite + React + TypeScript**
- **culori** — OKLCH ↔ sRGB, gamut mapping, deltaE, contrast ratio
- **@use-gesture** — pan, zoom, drag with momentum
- **lz-string** — URL hash compression for large canvases
- **CSS transforms** for canvas camera (translate + scale)
- **DOM rendering** for all objects — element count stays low
- **Zero backend** — static deployment (Vercel / GitHub Pages)

### Spatial Canvas Architecture

Single container `<div>` with `transform: translate(x, y) scale(z)`. Swatches and ramps are absolutely positioned children. Pan/zoom updates three numbers at 60fps. Virtualize if element count ever warrants it (hundreds of objects).

### Key Algorithms

**Gamut mapping:** `culori.toGamut('rgb', 'oklch')` — binary search reducing C until in-gamut.

**Purification:** Convert input → OKLCH. Hold H. Binary search for max C at current L. Optionally sweep L for the hue's chroma peak.

**Ramp generation:** Given anchor hue + stop count, distribute L values (non-linear), apply chroma curve × gamut max, apply hue drift. Verify each stop in-gamut.

**Harmonization:** For selected hues, measure angular distances. Compare to harmonic targets. Minimize total displacement.

**Contrast ratio:** WCAG 2.x formula on sRGB-derived relative luminance.

---

## Out of Scope (v1)

- Color space education / visualizers
- Mobile
- User accounts
- Colorblind simulation (future: press V)
- Display P3 gamut target (future)
- Figma plugin export (future)

---

## Future Considerations

- **Reference import** — paste a list of hex values, reverse-engineer OKLCH curves
- **Colorblind preview** — V to cycle simulations
- **Ramp presets** — P for common palette families (primary + neutral + semantic)
- **Display P3 mode** — toggle gamut target for wider-gamut displays
- **Figma plugin** — export directly to Figma variables
- **Image eyedropper** — drop an image on the canvas, click to sample colors from it
