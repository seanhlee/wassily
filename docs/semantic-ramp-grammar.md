# Semantic Ramp Grammar

Status: design memo, 2026-05-09.

This memo documents the ramp grammar that emerged from the Tailwind v4
comparison and the successful Wassily P3 orange pass. It is not a replacement
for the research scratchpad or synthesis memo. It is the distilled design
language we can use to extrapolate orange's progress across the system.

Related docs:

- [oklch-ramp-research-scratchpad.md](./oklch-ramp-research-scratchpad.md)
- [oklch-ramp-synthesis.md](./oklch-ramp-synthesis.md)
- [generated/tailwind-v4-comparison.html](./generated/tailwind-v4-comparison.html)

## Core Thesis

A beautiful ramp is not a uniform line from light to dark.

It is a family-specific story around an exact seed:

```text
source seed
-> target gamut and exactness contract
-> family affinities
-> anchor policy
-> semantic light shoulder
-> body shelf
-> exact seed
-> ink tail
-> sampling schedule
-> gamut/fallback/audit
```

OKLCH is the language for describing colors. OKLab is the geometry for moving
between them. The family grammar supplies the taste.

The orange pass proved that Wassily gets much better when it stops asking "how
do I make a mathematical scale from this seed?" and starts asking "what is the
right semantic behavior for this family while preserving the seed exactly?"

## What Worked For Orange

The successful P3 orange result came from five decisions.

### 1. Seed As Contract

The orange `500` seed remained exact in P3.

This is the center of Wassily's personality. The user color is not a
suggestion; it is the invariant the ramp solves around.

### 2. Light Shoulder, Not Pale Seed

The `50` stop became a sunny warm highlight, not a pale version of orange.

Tailwind's orange `50` lives around yellow-orange light:

```text
Tailwind orange 50: oklch(0.980 0.016 73.7)
Wassily orange 50:  oklch(0.983 0.013 72.5)
```

This is the key identity move. A UI orange highlight should read as warm light,
not diluted brand pigment.

### 3. Body Shelf With Chroma Bloom

The `100-300` shelf descends enough in lightness for chroma to grow.

If the shelf stays too high in lightness, the gamut boundary crushes chroma and
the ramp feels washed out. The improved orange lets lightness drop earlier:

```text
Tailwind 100/200/300:
0.954 0.038 75.2
0.901 0.076 70.7
0.837 0.128 66.3

Wassily 100/200/300:
0.948 0.044 70.9
0.898 0.082 67.4
0.840 0.123 62.3
```

This is why "make the lights lighter" was incomplete. The more precise lesson
is: keep the top airy, but make the shelf brave enough to bloom.

### 4. Ink Tail, Not Same-Hue Brown

The dark side shifts hue toward warmer, redder earth as it darkens.

Keeping orange's hue fixed all the way to `950` preserves a coordinate, but it
does not preserve UI-orange identity. The better tail becomes warm ink:

```text
Tailwind orange 900/950:
0.408 0.123 38.2
0.266 0.079 36.3

Wassily orange 900/950:
0.397 0.123 38.0
0.272 0.080 38.1
```

This is family identity beating hue constancy.

### 5. P3 As Real Output, Not Just Research

The P3 solve matters. Orange has enough gamut room to feel lush while keeping
the seed exact. sRGB fallbacks are necessary, but they should be understood as
fallbacks rather than the only truth.

## The Grammar

Each family profile should be a soft, composable grammar object. It should not
be a pile of global constants.

### Classifier

Determines how strongly the family applies.

Inputs:

- hue
- lightness
- chroma
- target-gamut occupancy
- neutral threshold
- optionally reference-family distance

Output:

```text
familyWeight: 0..1
```

Profiles should blend softly. Hard hue boundaries create discontinuities and
surprising ramp jumps.

### Light Shoulder

Defines the high-lightness endpoint and early hue/chroma behavior.

Questions:

- Should the top stop stay near the seed hue, drift warmer, drift cooler, or
  desaturate?
- How much chroma should survive at `50`?
- Is the top stop allowed to sit near the gamut wall?
- Does `50` need to be paper, glass, blush, sunlight, mist, or bone?

Orange answer:

```text
Move toward sunny yellow-orange.
Keep lightness very high.
Keep enough chroma to avoid beige paper.
```

