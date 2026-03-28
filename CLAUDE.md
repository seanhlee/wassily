# Wassily

## Overview

A color moodboard that thinks in OKLCH. Collect colors from anywhere — paste hex values, drop photographs, click for serendipity. Every color is purified to its ideal expression. Promote colors into ramps when you're ready. Export production tokens. The canvas is the collection. The collection is the tool.

See [docs/PRD.md](docs/PRD.md) for full product spec.

## Stack

- Vite + React 19 + TypeScript
- `culori` for color science (OKLCH conversions, gamut mapping, deltaE)
- `@use-gesture` for pan/zoom/drag gestures
- `lz-string` for URL state compression
- IBM Plex Mono (400 weight, 11px)
- CSS transforms for spatial canvas camera
- DOM rendering for all objects
- localStorage for persistence, URL hash for sharing
- No backend — pure client-side static site

## Commands

- `npm run dev` — start dev server
- `npm run build` — production build
- `npm run preview` — preview production build

## Architecture

- `src/engine/` — color science (purification, ramp generation, harmonization, image extraction, gamut mapping)
- `src/canvas/` — spatial canvas (camera, pan/zoom, coordinate system, object placement)
- `src/components/` — React UI (swatches, ramp strips, connections, reference images, toasts, context menus)
- `src/hooks/` — React hooks (clipboard, keyboard shortcuts, localStorage persistence, gestures)
- `src/state/` — canvas state management, undo history, URL serialization
- `src/types/` — TypeScript types

## Canvas Objects

1. **Swatch** — single purified color (the atomic unit)
2. **Ramp** — linked strip of colors generated from a swatch (promoted via R key)
3. **Connection** — relationship line between two swatches (contrast ratio, hue distance, deltaE)
4. **Reference Image** — dropped photograph/screenshot for color extraction (session-only, not in shared URLs)

## Key Concepts

- **Color as primitive** — click = swatch. R = promote to ramp. Ramp is derived, not default.
- **Purification** — every color that enters is maximized to peak chroma at its hue. The true note.
- **Opinions** — chroma contouring, warm shadow drift, cool highlight lift, non-linear lightness. Hold M to compare against pure math.
- **Harmonization** — select 2+ objects, press H, hues snap to nearest harmonic geometry
- **Image extraction** — drop an image, get 3-7 adaptive dominant colors in OKLCH space
- **Two zoom levels** — overview (pure color) and detail (values fade in). Smooth crossfade.
- **WCAG AA** — swatch dots + connection lines double as contrast checks. No dashboard.
- **Dark mode** — D toggles. Second generated ramp, not a remapping.
- **Persistence** — localStorage (your working board) + URL hash (shareable snapshots)

## Design

- IBM Plex Mono 400, 11px everywhere
- Labels: uppercase, letter-spacing -0.55px
- Values: normal case. Hex uppercase (#0059E9). CSS functions lowercase (oklch(...)).
- Canvas bg: oklch(0.13 0 0) dark default, oklch(0.98 0 0) light toggle
- The color is always the loudest thing on screen
