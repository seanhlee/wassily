# OKLCH Ramp Research Scratchpad

Living scratchpad for the seed-exact OKLab / OKLCH ramp investigation.

This is intentionally messier than a final design memo. Use it to park ideas,
source links, observations, falsifications, and candidate algorithms as the
research evolves.

## Core Question

Can Wassily generate Tailwind-level or better UI color ramps from a single seed
color while preserving that seed exactly at the best stop in the ramp?

The hard version of the problem:

- Preserve the seed color exactly.
- Anchor the seed at the visually correct stop, not always `500`.
- Keep adjacent perceptual cadence smooth.
- Keep lightness monotone.
- Avoid dead/paper highlights, muddy shadows, and gamut-wall flattening.
- Support hard colors: yellow/lime cusp colors, cyan/aqua, ultramarine,
  violet/fuchsia, red/orange, muted earth colors, and near-neutrals.

## Current Working Thesis

The best architecture is not a fixed OKLCH formula. It is:

```text
exact seed
-> choose seed stop from perceptual budget
-> solve a family-aware OKLab path through the seed
-> sample by arc length
-> gamut-map/compress non-seed stops
-> validate spacing, contrast, hue/chroma identity, and visual taste
```

In other words: OKLCH is the authoring language, OKLab is the geometry, and
beautiful ramps come from path design plus priors.

## Source Stack

### Tailwind

