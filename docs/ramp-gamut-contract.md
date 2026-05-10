# Ramp Gamut Contract

Status: architecture contract, 2026-05-10.

This document is the source of truth for how Wassily treats P3, sRGB,
fallbacks, seed exactness, rendering, export, and research comparisons.

It exists to keep future feature work from re-litigating the same choices or
quietly weakening the core promise of the ramp engine.

Related docs:

- [semantic-ramp-grammar.md](./semantic-ramp-grammar.md)
- [oklch-ramp-research-scratchpad.md](./oklch-ramp-research-scratchpad.md)
- [generated/tailwind-v4-comparison.html](./generated/tailwind-v4-comparison.html)

## Decision

Wassily's canonical color truth is Display P3.

The default app contract is dual gamut:

```text
canonical solve: Display P3
fallback output: sRGB
default targetGamut: dual
```

This means a generated ramp has one canonical set of stops and, when requested
by the contract, one explicit sRGB fallback set.

P3 is not an enhancement layer. It is the primary solve space for serious ramp
generation. sRGB is still essential, but it is a compatibility target and export
artifact, not the hidden constraint that silently edits the user's color before
the ramp begins.

## Why

Many high-quality modern palette seeds, including many Tailwind v4 `500`
colors, are outside sRGB but inside Display P3.

If Wassily claims seed exactness while solving only in sRGB, it must first map
the source color into sRGB. That makes "exact" mean "exact to a different color."

The Wassily promise is stronger:

```text
Preserve the user's source seed exactly when the source seed is inside the
canonical target gamut.
```

For modern UI color, that canonical target is Display P3.

## Vocabulary

Use these terms consistently in code, docs, UI, tests, and export tools.

### Source Seed

The color the user supplied or selected.

This is the user's intent. It may be in sRGB, Display P3, or outside both.

### Target Seed

The source seed mapped into the active solving gamut.

For the default `dual` contract, the solving gamut is Display P3. If the source
seed is inside Display P3, the target seed equals the source seed.

### Canonical Stops

The ramp stops produced by the active solve.

For `dual`, these stops are Display P3 truth and should be rendered/exported as
OKLCH/P3-capable CSS, not flattened to hex.

### Fallback Stops

Mapped sRGB versions of the canonical stops.

Fallback stops exist so hex, legacy CSS, screenshots, unsupported displays, and
sRGB-only consumers have an explicit representation. They are not the canonical
ramp.

### Source Delta

Distance between the canonical anchor stop and the source seed.

This answers: did we preserve the user's actual color?

### Target Delta

Distance between the canonical anchor stop and the target seed.

This answers: did we preserve the seed after applying the selected solving
gamut?

### Fallback Delta

Distance between the mapped canonical anchor and the mapped fallback seed.

This answers: does the sRGB fallback preserve the fallback version of the seed?

## Public Contract

### `targetGamut: "dual"`

Default for app ramps.

```text
solving gamut: Display P3
fallback gamut: sRGB
canonical stops: Display P3
fallback stops: sRGB mapped from canonical stops
rendering: canonical OKLCH
hex export/copy: fallback sRGB
```

Use this for normal product behavior.

### `targetGamut: "display-p3"`

P3-only solve.

```text
solving gamut: Display P3
fallback gamut: none
canonical stops: Display P3
fallback stops: none
rendering: canonical OKLCH
hex export/copy: chroma-mapped sRGB view if hex is requested
```

Use this for P3-native workflows where compatibility export is not the primary
concern.

### `targetGamut: "srgb"`

sRGB-only compatibility solve.

```text
solving gamut: sRGB
fallback gamut: none
canonical stops: sRGB
fallback stops: none
rendering: canonical OKLCH, but colors are sRGB-displayable
hex export/copy: canonical sRGB
```

Use this when a user or integration explicitly asks for sRGB-constrained color.

## Exactness

Exactness metadata must be attached to ramp solve results and persisted on ramp
state when possible.

Current exactness labels:

```text
source-exact    canonical anchor equals the source seed
target-exact    canonical anchor equals the target seed
target-mapped   source seed was out of target gamut; anchor equals mapped target
fallback-mapped fallback mapping preserves the fallback seed
unanchored      no exact seed preservation claim
```

Rules:

- A P3-in-gamut source seed in `dual` should normally be `source-exact`.
- An sRGB-out, P3-in source seed in `dual` should still be `source-exact`.
- An out-of-P3 source seed may be `target-mapped`.
- `pure` ramps are allowed to be `unanchored` if they do not pass through the
  seed.
- Fallback exactness never replaces source or target exactness. It is a separate
  audit fact.

## Rendering

Canvas rendering should use canonical color.

For ramps and swatches:

```text
render color = canonical OKLCH
```

Do not use hex as the render path for canonical P3 color.

Current implementation:

- `toCssColor()` returns CSS `oklch(...)`.
- ramp cells render canonical stop color
- swatches render canonical swatch color
- extraction marker dots render canonical source color

