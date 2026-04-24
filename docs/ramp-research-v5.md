# Wassily Ramp Research Working Doc

Living design memo and research log for Wassily's ramp-generation work. This started as the `v5` investigation and now also tracks the `v6` semantic solver direction.

This document should be updated as the work evolves. It is meant to capture:

- what we currently believe
- what we have already falsified
- what we need to test next
- what evidence is required before committing to a new architecture

## Context

Wassily's `v3` ramp engine in `src/engine/ramp.ts` moved in the right direction by sampling an OKLab path at equal arc-length intervals. That gave the system something `v4` lost: perceptual evenness by construction.

The current `v6` research solver in `src/engine/v6ResearchSolver.ts` keeps that perceptual backbone and adds a seed-constrained path solver plus semantic tonal roles for the 11-stop ladder. The focus has shifted from "smooth ramps" to "beautiful, coherent, design-system ramps from an exact anchor seed."

The failed `v4` experiment is still useful. It showed that "beauty-first" cannot mean replacing perceptual geometry with hand-shaped stop-index curves. Beauty has to enter as path design, endpoint selection, and family-specific behavior while preserving the perceptual backbone.

The image extraction system in `src/engine/extract.ts` is already better than naive palette extraction in a few important ways:

- It clusters in OKLCH instead of RGB.
- It adapts `k` to chromatic variance instead of forcing a fixed palette size.
- It uses peak-chroma representatives instead of averaged centroids.
- It scores clusters by a mix of vividness and population.
- It normalizes extracted chroma relative to the local gamut instead of flattening everything to the same intensity.

That is a strong base. The next research step is to connect ramp generation and image extraction to a stronger theory of perceptual spacing, gamut behavior, and aesthetic priors.

## Working Principles

These are the principles the research should defend unless strong evidence says otherwise.

1. **Seed fidelity is non-negotiable.**
   The exact seed color must appear in the generated ramp at the appropriate stop.

2. **Perceptual smoothness is non-negotiable.**
   `v3` proved that perceptual path geometry matters. Future versions should preserve evenness by construction wherever possible.

3. **Beauty must change the path, not replace the spacing model.**
   The failed `v4` showed that hand-shaped stop-index curves can destroy the very quality that made `v3` feel trustworthy.

4. **Hard colors are the real test.**
   Lime, yellow, cyan, violet, ultramarine, phthalo green, and warm/cool neutrals are more informative than easy middle-of-the-wheel hues.

5. **Research quality matters more than implementation convenience.**
   The goal is not to land on a neat algorithm quickly. The goal is to discover the best engine Wassily can plausibly own.

## Most Relevant Sources

### 1. Oklab

