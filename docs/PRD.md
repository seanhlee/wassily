# Wassily

## What It Is

A color moodboard that thinks in OKLCH.

Collect colors from anywhere — paste a hex from a screenshot, drop a photograph, right-click for something new. Every color that enters as design material is purified to its ideal expression. Arrange colors spatially. Connect them to see relationships. Extract and steer palettes from reference images. When you're ready, promote a color into a full ramp and export production tokens through MCP tooling. The browser export UI is still planned.

The canvas is the collection. The collection is the tool.

It's opinionated — it is trying to know what makes color beautiful and do that by default. That opinion is still under active research, especially for ramp generation. You override when you want to, not because you have to.

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

A dropped photograph, screenshot, or artwork. Displayed at full opacity, selectable and deletable. Pinned to the canvas as a source for color extraction. Image metadata persists with the board, and blob data persists locally in IndexedDB. Shared URLs are still not built.

---

## Core Interaction Model

### The Spatial Canvas

The screen is empty. Light by default (`#fff`) with a dark toggle (`#000`). Infinite in every direction. No instructions, no logo.

Pan with **two-finger trackpad scroll** or **Space+drag**. Zoom with **pinch** (Ctrl/Cmd+scroll). Colors and ramps live as objects in this space — place them anywhere, group them as you think about them.

### Creating Colors

| Action | Result |
|--------|--------|
| **Right-click empty space > New color** | New swatch at random hue, placed where you clicked |
| **Right-click empty space > Warm/Cool/Pure neutral** | New neutral swatch with specific hue tinting |
| **Cmd+V** (text) | New swatch from pasted color (hex, oklch, rgb, hsl — any CSS format), purified |
| **Cmd+V** (image) | Reference image placed on the canvas |
| **Drop image** | Same as paste image — reference image placed at the drop point |

**Click on empty space ONLY deselects.** It does not create new swatches. All color creation is through right-click context menu or paste.

Every new swatch is purified automatically (see Color Purification). The color you get is the best version of the color you asked for.

### Selecting

| Action | Result |
|--------|--------|
| **Click a swatch** | Select it. Corner brackets appear. |
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

Hue rotation via scroll was removed because it was too accidental. It should return only as a deliberate spectral/JIT control. Current precision editing is split between a temporary gesture and the double-click editor.

Works on selected swatches:

| Action | Effect | Status |
|--------|--------|--------|
| ~~Scroll on swatch~~ | ~~Rotate hue~~ | **Removed** (too accidental) |
| Hold **E** + drag vertical on swatch | Adjust lightness | Built |
| Hold **E** + drag horizontal on swatch | Nudge chroma | Built |
| Arrow Up/Down | Adjust lightness | Built |
| Arrow Left/Right | Adjust chroma | Built |
| Double-click selected swatch | Open full color editor | Built |

### Promoting to Ramp

Select a swatch. Press **R**. The swatch transforms into a ramp — expanding from a single color into a continuous strip of stops. The ramp builds around the seed color's hue.

**Default: 11 stops** (Tailwind: 50, 100, 200, 300, 400, 500, 600, 700, 800, 900, 950).

**+/- keys** add or remove stops by cycling through presets: **3 - 5 - 7 - 9 - 11**.

Right-click a swatch offers direct ramp creation at specific stop counts (11, 7, 5).

### Connections

Connections make relationships between colors visible. Select two or more swatches/ramps and press **L**. Wassily chain-connects adjacent pairs in selection order. Press **L** with fewer than two endpoints selected to toggle connection visibility.

