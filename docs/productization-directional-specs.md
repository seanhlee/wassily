# Productization Directional Specs

Status: directional planning memo, 2026-05-10.

This memo turns the current post-P3 roadmap into concise specs the team can
pick up in future sessions. It is intentionally directional: each section says
what to build, why it matters, where to look in the repo, and what "good enough
for v1" means.

Start with:

- [ramp-gamut-contract.md](./ramp-gamut-contract.md)
- [semantic-ramp-grammar.md](./semantic-ramp-grammar.md)
- [oklch-ramp-research-scratchpad.md](./oklch-ramp-research-scratchpad.md)
- [generated/tailwind-v4-comparison.html](./generated/tailwind-v4-comparison.html)
- [generated/ramp-geometry-lens-mockup.html](./generated/ramp-geometry-lens-mockup.html)

## Prioritization

Recommended order:

1. Ramp Inspector / Export Panel
2. Gamut / Fallback Preview
3. Ramp Geometry Lens / Color Lab
4. Save / Share / Use Workflow
5. Regression / Quality Harness
6. Extraction Provenance
7. Solver Performance

The principle: make the ramp breakthrough visible and usable before deepening
adjacent systems. Extraction is valuable, but the current product gap is that
Wassily's strongest idea is mostly hidden inside the engine and docs.

## 1. Ramp Inspector / Export Panel

Status: shipped v1 on 2026-05-11. Keep this section as the contract and
polish checklist for follow-up iterations.

### Direction

Build a focused export lens for ramps that explains and copies what Wassily
solved. It should be launched intentionally from the ramp context menu, not from
plain selection.

The panel should make the contract legible:

```text
canonical OKLCH / P3 truth
sRGB fallback hex
seed exactness
target gamut
copy/export commands
```

### Why

The engine now has a distinctive value proposition, but the canvas still makes
users infer too much. The inspector is where Wassily can say, plainly: "this is
the real color, this is the fallback, and this is how exact the seed is."

### V1 Scope

- Stop table:
  - label
  - OKLCH
  - hex
  - light/dark variant toggle
- Copy actions:
  - OKLCH list
  - hex list
  - Tailwind v4 `@theme`
  - CSS custom properties
  - JSON token-ish output
- Optional info:
  - mode
  - stop count
  - target gamut
  - exactness
  - seed label
  - source / target / fallback seed deltas

### Non-Goals

- No full design-token management system.
- No cloud persistence.
- No complex theming UI.
- No editing every stop manually in v1.

### Repo Context

Look first:

- `src/types/index.ts` for `Ramp`, `RampStop`, `RampSolveMetadata`
- `src/engine/ramp.ts` for `solveRamp`
- `src/engine/rampContract.ts` for exactness metadata
- `src/engine/gamut.ts` for `toCssColor`, `toOklchString`, `toHex`
- `src/components/RampNode.tsx` for current ramp rendering
- `src/components/ContextMenu.tsx` for current copy actions
- `src/canvas/Canvas.tsx` for selected object context and shortcuts
- `mcp/tools.ts` for existing export formats

Likely new file:

- `src/components/RampInspector.tsx`

### Acceptance Signals

- Plain ramp selection stays quiet.
- Ramp context menu exposes an `Export` action.
- The export panel exposes OKLCH and hex side by side.
- Hex remains the fallback/export format, never canonical truth.
- Copy output agrees with MCP export behavior.
- Old ramps without metadata degrade gracefully.

## 2. Gamut / Fallback Preview

### Direction

Let users compare the canonical P3 ramp against the sRGB fallback.

This should feel like an audit lens, not a scary warning system.

### Why

P3 is the truth, but real-world output still needs sRGB. Showing both builds
trust and makes Wassily's contract tangible.

### V1 Scope

- Add a preview mode or inspector toggle:
  - `P3`
  - `sRGB fallback`
  - optional `delta` indicators
- For each stop, show whether canonical color is outside sRGB.
- Show a concise ramp-level summary:
  - number of stops outside sRGB
  - max fallback delta
  - seed fallback delta

### Non-Goals

- No simulated color-management engine.
- No monitor calibration claims.
- No accessibility audit replacement.

### Repo Context

Look first:

- `docs/ramp-gamut-contract.md`
- `src/engine/gamut.ts`
- `src/engine/rampContract.ts`
- `src/components/RampNode.tsx`
- `src/components/SwatchNode.tsx`
- `src/components/ContextMenu.tsx`
- `src/state/canvas.ts`

Useful existing data:

- `Ramp.fallbackStops`
- `Ramp.solveMetadata.seedDelta.fallback`
- `Ramp.solveMetadata.fallbackGamut`
- `isInGamut(color)`

### Acceptance Signals

- A P3-only-looking ramp can be viewed as its sRGB fallback.
- The seed/fallback difference is explicitly named.
- The preview does not mutate canonical ramp state.
- Copy/export behavior stays consistent with the selected export type.

## 3. Ramp Geometry Lens / Color Lab

### Direction