Source: [Bjorn Ottosson, "A perceptual color space for image processing"](https://bottosson.github.io/posts/oklab/)

Why it matters:

- Oklab was designed to predict perceived lightness, chroma, and hue while staying simple enough for interpolation and geometry.
- Constant-lightness / constant-chroma hue sweeps are much more even than HSV or HSL.

Meaning for Wassily:

- The solver should keep an Oklab or Oklch backbone unless a stronger alternative clearly outperforms it in practice.
- Interpolation quality should remain a first-class goal, not an implementation detail.
- Beauty work should happen on top of this space, not instead of it.

### 2. sRGB gamut geometry and cusp-aware clipping

Source: [Bjorn Ottosson, "sRGB gamut clipping"](https://bottosson.github.io/posts/gamutclipping/)

Why it matters:

- RGB clamping produces ugly hue distortions.
- Working in a perceptual space and moving colors along hue-preserving lines is a much better strategy.
- The shape of the gamut varies strongly by hue, and the "cusp" matters.

Meaning for Wassily:

- Hard colors such as lime, cyan, and violet should not be handled by raw chroma clipping alone.
- The solver should be cusp-aware when choosing highlight endpoints, dark endpoints, and shoulder points.
- Warm and cool neutral handling should be modeled as trajectories inside the gamut, not as arbitrary low-chroma exceptions.

### 3. Color Crafting

Source: [Smart, Wu, Szafir, "Color Crafting: Automating the Construction of Designer Quality Color Ramps"](https://arxiv.org/abs/1908.00629) and [project page](https://cmci.colorado.edu/visualab/ColorCrafting/)

Why it matters:

- This is the closest research match to the Wassily problem.
- It models the structure of 222 expert-designed ramps and generates new ramps from a single seed color.
- The key move is learning ramp shape from a corpus instead of relying on ad hoc formulas.

Meaning for Wassily:

- The important lesson is not "copy dataviz ramps."
- The important lesson is that beautiful ramps behave like structured families of curves, not one universal interpolation.
- If Wassily wants family-specific behavior for lime, ultramarine, phthalo green, warm neutral, cool neutral, and so on, a curve-family model is more promising than a pile of direct parametric tweaks.

### 4. Good Colour Maps

Source: [Peter Kovesi, "Good Colour Maps: How to Design Them"](https://arxiv.org/abs/1509.03700)

Why it matters:

- Kovesi's main claim is blunt and important: uniform perceptual lightness change is the most important property of a good sequential map.
- Uneven lightness creates flat spots and false features.

Meaning for Wassily:

- This validates the best part of `v3` and explains why the stop-index power curves in `v4` felt like a regression.
- Any prototype should preserve evenness metrics and monotonic lightness behavior wherever the chosen family intends it.
- Aesthetic priors are useful only if they do not destroy perceptual legibility.

### 5. HCL / sequential palette design heuristics

Source: [Achim Zeileis and Kurt Hornik, "Choosing Color Palettes for Statistical Graphics"](https://www.zeileis.org/papers/DSC-2007.pdf)

Why it matters:

- This paper captures practical palette trajectory ideas in a perceptual hue-chroma-lightness space.
- It treats sequential, diverging, warm, cool, and qualitative moods as trajectory design problems.

Meaning for Wassily:

- This is useful for neutral families and mood families.
- It also acts as a cautionary source: direct power-curve formulas are useful as shape priors, but they should not replace perceptual path sampling.
- The warm/cool subsets are relevant to Wassily's neutral story.

### 6. Human-extracted image themes

Source: [Lin and Hanrahan, "Modeling How People Extract Color Themes from Images"](https://www.sharondlin.com/papers/colorThemes.pdf)

Why it matters:

- Human theme extraction is not the same as vanilla clustering.
- People choose diverse colors and focus on salient image regions.
- The paper introduces evaluation ideas such as theme overlap and theme distance.

Meaning for Wassily:

- Image extraction should not be treated as "just k-means."
- Wassily's current extraction already moves in the right direction by preferring distinct vivid representatives over bland centroids.
- The next step is likely saliency-aware and diversity-aware extraction, especially if image-derived palettes are meant to seed ramps or style families.

### 7. CAM16-UCS as a comparator

Source: [CIE technical committee note on CAM16-UCS](https://cie.co.at/technicalcommittees/recommend-cam16-ucs-cie-uniform-colour-space) and [Li et al., "A Revision of CIECAM02 and its CAT and UCS"](https://library.imaging.org/cic/articles/24/1/art00035)

Why it matters:

- CAM16-UCS is a stronger appearance model than older Lab-style spaces under varying viewing assumptions.
- It is more expensive and more complex than Oklab.

Meaning for Wassily:

- CAM16-UCS is worth testing as a comparator for evaluation, especially for dark ramps and appearance-sensitive edge cases.
- It should not be the first implementation move. It is a benchmark question before it is an architecture decision.

## What This Means for Ramp Generation

### Working thesis

The research direction is to keep `v3`'s perceptual path sampling insight and make the path itself more intelligent. The current `v6` solver follows this direction by optimizing a seed-constrained path before semantic role shaping.

That means:

- Keep seed-exact behavior.
- Keep seed anchoring at the appropriate stop.
- Keep equal-distance sampling in a perceptual space.
- Move "beauty" into control-point placement, gamut-aware endpoint design, and family-specific path templates.

### Things to avoid

- Stop-index power curves as the main engine.
- Global hue drift rules that apply equally to lime, cyan, violet, ultramarine, and neutrals.
- Plain RGB clamping or generic chroma clipping.
- Overfitting eight different families before proving the architecture on the hardest hues.

### Things to investigate

- Cusp-aware endpoint placement for highlights and shadows.
- Control-point or shoulder-point models instead of raw endpoint-only interpolation.
- Family-specific path templates that still sample by arc length.
- Soft priors for hue families and warm/cool neutrals rather than rigid category buckets.

## What This Means for Image Color Extraction

Wassily already has a promising extraction stack. The next question is how to make extracted themes feel more human and more useful for downstream ramp generation.

### Current strengths worth keeping

- OKLCH-space extraction.
- Adaptive cluster count.
- Distinctiveness filtering.
- Peak representatives instead of averages.
- Gamut-relative chroma normalization.

### Research-backed upgrades

#### 1. Saliency weighting

Lin and Hanrahan found that people focus on salient regions instead of just the largest color masses. That suggests weighting pixels or regions by visual saliency before clustering or before final palette selection.

Possible implementation directions:

- Weight samples by a simple saliency map.
- Add edge density or local contrast as a proxy for saliency.
- Prefer colors from coherent salient regions over huge low-interest backgrounds.

#### 2. Diversity-aware theme selection

People pick representative themes, not just the top `k` cluster centers. Wassily already partially addresses this with `cullForDistinctiveness()`, but the next version could optimize for a small set that balances:

- coverage
- vividness
- saliency
- pairwise diversity

This is especially relevant if extracted colors become seeds for ramp generation or style inference.

#### 3. Region and role awareness

For product design, images often contain:

- background neutrals
- large body colors
- small accent colors

It may be useful to extract not one palette but two views:

- dominant colors
- accent colors

That would map more cleanly to how designers actually use reference images.

#### 4. Extraction as style input, not just swatch output

Long-term, image extraction can do more than produce 3-7 swatches. It can provide:

- likely temperature: warm / cool / mixed
- neutral tendency
- likely family bias
- candidate ramp mood for promoted colors

This would connect image extraction directly to the ramp engine without forcing full automation.

## Candidate Algorithm Families for v5

### Family A: Cusp-aware control-point paths in Oklab

Summary:

- Keep the seed exact.
- Choose an anchor stop based on seed lightness and local gamut geometry.
- Build a small set of control points:
  - tinted highlight endpoint
  - optional light shoulder
  - exact seed
  - optional dark shoulder
  - dark endpoint
- Interpolate through those points in Oklab and resample at equal arc length.

Pros:

- Closest to `v3`, lowest risk.
- Preserves perceptual evenness.
- Handles hard colors better if the control points are cusp-aware.
- Fits neutrals, warm neutrals, and cool neutrals naturally as special path shapes.

Cons:

- Needs good control-point heuristics.
- On its own, it does not learn aesthetic families from a corpus.

Best use:

- First prototype.

### Family B: Corpus-fit curve families on top of Oklab geometry

Summary:

- Build or curate a corpus of ramps Wassily actually admires.
- Represent each ramp as a normalized curve or control-point path.
- Cluster or fit families from that corpus.
- Given a seed, choose or blend a family and then instantiate it in Oklab, preserving exact seed anchoring and arc-length sampling.

Pros:

- Most directly aligned with the "beautiful, harmonious" goal.
- Learns family behavior instead of guessing it.
- Scales naturally to lime, yellow, cyan, violet, ultramarine, phthalo green, and neutral families.

Cons:

- Curation and fitting are the real work.
- Easy to build a biased or overfit corpus.
- More complex evaluation story.

Best use:

- Second prototype, after a geometry-first baseline exists.

### Family C: Reference-driven retrieval and blending

Summary:

- Treat imported palettes, extracted image themes, or curated reference ramps as style sources.
- Retrieve the closest family or blend a few references.
- Rebuild a new ramp around the exact seed using the retrieved structure, not just raw color copying.

Pros:

- Fits the product arc of starting from references.
- Gives "learn from palette" a concrete algorithmic path.
- Makes image extraction strategically important instead of just decorative.

Cons:

- Retrieval quality depends heavily on the library.
- Can feel imitation-heavy if the representation is naive.
- Harder to guarantee stable behavior across all hues.

Best use:

- Third-stage exploration once Wassily has a reliable curve-family representation.

## Current Recommendation

The current best path is still **Family A first**, but with a stricter quality-first rollout:

- do not treat the first prototype as the architecture
- do not jump to family templates before the geometry is proven
- do not ship based on visual hunches alone

The next sequence should be:

1. build the evaluation lab
2. run a minimal cusp-aware endpoint prototype on top of `v3`
3. compare that against a control-point variant before committing to a broader direction

This keeps the strongest part of `v3` intact while making space for genuinely better behavior at the ramp extremes.

That comparison has now been run. The current implication is:

- endpoint intelligence helps
- generic control points help
- neither is enough on its own for the full beauty target

The next serious question is whether the missing ingredient is:

- family-aware control-point behavior
- corpus-fit curve families
- or reference-conditioned retrieval / blending

That question has now started to resolve:

- a small weighted corpus can successfully replace several hand-authored family profile knobs
- the cleanest extraction path so far is to average reference control points in Oklab around a canonical exemplar for each family
- shoulder geometry still appears to be a separate fitting problem and should not be conflated with endpoint, hue, and intensity extraction

## Research Program

### Phase 0: Evaluation Lab

Goal:

- create a permanent test bench for future ramp experiments

Deliverables:

- fixed seed suite
- side-by-side visual board
- numerical diagnostics
- short notes for each experiment explaining what feels wrong and why

The lab should answer:

- are adjacent steps perceptually even
- does lightness remain monotone where intended
- does the seed land at the right stop
- do highlights carry visible hue
- do darks deepen without mud
- how much gamut compression is happening
- can we visually inspect the reference corpus, derived archetype, and resulting exemplar ramp side by side without reconstructing the fit by hand

### Phase 1: `v3` + cusp-aware endpoints only

Goal:

- test whether fixed endpoints are the main reason some families lose hue presence at the top and bottom of the ramp

Scope:

- keep arc-length sampling unchanged
- keep exact seed anchoring unchanged
- replace fixed endpoints with hue-aware endpoint search
- do not add shoulders or family templates yet

Why this is a good first probe:

- it isolates one hypothesis cleanly
- it preserves `v3`'s spacing model
- it directly targets the current weak-highlight problem for blue, pink, and other narrow-near-white hues

Limits:

- this will not solve lime's muddy darks or ultramarine's deep-blue retention by itself

### Phase 2: cusp-aware control-point paths

Goal:

- test whether endpoint intelligence alone is sufficient, or whether the path needs more structure

Scope:

- keep perceptual arc-length sampling
- add one optional shoulder on each side of the seed
- allow those control points to vary by hue family or by learned family shape

Why this phase exists:

- if Phase 1 improves endpoint hue presence but still feels generic or muddy, the problem is likely path shape, not endpoint choice

### Phase 3: learned or reference-conditioned family behavior

Goal:

- add family-specific aesthetic priors only after the geometric backbone is proven

Scope:

- fit family curves from a curated corpus
- or retrieve and blend from references and extracted themes
- preserve seed-exact and arc-length guarantees

Why this is later:

- otherwise the work risks becoming parameter tuning without a stable foundation

## Suggested Research Harness

Use a fixed set of seed colors and judge both perceptual evenness and aesthetic quality:

- bright lime
- cadmium-like yellow
- cyan
- violet
- ultramarine
- phthalo green
- warm neutral
- cool neutral

For each candidate algorithm, inspect:

- adjacent perceptual distance uniformity
- monotonic lightness behavior
- seed stop placement
- gamut clipping / compression severity
- whether highlights stay tinted
- whether darks deepen without mud

For extraction experiments, compare:

- current extraction
- saliency-weighted extraction
- diversity-optimized extraction

and judge whether the resulting palettes feel closer to what a designer would actually keep from the image.

## Lab Spec

### Fixed seed suite

Use at least the following seeds for all ramp experiments:

- bright lime
- cadmium-like yellow
- cyan
- violet
- ultramarine
- phthalo green
- warm neutral
- cool neutral
- one very light seed
- one very dark seed

### Quantitative checks

For each generated ramp, record:

- adjacent OKLab distance mean and variance
- monotonicity of lightness
- seed stop index and seed reconstruction error
- endpoint lightness
- endpoint gamut-relative chroma
- maximum hue drift from seed

### Visual checks

Each prototype should generate a fixed visual board showing:

- the full ramp
- the seed-highlighted stop
- the top three stops enlarged
- the bottom three stops enlarged
- a neutral comparison strip
- a note on what feels wrong or right

### Failure conditions

A prototype should be treated as failed if any of the following occur:

- perceptual spacing becomes visibly less even than `v3`
- seeded ramps become non-monotone at lightness extremes
- highlights only become more colored by getting unacceptably dark
- darks gain character only by becoming muddy or overly warm
- success depends mainly on ad hoc per-family tuning rather than stable rules

## Immediate Open Questions

1. What is the right objective for highlight endpoint search:
   maximize lightness subject to visible chroma, or optimize a weighted score of both?

2. Should highlight and dark endpoint selection use symmetric logic, or are they aesthetically different problems?

3. How should endpoint chroma respect seed intensity:
   should muted seeds remain muted even if the hue supports more color at the extremes?

4. Is cusp-aware endpoint placement enough for a compelling Phase 1, or does a single shoulder point already outperform it decisively?

5. Which image-extraction signal is most valuable to the ramp engine:
   saliency, diversity, temperature, or neutral tendency?

## Current Findings

### Confirmed

- `v3`'s arc-length Oklab interpolation is a real improvement in perceptual evenness.
- The failed `v4` regressed because it replaced perceptual geometry with stop-index power curves.
- A single universal behavior is unlikely to produce the best ramps across lime, cyan, violet, ultramarine, phthalo green, and neutrals.
- Cusp-aware endpoint search improves hue presence for narrow-near-white families such as ultramarine and violet.
- A minimal control-point path can fix some path-shape issues, but generic shoulders alone do not yet produce the family-specific beauty we want.
- A tiny amount of family-aware control-point behavior materially improves the target families:
  - lime darks stay greener
  - ultramarine darks retain blue identity
  - cyan darks drift bluer instead of warmer
  - neutrals stay quiet and temperature-stable
- A weighted curated corpus can replace much of the hand-authored family profile surface:
  - lime now blends a lime-forward reference with a smaller yellow-side counterweight
  - ultramarine is currently anchored to a blue-side reference rather than a generic blue-purple average
  - cyan is extracted from two distinct bright cyan corpora
  - neutral structure is averaged from gray, slate, and stone references while keeping hue offsets locked to zero
- The first corpus fit suggested a useful architectural split:
  - endpoint thresholds, hue tendencies, and intensity behavior can be learned from references now
  - shoulder placement is really a path-geometry problem, not another surface for taste-driven constants
- The projection-only and off-axis-bend stages were still valuable:
  - they confirmed that shoulder geometry carries real family signal
  - they also exposed the real failure mode: fitting each shoulder independently can leave the exact seed sitting inside a path that is locally incoherent
- The current model is a seed-centered normalized family path:
  - for each curated reference, build a shared OKLab frame centered on the seed
  - use the full light-endpoint ↔ dark-endpoint geometry to define the longitudinal flow axis
  - express both shoulders relative to the seed in that shared frame as progress plus two transverse offsets
  - average those coordinates jointly into a family archetype path shape instead of fitting two unrelated shoulders
  - map that averaged shape back onto the live endpoint / seed geometry at generation time while keeping the existing arc-length spacing model intact
- Reference alignment now matters more, not less:
  - chromatic references are rotated so their anchor stop is aligned to the canonical family exemplar before path fitting
  - this makes the learned archetype about family shape rather than about arbitrary corpus hue placement
  - neutrals remain unrotated and keep hue offsets pinned to zero
- Result:
  - lime now reads much more like a coherent family object around the seed instead of a hot isolated spike; its generated path stays tightly centered around `~121°` through the seed neighborhood and the fitted archetype carries that shape cleanly
  - ultramarine no longer needs a highlight-side patch; after exemplar alignment and joint path fitting, the generated ramp stays close to the seed-centered blue spine (`~263-265°`) instead of wandering into a violet hump and then recovering
  - the remaining judgment problem is now the right one: not "how do we patch the seed neighborhood?" but "is this archetype path beautiful enough to deserve being the family prior?"

### Former bug, now addressed by the probes

- The old `v3` implementation could become non-monotone or plateau at the extremes because the seed could lie outside the fixed endpoint range. The endpoint and control-point probes in `src/engine/ramp.ts` have now removed that specific failure mode, although extreme light seeds still need aesthetic evaluation.

## Working Log

### 2026-04-14

- Wrote the initial v5 research memo.
- Clarified the main lesson from `v3` vs failed `v4`: beauty should alter the path, not replace the spacing model.
- Chose three candidate algorithm families for `v5`.
- Elevated image extraction to a research track, not just a supporting feature.
- Shifted the plan from "implement the simplest plausible algorithm" to "build the evaluation lab first and use prototypes to answer architectural questions."
- Built the first Phase 0 harness in `src/engine/research.ts`.
- Added a fixed research seed suite covering lime, yellow, cyan, violet, ultramarine, phthalo green, warm neutral, cool neutral, and extreme light/dark seeds.
- Added reusable analysis metrics for seed placement, adjacent OKLab distance variance, lightness monotonicity, gamut violations, endpoint relative chroma, and hue drift.
- Added tests in `src/engine/__tests__/research.test.ts` to lock down the harness and verify extreme-seed behavior.
- Built the first Phase 1 probe in `src/engine/ramp.ts`: cusp-aware highlight and shadow endpoint search on top of the existing arc-length Oklab interpolation.
- Result: ultramarine and violet highlights now come down into the gamut enough to carry visible color; bright lime stays near the top of the lightness range.
- Result: endpoint search alone did not fully solve extreme top-end seed behavior.
- Built a first corpus-extraction path for family profiles in `src/engine/familyProfiles.ts`.
- Curated a small reference corpus drawn from Web Awesome bright ramps and Tailwind v3 ramps:
  - lime family: lime + yellow
  - ultramarine family: blue
  - cyan family: bright cyan + cyan
  - neutral family: gray + slate + stone
- Switched from hand-authored family profile constants to weighted corpus-derived archetypes:
  - references are aligned against canonical family exemplars
  - control points are averaged in Oklab
  - thresholds, hue offsets, and intensity tendencies are derived from those archetypal control points
- Kept shoulder mixes intentionally fixed for now.
- Reason: the corpus fit is already useful for endpoints, hue behavior, and chroma behavior, but shoulder placement still needs a real fitter rather than another round of taste-driven constants.
- Added an inspectable corpus-fit board:
  - generator: `scripts/generate-family-profile-board.ts`
  - command: `npm run research:family-board`
  - outputs:
    - `docs/generated/family-profile-board.html`
    - `docs/generated/family-profile-board.json`
- The board shows, for each derived family:
  - every curated reference ramp and its fitted anchor
  - the averaged archetype control points
  - the resulting Wassily exemplar ramp
  - fit metadata and core diagnostics
- Result: this phase improves endpoint hue presence without regressing the global test suite.
- Replaced the 3-point seeded path with a 5-point control path:
  - highlight endpoint
  - light shoulder
  - exact seed
  - dark shoulder
  - dark endpoint
- Result: the very-light seed plateau is gone. The top stop now reaches pure white and the exact seed can sit below it without duplicating the top lightness value.
- Result: ultramarine and violet keep the improved colored highlights from Phase 1.
- Result: bright lime still anchors high and the dark olive / mud problem is largely unchanged. Generic shoulders are not enough; the remaining gap appears to be family-specific path behavior, not just "more control points."
- Result: the control-point probe passes the test suite and gives a better shape baseline for future family-aware experiments.
- Added the first family-aware control-point experiment for four families: lime, ultramarine, cyan, and neutral.
- Result: bright lime darks now end around hue `103` instead of drifting into amber; the bottom stop is greener and less muddy, though also not as deep.
- Result: ultramarine darks now stay blue (`~253`) instead of warming toward purple, with a cleaner deep-blue identity.
- Result: cyan darks now drift bluer (`~228`) instead of warmer.
- Result: warm and cool neutrals now stay temperature-stable with effectively zero hue drift and very low endpoint chroma.
- Result: this is the first probe that feels genuinely family-aware rather than merely family-tolerant.
- Replaced the fixed shoulder-mix templates with a corpus-fit shoulder geometry pass.
- Method:
  - for each curated reference, project the light shoulder onto the light-endpoint→seed OKLab segment
  - project the dark shoulder onto the seed→dark-endpoint segment
  - average those progress values with corpus weights and feed the result back into ramp generation
- Added shoulder-fit visibility to the research board and JSON output so the learned geometry is inspectable instead of implicit.
- Result:
  - lime, cyan, and neutral families fit cleanly with low projection residuals
  - ultramarine's light shoulder still has a materially larger residual, which is a useful signal that the remaining gap is real curve shape, not just better scalar placement
- Result: this is a better research baseline because shoulder placement is now learned from the corpus while still keeping the path model simple enough to reason about.
- Replaced scalar-only shoulder fitting with a local off-axis bend fit.
- Method:
  - for each reference shoulder, keep the projected segment progress
  - measure the residual in a local OKLab frame built from the endpoint-to-seed segment plus two perpendicular bend axes
  - average those bend coefficients with corpus weights and feed them back into generated shoulder placement
- Added bend coefficients to the family board and JSON output so the fitted curve shape is inspectable instead of hidden in engine internals.
- Result:
  - the global suite still passes, which means the bend fit is compatible with the current ramp invariants
  - ultramarine now learns the strongest light-shoulder bend, matching the earlier residual warning
  - neutral bends are intentionally held at zero in synthesis for now because the measured residuals are small and allowing them through slightly degraded neutral hue stability
- Replaced the independent-shoulder model with a seed-centered normalized family path fit.
- Method:
  - build a shared OKLab frame for each reference path with the exact seed at the origin
  - define the main flow axis from the full light-endpoint ↔ dark-endpoint geometry, then derive two transverse axes
  - project both shoulders into that frame as one joint local shape
  - average those seed-relative coordinates with corpus weights
  - reconstruct the averaged family archetype path on both the averaged reference geometry and the live runtime geometry
- Tightened corpus alignment so the fitter learns family shape instead of accidental corpus hue placement:
  - chromatic references are hue-rotated to the canonical family exemplar before control points are fitted
  - neutral references are left in place
- Result:
  - the global suite still passes, which means the seed-centered fit preserves the spacing backbone and monotone runtime behavior
  - lime's fitted archetype now closely matches the generated seed neighborhood instead of leaving the seed as an isolated chroma spike
  - ultramarine's generated ramp now stays on a much more convincing blue spine, with highlight-side drift reduced from the earlier violet hump to a tight `~263-265°` band through the seed and dark tail
  - the research board is now showing the right object: not just shoulder coefficients, but an actual transferable family path archetype

## V6 Status

- `v6` is now a seed-constrained path solver with corpus-conditioned regularization, not just a family-profile variant of `v5`.
- The important architectural pieces now in play are:
  - solve a continuous OKLab path first
  - keep the exact seed as a hard constraint
  - evaluate path density before stop sampling
  - sample the ladder from the solved path
  - regularize the solve against a curated reference corpus instead of hand-authored family constants
- The solver score is currently made of three layers:
  - hard validity:
    - exact seed match
    - sampled ladder monotonicity
    - gamut containment pressure
  - path-quality terms:
    - curvature and jerk
    - hue wobble
    - continuous path density
    - light-side entrance cadence
  - corpus regularization:
    - endpoint reserve
    - endpoint intensity
    - seed-tangent behavior
    - family-conditioned energy targets

### What improved

- The path now wants perceptually smoother density before the ladder is sampled, so cadence comes more from the solved geometry and less from after-the-fact spacing checks.
- Light-end cadence is now explicitly controlled, so the top of the ramp is less likely to bleach the `50` and then take a conspicuously large first step.
- Highlight and shadow behavior are less entangled:
  - the path can leave the seed differently toward light and dark
  - shadow depth and chroma no longer have to inherit the same local geometry as the light side
- The soft prior is now seed-position-aware:
  - each curated reference is aligned to the stop that best matches the live seed
  - family affinity is then applied on top of that aligned stop so the solver does not regularize cyan toward blue or a neutral toward a chromatic family just because a single stop is locally close
- The hard monotonicity check now lives on the sampled ladder instead of every intermediate cubic sample, which removes the false "impossible" failure mode for very-light seeds.

### Current reading of the remaining failures

- The remaining misses no longer feel like bad thresholds or missing guardrails.
- They mostly look like missing continuous priors:
  - some top-end seeds still want a more beautiful highlight envelope, not merely a safer `50`
  - some neutrals still feel too scalar or too linear in their chroma progression even when they are technically stable
  - some chromatic families still need a stronger idea of where color should live along the path, not only how much color the endpoints may keep
- That is a healthy state for the project. The next gains should come from better family-conditioned path models, not from more isolated patches.

## Next Pushes for V6

1. Add a continuous family-shape prior over the whole path.
   We already compare endpoint reserve, endpoint intensity, and tangent behavior. The next elegant move is to compare the full solved path, expressed in the same seed-centered frame as the corpus, against a weighted family envelope.

2. Learn chroma distribution along normalized path progress.
   Right now the solver knows a lot about endpoint chroma but much less about where chroma should accumulate or thin out along the path. A family-conditioned chroma-density prior should help neutrals stay quiet, cyan keep energy in the upper mids, and ultramarine avoid washing out too early.

3. Give the light and dark halves distinct family-conditioned progress priors.
   The current split handles are a good first move, but the next step is to model highlight and shadow progress as related rather than symmetric subproblems so bright seeds can keep a believable highlight envelope without compromising shadow cadence.

4. Move from single-stop prior alignment to soft stop neighborhoods.
   The current aligned prior picks the best matching stop per reference ramp. That is already much better than assuming every seed is a reference `500`, but the more continuous version is to softly blend nearby aligned stops so the prior varies smoothly as the seed moves through the ladder.

5. Build a path-beauty board, not just a ramp board.
   The current research lab shows the solved ramps and metrics. The next useful board should overlay:
   - the seed-centered family archetype path
   - the live solved path
   - local deviation along the path
   That would let us judge whether a miss comes from the family model, the solver objective, or the sampling stage.

## Current Direction After the Semantic Role Pass

The v6 work has shifted the goal from "generate a smooth set of colors" to "generate a semantic design-system ramp from an anchor seed." This is a meaningful distinction.

The 11-stop ladder now carries role meaning:

- `50` should be tinted paper, not white.
- `100/200` should bridge into high-chroma seeds without a perceptual cliff.
- The seed should remain exact and should land where its color actually belongs.
- `700/800/900/950` should read as a deliberate descent into colored ink.
- `950` should not collapse into generic black.

This role layer does not replace perceptual spacing. It sits on top of the solved OKLab path and gives the tonal labels product meaning. The best ramp should be both perceptually coherent and semantically useful.

Current hard-case reading:

- Bright lime is the stress test for high-lightness, high-chroma cusp behavior.
- Cyan is the stress test for pale tints that still need family signal.
- Phthalo green is the stress test for cool green identity through the body and tail.
- Ultramarine / blue-violet is the stress test for dark-tail cadence and chromatic ink.
- Neutrals are the stress test for restraint: quiet paper, quiet ink, no accidental color theatrics.

The next algorithmic gains should come from better continuous family priors rather than broad endpoint movement:

1. Keep the semantic role envelope, but make it less hand-shaped over time.
2. Learn family-specific chroma density along normalized progress.
3. Add a path-beauty board that exposes the live path, role envelope, and corpus archetype together.
4. Continue using the gauntlet as the regression gate for hard colors and near-neighbor perturbations.
5. Treat Tailwind/Web Awesome-style systems as references, not targets to copy exactly.

### 2026-04-15

- Built the first full `v6` solver path in `src/engine/v6ResearchSolver.ts`.
- Added a dedicated side-by-side research lab:
  - generator: `scripts/generate-research-lab.ts`
  - command: `npm run research:lab`
  - outputs:
    - `docs/generated/research-lab.html`
    - `docs/generated/research-lab.json`
- Added a continuous path-density objective so the path itself is encouraged toward uniform perceptual density before the ladder is sampled.
- Added local light-entrance control so the top of the ladder is judged as an entrance shape rather than only as pairwise spacing.
- Split seed-exit geometry so the solved path can leave the seed differently toward highlight and shadow.
- Switched gamut pressure from summed excursion to mean excursion so saturated paths do not self-desaturate just to avoid many tiny out-of-gamut penalties.
- Added shadow-aware endpoint reserve / intensity pressure.
- Reworked the soft prior so references are aligned to the seed's best-matching stop instead of assuming the live seed corresponds to every reference `500`.
- Added family-affinity weighting on top of that aligned-stop match so local similarity does not override family identity.
- Moved the hard monotonicity penalty onto the sampled ladder rather than every intermediate cubic sample.
- Result:
  - the remaining misses are now much more clearly shape-prior problems rather than anchor-selection mistakes or invalidity bugs
  - the next useful work should focus on continuous family-conditioned path and chroma-distribution priors, not another round of isolated endpoint patches

### 2026-04-23 / 2026-04-24

- Reframed the v6 output around semantic tonal roles for the Tailwind-style 11-stop ladder.
- Added a tonal role envelope in `src/engine/v6ResearchSolver.ts`:
  - chromatic `50` now targets tinted paper around `L 0.958`
  - neutral `50` targets quieter paper around `L 0.955`
  - chromatic `950` is lifted/deepened into colored ink by family, generally around `L 0.24-0.28`
  - neutral `950` targets quiet ink around `L 0.22`
  - exact seed placement remains a hard constraint after role shaping
- Added high-lightness cusp handling for bright lime:
  - extreme yellow-green seeds can anchor at `200`
  - `50/100/200` are shaped as a deliberate tint-to-flash bridge
  - the body and tail keep lime identity without turning into mud
- Tuned tint occupancy by family:
  - cyan/aqua keeps stronger family signal in `50`
  - phthalo/green-cyan keeps more chroma in the light tint
  - neutrals stay low chroma
- Tuned ink behavior by family:
  - lime keeps colored olive-green ink instead of black
  - cyan/phthalo keep readable dark color without tail collapse
  - ultramarine / blue-violet now gets a deeper but still chromatic ink endpoint and a slightly more linear dark-tail cadence
- Added an anchor-aware dark-tail progression:
  - `400`-anchored ramps descend more evenly through `700/800/900/950`
  - `500`-anchored phthalo/ultramarine paths keep a stronger semantic ink curve
- Added the broader visual stress matrix:
  - generator: `scripts/generate-research-gauntlet.ts`
  - command: `npm run research:gauntlet`
  - outputs:
    - `docs/generated/research-gauntlet.html`
    - `docs/generated/research-gauntlet.json`
- The gauntlet currently covers 26 seeds across:
  - neutrals
  - warm hues
  - greens
  - cool hues
  - perturbations around lime, cyan, and phthalo
- Current gauntlet status after this pass:
  - `ok 26`
  - `watch 0`
  - `fail 0`
- Focused hard-case readings after the pass:
  - Bright Lime: `50 L 0.958`, `950 L 0.276`
  - Cyan: `50 L 0.958`, `950 L 0.273`
  - Phthalo Green: `50 L 0.958`, `950 L 0.270`
  - Ultramarine: `950 L 0.238`, still chromatic blue ink rather than black
- Added/updated tests to protect the new aesthetic contract:
  - semantic tint and ink roles
  - neutral endpoint cadence
  - hard chromatic dark-tail liveliness
  - blue-violet ink cadence
- Verification at commit `245725c`:
  - `npm run test:run`: 173 passed
  - `npm run lint`: passed
  - `npm run build`: passed
- Deployed to GitHub Pages via the existing `main` push workflow.