Connections render as thin curved lines between objects. On hover they show contrast ratio, hue distance, and perceptual delta. Connections are cleaned up when referenced objects are deleted.

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
| **E** (hold) | Enable swatch lightness/chroma drag edit | Built |
| **I** (hold) | Eyedropper selected swatch from reference images | Built |
| **H** | Harmonize selected swatches/ramps | Built |
| **K** | Lock/unlock selected hues for harmonization | Built |
| **C** | Copy hex value | Built |
| **O** | Copy oklch value | Built |
| **Cmd+V** | Paste color (text) or image (clipboard image) | Built |
| **Cmd+Z / Cmd+Shift+Z** | Undo / redo | Built |
| **Cmd+A** | Select all | Built |
| **Cmd+0** | Reset camera | Built |
| **Delete / Backspace** | Remove selected | Built |
| **Space+drag** | Pan canvas | Built |
| **L** | Connect 2+ selected endpoints, otherwise toggle connections | Built |
| **Cmd+E** | Export menu | Not built |
| **Cmd+L** | Generate shareable URL | Not built |
| **Cmd+C** | Copy CSS custom property | Not built |
| **Cmd+Shift+C** | Copy selected ramp as full CSS block | Not built |

### Context Menus (Right-Click)

Every right-click target gets a context-appropriate menu. 11px IBM Plex Mono, uppercase, adaptive canvas-colored background, edge-aware positioning.

**Right-click a swatch:**
- Hex value (copies to clipboard on click)
- oklch value (copies to clipboard on click)
- Ramp - 11 / Ramp - 7 / Ramp - 5
- Delete

**Right-click a ramp:**
- Hex list (copies all stops as hex, one per line)
- oklch list (copies all stops as oklch, one per line)
- Lock / unlock hue
- Delete

**Right-click a ramp stop:**
- Hex value
- oklch value
- Delete stop

**Right-click a reference image:**
- Extract colors / Re-extract colors
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

Drop or paste an image onto the canvas — a photograph, a screenshot, a painting, anything. Wassily adds it as a reference object. Extraction is explicit: right-click the reference image and choose `Extract colors`.

### What Happens

1. **The image appears on the canvas** as a reference object at full opacity. It's a real canvas object — move it, select it, delete it.
2. **Dominant colors are extracted on demand.** A linked strip of swatches appears beside the image, depending on the image's chromatic complexity.
3. **Markers appear on the image** while the image or linked swatches are selected/hovered. Each marker records the source point for one extracted swatch.
4. **Dragging a marker resamples the image** and updates the linked swatch live. A loupe follows the pointer for pixel-level inspection.

### The Extraction Algorithm

- Convert pixels to OKLCH (clustering in perceptual space, not RGB)
- Sample up to 2000 pixels (evenly distributed, transparent pixels skipped)
- K-means++ clustering with adaptive `k` derived from chromatic and tonal complexity
- Score candidates by coverage, gamut-relative intensity, and small chroma bonuses
- Choose peak-chroma real-pixel representatives, not averaged centroids
- Cull visually redundant candidates with OKLCH distance thresholds
- Keep meaningful neutrals when they matter; drop weak neutrals when chromatic alternatives dominate
- Gently normalize chroma relative to the image's own peak intensity. This gives image-derived palettes presence without full swatch purification.

### Smart Single-Color Detection

If the image has very low palette complexity (a swatch screenshot, a solid crop, a color sample), Wassily detects this and produces one source-aware swatch instead of a row. No unnecessary clustering on what's obviously one color.

### Image as Canvas Object

The reference image persists on the canvas at full opacity. You can:
- **Move it** (drag)
- **Select it** (click)
- **Delete it** (Delete/Backspace when selected, or right-click > Delete)
- **Extract / re-extract colors** (right-click)
- **Edit extracted colors** by dragging linked source markers

**Persistence caveat:** reference image metadata persists in board state, but blob data lives in IndexedDB instead of localStorage. Reload restores images by loading blobs and patching object URLs back into the canvas. If IndexedDB is unavailable, images degrade to session-only behavior. Shared URLs are still not built.

---

## Ramp Generation (Math-First Brand-Exact Fairing)

### Architecture

