# Wassily

## What It Is

A color moodboard that thinks in OKLCH.

Collect colors from anywhere — paste a hex from a screenshot, drop a photograph, right-click for something new. Every color that enters is purified to its ideal expression. Arrange them spatially. Connect them to see relationships. When you're ready, promote a color into a full ramp and export production tokens.

The canvas is the collection. The collection is the tool.

It's opinionated — it knows what makes color beautiful and does that by default. You override when you want to, not because you have to.

Named for Wassily Kandinsky.

---

## Canvas Objects

Four things can exist on the canvas:

### 1. Swatch

A single color. The atomic unit. A small filled square. Right-click the canvas and choose "New color" to create one at a random hue, purified to its ideal OKLCH expression. Paste a hex from a screenshot and a swatch appears, purified. Swatches are free-floating — place them anywhere.

### 2. Ramp

A linked strip of colors generated from a swatch. Select a swatch, press **R**, and it transforms — expanding into a continuous band of stops, light to dark, with all the opinions applied. A ramp is a promoted swatch.

### 3. Connection

A thin line between any two swatches (loose or inside ramps). Shows their contrast ratio, hue distance, or perceptual delta. Connections update live as you adjust colors. They're the tool's way of making relationships visible.

### 4. Reference Image

A dropped photograph, screenshot, or artwork. Displayed at full opacity, selectable and deletable. Pinned to the canvas as a source for color extraction. Persists in the session but not in shared URLs — the extracted colors are the artifact, not the image.

---

## Core Interaction Model

### The Spatial Canvas

The screen is empty. Dark (`#000`). Infinite in every direction. No instructions, no logo.

Pan with **two-finger trackpad scroll** or **Space+drag**. Zoom with **pinch** (Ctrl/Cmd+scroll). Colors and ramps live as objects in this space — place them anywhere, group them as you think about them.

### Creating Colors

| Action | Result |
|--------|--------|
| **Right-click empty space > New color** | New swatch at random hue, placed where you clicked |
| **Right-click empty space > Warm/Cool/Pure neutral** | New neutral swatch with specific hue tinting |
| **Cmd+V** (text) | New swatch from pasted color (hex, oklch, rgb, hsl — any CSS format), purified |
| **Cmd+V** (image) | Reference image with extracted palette swatches placed beside it |
| **Drop image** | Same as paste image — reference image + extracted swatches |

**Click on empty space ONLY deselects.** It does not create new swatches. All color creation is through right-click context menu or paste.

Every new swatch is purified automatically (see Color Purification). The color you get is the best version of the color you asked for.

### Selecting

| Action | Result |
|--------|--------|
| **Click a swatch** | Select it. Subtle outline appears. |
| **Click a ramp** | Select the whole ramp. |
| **Shift+Click** | Add to / toggle from selection (multi-select) |
| **Click empty space** | Deselect all |
| **Cmd+A** | Select everything on canvas |

### Copying Values

A selected swatch or stop can be copied with single-key shortcuts:

| Action | Copies |
|--------|--------|
| **C** | hex value (e.g., `#0059E9`) |
| **O** | oklch value (e.g., `oklch(0.550 0.229 261.3)`) |

No toast notifications — the value is silently copied to clipboard.

### Adjusting Colors

> **PARTIALLY BUILT.** Hue rotation via scroll was removed (too accidental). Will return with spectral ghost controls. Drag-to-adjust lightness/chroma is not yet implemented.

Works on any swatch (loose or inside a ramp):

| Action | Effect | Status |
|--------|--------|--------|
| ~~Scroll on swatch~~ | ~~Rotate hue~~ | **Removed** (too accidental) |
| Drag vertical on swatch | Adjust lightness | **Not yet built** |
| Drag horizontal on swatch | Nudge chroma | **Not yet built** |

### Promoting to Ramp

Select a swatch. Press **R**. The swatch transforms into a ramp — expanding from a single color into a continuous strip of stops. The ramp builds around the seed color's hue.

**Default: 11 stops** (Tailwind: 50, 100, 200, 300, 400, 500, 600, 700, 800, 900, 950).

**+/- keys** add or remove stops by cycling through presets: **3 - 5 - 7 - 9 - 11**.

Right-click a swatch offers direct ramp creation at specific stop counts (11, 7, 5).

### Connections

> **NOT YET BUILT.** Planned feature.

Connections make relationships between colors visible. Select two swatches (Shift+Click), press **L** (link). A thin line appears between them.

### Moving and Organizing

