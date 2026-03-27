# Wassily — OKLCH Color Ramp Generator

## Overview

A minimal, opinionated OKLCH color ramp generator. Click a blank canvas, get beautiful color ramps. See [docs/PRD.md](docs/PRD.md) for full product spec.

## Stack

- Vite + React 19 + TypeScript
- `culori` for color science (OKLCH conversions, gamut mapping, deltaE)
- No backend — pure client-side static site

## Commands

- `npm run dev` — start dev server
- `npm run build` — production build
- `npm run preview` — preview production build

## Architecture

- `src/engine/` — color generation logic (ramp algorithms, gamut mapping, opinions)
- `src/components/` — React UI components (swatches, ramp strips, canvas)
- `src/hooks/` — React hooks (clipboard, keyboard shortcuts, URL state)
- `src/types/` — TypeScript types

## Key Principles

- The ramp IS the interface — no panels, no dashboards
- Opinions (chroma contouring, warm shadows, cool highlights) are defaults, not options
- All generated colors must be in-gamut for sRGB
- WCAG AA compliance is shown inline via swatch dots, not a separate audit view
- State lives in the URL hash — shareable, bookmarkable, no backend