If a future rendering surface cannot display OKLCH/P3, it must be explicit that
it is using fallback color.

## Copy And Export

Hex is sRGB.

Any `#RRGGBB` output must be treated as sRGB fallback output. If a canonical
color is outside sRGB and no fallback stop exists, chroma-map it into sRGB
before generating hex.

Rules:

- `oklch(...)` export uses canonical color.
- Tailwind v4 `@theme` export should prefer canonical OKLCH.
- CSS custom properties should prefer canonical OKLCH.
- Design token formats that require hex should use sRGB fallback.
- Figma variable RGB output should use sRGB fallback unless a future Figma/P3
  path is explicitly implemented.
- Context-menu hex copy uses sRGB fallback.
- Keyboard hex copy uses sRGB fallback.
- Ramp hover hex labels show sRGB fallback.

Do not label hex as the canonical value.

## Engine Responsibilities

Ramp solving must be target-gamut-aware.

The solver may use OKLCH as the authoring language and OKLab as geometric
space, but all chroma occupancy, gamut pressure, and clamp decisions must know
which gamut they are targeting.

Responsibilities:

- preserve exact seed placement according to the selected target contract
- solve canonical stops inside the solving gamut
- build fallback stops when `targetGamut` requires them
- store source, target, and fallback seed deltas
- expose exactness metadata
- avoid hidden sRGB assumptions inside P3 paths

Low-level helpers may default to sRGB for backwards compatibility, but app ramp
entry points must normalize the target gamut before solving.

## State Responsibilities

Ramp state should carry enough data to explain what the user is seeing.

Persist on ramp objects where available:

```text
stops
fallbackStops
solveMetadata
targetGamut
seedHue
seedChroma
seedLightness
mode
stopCount
```

Future migrations must preserve existing boards. If an older ramp lacks
`targetGamut`, treat it as a legacy ramp and regenerate through the current
default only when the user performs a regeneration action.

## Research Responsibilities

Research and comparison tooling must measure the same contract the app uses.

Rules:

- `analyzeRamp` must be target-gamut-aware.
- gamut pressure must use the active solving gamut.
- seed deltas must distinguish source, target, and fallback.
- Tailwind comparison boards should make clear whether they are comparing P3
  truth, sRGB fallback, or both.
- Reference corpora should influence taste, not silently redefine the seed.

Tailwind v4 is a taste prior and audit corpus. It is not a command to copy
values.

## UI Responsibilities

UI should keep the mental model simple:

```text
the visible swatch/ramp is the real P3-capable color
hex is the sRGB fallback
OKLCH is the canonical value
```

Suggested labels:

- `OKLCH` for canonical color
- `sRGB #...` for hex fallback
- `sRGB hex list` for fallback ramp export

Avoid UI copy that implies the hex is the one true color when canonical OKLCH is
available.

## Test Responsibilities

Tests should protect the contract, not just current numbers.

Required coverage:

- default `solveRamp()` is `dual`
- default canonical stops are Display P3-displayable
- default dual solves create sRGB fallback stops
- P3-in/sRGB-out seeds can be `source-exact` under `dual`
- fallback seed delta is finite and near zero when fallback mapping is possible
- research analysis uses the active target gamut
- export/copy helpers use sRGB fallback for hex
- continuous/research prototypes do not accidentally fall back to sRGB math

Snapshot-like numeric thresholds are acceptable for visual grammar work, but
they should not be mistaken for the contract itself.

## Non-Goals

This contract does not require:

- every display to show P3
- every export format to preserve P3
- every ramp to mimic Tailwind
- every family to use the same lightness/chroma shape
- exact seed preservation for intentionally unanchored modes

It does require that compromises are explicit.

## Anti-Patterns

Avoid:

- converting canonical ramp stops to hex before rendering
- calling `toHex()` on P3 color without sRGB mapping
- measuring exactness only against `clampToGamut(seed)` without naming the
  target gamut
- treating sRGB fallback as the source of truth
- adding feature code that assumes `ramp.stops` are hex-equivalent
- using one global chroma rule for all families because it looks smooth
- silently regenerating old boards without preserving the user's visible work

## Feature Checklist

Before shipping a feature that touches ramps, color copy/export, persistence, or
analysis, answer:

- Does this feature use canonical color or fallback color?
- If it emits hex, did it map to sRGB explicitly?
- If it computes chroma occupancy, which gamut does it use?
- If it evaluates exactness, does it report source, target, and fallback deltas?
- If it stores a ramp, does it preserve `targetGamut`, `fallbackStops`, and
  `solveMetadata`?
- If it imports a color, is that color treated as source seed or already-mapped
  fallback?
- If it compares to Tailwind or another corpus, is the comparison P3, sRGB, or
  dual?

If the answer is unclear, do not guess. Extend this contract or add metadata
before adding behavior.

## One-Sentence Rule

Wassily solves the real color in Display P3, explains the seed exactness, and
exports sRGB as an explicit fallback rather than a hidden compromise.
