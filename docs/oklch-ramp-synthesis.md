# OKLCH Ramp Synthesis: Wassily vNext

Status: synthesis memo, 2026-05-09.

This document distills the current OKLab/OKLCH ramp research into a practical
direction for leveling up Wassily. The scratchpad remains the raw lab notebook:
[oklch-ramp-research-scratchpad.md](./oklch-ramp-research-scratchpad.md).
The semantic grammar that emerged from the successful P3 orange pass lives in
[semantic-ramp-grammar.md](./semantic-ramp-grammar.md).

The goal is not to copy Tailwind. The goal is to understand why Tailwind v4
feels good, why many OKLCH generators feel almost good, and what Wassily can
own that is more exact, more inspectable, and more useful for real design
systems.

## Executive Thesis

Wassily should treat the seed color as a contract, not a suggestion.

The ramp is the solved context around that seed. The best architecture is not a
single OKLCH formula. It is a layered system:

```text
seed color
-> target gamut
-> exactness contract
-> anchor placement
-> reference or family prior
-> continuous OKLab path
-> semantic sampling schedule
-> gamut fit
-> audit
-> export
```

OKLCH is the editing language. OKLab is the geometry. Tailwind, Radix, Flexoki,
and expert ramps are reference corpora. Beauty comes from path design, semantic
sampling, family identity, and target-gamut choices, not from uniform spacing
alone.

Independent review adjustment: build the contract layer before chasing taste.
Target gamut, exactness metadata, and persisted solve stories should land before
Tailwind-DNA work. Otherwise the Tailwind v4 comparison will mostly measure
"sRGB-compressed Tailwind" instead of Tailwind's actual P3-oriented palette.

## What We Learned

### Tailwind v4

Tailwind does not appear to publish a seed-to-ramp algorithm. Its palette is a
curated static corpus exposed as OKLCH values.

That makes Tailwind more useful as training data than as an implementation
recipe. It tells us what good designers accepted as final values, not how those
values were generated.

The generated comparison report found:

- 26 families total: 17 chromatic, 9 neutral.
- 14 of 26 Tailwind v4 `500` stops are outside sRGB.
- Wassily currently anchors 11 of 26 Tailwind `500` seeds away from `500`.
- The largest seed deltas are in high-chroma or cusp-sensitive families: lime,
  amber, yellow, orange, sky, emerald, green, and cyan.
- Tailwind is much less uniform by adjacent OKLab distance than Wassily.
- Tailwind's `900 -> 950` jump is deliberately large.

Interpretation: Tailwind's beauty is structured unevenness. It uses semantic UI
labels, family-specific hue/chroma behavior, strong body stops, vivid P3 color,
and a deliberate ultra-dark endpoint. A ramp can be smoother than Tailwind and
still miss the taste.

### OKLCH Tools

oklch.fyi appears to generate smooth, gamut-aware scales by treating the input
as hue/chroma intent, not as an exact stop. It computes relative chroma against
local max chroma, samples a lightness window around the input, and recomputes
chroma at each sampled lightness.

That is a valid "normalize this color into a scale" behavior. It is annoying for
Wassily's design-token workflow because the input color drifts.

Lesson: seed movement should be a named mode, never a surprise.

### RampenSau

RampenSau is valuable as an interaction/API reference: independent hue,
saturation-or-chroma, and lightness easing; hue lists; transform hooks; simple
generative controls.

It is not a seed-exact OKLCH solver. Its OKLCH behavior is tuple formatting and
downstream interpretation. It does not own gamut mapping or exact token
anchoring.

Lesson: borrow the control vocabulary, not the color math.

### Royalfig Color Palette Generator

Royalfig's tints-and-shades path has a useful move: choose the closest
lightness step to the seed and explicitly insert the seed there.

But seed preservation is not universal across its modulation and UI modes, and
gamut handling is pragmatic rather than surgical: global OKLCH clamps plus
`colorjs.io` output mapping.

