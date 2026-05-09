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
body shelf: strong chroma shelf, less seed-hue literalism
seed anchor: perceptual in Exact, 500-biased in Tailwind DNA
ink tail: orange/brown ink with retained chroma
```

### Red / Pink

Do not reuse orange's yellow shoulder directly.

Likely profile:

```text
light shoulder: blush, not paper
body shelf: hot chroma retained into body labels
seed anchor: body/action labels are often natural
ink tail: hot red/magenta ink, avoid muddy maroon collapse
```

### Lime / Green

Avoid radioactive lights and dead olive shadows.

Likely profile:

```text
light shoulder: botanical/yellow-green light, carefully restrained
body shelf: preserve freshness without neon glare
seed anchor: often high-lightness seeds need non-500 anchors
ink tail: living green/teal ink, avoid gray-brown mud
```

### Cyan / Sky / Blue

Highlights should be colored glass, not white paper.

Likely profile:

```text
light shoulder: cool glass with visible chroma
body shelf: stable hue with enough saturation for UI affordance
seed anchor: depends strongly on seed lightness
ink tail: deep blue/cyan ink, avoid blackened gray
```

### Violet / Purple / Fuchsia

Protect both ends: pale highlights can die, darks can over-blacken.

Likely profile:

```text
light shoulder: airy cool/lavender presence
body shelf: rich chroma near seed, avoid gray lavender
seed anchor: often lower than warm colors
ink tail: saturated violet ink, avoid neutral charcoal
```

### Neutrals

Neutral identity is temperature and restraint.

Likely profile:

```text
light shoulder: paper/bone/slate, very low chroma
body shelf: smooth temperature retention
seed anchor: mostly perceptual budget
ink tail: controlled chroma, temperature-preserving
```

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

## Current Takeaway

Orange is the proof point.

It shows that Wassily can reach Tailwind-level beauty without giving up what
makes Wassily distinctive: exact seeds, inspectable metadata, explicit gamut
contracts, and a solver that can explain itself.

The next move is not to copy orange everywhere. The next move is to make every
family tell its own story with the same grammar.