The opinionated ramp engine uses a **math-first brand-exact fairing pass** on top of the v6 seed-constrained OKLab path solver.

The core insight is still perceptual geometry: color movement should be solved in OKLab, not by independently easing L, C, and H. The v6 solver gives Wassily a strong scaffold: exact seed anchoring, path solving, semantic tonal roles, and family-aware endpoints. The brand-exact fairing pass then treats the final visible stops as the thing users actually judge:

- The exact seed color is a hard constraint.
- The seed can move to a nearby semantic stop when that produces a more natural ramp.
- The visible ladder is re-faired around the seed so `50 -> 100 -> 200` follows adjacent OKLab distance instead of a hand-authored paper role.
- The dark tail is opened so `900 -> 950` stays chromatic instead of collapsing into one dark mass.
- The 11-stop ladder remains semantically named, but math wins. `50` may read as tinted paper when the geometry supports it; it is not forced to be paper at the expense of perceptual cadence.
- Family behavior is explicit where the gamut demands it: bright lime, cyan, phthalo green, blue-violet, and neutrals do not share one naive endpoint formula.

The app-facing implementation lives in `src/engine/brandExactFairingSolver.ts`, with the v6 base in `src/engine/v6ResearchSolver.ts`. The visual research boards are generated by `npm run research:lab` and `npm run research:gauntlet`.

### Current Quality Status

Brand-exact fairing is the locked app-facing ramp algorithm for this ship. It is a meaningful step past raw v6 because it solves the user's actual complaint: the exact seed remains exact, while the surrounding stops become smoother and more visually deliberate. The current direction follows the math over the old paper-edge semantic: if OKLab cadence says `50` should be more color than paper, the ramp should follow cadence. Passing tests and gauntlet metrics are supporting evidence, not proof that the ramp problem is permanently solved.

### The Opinions

When a swatch is promoted to a ramp, these opinions shape the gradient:

#### 1. Exact Seed, Natural Anchor

The user's seed color must appear exactly in the generated ramp. The solver evaluates nearby semantic seed stops, preserves the exact seed after fairing, and chooses the position that gives the most natural visible cadence.

The intent is for a bright lime to naturally anchor around `200`, cyan to move lower when the top edge needs room, and a deep ultramarine to sit where the body and dark tail can breathe without inventing a separate ramp type for each case.

#### 2. Math-First Tint and Ink Roles

The endpoints are not treated as arbitrary math extremes, but semantic roles are soft. They cannot override perceptual progression:

- **50**: the lightest ramp color. It may feel like tinted paper, but it should not be forced into paper if that creates a visible cliff.
- **100/200**: the highlight bridge. For extreme high-lightness chroma, these stops should preserve local OKLab step evenness before satisfying a paper metaphor.
- **900/950**: colored ink. The tail should retain hue identity instead of collapsing into black.
- **Neutral 50/950**: quiet light and quiet ink. Neutrals use lower chroma envelopes and should not become colorful just because the gamut allows it.

The endpoint model is family-aware:

- Bright lime gets cusp-aware handling so `50/100/200` can progress evenly despite extreme high-lightness chroma.
- Cyan and phthalo green keep stronger tint occupancy so their `50`s still read as family colors.
- Blue-violet seeds, especially ultramarine, get a deeper but still chromatic ink endpoint and a more open dark-tail cadence.
- Neutrals use a separate low-chroma role envelope.

#### 3. Perceptual Cadence

The solver and role envelope are judged by adjacent OKLab distance, three-step windows, light-edge entrance behavior, monotone lightness, and seed placement. The goal is not mathematically identical steps at all costs; it is a ramp that feels perceptually coherent and designed.

Important cadence targets:

- No top-end plateau or washed-out `50`.
- No `100 -> 50` cliff for extreme chroma seeds.
- No `900/950` collapse into a single dark mass.
- No hue wobble that makes a family lose its identity.

#### 4. Corpus-Conditioned Path Shape