| Action | Effect |
|--------|--------|
| **Drag a swatch** | Move it freely on the canvas |
| **Drag a ramp** | Move the whole ramp |
| **Drag when selected** | Move all selected objects together |
| **Cmd+0** | Reset camera to origin |

### Keyboard Summary

| Key | Effect | Status |
|-----|--------|--------|
| **R** | Promote selected swatch to ramp (11 stops) | Built |
| **+/-** | Cycle stop count on selected ramp (3/5/7/9/11) | Built |
| **D** | Toggle light/dark canvas | Built |
| **M** (hold) | Peek at pure math mode (release to return) | Built |
| **H** | Harmonize selected swatches/ramps | Built |
| **C** | Copy hex value | Built |
| **O** | Copy oklch value | Built |
| **Cmd+V** | Paste color (text) or image (clipboard image) | Built |
| **Cmd+Z / Cmd+Shift+Z** | Undo / redo | Built |
| **Cmd+A** | Select all | Built |
| **Cmd+0** | Reset camera | Built |
| **Delete / Backspace** | Remove selected | Built |
| **Space+drag** | Pan canvas | Built |
| **L** | Link selected swatches (create connection) | Not built |
| **Cmd+E** | Export menu | Not built |
| **Cmd+L** | Generate shareable URL | Not built |
| **Cmd+C** | Copy CSS custom property | Not built |
| **Cmd+Shift+C** | Copy selected ramp as full CSS block | Not built |

### Context Menus (Right-Click)

Every right-click target gets a context-appropriate menu. 9px IBM Plex Mono, uppercase, `#000` background, edge-aware positioning (flips to stay on screen).

**Right-click a swatch:**
- Hex value (copies to clipboard on click)
- oklch value (copies to clipboard on click)
- Ramp - 11 / Ramp - 7 / Ramp - 5
- Delete

**Right-click a ramp:**
- Hex list (copies all stops as hex, one per line)
- oklch list (copies all stops as oklch, one per line)
- Delete

**Right-click a reference image:**
- Delete

**Right-click empty space:**
- New color (random)
- Warm neutral (H:60, C:0.015)
- Cool neutral (H:250, C:0.015)
- Pure neutral (C:0)
- Harmonize (only if 2+ objects selected)

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

### Neutral Exception

Colors with C < 0.05 are treated as intentionally neutral and are NOT purified. A gray stays gray — it's not a detuned color, it's an intentional neutral.

### For Random Swatches

Random clicks (no input color) generate a swatch born purified — directly at peak chroma for its random hue.

---

## Image Extraction

Drop an image onto the canvas — a photograph, a screenshot, a painting, anything. Wassily extracts its palette.

### What Happens

1. **The image appears on the canvas** as a reference object at full opacity. It's a real canvas object — move it, select it, delete it.
2. **Dominant colors are extracted automatically.** 3-7 purified swatches appear in a column beside the image, depending on the image's chromatic complexity. A moody monochrome photo yields 3. A vibrant street market yields 7.
3. **Cmd+V with a clipboard image** does the same thing — adds the image and extracts its palette.

### The Extraction Algorithm

- Convert pixels to OKLCH (clustering in perceptual space, not RGB)
- Sample up to 2000 pixels (evenly distributed, transparent pixels skipped)
- K-means++ clustering with adaptive k (3-7) based on chromatic variance
- Sort clusters by perceptual prominence (chroma * sqrt(cluster size))
- Merge near-duplicates (OKLCH distance < 0.05)
- Filter out near-neutrals if chromatic alternatives exist (unless the image IS mostly neutral — then honor that)
- **Neutrals are NOT purified** — colors with C < 0.04 stay as-is. Only chromatic colors (C > 0.04) get purified. Grays are intentionally gray, not detuned.

### Smart Single-Color Detection

If the dropped image has very low chromatic variance (a swatch screenshot, a solid crop, a color sample), Wassily detects this and produces a single purified swatch instead of a row. No unnecessary clustering on what's obviously one color.

### Image as Canvas Object

The reference image persists on the canvas at full opacity. You can:
- **Move it** (drag)
- **Select it** (click)
- **Delete it** (Delete/Backspace when selected, or right-click > Delete)

**State caveat:** images live in the current session (memory) but do NOT persist to localStorage or encode into URL hashes — they're too large. When you reload, extracted swatches and ramps are preserved. The reference image is not. This is the right tradeoff — the colors are the artifact, the image was the source material.

---

## Ramp Generation (v3 Engine)

### Architecture

The ramp engine uses **arc-length parameterized OKLab interpolation** — three anchor points (tinted white → seed → hue-drifted dark) interpolated in Cartesian OKLab, sampled at equal Euclidean distances. One algorithm adapts to every seed through geometry, not branching.