Lesson: base-index insertion is good. Wassily should make the seed contract
stronger and test it through every transform.

### dittoTones

dittoTones is the closest conceptual cousin to the current Tailwind inquiry. It
copies the perceptual "DNA" of Tailwind, Radix, Shoelace, Flexoki, and Web
Awesome by:

- finding the closest reference ramp stop in OKLCH,
- using one reference ramp or blending two in OKLab,
- rotating hue to the target,
- optionally preserving reference hue offsets,
- correcting lightness so the matched shade hits the target exactly,
- correcting chroma with ratio and power behavior.

Lesson: Wassily should have a reference-DNA mode. The improvement opportunity is
to make target gamut explicit, preserve exactness after gamut solving when
possible, and use a stronger matching/audit stack.

### color-palette-shader

color-palette-shader is not a generator. It is a palette auditor. It draws a
perceptual nearest-color map across color spaces and distance metrics.

This is a missing piece for Wassily's judgment loop. Adjacent distance tables
tell us whether neighboring stops are smooth. A nearest-region view tells us
whether each stop earns its keep in color space.

Lesson: Wassily should add a palette audit report inspired by this idea, even if
the first version is a CPU/grid approximation rather than WebGL.

### Academic Direction

The Color Crafting paper is the strongest research match. It learned ramp
structures from designer-crafted ramps, fit curves through them, and generated
new ramps from seed colors. The important idea is not its exact CIELAB method;
it is the premise that good ramps are families of learned curves.

Wassily already has the right instincts:

- `brand-exact-fair` preserves the exact seed and fairs visible stops.
- `v6ResearchSolver` explores semantic roles, seed placement, path scoring,
  family priors, and gamut pressure.
- `continuousCurveSolver` tests a cleaner continuous OKLab curve architecture.
- `v6SoftPriors` already aligns reference examples around candidate anchors.

The next step is not a rewrite from zero. It is a consolidation.

## Core Principles

### 1. The Seed Is A Contract

Default behavior should preserve the input color exactly at one generated stop.

The seed vocabulary needs to be precise:

```text
source seed             The color the user supplied or imported.
promoted swatch seed    The color stored on the canvas before ramp generation.
target seed             The seed interpreted inside the selected target gamut.
fallback display color  The mapped color used for a narrower fallback output.
```

Exactness must be measured and reported, not assumed:

```text
source-exact        The OKLCH seed appears exactly in the ramp.
target-exact        The seed is exact and inside the selected target gamut.
target-mapped       The source seed was outside the selected target gamut, so a
                    mapped display color was needed.
fallback-mapped     Primary output preserves the seed, but a fallback output
                    maps it for a narrower target such as sRGB.
```

This matters because Tailwind v4 contains vivid body stops that are outside
sRGB. A P3 output may preserve them; an sRGB fallback cannot.

Today, this distinction is not fully present in the engine. The current
generation path is effectively sRGB-mapped seed exact: seeds are sanitized to the
sRGB target before some solves and analyses. vNext should track at least:

```text
sourceSeedDelta
targetSeedDelta
fallbackSeedDelta
```

That gives the app a truthful way to say "we preserved your P3 brand color, and
here is the sRGB fallback compromise."

### 2. Anchor Placement Is Both Perceptual And Semantic

There are two valid anchor questions:

```text
Where should this seed live for the best standalone ramp?
Where should this seed live if we are emulating a reference system's labels?
```

Current Wassily answers the first question by moving some Tailwind `500` seeds
to `300`, `400`, or `600`. That can be mathematically reasonable. But in a
Tailwind-faithful mode, a Tailwind `500` seed should strongly prefer `500`
because the label is part of the reference identity.

Recommendation: expose this distinction internally as anchor priors:

- `perceptual-budget`: choose the stop that gives the best light/dark budget.
- `reference-faithful`: preserve the reference label unless it creates a real
  collapse or endpoint problem.
- `semantic-body`: prefer body/action labels such as `500` or `600` for
  saturated UI colors.

### 3. Target Gamut Is A Taste Decision