The solver is regularized against a curated reference corpus instead of relying only on hand-written constants. The corpus contributes soft priors for endpoint reserve, endpoint intensity, seed-tangent behavior, energy targets, and family identity.

The corpus is not copied directly. It shapes the path while the live seed remains exact.

#### 5. Gamut Safety

Every color is in-gamut for sRGB. When desired chroma exceeds the boundary, chroma is reduced (never lightness). No clipping, ever. Uses culori's `clampChroma` for final safety.

### What Changed from v3

- **Fixed 3-point path -> solved path**: v6 searches path geometry and scores it before sampling the ladder.
- **Generic endpoints -> semantic roles**: the 50 and 950 stops now have design meaning instead of being just the lightest and darkest samples.
- **Single universal behavior -> family-aware hard cases**: lime, cyan, phthalo green, blue-violet, and neutrals get targeted behavior where a universal formula fails.
- **Spacing afterthought -> cadence objective**: adjacent and three-step perceptual spacing are first-class diagnostics.
- **Reference inspiration -> soft prior**: curated ramps guide shape without overriding the live seed.
- **Raw v6 output -> math-first brand-exact fairing**: the final visible ladder is smoothed around the exact seed, with explicit local evenness at the top bridge and dark tail.

### Variable Stop Counts

The full semantic role envelope applies to the 11-stop Tailwind-style ladder. Other stop counts still use the same seed-constrained path machinery and labels, but with fewer semantic positions available:

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
- A separate paper/ink envelope
- Lower endpoint chroma than chromatic ramps
- Stable temperature with minimal hue drift
- Monotone lightness and quiet cadence
- Named automatically: `warm-gray`, `cool-gray`, or `gray` based on seed hue

Create neutral swatches via right-click: Warm neutral (H:60), Cool neutral (H:250), Pure neutral (C:0).

---

## Harmonization

Select two or more swatches or ramps. Press **H**. Wassily creates a harmonized strip beside the selection, nudging hues toward the nearest pleasing geometric relationship while leaving the originals intact.

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
4. Create harmonized copies in a vertical strip.

For 3+ hues: distributes targets around the circle from the centroid unless hue locks provide anchors. Locked hues remain unchanged.

### Feedback

When **H** is pressed, the relationship name and angle appear **centered on screen** for 1.2 seconds (e.g., "COMPLEMENTARY - 180"). 11px IBM Plex Mono, uppercase, adaptive to the canvas mode. Then it fades.

### Cycling

Press **H** repeatedly to cycle through harmonic relationships. Cycling replaces the previous harmonized strip instead of accumulating copies.

---

## Canvas Light/Dark Mode

Press **D**. The canvas background shifts from `#fff` to `#000` (or back). The shipped default is light mode.

### How It Works

Dark mode generates a second, parallel set of values for each ramp — not a remapping, a distinct generation with adjusted rules:

| Zone | Dark Mode Adjustment |
|------|---------------------|
| **Light stops** (t < 0.3) | Lightness -0.03. Chroma x0.9. |
| **Mid stops** (t 0.3-0.6) | Lightness +0.06. Chroma x0.85. |
| **Dark stops** (t > 0.6) | Lightness +0.01. Chroma x1.05. |

The state flag is `lightMode` — `true` means light canvas (white, the default), `false` means dark canvas (black).

### In the UI

- **D** toggles canvas background between `#fff` (default) and `#000`
- Selection brackets invert (white on dark canvas, black on light canvas)
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

Duplicates append a number: `blue`, `blue-2`. Custom ramp names are supported in state and MCP tooling; the browser UI does not yet expose rename.

---

## Visual Form

### Labels and Values

Labels and values are **only visible when needed**. When not hovered or editing, swatches and ramps show pure color — no text, no numbers, no visual noise. On hover/edit, information fades in with a 0.15s transition.