The core insight: instead of computing each channel (L, C, H) independently with parametric curves, interpolate a straight-line path through 3D OKLab space. This eliminates chroma discontinuities at the seed and distributes color change perceptually evenly.

### The Opinions

When a swatch is promoted to a ramp, four opinions shape the gradient:

#### 1. Three Anchor Points

- **White endpoint** (L=0.96): Tinted with the seed's hue at max gamut chroma, scaled by seed intensity. L=0.96 (not 0.98) so the gamut has room for visible chroma — at 0.98, most hues get C≈0.009.
- **Seed**: The user's chosen color, snapped to the nearest arc-length stop.
- **Dark endpoint** (L=0.25): Hue-drifted toward amber with gamut-relative chroma, scaled by seed intensity.

#### 2. Arc-Length Parameterization

Stops are placed at equal OKLab Euclidean distances along the white→seed→dark path. The seed naturally falls wherever its perceptual distance from white places it — light seeds near the top, dark seeds near the bottom, mid-tones near center. The nearest stop is replaced with the seed's exact color.

This adapts to seed properties through math alone:
- Light vivid seeds → few light stops, many dark (seed ≈ stop 100-200)
- Mid-tone seeds → balanced (seed ≈ stop 500)
- Dark seeds → many light stops, few dark (seed ≈ stop 800-900)
- Vivid seeds → dramatic chroma curves
- Muted seeds → gentle gradients

#### 3. Hue Drift (target-based toward amber)

Encoded in the dark endpoint and distributed smoothly via the OKLab path:

- **Yellow-green zone** (H 60-130): aggressive drift (up to 55°) toward amber. Prevents olive in dark greens/yellows.
- **Teal zone** (H 130-180): tapering drift.
- **Blue/purple/red** (everything else): subtle base drift of up to +8°.

The OKLab interpolation distributes the hue rotation continuously across the dark stops — no per-stop easing functions needed.

#### 4. Gamut Safety

Every color is in-gamut for sRGB. When desired chroma exceeds the boundary, chroma is reduced (never lightness). No clipping, ever. Uses culori's `clampChroma` for final safety.

### What Changed from v2

- **Parametric curves → OKLab interpolation** — L/C/H no longer computed independently. The straight-line OKLab path ties them together, eliminating chroma discontinuities.
- **Power-curve anchoring → arc-length sampling** — the seed's position is determined by perceptual distance, not a lightness exponent.
- **Flat gamut-relative chroma → OKLab-distributed chroma** — chroma peaks at the seed and falls off smoothly toward both endpoints via the interpolation path.
- **Per-stop hue drift → endpoint-encoded drift** — hue shift is in the dark endpoint; OKLab distributes it naturally.

### Variable Stop Counts

The opinions scale to any stop count:

| Count | Stops | Use Case |
|-------|-------|----------|
| **3** | 200, 500, 800 | Quick light/base/dark |
| **5** | 100, 300, 500, 700, 900 | Compact design system |
| **7** | 100, 200, 400, 500, 600, 800, 900 | Mid-range system |
| **9** | 50, 100, 300, 400, 500, 600, 700, 900, 950 | Material-like |
| **11** | 50, 100, 200, 300, 400, 500, 600, 700, 800, 900, 950 | Tailwind |

### Display: Always Vivid

Ramps always show the vivid variant (`stop.color`) in the tool. Dark mode variants (`stop.darkColor`) are generated internally and used only for export. You always see the ramp at its brightest.

### Pure Mode (Hold M)

Hold **M** to temporarily see every ramp rendered in pure math mode:

- **Lightness:** Linear interpolation from L=0.98 to L=0.25
- **Chroma:** 85% of gamut max at each stop
- **Hue:** Constant (no warm/cool drift)

Release **M** to return to opinionated. The comparison reveals what the opinions buy you — warmth, contour, life.

### Neutral Ramps

Neutral swatches (C < 0.05) generate neutral ramps with:
- Same lightness distribution as chromatic ramps
- Hue drift applied (warm neutrals drift toward warm, cool toward cool)
- Chroma varies subtly across stops (peaks at midpoint)
- Named automatically: `warm-gray`, `cool-gray`, or `gray` based on seed hue

Create neutral swatches via right-click: Warm neutral (H:60), Cool neutral (H:250), Pure neutral (C:0).

---

## Harmonization

Select two or more swatches or ramps. Press **H**. Wassily nudges their hues toward the nearest pleasing geometric relationship.

### The Algorithm

1. Extract hue angles from all selected objects
2. Find the nearest harmonic relationship:

