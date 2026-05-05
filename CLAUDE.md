# Wassily

## Working Style

- **Always plan before implementing.** For any non-trivial feature or change, research the affected code, write out a plan, and get approval before writing code. Do not wing it. This applies to new features, refactors, bug fixes that touch multiple files, and any change to interaction behavior.

## Overview

A color moodboard that thinks in OKLCH. Collect colors from anywhere — paste hex values, drop photographs, right-click for serendipity. Every color is purified to its ideal expression. Promote colors into ramps when you're ready. Export production tokens through MCP tooling; browser export UI is still planned. The canvas is the collection. The collection is the tool.

See [docs/PRD.md](docs/PRD.md) for full product spec.

## Stack

- Vite + React 19 + TypeScript
- `culori` for color science (OKLCH conversions, gamut mapping via `clampChroma`/`displayable`)
- `@fontsource/ibm-plex-mono` (400 weight, 11px)
- CSS transforms for spatial canvas camera
- DOM rendering for all objects
- localStorage for board/canvas metadata + IndexedDB for reference image blobs
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

- `src/engine/` — color science (purification, brand-exact ramp fairing, v6 semantic base solver, harmonization, image extraction, gamut mapping)
- `src/canvas/` — spatial canvas (camera, pan/zoom, coordinate system, object placement)
- `src/components/` — React UI (swatches, ramp strips, reference images, context menus, harmonize feedback overlay, board bar)
- `src/state/` — canvas state management (useReducer + undo history), board persistence, MCP bridge hook
- `src/hooks/` — shared React hooks (useDrag, usePasteAndDrop) and canvas utilities (eyedropper sampling)
- `src/types/` — TypeScript types (shared between browser and Node MCP process)
- `mcp/` — MCP server (25 tools: 8 pure engine, 5 board management, 12 canvas writes)
- `src/vite-plugin-mcp-bridge.ts` — Vite dev server middleware for MCP bridge

## Canvas Objects

1. **Swatch** — single purified color (the atomic unit)
2. **Ramp** — linked strip of colors generated from a swatch (promoted via R key)
3. **Reference Image** — dropped/pasted photograph for color extraction. Metadata persists in localStorage; blob data persists in IndexedDB and is restored as object URLs.
4. **Connection** — curved bezier line between swatches/ramps showing contrast ratio, hue distance, and deltaE on hover. L to create (chain-connects 2+ selected), L to toggle visibility, Delete to remove.

## Key Concepts

- **Color as primitive** — right-click = swatch. R = promote to ramp. Ramp is derived, not default. Click on empty space ONLY deselects.
- **Purification** — every color that enters is maximized to peak chroma at its hue. Neutrals (C < `NEUTRAL_CHROMA` = 0.05 from `gamut.ts`) bypass purification. Exception: image extraction uses normalize-to-peak instead of max purification (see below).
- **Ramp engine** — app-facing `opinionated` ramps use `brand-exact-fair`, which starts from the v6 seed-constrained OKLab path solver and then math-fairs the final visible ramp around the exact seed.
  - Exact seed placement is a hard constraint. The nearest semantic stop is replaced with the exact seed color.
  - v6 optimizes perceptual path density, curvature, hue stability, seed exit geometry, and corpus-conditioned soft priors before sampling stops.
  - The fairing pass can shift the exact seed to a nearby better label, prioritizes adjacent OKLab evenness at `50 -> 100 -> 200`, and opens the `900 -> 950` tail when v6 collapses the darks.
  - The 11-stop labels remain semantic names, but math wins over forcing a role: `50` may read as paper when the ramp geometry allows it, and `950` should be colored ink rather than black.
  - Chromatic endpoints are family-aware. Bright lime uses cusp handling, cyan/phthalo keep high tint occupancy, blue-violet gets a deeper but still chromatic ink tail, and neutrals use quiet paper/ink envelopes.
  - The broad visual stress board is `npm run research:gauntlet`; the focused side-by-side lab is `npm run research:lab`.
  - Important: brand-exact fairing is the locked app-facing algorithm for this ship, but ramp quality should still be judged visually; v6 remains the base research scaffold.