- **Swatch:** hex appears in edit mode or context menu, not passive hover.
- **Ramp:** name label appears above the strip on hover; stop labels/hex values appear below individual stops on hover.

### Typography

**IBM Plex Mono** everywhere. One typeface, one weight (400), one size (**11px**). Pure black or pure white are used for the strongest chrome, with subtle alpha for labels:

- **Labels** (ramp names, stop numbers): uppercase, `letter-spacing: -0.55px` or `0.5px`. Quiet authority.
- **Values** (hex): uppercase (`#0059E9`). CSS functions lowercase (`oklch(0.550 0.229 261.3)`).
- **Color:** `rgba(255,255,255,0.85)` on dark canvas, `rgba(0,0,0,0.85)` on light canvas.

No bold. No italics. No size hierarchy. The color is the hierarchy.

### Swatch

- **48x48px** at 1x zoom
- Filled square, **no corner radius**
- No border, no label when not hovered
- Hover: no passive hex label
- Selected: SVG corner brackets, 4px offset, 8px arms, 0.75px stroke
- Locked: small adaptive padlock at lower-right

### Ramp

- **Continuous strip** — stops touch (0 gap), reads as a gradient bar
- Height: 48px. Width: 48px per stop (e.g., 528px for 11 stops)
- **No corner radius** on the strip — sharp edges throughout
- **Name label**: hover only, 11px, positioned above the strip, 4px gap. Uppercase, letter-spacing -0.55px.
- **Stop numbers and hex values**: hover only, positioned below each stop.
- Selected: SVG corner brackets around the entire strip.

### Context Menu

- Positioned by Base UI at the pointer.
- Adaptive `#fff` / `#000` background with subtle border.
- 11px IBM Plex Mono, uppercase, `letter-spacing: 0.5px`
- Items use low-alpha text by default and stronger contrast on hover.
- Separator lines between logical groups
- **Edge-aware positioning:** if menu would overflow viewport edge, it repositions to stay on screen

### Canvas

- Default background: `#fff` (light)
- **D** toggles to dark: `#000`
- Dark mode remains a working lens for checking color against black canvas.

---

## Persistence

Two layers. No backend. No accounts.

### Local (your working board)

The canvas auto-saves board metadata and non-image object state to **localStorage** continuously (debounced, 300ms). Reference image blobs are stored in **IndexedDB** and restored into the board as object URLs. Close the tab, close the browser, come back tomorrow — board objects and reference images should be where you left them unless browser storage is unavailable or evicted.

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

**Ramp generation:** Current implementation uses `brand-exact-fair`: v6 first solves a seed-constrained OKLab path with exact seed placement, perceptual density scoring, curvature/hue stability pressure, and corpus-conditioned soft priors; the app-facing fairing pass then rebalances the visible stops by adjacent OKLab distance around the exact seed. The 11-stop labels keep design-system meaning, but semantic roles are soft: `50` is the lightest ramp color, not a forced paper chip; `950` should remain colored ink rather than black. Clamp to gamut and generate a parallel dark mode variant.

**Harmonization:** For selected hues, measure angular distances and compare to harmonic targets (30/90/120/150/180). Pairs split the smallest needed adjustment unless one hue is locked. For 3+ hues, choose a spread-aware geometry, keep locked hues fixed, and use optimal cyclic assignment to minimize total displacement.

**Image extraction:** K-means++ in OKLCH space. Adaptive `k`. Gamut-relative intensity scoring. Peak real-pixel representatives. Neutral filtering. Source-marker metadata. Gentle image-relative chroma normalization rather than full purification.

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

- **Export menu** — Cmd+E, CSS / Tailwind / JSON / hex list formats in the browser UI. MCP export tooling exists.
- **Shareable URLs** — Cmd+L, lz-string compressed canvas state in URL hash
- **CSS copy shortcuts** — Cmd+C for CSS custom property, Cmd+Shift+C for full ramp block
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