- [Tailwind CSS v2.0 blog](https://tailwindcss.com/blog/tailwindcss-v2)
  - v2 introduced a newly designed palette with 22 colors and 10 shades,
    including a new `50` shade.
  - No public generator is described.
- [Tailwind CSS v3.0 blog](https://tailwindcss.com/blog/tailwindcss-v3)
  - v3 made the full extended palette available by default.
- [Tailwind CSS v3.3 blog](https://tailwindcss.com/blog/tailwindcss-v3-3)
  - v3.3 added `950` for every color, explicitly motivated by dark UI,
    high-contrast text, and tinted control backgrounds.
- [Tailwind CSS v4.0 blog](https://tailwindcss.com/blog/tailwindcss-v4)
  - v4 upgraded the default palette from RGB to OKLCH, using wider gamut color
    while trying to keep v3 balance.
  - v4 uses OKLab as the default gradient interpolation space.
- [Tailwind colors docs](https://tailwindcss.com/docs/colors)
  - The current docs call the palette carefully crafted by expert designers.
  - Every default color has 11 steps: `50` through `950`.
  - Current values are exposed as `--color-*` CSS variables in OKLCH.
- [Tailwind v4 source: `theme.css`](https://github.com/tailwindlabs/tailwindcss/blob/main/packages/tailwindcss/theme.css)
  - Static OKLCH palette values. This is data to learn from, not an algorithm.

Initial conclusion: Tailwind does not publish a seed-to-ramp algorithm. The
palette appears to be a curated static corpus. We can learn its path shapes,
but we should not assume there is a hidden simple formula.

Seed fixture for testing all current Tailwind v4 `500` stops in Wassily:
[tailwind-v4-500-seeds.json](./tailwind-v4-500-seeds.json).

MCP audit workflow added on 2026-05-09:

- `create_swatches` now has `preserve_colors` for source-exact reference
  swatches.
- `create_ramp_suite` accepts arbitrary `{ name, color }` seeds, preserves
  source swatches by default, promotes each to an 11-stop ramp, and renames the
  ramps.
- `create_tailwind_v4_500_suite` creates a new visual audit board from all
  Tailwind v4.3.0 `500` colors.
- Caveat: Wassily's current visible ramp engine is sRGB-gamut-safe. Tailwind v4
  values are sometimes outside sRGB, so the source swatches can be kept exact
  in OKLCH, but generated ramps may chroma-compress those seeds unless/ until
  Wassily gains an explicit P3 target-gamut mode.

### OKLab / OKLCH And Gamut

- [Bjorn Ottosson, A perceptual color space for image processing](https://bottosson.github.io/posts/oklab/)
  - OKLab was designed for predictable perceived lightness, chroma, hue, and
    smooth blending.
  - OKLCH is the polar form of OKLab.
  - Practical note: use OKLab for interpolation/geometry; use OKLCH for
    semantic editing of lightness/chroma/hue.
- [Bjorn Ottosson, sRGB gamut clipping](https://bottosson.github.io/posts/gamutclipping/)
  - Raw RGB clipping causes ugly hue distortions.
  - Better mapping preserves perceptual hue/lightness as much as possible and
    reduces chroma.
- [Bjorn Ottosson, Okhsv and Okhsl](https://bottosson.github.io/posts/colorpicker/)
  - Useful for understanding how irregular the sRGB gamut is around OKLCH.
  - Maximum chroma is a function of hue and lightness, not a global constant.
- [CSS Color Module Level 4](https://www.w3.org/TR/css-color-4/)
  - Standardizes `oklab()` / `oklch()`.
  - CSS gamut mapping is relevant because it uses OKLCH-like constant-hue,
    constant-lightness chroma reduction before clipping.
- [Color.js gamut mapping docs](https://colorjs.io/docs/gamut-mapping.html)
  - Practical reference for CSS-style gamut mapping.
  - Important warning: pure chroma reduction can fail on yellows.

### Ramp And Palette Research

- [Color Crafting: Automating the Construction of Designer Quality Color Ramps](https://arxiv.org/abs/1908.00629)
  - Closest academic match: learns designer-quality ramp structure from a
    corpus of expert-designed ramps.
  - Key lesson: good ramps behave like families of curves, not one universal
    linear interpolation.
  - More specific method notes from the paper:
    - Corpus: 222 designer-crafted ramps, including 180 sequential and 42
      diverging ramps.
    - They fit interpolating cubic B-splines through source ramps in CIELAB,
      then resample each curve by arc length to nine points.
    - They cluster normalized curve shapes to learn relative structures
      independent of absolute hue/color.
    - Seeding is especially relevant to Wassily: they place the seed at the
      control point whose luminance is closest to the seed, translate the curve
      to preserve that luminance distribution, then translate in the `a/b` plane
      so the selected control point precisely matches the seed.
    - Translation to Wassily: use OKLab instead of CIELAB, preserve exact seed,
      but replace "nearest luminance control point" with a stronger perceptual
      budget/semantic stop policy.
- [Peter Kovesi, Good Colour Maps: How to Design Them](https://arxiv.org/abs/1509.03700)
  - Uneven perceptual contrast creates false visual features and flat spots.
  - For UI ramps, this supports Wassily's arc-length/even-cadence priority.
- [colorspace: A Toolbox for Manipulating and Assessing Colors and Palettes](https://arxiv.org/abs/1903.06490)
  - HCL trajectory design is useful background for sequential palette shape.
- [Material Color Utilities](https://github.com/material-foundation/material-color-utilities)
  - HCT/CAM16 x L* based dynamic palette system.
  - Good inspiration for source-color-driven themes, but Material does not
    necessarily preserve the source color as a visible ramp stop.
- [Android dynamic color docs](https://source.android.com/docs/core/display/dynamic-color)
  - Dynamic palettes are generated from a single source color and expanded into
    multiple tonal palettes and theme styles.
- [Adobe Leonardo](https://github.com/adobe/leonardo)
  - Strong contrast-targeted generation reference.
  - Useful for role/token generation after ramps exist.
- [Evil Martians, OKLCH in CSS](https://evilmartians.com/chronicles/oklch-in-css-why-quit-rgb-hsl)
  - Clear practical argument for OKLCH over RGB/HSL in design systems.
- [Making Software: color spaces, models, and gamuts](https://www.makingsoftware.com/chapters/color-spaces-models-and-gamuts)
  - Useful conceptual explainer for why gamut and color-space shape matter.
  - Important implication: OKLCH can describe colors outside the target display
    gamut, so pointwise clipping can collapse different intended colors onto
    the same boundary.

### Accessibility / Contrast

- [WCAG 2.2 contrast minimum](https://www.w3.org/TR/WCAG22/#contrast-minimum)
  - Still the normative compliance target for web text contrast.
- [APCA in a Nutshell](https://git.apcacontrast.com/documentation/APCA_in_a_Nutshell.html)
  - Useful perceptual readability signal, but advisory until WCAG 3 settles.

## Tailwind Observations To Quantify

Initial Tailwind v4.3.0 numerical pass, parsed from `theme.css` on 2026-05-09:

```text
Chromatic peak stop counts: 400 = 6 families, 500 = 3, 600 = 8.
Average chromatic L: 50=0.977, 500=0.683, 950=0.278.
Average OKLab adjacent-distance CV across chromatic families: 0.337.
Average worst adjacent-distance ratio: 3.61.
```

This is important: Tailwind is not trying to make equal perceptual steps. It is
a semantic UI palette with deliberately uneven label spacing. The large jumps
are concentrated around `900 -> 950` and, for some families, around the
highlight-to-body transition. Wassily can be smoother than Tailwind and still
learn from Tailwind's family-specific shape.

Average chromatic Tailwind v4.3.0 shape by label:

```text
label avgL  sdL   avgC  sdC   avg sRGB occupancy  out-of-sRGB families
50    0.977 0.007 0.018 0.005 0.898               4/17
100   0.950 0.011 0.042 0.013 0.912               4/17
200   0.905 0.019 0.080 0.024 0.913               8/17
300   0.840 0.033 0.135 0.026 0.983               11/17
400   0.754 0.051 0.189 0.024 1.058               15/17
500   0.683 0.058 0.214 0.042 1.063               14/17
600   0.598 0.044 0.213 0.056 1.070               13/17
700   0.515 0.025 0.187 0.057 1.041               14/17
800   0.446 0.019 0.154 0.048 0.980               10/17
900   0.395 0.016 0.124 0.038 0.895               1/17
950   0.278 0.013 0.088 0.030 0.896               1/17
```

Tailwind v4 is frequently outside sRGB in the colorful body stops. That matches
the v4 blog's "P3 color palette" framing. Wassily currently clamps generated
colors to sRGB via `culori` OKLCH chroma reduction. If Wassily wants Tailwind v4
vividness, it likely needs a target-gamut choice: sRGB-safe, P3-vivid, or both.

Average Tailwind chromatic lightness deltas:

```text
50->100  0.027
100->200 0.045
200->300 0.065
300->400 0.087
400->500 0.071
500->600 0.085
600->700 0.083
700->800 0.069
800->900 0.052
900->950 0.117
```

The `900 -> 950` jump is not an accident. It supports the v3.3 explanation that
`950` was added for ultra-dark UI, high-contrast text, and tinted control
backgrounds.

Still need deeper Tailwind analysis:

- Lightness curves by family.
- Chroma curves by family.
- Relative chroma / gamut occupancy by stop.
- Hue drift from light to dark.
- Which stop has peak chroma.
- OKLab adjacent distances and coefficient of variation.
- The closest stop for a given arbitrary seed and what seed placement would
  look like if Tailwind family curves were used as priors.

Hypotheses to test:

- Tailwind's chromatic ramps usually peak around `500` or `600`, but not
  always at the same lightness.
- Warm cusp families keep very light stops high-L but chroma-limited, then
  bend hue toward warmer shadows.
- Cool narrow-gamut families need stronger visible tint in highlights or they
  collapse to paper.
- `950` is not just the next equal step after `900`; it is a deliberate dark UI
  endpoint.
- Neutrals are separate families, not low-chroma chromatic ramps.
- Wassily's local `familyProfiles.ts` Tailwind references look like v3/sRGB
  conversions, while Tailwind v4's OKLCH palette is wider-gamut and more vivid.
  Need decide whether priors should be v3-compatible, v4-P3-compatible, or
  target-gamut dependent.

Visual observation from Sean's Tailwind v4 vs Wassily orange comparison image
on 2026-05-09:

- Tailwind's orange ramp keeps the seed-like `500` stop as a hot, clean orange,
  but the light side walks through a distinctly yellow/amber highlight shoulder.
  `200-400` read sunny and luminous rather than peach.
- Wassily preserves the exact seed and has a smoother-looking cadence, but the
  light side is peach/beige and the dark side browns quickly. The ramp feels
  more like roasted orange or caramel than Tailwind's bright UI orange.
- The seed placement differs visually: Tailwind's seed sits on the hot body
  stop, while Wassily's exact seed appears earlier in the ramp, leaving more
  dark-side budget and making the body descend into ochre/brown.
- Taste implication: for saturated orange/yellow families, equalized OKLab
  spacing alone is not enough. Wassily needs a warm-cusp/highlight identity
  prior that keeps highlights clean and yellow-luminous without collapsing into
  paper, plus a dark-tail prior that delays brownness.
- Research question: is Wassily over-preserving hue/chroma geometry around the
  exact seed and under-preserving the family identity of "orange UI ramp"? We
  may need a stronger Tailwind-v4/P3 orange reference profile or a body-stop
  semantic prior when the seed is an action-color orange.

## Wassily Repo Observations

Existing ramp architecture already contains the most promising ingredients:

- [src/engine/ramp.ts](/Users/sean/Projects/wassily/src/engine/ramp.ts)
  - App-facing `opinionated` mode delegates to `brand-exact-fair`.
  - `pure` is a simple hue-constant baseline.
- [src/engine/brandExactFairingSolver.ts](/Users/sean/Projects/wassily/src/engine/brandExactFairingSolver.ts)
  - Preserves the exact seed.
  - Evaluates nearby seed indices.
  - Fairs visible stops around the seed in OKLab.
- [src/engine/v6ResearchSolver.ts](/Users/sean/Projects/wassily/src/engine/v6ResearchSolver.ts)
  - Has endpoint search, seed placement, soft priors, continuous path scoring,
    monotone lightness penalties, gamut penalties, spacing metrics, and family
    priors.
- [src/engine/continuousCurveSolver.ts](/Users/sean/Projects/wassily/src/engine/continuousCurveSolver.ts)
  - Research-only prototype with continuous OKLab curve sampling.
  - Handles highlight endpoint models for warm cusp, bright cyan, cool narrow,
    and warm red cases.
  - Includes a `continuous-compressed` gamut-pressure variant.
- [src/engine/gamut.ts](/Users/sean/Projects/wassily/src/engine/gamut.ts)
  - Uses `culori` OKLCH chroma clamping and local `maxChroma(l, h)`.
- [docs/ramp-research-v5.md](/Users/sean/Projects/wassily/docs/ramp-research-v5.md)
  - Existing living memo. This scratchpad should feed future updates there once
    ideas harden.

Initial read: Wassily is already past naive OKLCH formulas. The next work is
probably data analysis, sharper priors, and visual/lab regression loops.

Generated lab snapshot from `docs/generated/research-lab.json`
(`2026-05-06T15:15:51.259Z`):

- `continuous-curve` and `continuous-compressed` pass every listed pressure
  seed in the focused lab.
- `brand-exact-fair` is mostly strong, but fails the `very-light-seed` endpoint
  case because the top-side budget collapses around the exact seed.
- For many chromatic seeds, `continuous-curve` has spacing CV near `0.001-0.03`
  and worst adjacent ratios near `1.00-1.07`.
- Earth/muted seeds are more varied; `rust` and `burgundy` remain harder even
  under continuous sampling.
- Neutral seeds improve under continuous sampling (`cv ~= 0.031`) compared with
  brand-exact fairing (`cv ~= 0.088`), but this needs visual judgment because
  neutral ramps can look numerically good and still feel temperature-wrong.

Important implication: Wassily's current continuous research engines are far
more perceptually even than Tailwind's static palette. The remaining question is
not "can we match Tailwind's spacing?" but "can we keep Wassily's superior
cadence while borrowing Tailwind's taste: chroma confidence, family-specific hue
motion, dark endpoint usefulness, and highlight identity?"

## Candidate Algorithm Sketch

1. Parse seed into OKLCH and OKLab.
2. Compute local gamut facts:
   - `Cmax(seed.l, seed.h)`
   - seed relative chroma / occupancy
   - chroma peak lightness for the hue
   - highlight/shadow chroma budget
3. Choose seed anchor:
   - Estimate a light endpoint and dark endpoint for the seed family.
   - Measure OKLab distance from light endpoint to seed and seed to dark
     endpoint.
   - Convert the light-side distance fraction to an index over `50..950`.
   - Clamp to an endpoint only when there is not enough perceptual budget for a
     real step on that side.
4. Preserve seed exactly at the anchor.
5. Build a continuous OKLab path through:
   - light endpoint
   - optional light shoulder
   - exact seed
   - optional dark shoulder
   - dark endpoint
6. Make endpoints and shoulders family-aware:
   - use Tailwind/curated reference ramps as soft priors
   - use cusp-aware highlight logic
   - use separate neutral logic
7. Sample by OKLab arc length on each side of the exact seed.
8. Gamut map non-seed samples:
   - keep seed untouched
   - prefer segment-level compression when the whole curve rides a gamut wall
   - avoid raw RGB clipping
9. Score:
   - seed delta
   - monotone lightness
   - adjacent OKLab distance CV
   - worst adjacent ratio
   - top bridge and dark tail ratios
   - hue wobble
   - gamut pressure and near-boundary count
   - contrast targets for intended foreground/background uses
10. Render visual gauntlets and judge by eye.

## Open Questions

- Should app-facing `opinionated` switch from `brand-exact-fair` to
  `continuous-curve` once visual QA confirms the generated metrics?
- How much of Tailwind's current OKLCH palette can be modeled as reusable
  family profiles versus one-off designer decisions?
- Should seed anchoring prefer exact perceptual budget or semantic label
  conventions (`500` as default action color)?
- Should output support both sRGB-safe and P3-vivid variants?
- Can `continuous-compressed` beat simple pointwise OKLCH chroma clamping in
  visible taste, especially for yellow/ochre/aqua?
- What is the right neutral strategy when seed chroma is near zero and hue is
  unstable?
- Can Leonardo-style contrast targeting become a separate role-token layer
  after ramp generation?

## Next Lab Tasks

- Parse Tailwind v4 `theme.css` into structured OKLCH data.
- Generate a compact Tailwind metric report:
  - peak chroma stop
  - hue drift
  - lightness deltas
  - OKLab adjacent distances
  - relative chroma by stop
- Compare Tailwind curves to Wassily `brand-exact-fair`,
  `continuous-curve`, and `continuous-compressed` for matched seeds.
- Add a source/corpus format for external reference ramps if the existing
  `familyProfiles.ts` corpus is not enough.
- Preserve screenshots or HTML gauntlets for visual review after each solver
  change.