| Relationship | Angle | Feel |
|-------------|-------|------|
| Analogous | 30 | Gentle, cohesive |
| Tetradic | 90 | Rich, complex |
| Triadic | 120 | Balanced, colorful |
| Split-complementary | 150 | Contrast with nuance |
| Complementary | 180 | High contrast, vibrant |

3. Minimize total displacement — the smallest collective hue nudge to reach harmony
4. Apply. All selected objects shift.

For 3+ hues: distributes evenly around the circle from the centroid.

### Feedback

When **H** is pressed, the relationship name and angle appear **centered on screen** for 1.2 seconds (e.g., "COMPLEMENTARY - 180"). 9px IBM Plex Mono, uppercase, white at 70% opacity. Then it fades.

### Cycling

Press **H** repeatedly to cycle through harmonic relationships, sorted by proximity to the current angle.

---

## Auto Dark Mode

Press **D**. The canvas background shifts from `#000` to `#fff` (or back).

### How It Works

Dark mode generates a second, parallel set of values for each ramp — not a remapping, a distinct generation with adjusted rules:

| Zone | Dark Mode Adjustment |
|------|---------------------|
| **Light stops** (t < 0.3) | Lightness -0.03. Chroma x0.9. |
| **Mid stops** (t 0.3-0.6) | Lightness +0.06. Chroma x0.85. |
| **Dark stops** (t > 0.6) | Lightness +0.01. Chroma x1.05. |

The state flag is `lightMode` — `true` means light canvas (white), `false` means dark canvas (black, the default).

### In the UI

- **D** toggles canvas background between `#000` (default) and `#fff`
- Selection outlines invert (white on dark canvas, black on light canvas)
- Label colors invert (white-ish on dark, black-ish on light)
- Ramps always show vivid colors — dark variants are for export only

---

## Ramp Naming

Auto-generated from hue:

| Hue Range | Name |
|-----------|------|
| 0-15 | red |
| 15-40 | orange |
| 40-65 | amber |
| 65-100 | yellow |
| 100-120 | lime |
| 120-150 | green |
| 150-180 | teal |
| 180-210 | cyan |
| 210-250 | blue |
| 250-280 | indigo |
| 280-310 | violet |
| 310-340 | pink |
| 340-360 | rose |

Duplicates append a number: `blue`, `blue-2`. Rename via right-click (planned, rename action exists in state but no UI yet).

---

## Visual Form

### Labels and Values

Labels and values are **only visible on hover**. When not hovered, swatches and ramps show pure color — no text, no numbers, no visual noise. On hover, information fades in with a 0.15s transition.

- **Swatch hover:** hex value below the swatch
- **Ramp hover:** name label above the strip, stop labels and hex values below (only at detail zoom > 1.5x)

### Typography

**IBM Plex Mono** everywhere. One typeface, one weight (400), one size (**9px**). Pure black or pure white — no gray intermediates:

- **Labels** (ramp names, stop numbers): uppercase, `letter-spacing: -0.55px` or `0.5px`. Quiet authority.
- **Values** (hex): uppercase (`#0059E9`). CSS functions lowercase (`oklch(0.550 0.229 261.3)`).
- **Color:** `rgba(255,255,255,0.85)` on dark canvas, `rgba(0,0,0,0.85)` on light canvas.

No bold. No italics. No size hierarchy. The color is the hierarchy.

### Swatch

- **48x48px** at 1x zoom
- Filled square, **no corner radius**
- No border, no label when not hovered
- Hover: hex value fades in below (9px Plex Mono)
- Selected: 1px outline (white on dark canvas, black on light), 3px offset

### Ramp

- **Continuous strip** — stops touch (0 gap), reads as a gradient bar
- Height: 48px. Width: 48px per stop (e.g., 528px for 11 stops)
- **No corner radius** on the strip — sharp edges throughout
- **Name label**: hover only, 9px, positioned above the strip, 4px gap. Uppercase, letter-spacing -0.55px.
- **Stop numbers and hex values**: hover only (and only at detail zoom > 1.5x), positioned below each stop.
- Selected: 1px outline around the entire strip, 3px offset

### Context Menu

- Fixed position (viewport space, not canvas space)
- `#000` background, `1px solid rgba(255,255,255,0.15)` border
- 9px IBM Plex Mono, uppercase, `letter-spacing: 0.5px`
- Items: `rgba(255,255,255,0.6)` default, `#fff` on hover with `rgba(255,255,255,0.08)` background
- Separator lines between logical groups
- **Edge-aware positioning:** if menu would overflow viewport edge, it repositions to stay on screen

### Canvas