- **Always vivid display** — ramps show `stop.color` (vivid) in the tool. Dark variants (`stop.darkColor`) are for export only.
- **Harmonization** — select 2+ objects, press H, hues snap to nearest harmonic geometry. Feedback overlay: "RELATIONSHIP · ANGLE" centered on screen for 1.2s (via `HarmonizeLabel.tsx`). Press H again to cycle: 2 objects cycle relationship types (analogous→triadic→complementary...), 3+ objects rotate the harmonic frame. Cycling replaces the previous strip (no accumulation). Already-harmonized colors show "ALREADY X" feedback. Uses optimal cyclic assignment with locked-hue pre-assignment for 3+ objects.
- **Image extraction** — drop/paste an image to add a reference image, then right-click the image and choose `Extract colors`. Extraction returns adaptive dominant colors in OKLCH space and stores source markers on the image. Marker dragging samples source-exact pixels and updates linked swatches without purification. K-means in OKLCH uses gamut-relative scoring, boosted hue separation, peak-chroma representatives, normalize-to-peak chroma scaling, and distinctiveness culling. Neutrals pass through unchanged.
- **Hover-only labels** — ramp names/values hidden until hover. Swatch hex is only visible in edit mode (context menu for quick copy).
- **Light mode default** — canvas starts white (#fff). D toggles between light and dark (#000).
- **Persistence** — localStorage for board/canvas metadata (auto-save, debounced) and IndexedDB for reference image blobs. `saveBoardState` strips `dataUrl`; `RESTORE_IMAGE_URLS` patches object URLs after blob load. Blob cleanup is cross-board-aware.
- **Boards** — named, switchable documents. Each board has its own `CanvasState` stored at `localStorage('wassily-board-{id}')`. Board list at `wassily-boards`, active board at `wassily-active-board`. Legacy `wassily-canvas` key auto-migrated to an "Untitled" board on first load.
- **MCP Bridge** — dev-only Vite middleware (`/__mcp__/*`) that enables the MCP tools to read/write the live canvas. The React hook (`useMcpBridge`) connects via SSE, receives dispatched actions, applies them via `applyExternalActions`, and posts results back. State is synced to the middleware cache on connect, after bridge operations (immediate), and on local changes (debounced 300ms).

## Design

- IBM Plex Mono 400, 11px everywhere
- Labels: uppercase, letter-spacing -0.55px (ramp names) or 0.5px (context menu, LCH labels)
- Values: hex uppercase (#0059E9), CSS functions lowercase (oklch(...))
- No rounded corners anywhere — all sharp edges
- Canvas bg: #fff light default, #000 dark toggle
- Context menu: adaptive bg (light on light canvas, dark on dark canvas), 11px uppercase, edge-aware positioning
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

## Boards

- **Board** = a named, persistent document. Each board holds an independent `CanvasState`.
- Storage: `wassily-boards` (BoardMeta[]), `wassily-active-board` (ID), `wassily-board-{id}` (CanvasState per board).
- `src/state/boardStore.ts` — pure persistence functions (no React). Handles migration from legacy `wassily-canvas`.
- `src/state/useBoardManager.ts` — React hook for create/switch/delete/rename/duplicate.
- `src/components/BoardBar.tsx` — minimal board switcher UI (top-left corner, dropdown).
- Board switching dispatches `LOAD_BOARD` which replaces state and clears undo/redo history.
- `cleanOrphanedBlobs` uses `collectAllImageIds()` across ALL boards to prevent cross-board image deletion.
- Rooms, branches, and variants are deferred — boards are the document layer only.

## MCP Bridge (Dev Only)

The MCP server can read and write the live canvas via a Vite dev server middleware bridge.

```
Claude ←(stdio)→ MCP Server ──(HTTP fetch)──→ Vite Dev Server ←(SSE)→ Browser
                  25 tools        /__mcp__/*       middleware       useMcpBridge
```

- `src/vite-plugin-mcp-bridge.ts` — Vite plugin adding `/__mcp__/*` endpoints. Sessions scoped by `clientId`. Dispatch holds HTTP response open, pushes action via SSE, waits for browser result (10s timeout). Client disambiguation: 1 tab = auto-resolve, 2+ tabs = error.
- `src/state/mcpBridge.ts` — React hook connecting via `EventSource`. Handles `dispatch` (canvas actions) and `board-op` (board management) messages. Posts results back. Dev-only (`import.meta.env.DEV`).
- `applyExternalActions` — simulates actions through the pure reducer to compute created/deleted diff, then dispatches for real with `SNAPSHOT` for undo. Saves/restores `nextId` to prevent genId divergence between simulation and dispatch.
- MCP tools use `WASSILY_DEV_URL` env var (default `http://localhost:5173`) to reach the Vite server.
- Selection-free actions (`DELETE_OBJECTS`, `CONNECT_OBJECTS`, `SET_LOCK`) prevent MCP tools from clobbering user selection.
- External IDs (`id?` on `CREATE_SWATCH`, `CREATE_SWATCHES`, `newId?` on `HARMONIZE_SELECTED`) let MCP tools pre-generate UUIDs for reliable dispatch-to-result correlation.

### MCP Tools (25 total)

**Pure engine (8):** purify_color, parse_color, generate_ramp, check_contrast, harmonize, read_canvas, export_palette, audit_accessibility

**Board management (5):** list_boards, create_board, switch_board, delete_board, rename_board

**Canvas writes (12):** create_swatch, create_swatches, delete_objects, update_swatch_color, promote_to_ramp, set_stop_count, rename_ramp, harmonize_objects, create_connections, move_object, toggle_dark_mode, set_lock

### Known Bridge Limitations

- Double undo: each MCP tool call creates SNAPSHOT + action = 2 undo entries (one extra Cmd+Z per operation).
- `WASSILY_DEV_URL` defaults to port 5173; if Vite starts on another port, tools fail.
- JSON.parse errors in Vite middleware hang instead of returning 400.

## Known Tech Debt

- ~~**darkMode naming is backwards**~~: Fixed — renamed to `lightMode` (`true` = light canvas). Old persisted `darkMode` key auto-migrated on load.
- ~~**Hue rotation removed**~~: Scroll-on-swatch hue rotation code removed. Will return with spectral ghost controls (JIT UI — faint arc during gesture).
- ~~**genId counter resets on reload**~~: Fixed — `nextId` is now seeded from persisted objects in the `useReducer` initializer.

## Current Verification Caveats

As of 2026-05-05:

- `npm run build` passes, with a Vite chunk-size warning.
- `npm run test:run` passes.
- `npm run lint` passes.