Wassily currently treats generated colors as sRGB-safe. Tailwind v4 is a P3
palette. Comparing the two under sRGB-only generation is therefore partly
unfair.

Target gamut should be a first-class option:

```text
sRGB-safe    Conservative, universally displayable, good fallbacks.
P3-vivid     Tailwind-v4-like vividness on modern displays.
dual         Generate P3/OKLCH primaries plus sRGB fallbacks.
```

This requires a real `TargetGamut` abstraction:

```text
isInGamut(color, target)
maxChroma(l, h, target)
clampOrMap(color, target, strategy)
occupancy(color, target) = c / maxChroma(l, h, target)
```

The current `maxChroma` and `clampToGamut` utilities are hardwired to sRGB.
They should become target-aware before we judge Tailwind-v4 matching too
harshly.

P3 is not only engine math. It affects:

- rendering: ramp and swatch components should be able to display CSS
  `oklch()`/P3-capable colors instead of only hex fallbacks,
- contrast: contrast checks need a declared target/fallback color,
- export: tokens should distinguish primary P3/OKLCH values from sRGB
  fallbacks,
- reports: every comparison should say whether a value is source-exact,
  target-exact, or fallback-mapped.

The `dual` mode needs an explicit policy:

```text
mapped-fallback    Solve once for P3, then gamut-map each fallback color.
separate-fallback  Solve a second sRGB ramp for better sRGB taste.
```

The first is more faithful to the source. The second may look better in sRGB.
Wassily should test both, but the metadata must say which one produced a token.

### 4. Beauty Is Structured Unevenness

Uniform OKLab steps are a great baseline, but Tailwind teaches that production
UI ramps often need semantic unevenness:

- a vivid body shelf,
- a clean highlight shoulder,
- a deliberate `900 -> 950` dark endpoint,
- family-specific hue drift,
- neutrals as their own systems, not chromatic ramps with low chroma.

This suggests a new distinction:

```text
continuous curve     The underlying perceptual path through the seed.
sampling schedule    Where labels land on that curve.
```

`fair` mode can sample by equal arc length. `Tailwind-v4 DNA` mode should use a
semantic schedule learned from Tailwind's distances and label roles. That lets
Wassily keep a clean continuous path while allowing Tailwind-like label
behavior.

This means semantic unevenness needs its own objective. A Tailwind-DNA ramp
should not be penalized just because the `900 -> 950` jump or a vivid body shelf
is intentionally larger than its neighbors. The audit should compare the
observed unevenness to the selected sampling schedule, not always to perfect
even spacing.

### 5. Family Identity Beats Hue Constancy

Hue constancy is not the same as identity preservation.

For orange, Tailwind's light side walks toward yellow/amber luminosity. Wassily
currently stays smoother but can read peach/beige, then brown. The issue is not
that Tailwind is "less accurate." It is that Tailwind preserves the identity of
"hot UI orange" better across the ramp.

Family priors should be explicit:

- warm cusp: luminous yellow/amber highlights, delayed brownness,
- red/pink: controlled blush highlights, hot dark tails,
- cyan/aqua: enough visible highlight chroma without glassy paper,
- blue/violet: prevent pale paper collapse and dead ink,
- green/teal: manage dark-tail mud,
- neutrals: temperature and chroma are the identity.

The existing `continuousCurveSolver` already contains early versions of these
models. Tailwind v4 gives us a stronger calibration target.

### 6. Evaluation Must Be Multi-Metric

One metric will lie.

The audit stack should include:

- seed delta,
- target-gamut exactness,
- sRGB and P3 occupancy by stop,
- adjacent OKLab distance and coefficient of variation,
- DeltaE2000 as a secondary perceptual check,
- lightness monotonicity,
- hue drift by family,
- chroma peak label and shape,
- contrast and APCA trajectory,
- nearest-region area from a palette-shader-style audit,
- visual reports for pressure seeds.

Metrics should flag risk. They should not declare taste solved.

