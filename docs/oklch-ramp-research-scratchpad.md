# OKLCH Ramp Research Scratchpad

Living scratchpad for the seed-exact OKLab / OKLCH ramp investigation.

This is intentionally messier than a final design memo. Use it to park ideas,
source links, observations, falsifications, and candidate algorithms as the
research evolves.

For the distilled architecture direction, see
[oklch-ramp-synthesis.md](./oklch-ramp-synthesis.md).

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

### External Tool Observations

- [oklch.fyi Create](https://oklch.fyi/create)
  - Useful reference for an approachable OKLCH palette tool. It exposes palette
    size, target color space, OKLCH controls, CSS export, and WCAG/APCA contrast
    checks.
  - Observed behavior: the entered color is not preserved as an exact stop in
    the generated ramp. The tool appears to treat the input as a set of
    parameters for a new scale, not as an anchored token.
  - Current shipped JS indicates this flow:
    - Convert seed to OKLCH.
    - Compute `Cmax(seed.l, seed.h, gamut)`.
    - Store seed chroma as a percentage of that local maximum.
    - Build a lightness window around the seed: roughly `seed.l - up to 0.4`
      through `seed.l + up to 0.4`, clamped around `0.05..0.95`.
    - Sample evenly across that window according to the requested palette size.
    - At each sampled lightness, set chroma to
      `seedRelativeChroma * Cmax(sample.l, seed.h, gamut)`.
  - This explains Sean's annoyance: the output ramp can be smooth and
    gamut-aware, but the exact seed usually drifts because no stop is constrained
    to equal the input.
  - Wassily principle: offer this as a possible "normalize to a scale" mode, but
    make the default design-token workflow seed-exact. The seed is a contract;
    neighboring stops should solve around it.

Repo scans on 2026-05-09:

- [meodai/rampensau](https://github.com/meodai/rampensau)
  - Agent/local read at commit `e328099`: a lightweight TypeScript ramp
    generator that produces abstract `[hue, saturationOrChroma, lightness]`
    tuples with independent easing for hue, the middle channel, and lightness.
  - Core behavior is curve-first, not seed-first: hue comes from either an exact
    `hueList` entry or a generated hue-cycle formula; the other channels come
    from eased ranges. There is no full color seed, no OKLab interpolation, and
    no exact OKLCH token anchor.
  - OKLCH support is formatting/mapping rather than a true OKLCH solver. The
    README demo scales the middle channel to OKLCH chroma with `c = s * 0.4`,
    while the CSS helper emits percentage chroma. That ambiguity is a warning
    sign for API design: "saturation" and OKLCH chroma should not share a loose
    channel without very explicit units.
  - Gamut handling is essentially delegated to the browser or a downstream color
    library. This is fine for generative art, but not enough for design-token
    ramps where exactness and output contracts matter.
  - Lesson for Wassily: borrow the UI/API idea of independent hue/chroma/L
    easing and transform hooks; do not borrow the underlying color model as a
    production OKLCH ramp algorithm.

- [royalfig/color-palette-generator](https://github.com/royalfig/color-palette-generator)
  - Agent/local read at commit `8bd0697`: a broader palette synthesizer using
    `colorjs.io`, with analogous/triadic/etc. palettes plus a tints-and-shades
    generator.
  - The tints-and-shades path is relevant: it defines a 12-step OKLCH lightness
    progression, finds the closest step to the seed lightness, and replaces that
    step with the seed lightness. Several modes then generate colors around
    that base index.
  - Seed preservation is mostly explicit, but not universal. Standard palette
    generators preserve the seed at index 0; tints/shades clones the seed at the
    chosen base index; later modulation and UI semantic modes can move it.
  - Gamut handling is pragmatic, not surgical: clamp OKLCH `l`/`c` globally,
    then use `colorjs.io` `toGamut()` for output conversions. It does not appear
    to solve per-hue/per-lightness chroma maxima or guarantee exactness after
    gamut mapping.
  - Lesson for Wassily: the "find closest lightness stop, then insert the seed"
    pattern is worth keeping. But Wassily should make the seed contract mode
    explicit and test it through every transform, modulation, and gamut target.

- [meodai/dittoTones](https://github.com/meodai/dittoTones)
  - Local read at commit `acd656b`: this is the closest conceptual cousin to
    our Tailwind comparison work. It transforms any color into a full palette by
    copying the perceptual "DNA" of design systems such as Tailwind, Radix,
    Shoelace, Flexoki, and Web Awesome.
  - Core flow:
    - Parse input to OKLCH.
    - Find the closest reference ramp stop using Euclidean distance in OKLCH.
    - If close enough, use that single ramp; otherwise blend two reference
      ramps in OKLab at each shade.
    - Rotate the reference ramp to the target hue, optionally preserving hue
      offsets across stops.
    - Correct lightness with a piecewise linear function anchored at black,
      white, and the matched shade, so the matched stop hits the target
      lightness exactly.
    - Correct chroma with a ratio/power hybrid: lower-chroma colors avoid being
      overblown, while highly saturated target colors avoid runaway peaks.
  - This is seed-exact before optional gamut mapping because the matched shade's
    L/C/H are solved to the target. However, the optional gamut map is sRGB
    only (`toGamut("rgb", "oklch")`), so a P3-first mode would need a different
    target and exactness check.
  - Lesson for Wassily: a "design-system DNA" mode is highly compatible with
    our Tailwind research. But we should improve on it by using a more careful
    distance metric than raw OKLCH Euclidean, supporting P3/sRGB target gamut
    choices, and keeping anchor exactness after gamut solving when possible.

- [meodai/color-palette-shader](https://github.com/meodai/color-palette-shader)
  - Local read at commit `52382df`: not a ramp generator. It is a dependency-free
    WebGL2 palette auditor that maps a palette across perceptual color spaces
    and colors each pixel by the nearest palette entry.
  - The interesting output is a perceptual Voronoi view: tiny claimed regions
    suggest redundant colors; huge regions suggest colors doing too much work;
    lopsided regions reveal hue/lightness/chroma bias.
  - Supports many view spaces, including OKHSL/OKHSV, OKLab, OKLCH, toe-corrected
    OKLab variants, CIELab/LCH D65/D50, and CAM16-UCS D65. Distance metrics
    include OKLab, toe-corrected OKLab, OK lightness, CIE76/94/2000,
    Kotsarenko/Ramos, and CAM16-UCS.
  - Contains useful GLSL implementations of Bjorn Ottosson OKLab, OKHSL/OKHSV,
    cusp finding, and several gamut-clipping strategies. This is reference
    material for thinking about gamut, with attribution requirements, not a
    direct TS ramp engine.
  - Important nuance from the agent read: the public `gamutClip` option is an
    audit/display mode that discards out-of-sRGB pixels to reveal the gamut
    boundary. It does not invoke the perceptual `gamut_clip_*` correction
    functions. Those functions are implementation reference material, not the
    current product behavior.
  - Boundary naming matters: the README says linear sRGB inputs, while the
    implementation/demo path behaves like gamma-encoded sRGB that is converted
    to linear for OKLab math. Wassily should be painfully explicit about RGB
    encoding at API boundaries.
  - Lesson for Wassily: add a palette-audit view or generated report that shows
    Tailwind and Wassily ramps as nearest-color regions in OKLCH/OKLab slices.
    This could quantify "do these stops each earn their keep?" better than
    adjacent delta tables alone.

- Other meodai color repos surfaced by the account scan:
  - [pro-color-harmonies](https://github.com/meodai/pro-color-harmonies):
    OKLCH-first harmony generation from a base color. Agent takeaway: adaptive
    hue relationships and named perceptual styles are more promising than
    purely geometric hue rotations.
  - [pickyPalette](https://github.com/meodai/pickyPalette): interactive palette
    sculpting using perceptual distance, OKHSL/OKLab defaults, `culori`,
    `color-palette-shader`, and Token Beam. More tooling than algorithm, but it
    reinforces that generation space, distance metric, and gamut choice should
    be separate controls.
  - [poline](https://github.com/meodai/poline): HSL/coordinate anchor palette
    generator. Good inspiration for multi-anchor UI and per-axis easing, not a
    perceptual design-token ramp solver.
  - [fettepalette](https://github.com/meodai/fettepalette): HSV/HSL curve and
    hue-shift ramp generator for illustration/pixel-art vibes. Useful for
    studying expressive hue-shift controls, not for seed-exact OKLCH.
  - [token-beam](https://github.com/meodai/token-beam): not ramp generation, but
    highly relevant to output. Keep a normalized internal token model and sync
    through target-specific adapters with stable token names.
  - [palette-aldente](https://github.com/meodai/palette-aldente): palette
    build/export pipeline from JSON/YAML to JS, JSON, SVG, PNG, and app palette
    formats. Strong reminder to separate generation from packaging/export.
  - [color-router](https://github.com/meodai/color-router): reactive palette and
    token dependency graph with refs, computed colors, inheritance, CSS
    variables, and JSON rendering. Useful pattern for semantic tokens over base
    ramps, especially cycle/error handling.
  - [RYBitten](https://github.com/meodai/RYBitten), [spectral.js](https://github.com/meodai/spectral.js),
    [color-names](https://github.com/meodai/color-names), and
    [color-name-api](https://github.com/meodai/color-name-api) are adjacent
    color-knowledge tools. Interesting for creative modes, naming, or labels,
    but lower priority for Tailwind-like ramps.

Working synthesis from the tool scan:

- Seed handling needs explicit modes:
  - `seed-exact`: the input color is a contract and one stop must equal it
    unless the target gamut makes that physically impossible.
  - `normalize`: the input color describes hue/chroma intent, but the generated
    scale may move it for smoothness or gamut fit. This is how oklch.fyi appears
    to behave.
  - `reference-DNA`: the input seed is matched to a nearby stop in a reference
    corpus such as Tailwind/Radix, then the reference L/C/hue-offset shape is
    transformed around the seed. dittoTones is the clearest existing example.
- Gamut should be a first-class target, not a hidden export side effect:
  `sRGB-safe`, `P3-vivid`, and possibly `dual` output. The exact seed contract
  should report whether exactness is source-OKLCH exact, target-gamut exact, or
  target-gamut mapped.
- Chroma should be fitted against per-hue/per-lightness gamut envelopes, not a
  fixed global OKLCH cap. Ottosson cusp/intersection math and Cmax-style tools
  are the right family of ideas.
- Beauty is not just uniform distance. Tailwind, dittoTones, and our comparison
  report all point to semantic body-stop priors, family-specific hue drift, and
  intentionally uneven dark endpoints.
- The pipeline should stay decomposed:
  generation space -> gamut mapping -> audit metric -> export format. Mixing
  these is how tools become surprising.
- Useful next audit metrics: seed delta, target-gamut occupancy, adjacent OKLab
  distance/CV, DeltaE2000 deltas, contrast/APCA trajectory, and nearest-region
  area from a palette-shader-style view.

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

Generated comparison report added on 2026-05-09:

- [generated Tailwind v4 comparison HTML](./generated/tailwind-v4-comparison.html)
- [generated Tailwind v4 comparison JSON](./generated/tailwind-v4-comparison.json)
- Generator: `npm run research:tailwind-comparison`

First quantitative read from the app-facing Wassily engine against Tailwind
v4.3.0:

- 14 of 26 Tailwind `500` seeds are outside sRGB.
- Wassily anchors 11 of 26 Tailwind `500` seeds away from `500` when using the
  current perceptual-budget policy.
- Biggest seed deltas are warm/cusp and high-chroma families: lime, amber,
  yellow, orange, sky, emerald, green, cyan.
- Tailwind is much less uniform by OKLab adjacent distance, but that unevenness
  is part of its semantic UI palette behavior, especially the `900 -> 950`
  endpoint and the bright body/highlight shelves.
- Immediate research implication: "match Tailwind beauty" needs a target-gamut
  decision and a semantic `500`/body-stop prior, not just smoother spacing.

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

## Implementation Checkpoint: Contract Layer

Date: 2026-05-09

We started the "boring contract first" slice recommended by the independent
review. The current app-facing `generateRamp()` remains stop-compatible, while
new `solveRamp()` returns both stops and explicit metadata:

- target gamut, currently guarded to sRGB
- solver name
- seed anchor index/label/fraction
- exactness classification
- source seed, target seed, and source/target seed deltas

Key observation from the Tailwind comparison: many vivid Tailwind v4 `500`
seeds are outside sRGB, so Wassily's current "exact" behavior is often
`target-mapped`: exact to the sRGB-mapped target, not exact to the original P3-ish
source seed. That makes the next technical question much clearer: implement
real target-gamut helpers before judging Tailwind-DNA taste.

## Implementation Checkpoint: P3 / Dual Gamut

Date: 2026-05-09

The engine now has concrete sRGB and Display P3 gamut helpers:

- `isInGamut(color, "display-p3")`
- `clampToGamut(color, "display-p3")`
- `maxChroma(l, h, "display-p3")`
- `toDisplayP3String(color)`

`solveRamp({ targetGamut: "display-p3" })` solves against P3 and can preserve
vivid Tailwind-like seeds exactly when they are outside sRGB but inside P3.
`solveRamp({ targetGamut: "dual" })` solves against P3 and also returns
`fallbackStops`, produced by mapping the P3 target ramp into sRGB. This locks
the first dual-mode policy: fallback is target-derived, not a separately solved
sRGB taste pass.

Open follow-up: decide whether the UI should expose P3 rendering/export now, or
keep P3 as a research/export mode until the Tailwind-DNA prototype can show why
wide-gamut output is visually worth surfacing.

## Implementation Checkpoint: Warm Body Highlight Shoulder

Date: 2026-05-09

The Tailwind v4 comparison made the Orange / Amber / Yellow gap more concrete:
the issue was not simply "too much chroma" in Wassily's lights. Wassily was too
literal about the seed hue and too evenly spaced on the light side. Tailwind's
warm families use a high-lightness shoulder that bends highlights toward sunny
yellow while keeping the body seed intact.

New app-facing prior:

- applies only to high-chroma, mid-body orange / amber / yellow seeds
- keeps very high warm seeds on the existing math-first path
- preserves the exact seed anchor
- lifts 50s toward roughly Tailwind-like lightness
- shifts highlight hue toward a yellow shoulder, then returns to the seed hue
- blends the prior in OKLab so boundary behavior remains gradual

First regenerated comparison result:

- Orange P3 50 moved from seed-hue literal to `oklch(0.979 0.012 69.5)`
- Amber P3 50 moved to `oklch(0.983 0.021 94.0)`
- Yellow P3 50 moved to `oklch(0.982 0.026 97.5)`

Interpretation: this is closer to Tailwind's semantic highlight language, but
still a bit more conservative in the 100-300 chroma build than Tailwind. That
may be the right Wassily personality: exact seed, honest gamut, sunny lights,
less designer-specific exaggeration.

## Implementation Checkpoint: Warm Shelf And Ink Tail

Date: 2026-05-09

Second warm-family pass after visual review:

- keep the top stop airy, but let `100-300` descend soon enough that chroma can
  actually bloom instead of being crushed by the high-lightness gamut boundary
- add a warm-ink tail that shifts orange / amber / yellow shadows toward redder
  earth hues as the ramp darkens
- keep exact seed anchoring and the continuous-curve baseline isolated

Regenerated P3 comparison:

- Orange now tracks Tailwind closely through the light shelf:
  - Wassily `100/200/300`: `0.948 0.044 70.9`,
    `0.898 0.082 67.4`, `0.840 0.123 62.3`
  - Tailwind `100/200/300`: `0.954 0.038 75.2`,
    `0.901 0.076 70.7`, `0.837 0.128 66.3`
- Amber now has a Tailwind-like top and a stronger shelf, but remains more
  conservative from `200-400`.
- Yellow now has stronger `200/300` chroma and a much better warm dark tail,
  though the seed still naturally anchors at `400` in Wassily's current policy.

Interpretation: this feels closer to "same beauty language, Wassily accent."
The next open taste question is whether amber/yellow should receive a
Tailwind-DNA body-shelf profile that intentionally prioritizes the `500` label,
or whether Wassily should keep choosing the seed's perceptual anchor.

## Implementation Checkpoint: Gold Body Profile

Date: 2026-05-09

After the orange profile extraction, amber/yellow still read a little muddy
because they were inheriting too much of orange's earth-turning behavior. The
new `gold-body` semantic profile separates amber/yellow from `warm-body`:

- `warm-body` now mostly owns orange/red-orange
- `gold-body` owns amber/yellow
- gold lights keep luminous yellow hue longer
- `200-400` build chroma more confidently before returning to the seed
- the dark tail becomes ochre/bronze, with yellow holding gold longer before
  warming down

Regenerated P3 comparison:

- Amber `200/300/400` moved to `0.924 0.112 94.8`,
  `0.878 0.180 91.4`, `0.826 0.188 83.8`.
- Yellow `200/300` moved to `0.953 0.130 101.3`,
  `0.892 0.184 97.3`.
- Orange stayed effectively unchanged.

Interpretation: this is a better split of family stories. Orange keeps its hot
sun-to-ink path; amber/yellow now read more like lit gold material and less like
orange math stretched over yellow.

## Implementation Checkpoint: Yellow Early Shelf

Date: 2026-05-09

Visual review found that the first gold-body pass improved amber/yellow overall
but missed yellow `100`: it became lightness-correct while riding too hard on
the local P3 cusp.

The fix was not "more color everywhere." It was a narrower rule:

- let yellow `100` rise to Tailwind-like chroma earlier than the generic curve
- drop the early shelf lightness slightly so it is not paper-white
- cap early local-gamut occupancy around the `100` region so it stays luminous
  instead of neon
- relax that cap before `200` so the gold body shelf can still bloom

Regenerated P3 comparison:

- Yellow `100` now sits at `0.972 0.071 102.2`, almost exactly against
  Tailwind's `0.973 0.071 103.2`.
- The prior overcooked version was closer to `0.972 0.083 102.2` and had local
  occupancy around `1.01`.
- Orange and amber stayed effectively unchanged.

Interpretation: yellow lights want a shoulder-to-shelf transition, not a global
chroma pump. Local gamut occupancy is the right control surface for preventing
P3 yellows from becoming electric at the top while still allowing rich `200/300`
body color.

Reusable principle: for cusp-heavy hues, especially yellow and likely lime,
beauty is often governed by local gamut occupancy rather than absolute chroma.
P3 gives the engine more usable chroma, but the top of the ramp still needs a
semantic ceiling. The move is "occupy enough of the cusp to read luminous, then
back off before the swatch reads fluorescent."

## Implementation Checkpoint: Lime Body Profile

Date: 2026-05-10

Lime confirmed that the yellow occupancy lesson transfers, but not by copying
yellow's grammar directly. The first profile pass improved lime's lights but
kept the exact seed at `400`, which made the ramp read like a compressed
perceptual solve instead of a semantic UI family. The stronger move was to give
mid-body lime its own center-label anchor preference.

What changed:

- add `lime-body` as a narrow profile for high-chroma, mid-lightness lime seeds
- keep very high-lightness edge lime seeds on the existing edge-anchor path
- bend the light shoulder toward botanical yellow-green rather than same-hue
  paper
- cap the upper lights below full cusp occupancy
- let `200-400` bloom back into a fresh leafy body shelf
- add a profile-level seed-index penalty so this family can prefer the `500`
  body label without forcing that rule onto orange/yellow

Regenerated P3 comparison:

- Lime now anchors at `500` instead of `300/400`.
- Lime `50/100/200`: `0.985 0.031 121.0`,
  `0.970 0.064 122.9`, `0.938 0.123 124.8`.
- Lime `300/400/500`: `0.893 0.199 126.8`,
  `0.836 0.239 128.8`, exact seed `0.768 0.233 130.8`.
- Tailwind v4 for the same stops is `0.986 0.031 120.8`,
  `0.967 0.067 122.3`, `0.938 0.127 124.3`,
  `0.897 0.196 126.7`, `0.841 0.238 128.8`,
  `0.768 0.233 130.8`.

Interpretation: lime is the first clear case where semantic anchor policy is
part of the beauty, not just a reporting detail. For body lime, the center label
lets the top stay airy without starving the `200-400` shelf. For edge lime, the
old non-500 anchor remains important because the seed may already live near the
highlight cusp.

## Agent Cartography Round: Remaining Families

Date: 2026-05-10

After orange, gold/yellow, and lime, the useful levers are clear enough to send
parallel diagnosis passes across the remaining corridors. Agents are asked to
map terrain, not edit the engine.

Corridors:

- green / emerald / teal
- cyan / sky / blue
- indigo / violet / purple
- fuchsia / pink / rose / red
- neutrals / slate / gray / zinc / neutral / stone

Shared diagnostic template:

- Tailwind vs Wassily P3 deltas at key role stops
- visual/taste diagnosis
- implicated levers: anchor policy, light shoulder, body shelf, local
  occupancy, hue path, ink tail, sampling schedule
- proposed family grammar
- proposed regression assertions
- risks to neighboring families

Synthesis rule: look for the smallest transferable grammar piece, then implement
one corridor at a time with visual review. Agents can identify likely levers;
the main thread keeps the scalpel so the global palette stays coherent.

### Agent Synthesis

The reports agree on a larger pattern: Wassily's generic solver is now
trustworthy as geometry, but remaining Tailwind gaps are mostly semantic label
rhythm. The biggest repeated failure is "too fair": the ramps are smoother than
Tailwind, so `100-300` often become too dark and too chromatic while body or ink
roles lose their intentionally uneven shape.

Common findings:

- Green / emerald / teal, cyan / sky, and indigo all show anchor or label-rhythm
  issues. Exact seeds are preserved, but the semantic body often wants `500`.
- Pink / rose / red already anchor correctly; their miss is blushier lights,
  delayed chroma, and a hotter tail with a larger `900 -> 950` jump.
- Violet / purple anchor correctly but bloom too early in the lights and lose
  the Tailwind `600/700` body plateau.
- Neutrals are a separate class: no gamut drama, but the light side is far too
  dark and the `950` endpoint is far too light. They need a temperature-vector
  grammar, not chromatic hue rotation.

Proposed implementation order:

1. `verdant-body` for green / emerald / teal.
   This is the closest cousin to the successful `lime-body` work: center-label
   anchor preference, airy botanical/glass shoulder, restrained top occupancy,
   and a cooler ink tail. Gate it away from lime and cyan.
2. `cyan-glass` / `sky-glass`, then a separate `blue-body`.
   Cyan and sky share the verdant anchor pathology but need much bluer glass
   and ink behavior. Blue already anchors at `500`; it mostly needs a stronger
   post-seed body/tail bloom.
3. Red corridor profiles.
   Keep anchor policy alone. Tune blush shoulder, delayed light chroma, hot
   `600/700` body retention, and a deliberate `900 -> 950` dark jump.
4. Purple corridor profiles.
   Indigo needs a local `500` anchor preference; violet/purple need airy lights
   and a `600` peak/plateau without bleeding into fuchsia.
5. Neutral temperature profile.
   Highest UI payoff but broadest blast radius. Build as a dedicated neutral
   axis with strong protections for pure neutral, warm/cool neutral research
   seeds, and muted chromatic colors.

Cross-corridor guardrails:

- Do not add a global "prefer 500" rule. Anchor preference must remain local to
  family profiles.
- Keep local occupancy as the anti-glare control for cusp/highlight colors.
- Treat `900 -> 950` as a semantic UI role jump, not a smoothing failure.
- For neutrals, use OKLab temperature vectors rather than hue-angle heuristics.

## Implementation Checkpoint: Verdant Body Profile

Date: 2026-05-10

The green / emerald / teal corridor validated the agent synthesis. These
families had the same structural failure as lime before its profile: exact seeds
were preserved, but Tailwind's semantic `500` body color had slid to Wassily
`400`. That made `50-300` too dark/heavy and made the dark side too same-hue.

What changed:

- add `verdant-body` as a corridor profile, internally blending green, emerald,
  and teal behavior
- keep the hue gate away from `lime-body` and the future cyan profile
- prefer the `500` body label for high-chroma, mid-lightness verdant seeds
- bend lights toward airy botanical/glass highlights
- restrain top occupancy without starving the `300-500` body
- turn the tail cooler, with stronger cool ink for emerald/teal than green
- reshape dark lightness so `900 -> 950` reads more like an intentional UI jump

Regenerated P3 comparison:

- Green now anchors at `500` and sits close through the whole visible ramp:
  `50/100/200/300/400/500` are `0.981 0.020 155.4`,
  `0.961 0.042 155.5`, `0.922 0.091 155.6`,
  `0.867 0.163 154.0`, `0.801 0.211 150.7`,
  exact seed `0.723 0.219 149.6`.
- Emerald now anchors at `500`: `50/100/200/300/400/500` are
  `0.976 0.025 166.0`, `0.950 0.048 166.5`,
  `0.906 0.081 166.8`, `0.847 0.135 165.8`,
  `0.777 0.170 163.3`, exact seed `0.696 0.170 162.5`.
- Teal now anchors at `500`: `50/100/200/300/400/500` are
  `0.982 0.016 181.1`, `0.953 0.048 181.1`,
  `0.906 0.081 181.1`, `0.847 0.127 181.5`,
  `0.779 0.148 182.2`, exact seed `0.704 0.140 182.5`.
- Lime stayed unchanged and cyan stayed on its existing path.

Interpretation: `verdant-body` is the first multi-family corridor profile that
feels justified. The shared grammar is real, but the profile still needs local
shape controls: green wants a leafy `500` peak, emerald wants a mintier body
shelf and cool ink, and teal wants sea-glass lights with a stronger blue tail.

## Implementation Checkpoint: Cool Glass Profile

Date: 2026-05-10

The cyan / sky / blue corridor confirmed that the verdant strategy extrapolates,
but only after adding two cool-family levers that were not obvious from warm
families.

What changed:

- add `cool-glass` as a corridor profile blending cyan, sky, and blue behavior
- prefer the semantic `500` body label for high-chroma, mid-lightness cool seeds
- make the top stop colored glass instead of pale same-hue paper
- let sky and blue lights bend cyanward through `200-400`, then return to the
  exact seed at `500`
- move the dark tail blueward earlier, so `600/700` do not feel same-hue
- give blue a separate saturated ink shelf through `600-900`, while still
  landing on a controlled `950`

Regenerated P3 comparison:

- Cyan anchors at `500`: `50/100/200/300/400/500` are
  `0.980 0.019 203.4`, `0.951 0.052 203.1`,
  `0.905 0.088 203.1`, `0.849 0.128 207.5`,
  `0.785 0.150 213.4`, exact seed `0.715 0.143 215.2`.
  The tail now turns into blue ink: `700/900/950` are
  `0.531 0.107 224.1`, `0.393 0.075 228.3`,
  `0.298 0.056 228.3`.
- Sky anchors at `500` and now has Tailwind's glass dent:
  `200/300/400/500` are `0.895 0.062 230.0`,
  `0.834 0.103 229.6`, `0.763 0.156 231.5`,
  exact seed `0.685 0.169 237.3`. The tail lands at
  `0.292 0.066 243.2`.
- Blue anchors at `500` and now carries the body/tail plateau:
  `300/400/500/600/700/800/900/950` are
  `0.813 0.098 252.1`, `0.725 0.157 254.4`,
  exact seed `0.623 0.214 259.8`, `0.560 0.241 261.6`,
  `0.493 0.244 265.2`, `0.426 0.202 267.7`,
  `0.370 0.152 267.8`, `0.281 0.092 267.7`.

Interpretation: cool hues taught us that hue curves do not need to be simple
endpoint interpolation. For sky and blue, beauty comes from a local cyanward
reflection in the light body and a separate blueward ink shelf after the seed.
This is another vote for grammar pieces over one magic OKLCH ramp formula.
