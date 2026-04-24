# Wassily

Wassily is a color exploration studio built around OKLCH. It combines moodboarding, palette extraction, ramp generation, harmonization, and export-ready color output inside a spatial canvas.

## What It Does

- Create purified swatches directly on the canvas.
- Drop or paste images and extract dominant colors.
- Promote swatches into ramps in `opinionated` or `pure` mode. Opinionated ramps use the v6 semantic solver: exact seed placement, perceptual OKLab cadence, family-aware tint/ink roles, and gamut-safe OKLCH output.
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
npm run research:lab
npm run research:gauntlet
```

## Project Shape

- `src/engine` — gamut math, purification, ramps, harmonization, extraction, contrast
- `src/engine/v6ResearchSolver.ts` — seed-constrained semantic ramp solver and tonal role envelope
- `src/canvas` — camera and spatial canvas behavior
- `src/components` — swatches, ramps, overlays, menus, board UI
- `src/state` — reducer-driven canvas state, persistence, and bridge hooks
- `src/hooks` — interaction helpers like paste/drop and eyedropper support
- `mcp` — MCP server/tooling for development-time canvas access
- `docs` — PRD, product arc, design research, research boards, and implementation notes

## Ramp Research

The current ramp direction is documented in `docs/ramp-research-v5.md`. The working solver is v6: it solves a seed-constrained OKLab path, then applies semantic tonal roles for the Tailwind-style 50/100/200/.../950 ladder.

- `npm run research:lab` builds the focused side-by-side lab at `docs/generated/research-lab.html`.
- `npm run research:gauntlet` builds the broader stress matrix at `docs/generated/research-gauntlet.html`.
- The current gauntlet covers neutrals, warm hues, greens, cool hues, and perturbations around hard cases such as bright lime, cyan, phthalo green, and ultramarine.

## Notes

Some files in this repo are intentionally development-oriented, especially around the MCP bridge. `npm run deadcode` is useful for pruning obvious leftovers, but a couple of low-frequency entrypoints may still be intentional even if static analysis cannot trace them from the main browser app.

For deeper product context, start with `CLAUDE.md` and the documents in `docs/`.