## Recommended Architecture

### Engine Axes And User-Facing Presets

The user should see simple presets. The engine should keep the underlying axes
orthogonal.

Internal axes:

```text
exactnessPolicy     source-exact | target-exact | allow-normalized
styleProfile        none | tailwind-v4 | radix | flexoki | custom | artist
targetGamut         srgb | display-p3 | dual
anchorPolicy        perceptual-budget | reference-faithful | semantic-body
samplingSchedule    fair | reference-semantic | custom
fallbackPolicy      mapped-fallback | separate-fallback
styleStrength       numeric blend between neutral math and style prior
```

User-facing presets can compose those axes:

```text
Exact
  Default design-token mode. The seed appears as a real stop. The solver chooses
  the best context around it.

Tailwind DNA
  Apply the perceptual shape of a reference corpus such as Tailwind v4, Radix,
  Flexoki, or a user-imported palette. The seed remains exact unless the target
  gamut prevents it.

Normalize
  Smooth scale generation where the input describes intent but may move. Useful
  for exploration, not the default for brand tokens.

Artist
  Expressive RampenSau/fettepalette-like hue sweeps and curve gestures. Useful
  for illustration, mood, or generative palettes.
```

The near-term priority is the `Exact` preset plus the contract layer needed to
make `Tailwind DNA` honest.

### Data Model

Add a richer internal solve request:

```ts
type ExactnessPolicy = "source-exact" | "target-exact" | "allow-normalized";
type StyleProfile = "none" | "tailwind-v4" | "tailwind-v3" | "radix" | "custom" | "artist";
type TargetGamut = "srgb" | "display-p3" | "dual";
type AnchorPolicy = "perceptual-budget" | "reference-faithful" | "semantic-body";
type SamplingSchedule = "fair" | "reference-semantic" | "custom";
type FallbackPolicy = "mapped-fallback" | "separate-fallback";

interface RampSolveRequest {
  seed: OklchColor;
  labels: string[];
  exactnessPolicy: ExactnessPolicy;
  styleProfile: StyleProfile;
  targetGamut: TargetGamut;
  anchorPolicy: AnchorPolicy;
  samplingSchedule: SamplingSchedule;
  fallbackPolicy?: FallbackPolicy;
  styleStrength?: number;
}
```

And a more honest solve result:

```ts
interface RampSolveResult {
  stops: RampStop[];
  metadata: {
    solver: string;
    targetGamut: TargetGamut;
    seedIndex: number;
    seedLabel: string;
    exactness: "source-exact" | "target-exact" | "target-mapped" | "fallback-mapped";
    seedDelta: {
      source: number;
      target: number;
      fallback?: number;
    };
    referenceContributors?: ReferenceContributor[];
    audit: RampAuditSummary;
  };
}
```

This should survive into canvas state and exports. A ramp without its solve
story is hard to inspect, hard to compare, and hard for the agent to explain.

### Pipeline

Recommended vNext pipeline:

```text
1. Parse and classify seed
   - OKLCH coordinates
   - target-gamut status
   - relative chroma / occupancy
   - family affinities

2. Generate anchor candidates
   - candidate labels
   - perceptual budget score
   - semantic body score
   - reference-label score
   - gamut feasibility score

3. Build reference prior
   - Tailwind v4 profile first
   - matched family/families
   - matched anchor label
   - L curve, C curve, hue offsets, sampling schedule

4. Solve continuous OKLab path
   - exact seed control point
   - family-aware light endpoint
   - family-aware dark endpoint
   - shoulders/tangents from reference prior
   - monotone lightness guardrails

5. Fit to target gamut
   - preserve seed if in target
   - compress non-seed segments smoothly
   - avoid independent pointwise wall flattening
   - produce fallback mapping if target is dual

6. Sample and label
   - fair sampling for seed-exact/fair style
   - reference semantic sampling for Tailwind-DNA style
   - ensure no collapsed adjacent stops

7. Audit and export
   - structured metrics
   - visual report
   - OKLCH/P3/sRGB CSS variables
```