Build a visual lens that shows the ramp as geometry: a path through OKLCH /
OKLab space, anchored by the seed, constrained by the target gamut, and paired
with its sRGB fallback projection.

The first version should be a read-mostly diagnostic surface. Later, it can grow
into an expert playground, but normal edits must always route back through the
solver.

### Why

The current ramp breakthrough is hard to feel from swatches alone. A geometry
view can show why a ramp works: where lightness stays ordered, where chroma
shelves, where hue drifts, where the seed anchors, where fallback compression
appears, and why a light stop feels clean or muddy.

This is also a product differentiator. Many OKLCH tools expose raw channels or
math controls. Wassily should translate geometry into understandable color
intent.

### UX Contract

Default mode is not freeform point editing. Once a ramp exists, ordinary edits
preserve perceptual coherence unless the user explicitly enters an expert/manual
mode.

Normal controls should be semantic handles:

```text
cleaner lights
more mid punch
inkier tail
warmer/cooler shoulder
family travel
less fallback loss
```

Each handle should update solver intent, then re-solve or re-fair the ramp while
protecting:

- ordered lightness
- seed exactness
- target gamut contract
- sRGB fallback metadata
- smooth adjacent OKLab distance
- no accidental hue kinks
- no isolated muddy/neon outliers

### V1 Scope

- Add a selected-ramp geometry view or modal/lens:
  - projected OKLCH/OKLab ramp path
  - stop markers with selected-stop detail
  - seed anchor label
  - target gamut shell or boundary hint
  - sRGB fallback path/projection
  - bottom stop strip for grounding
- Add curve readouts:
  - lightness progression
  - chroma progression
  - hue travel
  - adjacent OKLab distance / cadence
- Add diagnostic badges:
  - outside-sRGB stop count
  - max fallback delta
  - seed target/fallback deltas
  - perceptual spacing health
- Include a small set of non-destructive intent handles. In v1 these can preview
  proposed solver parameters before committing.

### Expert Lab Later

The chaotic version can be fun and valuable, but it should be explicitly framed
as a lab.

Possible lab capabilities:

- drag curve handles
- pin individual stops
- rotate or travel a palette family
- overdrive chroma for exploration
- compare raw edit against solver-repaired ramp
- resolve the sketch into a coherent production ramp

The bridge matters: the lab may allow weird exploration, but the primary product
promise is still "resolve into a usable ramp."

### Non-Goals

- No raw 3D color editor as the default workflow.
- No direct mutation of canonical stops without solve metadata.
- No manual override that silently breaks seed exactness or fallback semantics.
- No requirement to teach OKLab math before the feature is useful.

### Repo Context

Look first:

- `docs/generated/ramp-geometry-lens-mockup.html`
- `docs/ramp-gamut-contract.md`
- `docs/semantic-ramp-grammar.md`
- `src/types/index.ts`
- `src/engine/ramp.ts`
- `src/engine/brandExactFairingSolver.ts`
- `src/engine/rampContract.ts`
- `src/engine/gamut.ts`
- `src/components/RampNode.tsx`
- `src/canvas/Canvas.tsx`

Likely new files:

- `src/components/RampGeometryLens.tsx`
- `src/engine/rampGeometry.ts`
- `src/engine/rampIntent.ts`

### Acceptance Signals

- A non-technical user can see why a ramp feels clean, muddy, vivid, or inky.
- The seed anchor is visible and remains exact through normal edits.
- P3 and sRGB fallback behavior are visible without changing ramp state.
- Every committed normal edit still passes ramp contract checks.
- Expert/lab edits are clearly marked and can be resolved back into a coherent
  ramp.

## 4. Save / Share / Use Workflow

### Direction

Make it easy to take a finished ramp out of Wassily and into production.

This is less about new color science and more about reducing the final mile
from "beautiful board" to "usable system."

### V1 Scope

- Browser UI export for selected ramps or all ramps:
  - Tailwind v4 `@theme`
  - CSS custom properties
  - JSON tokens
  - sRGB hex list
  - canonical OKLCH list
- Export should include light and dark variants where appropriate.
- Export should preserve ramp names and stop labels.
- Export should clearly mark canonical vs fallback formats.

### Non-Goals

- No hosted share links in v1.
- No account system.
- No package publishing.
- No bidirectional sync with Figma or design-token platforms.

### Repo Context

Look first:

- `mcp/tools.ts` for existing export format logic
- `src/components/ContextMenu.tsx` for current copy affordances
- `src/canvas/Canvas.tsx` for selection and keyboard actions
- `src/state/boardStore.ts` for local board persistence
- `src/state/canvas.ts` for ramp state shape
- `src/types/index.ts` for board/ramp types

Likely extraction target:

- pull shared export helpers out of `mcp/tools.ts` into an engine or export
  module so MCP and browser UI do not drift.

### Acceptance Signals

- A non-technical user can copy Tailwind/CSS output without touching MCP.
- Browser export and MCP export produce equivalent results.
- Export labels make gamut semantics clear.
- Generated output works when pasted into a basic app/style file.

## 5. Regression / Quality Harness

### Direction