### Body Shelf

Defines how the ramp builds usable UI color through `100-400`.

Questions:

- Where should chroma bloom?
- Which labels are background tints versus body/action colors?
- Does the ramp need a vivid plateau?
- Should the seed be allowed to anchor away from `500`?

Orange answer:

```text
Descend soon enough for chroma to bloom at 100-300.
Return hue toward the seed across the shelf.
Keep 500 exact when the seed has enough light/dark budget.
```

### Seed Anchor

Defines where the exact seed lives.

Policies:

```text
perceptual-budget   Best light/dark budget around the seed.
semantic-body       Prefer action/body labels such as 500 or 600.
reference-faithful  Preserve the reference label when copying a corpus.
```

This is the main unresolved amber/yellow question. Wassily currently lets some
warm seeds anchor at `400` because the perceptual budget is cleaner. Tailwind
DNA may need a stronger `500` semantic-body prior.

### Ink Tail

Defines dark-side hue/chroma/lightness behavior.

Questions:

- Should shadows stay same-hue, warm, cool, redder, bluer, greener?
- How much chroma should survive at `800`, `900`, and `950`?
- Does `950` need to be text ink, dark UI background, or accent shadow?
- Is the `900 -> 950` jump intentional?

Orange answer:

```text
Shift hue downward toward redder earth.
Retain strong chroma through 900.
Let 950 be deep warm ink, not dead brown.
```

### Sampling Schedule

Defines how labels are distributed along the path.

Schedules:

```text
fair                 Near-even perceptual spacing.
semantic-ui          Uneven, role-aware labels.
reference-semantic   Learned from a corpus such as Tailwind.
custom               User or brand-system-defined labels.
```

Tailwind's beauty is structured unevenness. Wassily should not blindly punish a
larger `900 -> 950` jump or a vivid body shelf if the selected profile expects
that behavior.

### Gamut Contract

Defines how the profile behaves under sRGB, P3, and dual output.

Requirements:

- preserve the seed exactly when it is inside the target gamut
- report source, target, and fallback seed deltas
- use target-gamut occupancy when deciding chroma
- for cusp-heavy lights, cap local occupancy semantically instead of treating
  the P3 boundary as an automatic beauty target
- map or solve fallbacks explicitly
- never hide that a fallback is a compromise

## Candidate Family Profiles

These are design hypotheses, not final algorithms.

### Orange

Proven first profile.

```text
light shoulder: sunny yellow-orange
body shelf: early chroma bloom, hue returns to seed
seed anchor: perceptual, often 500 for Tailwind orange
ink tail: redder earth, high chroma through 900
```

### Amber / Yellow

Use the orange grammar, but with stronger body semantics.

Open questions:

- Should amber/yellow force a more Tailwind-like `500` anchor in a DNA mode?
- Should the body shelf be allowed to overshoot chroma more aggressively?
- How much hue should the dark tail shed toward orange/red?

Likely profile:

```text
light shoulder: luminous yellow sunlight
early shelf: Tailwind-like chroma, capped below full cusp occupancy
body shelf: strong chroma bloom after 100, less seed-hue literalism
seed anchor: perceptual in Exact, 500-biased in Tailwind DNA
ink tail: orange/brown ink with retained chroma
```

### Red / Pink

Do not reuse orange's yellow shoulder directly.

Implemented profile:

```text
light shoulder: blush, not paper, with delayed chroma
body shelf: exact 500 body with restrained 100-200 pigment
seed anchor: body/action labels are often natural
ink tail: hot retained ink through 600-900, then a controlled 950 drop
```

The useful distinction from orange is restraint before intensity. Red, rose,
and pink lights get better when `50-200` stay pale and high-key instead of
pulling too much seed pigment upward. After the seed, the opposite is true:
`600-900` need high occupancy and only a late fall into the `950` ink endpoint.
Pink also needs a wraparound red turn after the seed, while rose needs a late
redward accent near `900`.

### Lime

Avoid radioactive lights and dead olive shadows.

Implemented profile:

```text
light shoulder: botanical/yellow-green light, carefully restrained
body shelf: center-label bloom, enough chroma to feel leafy
seed anchor: body lime wants 500; edge lime may still need non-500 anchors
ink tail: living green/teal ink, avoid gray-brown mud
```

### Green / Emerald / Teal

