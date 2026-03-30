# Wassily

## Working Style

- **Always plan before implementing.** For any non-trivial feature or change, research the affected code, write out a plan, and get approval before writing code. Do not wing it. This applies to new features, refactors, bug fixes that touch multiple files, and any change to interaction behavior.

## Overview

A color moodboard that thinks in OKLCH. Collect colors from anywhere — paste hex values, drop photographs, right-click for serendipity. Every color is purified to its ideal expression. Promote colors into ramps when you're ready. Export production tokens. The canvas is the collection. The collection is the tool.

See [docs/PRD.md](docs/PRD.md) for full product spec.

## Stack

- Vite + React 19 + TypeScript
- `culori` for color science (OKLCH conversions, gamut mapping via `clampChroma`/`displayable`)
- `@fontsource/ibm-plex-mono` (400 weight, 9px)
- CSS transforms for spatial canvas camera
- DOM rendering for all objects
- localStorage for persistence (reference images excluded — too large)
- No backend — pure client-side static site

## Commands

- `npm run dev` — start dev server
- `npm run build` — production build
- `npm run preview` — preview production build

## Deploy

- GitHub Pages via GitHub Actions (`.github/workflows/deploy.yml`)
- Auto-deploys on push to `main`
- Vite `base: "/wassily/"` for GitHub Pages path
- Live at https://seanhlee.github.io/wassily/

## Architecture

- `src/engine/` — color science (purification, ramp generation v2, harmonization, image extraction, gamut mapping)
- `src/canvas/` — spatial canvas (camera, pan/zoom, coordinate system, object placement)
- `src/components/` — React UI (swatches, ramp strips, reference images, context menus, harmonize feedback overlay)
- `src/state/` — canvas state management (useReducer + undo history), localStorage persistence
- `src/types/` — TypeScript types

## Canvas Objects

1. **Swatch** — single purified color (the atomic unit)
2. **Ramp** — linked strip of colors generated from a swatch (promoted via R key)
3. **Reference Image** — dropped/pasted photograph for color extraction (session-only, not persisted)
4. **Connection** — curved bezier line between swatches/ramps showing contrast ratio, hue distance, and deltaE on hover. L to create (chain-connects 2+ selected), L to toggle visibility, Delete to remove.

## Key Concepts

- **Color as primitive** — right-click = swatch. R = promote to ramp. Ramp is derived, not default. Click on empty space ONLY deselects.
- **Purification** — every color that enters is maximized to peak chroma at its hue. Neutrals (C < 0.05) bypass purification.
- **Ramp engine v2** — easing curves + gamut-relative chroma. No bell curves or lookup tables. The gamut boundary IS the shape.
  - Lightness: easeInQuad from 0.98 to 0.25
  - Chroma: flat 92% of gamut max, scaled by seedIntensity
  - Hue drift: target-based toward amber (H~55), easeInCubic for darks, with hue-dependent intensity
  - seedIntensity: calibrates the whole ramp based on how vivid the seed is relative to gamut max
- **Always vivid display** — ramps show `stop.color` (vivid) in the tool. Dark variants (`stop.darkColor`) are for export only.
- **Harmonization** — select 2+ objects, press H, hues snap to nearest harmonic geometry. Feedback: relationship name centered on screen for 1.2s.
- **Image extraction** — drop/paste an image, get 3-7 adaptive dominant colors in OKLCH space. Neutrals (C < 0.04) are NOT purified — grays stay gray.
- **Hover-only labels** — ramp names/values hidden until hover. Swatch hex is only visible in edit mode (context menu for quick copy).
- **Light mode default** — canvas starts white (#fff). D toggles between light and dark (#000).
- **Persistence** — localStorage (auto-save, debounced). Reference images are session-only.

## Design

- IBM Plex Mono 400, 9px everywhere
- Labels: uppercase, letter-spacing -0.55px (ramp names) or 0.5px (context menu, LCH labels)
- Values: hex uppercase (#0059E9), CSS functions lowercase (oklch(...))
- No rounded corners anywhere — all sharp edges
- Canvas bg: #fff light default, #000 dark toggle
- Context menu: #000 bg, 9px uppercase, edge-aware positioning
- The color is always the loudest thing on screen

## Selection Chrome

- **Corner brackets** — SVG L-shaped corners at each corner of selected objects (swatches, ramps, ref images). Replaces CSS outline. Constants in `SEL` object: gap 4px, arm 8px, stroke 0.75px.
- **Lock icon** — small padlock SVG at lower-right of swatch/ramp when hue-locked (K key). Color adapts to swatch lightness (dark icon on light colors, light icon on dark colors).
- **No hover labels** — hex value removed from hover/select display. Available via context menu or edit mode.

## Edit Mode

Double-click a selected swatch to enter edit mode. Two-column layout:

- **Left column**: swatch with selection brackets + "HEX" label + click-to-edit hex value (accepts hex, oklch, rgb, named colors via `parseColor`)
- **Right column**: 216×216 SL color field (Okhsl space) + 16px hue strip with filled triangle marker + labeled LCH controls (HUE, CHROMA, LIGHTNESS)
- **Field indicator**: bracket crosshair in the color field (gap 4px, arm 8px, mix-blend-mode difference)
- **Hue triangle**: filled triangle pointing left, sits against strip right edge, color adapts to canvas mode
- **LCH controls**: drag-to-scrub on channel letter, click-to-edit on value. Order: HUE, CHROMA, LIGHTNESS with full uppercase labels above values.
- Layout constants: `FIELD_SIZE=216`, `FIELD_LEFT=64`, `FIELD_TOP=0` (top-aligned), `HUE_STRIP_W=16`

## Eyedropper

- **I** (hold) = eyedropper mode. Select a swatch, hold I, hover over a reference image — swatch color updates live. Click to commit, release I to cancel.
- Sampled color used as-is (no purification) — user is picking a specific color from a photo.
- Offscreen canvases primed eagerly at image load time (no async race on keypress).
- Undo works: `snapshot()` before commit, `UPDATE_SWATCH_COLOR` is in `SKIP_HISTORY` so previews are free.
- `pointerEvents: "none"` on ref-image-node during eyedropper to bypass `useDrag`'s `stopPropagation`.

## Copy Shortcuts

- **C** = hex value
- **O** = oklch value
- No toast notifications (removed)

## Pan & Zoom

- Two-finger trackpad scroll = pan
- Ctrl/Cmd+scroll (pinch) = zoom
- Space+drag = pan
- No middle-click (no mouse assumed)

## Neutral Swatches

Created via right-click context menu:
- Warm neutral: H:60, C:0.015
- Cool neutral: H:250, C:0.015
- Pure neutral: C:0

## Known Tech Debt

- **darkMode naming is backwards**: `darkMode: true` in state means the canvas is LIGHT (white background, the default). `darkMode: false` means DARK (black). The flag should be renamed to something like `lightCanvas` or the logic inverted.
- ~~**Hue rotation removed**~~: Scroll-on-swatch hue rotation code removed. Will return with spectral ghost controls (JIT UI — faint arc during gesture).
- ~~**genId counter resets on reload**~~: Fixed — `nextId` is now seeded from persisted objects in the `useReducer` initializer.
