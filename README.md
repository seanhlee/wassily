# Wassily

Wassily is a color exploration studio built around OKLCH. It combines moodboarding, steerable palette extraction, ramp research, harmonization, contrast inspection, boards, and export-oriented color output inside a spatial canvas.

## What It Does

- Create purified swatches directly on the canvas.
- Drop or paste reference images, then extract dominant colors on demand.
- Edit extracted palettes with image-relative source markers and a pixel loupe.
- Promote swatches into ramps in `opinionated` or `pure` mode. Opinionated ramps now use a math-first brand-exact fairing pass on top of the v6 semantic solver: exact seed placement, even OKLab cadence, opened dark tails, and gamut-safe OKLCH output.
- Harmonize selected colors into useful geometric relationships.
- Compare contrast and relationships visually.
- Organize work into named boards with local persistence.
- Export ramp tokens through MCP tooling; browser export UI is still planned.

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
npm run research:family-board
npm run research:extraction
```

## Project Shape

- `src/engine` — gamut math, purification, ramps, harmonization, extraction, contrast
- `src/engine/v6ResearchSolver.ts` — seed-constrained semantic ramp solver and tonal role envelope
- `src/engine/brandExactFairingSolver.ts` — app-facing opinionated ramp fairing pass on top of v6
- `src/canvas` — camera and spatial canvas behavior
- `src/components` — swatches, ramps, overlays, menus, board UI
- `src/state` — reducer-driven canvas state, persistence, and bridge hooks
- `src/hooks` — interaction helpers like paste/drop and eyedropper support
- `mcp` — MCP server/tooling for development-time canvas access
- `docs` — PRD, product arc, design research, research boards, and implementation notes

## Ramp Research

The current ramp research direction is documented in `docs/ramp-research-v5.md`, with the P3/sRGB product contract in `docs/ramp-gamut-contract.md` and near-term product specs in `docs/productization-directional-specs.md`. The app-facing opinionated solver is `brand-exact-fair`: it starts from v6's seed-constrained semantic path, then fairs the final visible ramp around the exact seed with adjacent OKLab distance as the primary truth.

Important: the fairing pass is the locked app-facing algorithm for this ship, not a declaration that ramp research is over. Treat v6 as the base research scaffold and keep judging output quality visually.

Default ramps use the dual gamut contract: Display P3 is the canonical visible
solve, while sRGB is an explicit fallback for hex and compatibility exports.

- `npm run research:lab` builds the focused side-by-side lab at `docs/generated/research-lab.html`.
- `npm run research:gauntlet` builds the broader stress matrix at `docs/generated/research-gauntlet.html`.
- `npm run research:family-board` builds the corpus/profile inspection board.
- `npm run research:extraction` builds the extraction fixture board.
- The current gauntlet covers neutrals, warm hues, greens, cool hues, and perturbations around hard cases such as bright lime, cyan, phthalo green, and ultramarine.

## Notes

Some files in this repo are intentionally development-oriented, especially around the MCP bridge and research generators. `npm run deadcode` is useful for pruning obvious leftovers, but several low-frequency entrypoints are intentional even if static analysis cannot trace them from the main browser app.

For deeper product context, start with `CLAUDE.md` and the documents in `docs/`.