Avoid heavy green lights and dead same-hue shadows.

Implemented profile:

```text
light shoulder: airy botanical/glass highlight, not same-hue paper
body shelf: 500-centered verdant body, with green peak at 500 and teal/emerald near-400 shoulders
seed anchor: body greens want 500; edge greens remain free
ink tail: cooler living ink, stronger cool turn for emerald/teal than green
```

### Cyan / Sky / Blue

Highlights should be colored glass, not white paper.

Implemented profile:

```text
light shoulder: cool glass with visible chroma, not same-hue paper
body shelf: cyan stays clear; sky/blue make a cyanward glass dent at 200-400
seed anchor: body cyan/sky/blue want 500 when the seed has enough budget
ink tail: blueward ink, with a saturated blue shelf through 600-900
```

The important new lever is that light-side hue is allowed to be non-monotonic.
Sky and blue get cleaner when `200-400` bend cyanward before returning to the
exact seed at `500`. Blue also needs a separate post-seed ink shelf: its
`600-900` stops should stay saturated, then fall cleanly into the `950` ink
endpoint.

### Violet / Purple / Fuchsia

Protect both ends: pale highlights can die, darks can over-blacken.

Implemented profile:

```text
light shoulder: airy lavender/indigo presence, with delayed chroma bloom
body shelf: exact 500 seed, then a 600/700 chroma shelf instead of immediate fade
seed anchor: local 500 preference, especially for indigo
ink tail: saturated violet/magenta ink, avoid neutral charcoal
```

The shared failure was "too fair" in both directions. Linear light-side chroma
made `100/200` too pigmented and too dark, while the dark side faded directly
from seed to ink. The `violet-body` profile uses a high, low-chroma endpoint,
label-shaped lightness/chroma keyframes, and family-specific dark ratios:
indigo keeps a cleaner blue-violet tail, violet/purple get a true 600 peak, and
fuchsia keeps magenta heat without forcing every stop to full occupancy.

### Neutrals

Neutral identity is temperature and restraint.

Implemented profile:

```text
light shoulder: airy paper/bone/slate, with almost no chroma
body shelf: explicit UI cadence, not an even interpolation
seed anchor: exact 500 body for neutral families and near-neutrals
ink tail: deep 950 ink with temperature-specific chroma retention
```

The neutral profile is the first grammar where lightness cadence dominates hue
and chroma. Tailwind-like neutrals are spacious at `50-300`, exact in the
middle, and much deeper at `800-950` than a fair interpolation wants to be.
Slate/gray retain cool chroma in the darks; zinc and pure neutral stay quieter;
stone, taupe, olive, mist, and mauve fade into restrained temperature ink. The
`100` stop needs a narrow first-tint emergence: visibly more temperature than
`50`, but faded back before the `200/300` cadence takes over.

## Proposed Engine Shape

The current orange logic should evolve into declarative profile pieces.

Sketch:

```ts
interface SemanticRampProfile {
  id: string;
  classify(seed: OklchColor, targetGamut: ColorGamut): number;
  lightShoulder(seed: OklchColor, context: RampContext): ShoulderModel;
  bodyShelf(seed: OklchColor, context: RampContext): ShelfModel;
  anchorBias(seed: OklchColor, context: RampContext): AnchorBias;
  inkTail(seed: OklchColor, context: RampContext): InkTailModel;
  samplingSchedule?: SamplingScheduleModel;
}

interface ShoulderModel {
  target: OklchColor;
  lightnessCurve: Curve;
  chromaCurve: Curve;
  hueCurve: Curve;
}

interface InkTailModel {
  targetHue: number;
  targetLightness: number;
  targetOccupancy: number;
  hueCurve: Curve;
  chromaCurve: Curve;
}
```

Profiles should produce target behavior. The solver should still own exactness,
gamut fitting, monotonicity, and auditing.

## Implementation Path

### Step 1: Extract Orange Into A Profile Module

Move the current warm-body behavior out of `brandExactFairingSolver.ts` into a
small semantic profile module.

Goal:

```text
same output, cleaner ownership
```

