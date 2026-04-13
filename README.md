# Wassily

Wassily is a color exploration studio built around OKLCH. It combines moodboarding, palette extraction, ramp generation, harmonization, and export-ready color output inside a spatial canvas.

## What It Does

- Create purified swatches directly on the canvas.
- Drop or paste images and extract dominant colors.
- Promote swatches into ramps in `opinionated` or `pure` mode.
- Harmonize selected colors into useful geometric relationships.
- Compare contrast and relationships visually.
- Organize work into named boards.
- Export palette structure for implementation workflows.

## Stack

- React 19
- TypeScript
- Vite
- `culori` for color science
- localStorage + IndexedDB persistence
- optional MCP tooling for development-time canvas access

## Commands

```bash
npm run dev
npm run build
npm run test:run
npm run lint
npm run deadcode
```

## Project Shape

- `src/engine` — gamut math, purification, ramps, harmonization, extraction, contrast
- `src/canvas` — camera and spatial canvas behavior
- `src/components` — swatches, ramps, overlays, menus, board UI
- `src/state` — reducer-driven canvas state, persistence, and bridge hooks
- `src/hooks` — interaction helpers like paste/drop and eyedropper support
- `mcp` — MCP server/tooling for development-time canvas access
- `docs` — PRD, product arc, design research, and implementation notes

## Notes

Some files in this repo are intentionally development-oriented, especially around the MCP bridge. `npm run deadcode` is useful for pruning obvious leftovers, but a couple of low-frequency entrypoints may still be intentional even if static analysis cannot trace them from the main browser app.

For deeper product context, start with `CLAUDE.md` and the documents in `docs/`.
