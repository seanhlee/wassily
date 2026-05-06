# Design Research: Lyft ColorBox + Neutone Morpho + Teenage Engineering

Three reference points analyzed for interaction design and color system inspiration.

## References

- **Lyft / ColorBox** (2018) — Kevyn Arnott rebuilt Lyft's color system programmatically, open-sourced as [ColorBox.io](https://www.colorbox.io). Systematic approach to generating accessible color ramps with per-dimension easing curves.
- **Neutone Morpho** — Real-time AI tone morphing audio plugin. Input sounds are resynthesized into a different style while preserving the original sound's shape. Curated model collection + custom model training. [neutone.ai/morpho](https://neutone.ai/morpho)
- **Teenage Engineering OP-1 field / OP-XY** — Instruments that hide enormous depth behind constrained, gestural, mode-based interfaces. Gold standard for professional creative tools that feel playful and immediate. [teenage.engineering](https://teenage.engineering)

---

## Part 1: Lyft / ColorBox

### What Lyft Got Right (and Wassily Already Has)

1. **Programmatic generation over hand-picking** — Lyft's core thesis: designer-picked colors create an expiration date. Math doesn't drift. Wassily embodies this already with purification + opinionated ramp generation.

2. **The yellow-blue problem** — Same algorithm applied uniformly to different hues produces inconsistent results. Wassily's locked brand-exact fairing algorithm addresses this by starting from the v6 seed-constrained OKLab solver, then rebalancing the visible stops around the exact seed with special pressure for hard cases like bright lime, cyan, phthalo green, and blue-violet. This is the app-facing answer for this ship, but it should still be judged visually rather than treated as a solved design principle.

3. **Non-uniform tonal distribution** — Lyft needed "pockets of concentration in light and dark shades with only a few middle shades." Wassily's 11-stop ladder now treats `50`, `100/200`, body stops, and `900/950` as semantic names, then lets brand-exact fairing make the visible stops perceptually even. The role model is finally producing promising ramps because paper and ink are soft outcomes, not hard overrides.

4. **Color naming with numeric scale** — Lyft: hue name + 0-100. Wassily: hue name + Tailwind stops (50-950). Both work.

### What's Worth Learning from ColorBox

**Accessibility encoded in the naming convention.** Every Lyft color 0-50 passes AA on black, 60-100 passes AA on white. Just hearing "Red 60" tells you it's accessible. Wassily has WCAG dots and connection contrast ratios, but stop numbers don't inherently communicate accessibility. A visible threshold marker on ramps could bridge this.

**Easing curves for tonal distribution.** ColorBox uses configurable easing (easeOutQuad, easeInQuart) per dimension. Wassily's v6 solver currently owns the analogous decisions internally through path scoring and semantic role shaping, but the resulting taste is not yet there. A future "tonal bias" gesture could expose that control without turning the tool into a settings panel.

**Hue rotation across the ramp.** ColorBox sweeps hue across a range (e.g., 220-240 degrees). Wassily already uses family-aware hue and chroma behavior, but an optional expressive "hue sweep" style could still be useful when the goal is atmosphere rather than neutral design-system output.

**Locked/pinned stops.** ColorBox pins specific steps to exact colors. Wassily only implicitly snaps the closest stop to seed chroma. Multi-pin support would help retrofit existing brand palettes.

### What Wassily Already Does Better

- OKLCH native (ColorBox was HSV first, OKLCH added later)
- Seed-constrained OKLab solving with exact anchor preservation
- Semantic tint/body/ink roles instead of raw per-channel curves
- Family-aware hard-case handling without manual user tuning
- Chroma and hue behavior scored perceptually instead of linearly
- Purification (colors *enter* the system, not just generated from parameters)
- Dark mode as parallel generation (ColorBox has none)
- Hue-adaptive warm shadow drift
- Spatial canvas with connections and harmonization

---

## Part 2: Neutone Morpho — The Audio Analogy

Morpho is to sound what Wassily is to color.

### The Core Parallel

| Morpho (Audio) | Wassily (Color) |
|---|---|
| Input sound → resynthesized in new style | Input color → purified to ideal expression |
| "Keeps the overall shape intact" | "Hue is sacred — purification never changes it" |
| Pre-trained models = aesthetic directions | Ramp styles / solver priors = aesthetic directions |
| Mix knob (wet/dry) | M key (opinionated/pure) |
| Model browser = collection of aesthetics | Currently: one fixed opinion set |
| Custom model training = your sounds become your instrument | **No equivalent yet** |
| Serendipity macro = controlled randomness | Random click = binary serendipity |
| Resolution macro = fidelity control | Stop count (3/5/7/9/11/13) = resolution |

### The Deep Insights

**1. Models as Ramp Styles (the biggest idea)**

Each Morpho model IS a creative instrument. "Beating Djembe" encodes a specific aesthetic — not just EQ settings, but a learned *character*.

Applied to Wassily: What if there were **ramp styles** — named aesthetic directions:

- **"Natural"** — current default (semantic tints, perceptual body cadence, chromatic ink)
- **"Clinical"** — pure math mode but with gamut safety
- **"Brutalist"** — flat chroma, no drift, maximum contrast between stops
- **"Sunset"** — heavy warm drift throughout, chroma peaks in 300-500 range
- **"Deep Sea"** — cool drift in both directions, chroma suppressed in lights
- **"Neon"** — near-constant high chroma, minimal contouring

Each style would be a set of solver priors and semantic role preferences: tonal envelope, chroma density, hue drift, seed-exit geometry, and ink behavior. The current brand-exact default is the locked opinionated algorithm; future styles should feel like different instruments, not exposed math parameters.

**2. Custom Model Training → "Learn From Palette"**

Morpho: "Artists make art, not data." You supply sounds, Morpho learns a sonic character.

Applied to Wassily: **Import an existing palette and reverse-engineer its style.** Drop in Stripe's color system and Wassily analyzes:
- The lightness distribution curve
- The chroma contour
- The hue drift pattern
- The dark mode relationship

This creates a custom "style" that can be applied to ANY new hue. The PRD already lists "Reference import" as a future consideration. Morpho's framing makes this feel more like training an instrument than importing data.

**3. The Mix Knob as First-Class Interaction**

Morpho's Mix is THE interaction — front and center, not buried in settings.

Wassily's M key is binary (on/off). What if instead there were a **continuous opinion strength**?

```
0% ────────────── 50% ────────────── 100% ────────── 150%
Pure math       Lightly opinionated    Default         Extra dramatic
```

Gesture: **hold M + scroll** to adjust opinion strength.

**4. Serendipity as a Continuous Parameter**

A serendipity parameter could introduce:
- Subtle hue variation between stops (organic wobble, not uniform drift)
- Asymmetric chroma contour
- Micro-lightness perturbation

Ramps that feel *found* rather than *computed*.

**5. "Keeping the Shape Intact"**

What if you could "morph" one ramp's style onto another ramp's hue? The first ramp's hue is preserved, but its lightness curve, chroma contour, and drift pattern are replaced with the second ramp's. The shape of one, the character of another.

**6. Curation > Generation**

When a pasted color gets purified, show what changed and why. The purification moment ("the murk burns off") is the equivalent of Morpho showing you what its model does to your input. Make it visible.

---

## Part 3: Teenage Engineering — The Interaction Analogy

### The Design Principles

**1. Constraints as features, not limitations**

TE deliberately limits choices. Hick's Law: fewer choices = faster decisions = more flow. Wassily already embodies this — no color picker wheels, no HSL sliders, no panels. Resist adding settings panels. Every new parameter should be a gesture, not a setting.

**2. Modes over menus**

TE products switch between distinct modes rather than nesting features in menus. Applied to Wassily:
- **M key** = opinion mode (could become a continuous dial)
- **D key** = dark mode
- **V key** = accessibility view mode (contrast boundaries, WCAG markers)
- **T key** = token view (export names instead of color values)

Each mode is a *lens* on the same data, not a different screen.

**3. Colorless UI where content is the color**

OP-XY: all-black, grayscale display, ONE accent color (bright red for recording/locks). Wassily's shipped canvas currently starts light and can toggle dark, but the deeper rule is the same in both modes: the color is ONLY the swatches, ramps, images, and sampled pixels. The UI itself stays colorless. **Validate this aggressively.** One exception: a single system accent for active/locked states.

**4. Playful visual metaphors that teach**

OP-1's screen UI: tape reels spin, Tombola balls bounce, FM radio dial turns. These are **functional metaphors that teach the user what the engine does** without documentation. Applied to Wassily:
- **Purification**: a shimmering/settling animation
- **Harmonization**: brief geometric overlay (complementary arc, triadic triangle)
- **Ramp generation**: animate stop-by-stop
- **Chroma contouring**: faint curve overlay on hover

The key TE lesson: **the visual metaphor should make the algorithm legible.**

**5. Step components as composable micro-behaviors**

OP-XY's 14 step components are modular behaviors that can be stacked on any step. Applied to Wassily: the 6 opinions could be independently toggleable "components" per ramp. A style IS a specific combination of opinion components with specific intensities.

**6. Typographic austerity as brand identity**

TE uses disciplined typography everywhere. Uppercase labels. One size, one restrained chrome voice. Wassily uses PP Neue Montreal Text at 11px, uppercase labels with -0.55px letter-spacing. **Don't break it.** No decorative hierarchy. No italics. No size changes. The color IS the visual hierarchy.

### The Meta-Lesson: Instruments, Not Applications

Wassily should be an instrument: no onboarding tour, no empty state with instructions, no settings panel. Every action is a gesture. You learn by doing. The canvas is empty. Dark. Ready. You begin.

---

## Part 4: Just-in-Time UI — The Unifying Design Principle

The throughline across all three references: **Just-in-Time UI (JIT UI)** — precise controls that materialize at the point of interaction, serve their purpose, then vanish.

No panels. No sidebars. No property inspectors. No persistent dials. The canvas is empty except for your colors. When you need a control, it's already there — composed from the object you're touching. When you don't, it's gone.

### The Workflow: Moodboard → Color System

```
COLLECT          →  ARRANGE       →  PROMOTE      →  HARMONIZE    →  REFINE         →  EXPORT
paste, drop,        spatial           R = ramp         H = harmonic     JIT dials         Cmd+E
click, sample       grouping          from swatch      geometry         for opinions       tokens
```

The first four steps already exist. **Refine** is where JIT UI lives — the moment when you need precision but don't want to leave the canvas.

### JIT Controls on a Swatch

The swatch IS the control surface.

- **Scroll on swatch:** Hue rotates. A faint hue arc ghosts in around the swatch — then fades when you stop.
- **Drag vertical:** Lightness adjusts. A faint vertical scale ghosts in — then fades on release.
- **Drag horizontal:** Chroma nudges. A faint horizontal bar shows chroma relative to gamut max — then fades.

These are **spectral controls** — afterimages of the gesture, confirming what you're doing, then dissolving.

### JIT Controls on a Ramp

- **Hold M + scroll:** Opinion strength dial. A small arc appears below the ramp strip (0%→150%). Release M → arc fades, ramp keeps its setting. Morpho's Mix knob, composed just-in-time.
- **Hold M + click near stop:** Individual opinion toggles appear as tiny dots along the ramp edge. Click to toggle. Release M → dots fade. TE's step components, composed just-in-time.
- **Scroll on a stop:** Fine-tune that stop's hue. A faint hue indicator ghosts in.
- **Drag a stop vertically:** Fine-tune lightness. Neighbors adjust smoothly.

### The Philosophy

**The object IS the interface.** A swatch is a hue knob, a lightness slider, and a chroma dial — depending on how you touch it. A ramp is an opinion strength control, a stop-level editor, and an export source. The UI is never "added to" the canvas — it emerges from the canvas objects themselves.

A piano key doesn't have a "velocity settings" panel — you just press harder.

---

## Prioritized Recommendations

### Tier 1: Reinforce What's Already Right
1. **The instrument mentality** — Every new feature = a gesture or a mode, never a menu item
2. **Color is the only color** — Keep UI colorless, one possible system accent for active/locked states
3. **Typographic austerity** — PP Neue Montreal Text/11px/uppercase, don't break it

### Tier 2: JIT Visual Feedback (Spectral Controls)
4. **Ghost controls on gesture** — Faint hue arc, lightness scale, chroma bar that appear during gestures and fade on release
5. **Purification delta flash** — Brief ghost showing chroma gain + lightness shift when a color enters
6. **Harmonization geometry overlay** — Brief geometric relationship flash when H is pressed
7. **Accessibility boundary on ramps** — Subtle 1px tick mark where AA thresholds fall

### Tier 3: JIT Precision Dials
8. **Opinion strength dial (hold M + scroll)** — 0% pure math → 100% default → 150% dramatic
9. **Opinion component toggles (hold M + click)** — Individual opinions on/off per ramp
10. **Ramp generation animation** — Stops build sequentially, light to dark

### Tier 4: Ramp Styles & Learning
11. **Ramp styles as presets** — Named aesthetic directions, browsable via JIT picker
12. **Learn From Palette** — Import palette, reverse-engineer opinion parameters as custom style
13. **Locked/pinned stops** — Pin stops to exact colors, interpolate around them
14. **View modes** — V = accessibility lens, T = token lens