Status: implemented as `src/engine/semanticRampProfiles.ts`. The first resolved
profile was `warm-body`, which owns the light shoulder, body shelf, and ink-tail
behavior discovered through the P3 orange pass. A second `gold-body` profile now
handles amber/yellow so those families can hold luminous hue and shelf chroma
longer before moving into an ochre/bronze tail. A third `lime-body` profile
handles mid-body lime seeds with a botanical light shoulder, a center-label
anchor preference, and a stronger `200-400` body bloom. `brandExactFairingSolver.ts`
applies resolved profiles generically instead of knowing family-specific math.

### Step 2: Add Profile Blending

Allow multiple profiles to contribute softly.

Example:

```text
orange weight 0.7 + amber weight 0.3
```

This matters for boundary hues and user seeds that do not sit cleanly in one
named family.

### Step 3: Promote Anchor Policy

Separate perceptual anchor choice from reference/DNA anchor choice.

This unlocks:

```text
Exact mode: choose the best anchor.
Tailwind DNA mode: prefer Tailwind label semantics.
```

### Step 4: Build Tailwind-DNA Body Shelf Priors

Use Tailwind v4 as reference data for:

- label-specific lightness deltas
- chroma bloom curves
- hue offsets
- dark-tail hue travel
- `900 -> 950` behavior

Start with orange, amber, yellow, then expand family by family.

### Step 5: Audit Profiles Visually And Numerically

Each profile should ship with:

- seed exactness tests
- gamut tests in sRGB and P3
- monotone lightness tests
- profile-specific role assertions
- generated comparison reports
- visual review notes in the scratchpad

## Guardrails

Do not turn this grammar into one global "beauty" knob.

Avoid:

- making every light lighter
- making every dark more chromatic
- preserving hue as a dogma
- copying Tailwind values directly
- letting gamut mapping silently move the seed
- optimizing only for adjacent evenness

Prefer:

- profile-specific semantic behavior
- exactness as a contract
- target-gamut-aware chroma
- structured unevenness when labels have roles
- visual reports plus metrics
- clear explanations of why a ramp behaves the way it does

## Whole-Board Checkpoint

Status after warm, gold, lime, verdant, cool-glass, blush, neutral-temperature,
and violet-body profiles: the board is now coherent enough to treat family
tuning as mostly complete for this research phase.

Current generated Tailwind v4 comparison:

- P3: all 26 families are source-exact.
- P3 anchors: 25 families anchor at `500`; yellow remains the one `400`
  anchor.
- sRGB: 14 Tailwind v4 `500` seeds are outside sRGB but inside P3, so sRGB
  necessarily maps the source seed for those families.
- dual fallback: keeps the P3 source-exact contract while reporting the mapped
  sRGB fallback.

The remaining board-level nits are no longer "the system does not understand
this family." They are mostly boundary and policy questions:

- yellow is still the main non-`500` anchor and lightness-cadence outlier
- amber/yellow and lime/green are the sharpest warm/cusp transitions
- blue/indigo, purple/fuchsia, and pink/rose are profile-boundary watchpoints
- low-chroma hue deltas in neutrals are less meaningful than temperature,
  cadence, and chroma restraint

This is the moment to stop adding isolated taste patches and make the gamut
contract explicit.

Working recommendation:

```text
P3 solve = canonical Wassily color truth
sRGB solve = compatibility target
dual export = P3 first, with audited sRGB fallback
```

The reason is simple: Tailwind v4's own `500` seeds are now broadly P3-native.
If Wassily optimizes only for sRGB, it silently edits many seed colors before
the ramp even begins. P3 lets the seed contract stay honest; sRGB remains
essential, but as a visible fallback/export concern rather than the primary
beauty constraint.

Implementation note: this is now the app contract. `RampConfig` defaults to
`targetGamut: "dual"`, which solves the visible ramp in Display P3 and attaches
mapped sRGB fallback stops. Canvas swatches render from canonical CSS OKLCH;
hex copy/export paths are treated as sRGB fallback output. Research analysis and
the continuous-curve prototype are target-gamut-aware too, so the comparison
tools audit the same contract the app uses.

## Current Takeaway

Orange was the proof point. The full board is now the stronger proof.

Wassily can reach Tailwind-level beauty without giving up what makes Wassily
distinctive: exact seeds, inspectable metadata, explicit gamut contracts, and a
solver that can explain itself.

The next move is not more family-by-family mimicry. The next move is to turn the
P3 / sRGB / dual-fallback behavior into a boring, explicit product contract.