## Tailwind-v4 DNA Mode

This should be the first serious taste experiment after the target-gamut and
exactness contract layer exists.

### Why

Tailwind v4 is a large, modern, OKLCH/P3-oriented UI palette with familiar
labels. It is exactly the kind of corpus Wassily should learn from, and the
comparison report already exposes where Wassily diverges.

### What To Build

Create a `tailwind-v4` reference profile with:

- raw OKLCH stops,
- per-family L/C/hue curves,
- per-family peak chroma label,
- hue drift from `50 -> 950`,
- sRGB and P3 occupancy per stop,
- adjacent OKLab distances,
- normalized sampling schedule by family,
- family groups: warm, warm-cusp, yellow/lime, green/teal, cyan/blue,
  blue/violet, magenta/red, neutral.

Then implement a prototype:

```text
seed
-> find closest Tailwind-v4 reference stops
-> choose anchor by policy
-> align reference around exact seed
-> preserve hue offsets optionally
-> scale L/C around exact seed
-> fit to P3 or sRGB
-> sample with Tailwind semantic schedule
```

This can begin as a pure reference-DNA algorithm before being merged with the
continuous curve solver. A dittoTones-style prototype is cheap and will teach us
quickly.

### Anchor Policy For Tailwind Seeds

When the input is literally a Tailwind v4 `500` seed and the mode is
`reference-DNA` with `reference-faithful`, the result should strongly prefer
`500`.

When the input is an arbitrary brand color in `seed-exact` mode, the solver may
choose `300`, `400`, `500`, `600`, etc. based on perceptual budget and semantic
intent.

That distinction resolves the current tension in the comparison report.

## Product Implications

### UI Controls

Near-term controls should be few:

```text
Mode: Exact / Tailwind DNA / Normalize
Gamut: sRGB / P3 / Dual
Style strength: subtle / default / strong
```

The user should not need to understand cusp math, DeltaE, or sampling schedules.
Those belong in diagnostics and research reports.

### Export

For modern CSS, Wassily should be able to export:

```css
--color-brand-500: oklch(...);
@supports (color: color(display-p3 1 0 0)) {
  --color-brand-500-p3: oklch(...);
}
```

And also provide sRGB-safe fallback values when requested.

The important thing is not the exact CSS shape yet. It is that export must know
whether a token is source-exact, target-exact, or fallback-mapped.

### Agent Workflow

The agent should use this architecture to explain tradeoffs:

- "This color is exact in P3 but needs sRGB fallback mapping."
- "I anchored it at `400` because the seed is too light for a body `500`."
- "Tailwind-DNA mode keeps it at `500` but sacrifices some fair spacing."
- "The orange highlight is moving toward yellow to preserve UI-orange identity."

This is much better than presenting a ramp as if it simply happened.

## Implementation Roadmap

### Phase 1: Target Gamut And Exactness Infrastructure

Goal: stop treating sRGB as invisible law.

- Add a `TargetGamut` abstraction to `src/engine/gamut.ts`.
- Support `srgb` first through the current behavior.
- Add `display-p3` max-chroma and gamut checks.
- Add occupancy calculations for both targets.
- Track source, target, and fallback seed deltas.
- Add exactness metadata to solve results, reports, canvas state, and exports.

Done when: the Tailwind comparison can say, per stop, whether a color is sRGB
safe, P3 safe, source-exact, target-exact, or fallback-mapped.

### Phase 2: Solve Result Contract

Goal: persist the solve story instead of returning anonymous stops.

- Add `solveRamp(request): RampSolveResult`.
- Keep `generateRamp()` as a compatibility wrapper.
- Store result metadata in ramp state.
- Thread target gamut, exactness, and audit summaries into exports.

Done when: a generated ramp can explain its seed label, target gamut, exactness,
fallback behavior, and audit summary without recomputing everything.

### Phase 3: Shared Metrics

Goal: stop scattering comparison math across reports and research prototypes.

