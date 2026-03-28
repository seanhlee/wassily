# Wassily

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
4. **Connection** — relationship line between swatches (designed, NOT YET BUILT)

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
- **Hover-only labels** — all text/values hidden until hover. No zoom-level-based display.
- **Dark mode** — D toggles canvas between #000 (default) and #fff.
- **Persistence** — localStorage (auto-save, debounced). Reference images are session-only.

## Design

- IBM Plex Mono 400, 9px everywhere
- Labels: uppercase, letter-spacing -0.55px (ramp names) or 0.5px (context menu)
- Values: hex uppercase (#0059E9), CSS functions lowercase (oklch(...))
- No rounded corners anywhere — all sharp edges
- Canvas bg: #000 dark default, #fff light toggle
- Context menu: #000 bg, 9px uppercase, edge-aware positioning
- The color is always the loudest thing on screen

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

- **darkMode naming is backwards**: `darkMode: true` in state means the canvas is LIGHT (white background). `darkMode: false` means DARK (black, the default). The flag should be renamed to something like `lightCanvas` or the logic inverted.
- **Toast component exists but is unused**: `ToastContainer` is mounted in `main.tsx` but `showToast` is never called from copy shortcuts. Can be removed or repurposed.
- **Hue rotation removed**: Scroll-on-swatch hue rotation was removed as too accidental. Will return with spectral ghost controls (JIT UI — faint arc during gesture).