- Default background: `#000` (dark)
- **D** toggles to light: `#fff`
- The default is dark because most of the time you're crafting colors, not checking them on white. D is for when you need that check.

---

## Persistence

Two layers. No backend. No accounts.

### Local (your working board)

The canvas auto-saves to **localStorage** continuously (debounced, 300ms). Close the tab, close the browser, come back tomorrow — everything's where you left it (except reference images, which are too large for localStorage).

### Undo/Redo

Full undo/redo history (up to 50 states). `Cmd+Z` / `Cmd+Shift+Z`. Granular actions (select, camera, move) are excluded from history to keep it meaningful. Undo history is in-memory only (not persisted across sessions).

### Shareable (snapshots)

> **NOT YET BUILT.** Planned: `Cmd+L` to generate a shareable URL with canvas state encoded in the URL hash.

---

## Technical Stack

- **Vite + React 19 + TypeScript**
- **culori** — OKLCH conversions, gamut mapping (clampChroma, displayable), deltaE
- **@fontsource/ibm-plex-mono** — typography
- **CSS transforms** for canvas camera (translate + scale)
- **DOM rendering** for all objects — element count stays low
- **Zero backend** — static deployment

### Spatial Canvas Architecture

Single container `<div>` with `transform: translate(x, y) scale(z)`. Swatches and ramps are absolutely positioned children. Pan/zoom updates three numbers at 60fps. Two-finger trackpad scroll for panning, Ctrl/Cmd+scroll for pinch-to-zoom, Space+drag for mouse panning.

### Key Algorithms

**Gamut mapping:** `maxChroma()` — binary search for maximum C at a given (L, H) that stays in sRGB gamut. `clampToGamut()` — reduces chroma via culori's `clampChroma`.

**Purification:** Convert input to OKLCH. Hold H. Find max C at current L. Optionally sweep L for the hue's chroma peak. Neutrals (C < 0.05) bypass purification.

**Ramp generation (v3):** Three OKLab anchors: tinted white (L=0.96, gamut-max chroma) → seed → dark (L=0.25, hue-drifted, gamut-max chroma). Both endpoints scaled by seedIntensity. Compute OKLab Euclidean distances for each segment. Sample stops at equal arc-length intervals. Snap nearest stop to seed's exact color. Clamp to gamut. Generate parallel dark mode variant.

**Harmonization:** For selected hues, measure angular distances. Compare to harmonic targets (30/90/120/150/180). Minimize total displacement. Split adjustment evenly (unless one is locked).

**Image extraction:** K-means++ in OKLCH space. Adaptive k. Prominence scoring. Neutral filtering. Purify only chromatic results.

**Color parsing:** culori parses hex, rgb, hsl, oklch, named colors. Bare numbers 0-360 are treated as hue angles and generate a swatch at L=0.55, max chroma.

---

## Out of Scope (v1)

- Color space education / visualizers
- Mobile
- User accounts
- Colorblind simulation (future: press V)
- Display P3 gamut target (future)
- Figma plugin export (future)
- Toast notifications (removed — couldn't get working reliably)
- WCAG AA swatch dots (dropped — too noisy)
- Scroll-on-swatch hue rotation (removed — too accidental, will return with spectral ghost controls)

---

## Not Yet Built (planned)

These features are designed but not implemented:

- **Connections** — L key to link swatches, contrast ratio / hue distance / deltaE labels
- **Export menu** — Cmd+E, CSS / Tailwind / JSON / hex list formats
- **Shareable URLs** — Cmd+L, lz-string compressed canvas state in URL hash
- **CSS copy shortcuts** — Cmd+C for CSS custom property, Cmd+Shift+C for full ramp block
- **Drag-to-adjust** — vertical drag for lightness, horizontal for chroma
- **Hue rotation** — will return as spectral ghost controls (faint hue arc during gesture)
- **Ramp renaming UI** — state supports it, no UI trigger yet
- **Reference import** — paste a list of hex values, reverse-engineer OKLCH curves
- **Colorblind preview** — V to cycle simulations
- **Ramp presets** — P for common palette families (primary + neutral + semantic)
- **Display P3 mode** — toggle gamut target for wider-gamut displays
- **Figma plugin** — export directly to Figma variables
- **JIT spectral controls** — ghost controls that materialize during gestures and fade on release
- **Opinion strength dial** — hold M + scroll to adjust opinion intensity (0% pure math to 150% dramatic)
- **Ramp styles** — named aesthetic directions (Natural, Clinical, Brutalist, etc.)
- **Learn From Palette** — import existing palette, reverse-engineer its style parameters