- Move label handling, seed deltas, adjacent distances, coefficient of
  variation, gamut occupancy, and anchor summaries into shared engine modules.
- Make the Tailwind comparison, research lab, and future DNA prototype use the
  same metric functions.
- Add tests around the shared metrics.

Done when: "seed delta" and "occupancy" mean the same thing everywhere.

### Phase 4: Tailwind v4 Reference Profile

Goal: turn Tailwind v4 from a report fixture into a solver prior.

- Move parsed Tailwind v4 data into engine-readable reference data.
- Compute per-family curves and sampling schedules.
- Replace or supplement older v3/sRGB reference priors where appropriate.
- Add tests that keep the parsed profile stable.

Done when: the engine can ask for "Tailwind v4 orange, anchor 500" and receive
the reference shape, family tags, target-gamut occupancy, and semantic sampling
schedule as structured data.

### Phase 5: Reference-DNA Prototype

Goal: learn quickly before changing the main solver.

- Implement a standalone Tailwind-DNA generator inspired by dittoTones.
- Preserve exact seed at selected anchor before gamut mapping.
- Support `reference-faithful` and `perceptual-budget` anchor policies.
- Generate the same comparison report against Tailwind v4.

Done when: we can compare `brand-exact-fair`, `continuous-curve`, and
`tailwind-v4-DNA` for all Tailwind `500` seeds.

### Phase 6: Continuous Curve Integration

Goal: merge the best of Wassily's geometry with reference-DNA priors.

- Feed Tailwind-v4 reference shape into endpoint, tangent, and shoulder search.
- Add semantic sampling schedules separate from the continuous curve.
- Add semantic unevenness scoring so reference schedules are valid targets, not
  automatic spacing failures.
- Keep exact seed placement explicit.
- Preserve monotone lightness and no collapsed adjacent steps.

Done when: Tailwind-DNA visual taste improves without losing Wassily's
inspectability and exactness.

### Phase 7: Audit Reports

Goal: make taste debuggable.

- Extend the generated comparison report with P3/sRGB exactness.
- Add chroma occupancy curves.
- Add hue drift plots or tables.
- Add DeltaE2000 secondary deltas.
- Add a palette-shader-inspired nearest-region audit, starting with a grid
  approximation if WebGL is too much.

Done when: a bad ramp tells us why it is bad.

## Decisions To Lock Now

- Default design-token generation should remain seed-exact.
- Tailwind v4 comparisons should be evaluated in P3 mode, with sRGB fallback as
  a separate question.
- The engine needs named modes, not hidden compromises.
- Reference-DNA is a first-class research direction.
- Labels are semantic positions on a curve, not necessarily equal perceptual
  intervals.
- Metrics are diagnostics. Visual taste remains the final acceptance test.

## Risks

- Overfitting to Tailwind could make Wassily derivative.
- P3-first ramps may produce weaker or surprising sRGB fallbacks.
- A reference-DNA mode can preserve a seed while still losing the seed's brand
  personality if the reference prior is too strong.
- More modes can confuse the product if the UI exposes math instead of intent.
- Gamut exactness language can become too technical unless the app explains it
  in plain terms.

## Near-Term Build Recommendation

Build the smallest contract layer that can answer one question:

> For a vivid Tailwind v4 `500` color, what exactly is preserved as source,
> target, and fallback when Wassily generates a ramp in sRGB, P3, and dual mode?

Then build the smallest Tailwind-v4 DNA prototype that can answer the taste
question:

> If a Tailwind v4 `500` color is the exact seed, can Wassily generate a P3 ramp
> that keeps that seed at `500`, inherits Tailwind's family shape, and still
> reports a better exactness/audit story than Tailwind itself?

If yes, integrate the idea into the continuous curve solver. If no, keep the
prototype as a reference comparator and use its failures to improve
`brand-exact-fair`.

This is the path most likely to level up Wassily without losing what makes it
special: exact anchors, inspectable geometry, and a real design-system workflow.