Protect the current ramp quality as the product grows.

The goal is not to freeze every number. The goal is to catch muddy lights,
dead darks, broken exactness, bad family boundaries, and hidden sRGB regressions.

### V1 Scope

- Keep generated comparison boards current:
  - Tailwind v4 comparison
  - family profile board
  - research lab
- Add or maintain tests for:
  - seed exactness
  - P3/default `dual` behavior
  - sRGB fallback creation
  - family role assertions
  - export fallback semantics
- Create a short review checklist for visual board review.

### Non-Goals

- No pixel-perfect Tailwind copying.
- No full screenshot diffing requirement in v1.
- No permanent research solver performance rewrite just to speed tests.

### Repo Context

Look first:

- `scripts/generate-tailwind-comparison.ts`
- `scripts/generate-family-profile-board.ts`
- `scripts/generate-research-lab.ts`
- `src/engine/__tests__/engine.test.ts`
- `src/engine/__tests__/research.test.ts`
- `src/engine/__tests__/v6ResearchSolver.test.ts`
- `src/engine/__tests__/continuousCurveSolver.test.ts`
- `src/engine/research.ts`
- `src/engine/familyBoard.ts`

Current generated artifacts:

- `docs/generated/tailwind-v4-comparison.html`
- `docs/generated/family-profile-board.html`
- `docs/generated/research-lab.html`

### Acceptance Signals

- A future color change produces an updated visual board and focused tests.
- Reviewers know whether a change is contract work, family grammar work, or
  reference-DNA work.
- The suite catches hidden sRGB assumptions.
- Slow research tests remain reliable enough for CI.

## 6. Extraction Provenance

### Direction

Strengthen extraction metadata before strengthening extraction taste.

Do not rush into a new extraction algorithm. First, make the current extraction
pipeline honest about what each swatch represents.

### Why

Extraction is the front door to seeds. If the swatch has been sampled, lifted,
edited, or marker-resampled, future ramp behavior should be able to know that.

### V1 Scope

Track provenance for extracted swatches:

```text
raw sampled pixel
extracted/lifted color
source marker position
user marker edit
promoted ramp seed
```

Possible metadata:

- extraction source image id
- marker id
- raw sample OKLCH
- displayed swatch OKLCH
- chroma lift amount
- whether user edited/resampled the marker

### Non-Goals

- No full extraction rewrite.
- No masking or semantic segmentation.
- No P3 image pipeline claim until browser/canvas input support is understood.
- No automatic ramp generation from every extracted color in v1.

### Repo Context

Look first:

- `src/engine/extract.ts`
- `src/engine/__tests__/extract.test.ts`
- `docs/editable-extraction-markers.md`
- `src/components/RefImageNode.tsx`
- `src/components/ExtractionMarkerDot.tsx`
- `src/components/ExtractionLoupe.tsx`
- `src/hooks/useEyedropper.ts`
- `src/state/canvas.ts`
- `src/types/index.ts`

Current important distinction:

- extraction finds candidate seeds
- ramp generation grows seeds into systems
- the gamut contract governs how colors are interpreted and exported

### Acceptance Signals

- A selected extracted swatch can explain where it came from.
- Marker-resampling updates provenance, not just color.
- Promoting an extracted swatch to a ramp preserves the intended seed.
- Extraction docs distinguish raw source color from Wassily-enhanced swatch.

## 7. Solver Performance

### Direction

Keep the creative loop fast enough that the team can keep experimenting.

Performance work should be practical: cache where useful, separate app-facing
paths from research paths, and avoid making CI brittle.

### V1 Scope

- Identify expensive hot paths in app-facing ramp generation.
- Keep research-only solvers from affecting normal UI responsiveness.
- Cache or memoize repeated ramp solves when inputs are unchanged.
- Keep Vitest serial file execution if parallel worker reporting remains
  brittle for heavy research suites.
- Consider splitting research-heavy tests from fast app tests if CI time becomes
  painful.

### Non-Goals

- No premature rewrite of solver math.
- No Web Worker migration unless UI interaction becomes visibly blocked.
- No reducing visual quality just to make tests faster.

### Repo Context

Look first:

- `src/engine/ramp.ts`
- `src/engine/brandExactFairingSolver.ts`
- `src/engine/semanticRampProfiles.ts`
- `src/engine/v6ResearchSolver.ts`
- `src/engine/continuousCurveSolver.ts`
- `src/state/canvas.ts`
- `vite.config.ts`
- `src/engine/__tests__/engine.test.ts`
- `src/engine/__tests__/continuousCurveSolver.test.ts`
- `src/engine/__tests__/researchLab.test.ts`

### Acceptance Signals

- Normal ramp interactions feel immediate.
- CI remains green and understandable.
- Research tooling can stay slow when it is explicitly research tooling.
- Performance changes do not alter color output unless intentionally reviewed.

## Cross-Cutting Rule

Every feature touching color must say which layer it operates on:

```text
source color
canonical OKLCH / P3 color
sRGB fallback color
research-only comparison color
```

If a feature cannot answer that question, it is not ready to ship.
