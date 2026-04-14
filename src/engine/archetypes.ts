/**
 * Ramp archetypes — the aesthetic model behind v4 ramp generation.
 *
 * Each archetype is a hue landmark with hand-authored parameters that
 * shape the **path** through OKLab, not per-stop curves. Archetypes
 * blend continuously around the hue wheel via circular Gaussian weights.
 *
 * The backbone is v3's arc-length OKLab interpolation — what changes
 * per archetype is where the endpoints sit (lightness, chroma, hue).
 * Perceptual evenness comes from arc-length sampling; family character
 * comes from endpoint positioning.
 *
 * Phase 1: 4 landmarks (lime, cyan, ultramarine, orange).
 */

// ---- Archetype Type ----

export interface Archetype {
  /** Landmark hue center (degrees) */
  hue: number;
  /** Chroma at light endpoint as fraction of gamut max at that (L, H). 0 = pure white, 1 = full gamut. */
  lightChromaScale: number;
  /** Hue shift at the light endpoint (degrees, negative = cooler) */
  lightHueOffset: number;
  /** Chroma at dark endpoint as fraction of gamut max at that (L, H). Higher = richer darks. */
  darkChromaScale: number;
  /** Hue shift at the dark endpoint (degrees) */
  darkHueOffset: number;
}

// ---- Phase 1 Landmarks ----

const ARCHETYPES: Archetype[] = [
  {
    // Lime / yellow-green: tinted highlights, darks drift warm (avoid olive)
    hue: 100,
    lightChromaScale: 1.0,
    lightHueOffset: -3,
    darkChromaScale: 1.0,
    darkHueOffset: -40,
  },
  {
    // Cyan: moderate highlights, slightly warmer darks
    hue: 195,
    lightChromaScale: 1.0,
    lightHueOffset: -2,
    darkChromaScale: 1.0,
    darkHueOffset: 8,
  },
  {
    // Ultramarine: clean highlights, rich dark retention, slight purple shift
    hue: 265,
    lightChromaScale: 1.0,
    lightHueOffset: 0,
    darkChromaScale: 1.0,
    darkHueOffset: -5,
  },
  {
    // Orange / warm red: subtle highlights, slightly warmer darks
    hue: 30,
    lightChromaScale: 1.0,
    lightHueOffset: -2,
    darkChromaScale: 1.0,
    darkHueOffset: 5,
  },
];

// ---- Blending ----

const BLEND_SPREAD = 40; // degrees — Gaussian width

/**
 * Blend all archetype landmarks into a single profile for the given hue.
 * Circular Gaussian weights — no buckets, smooth everywhere.
 */
export function blendArchetypes(hue: number): Archetype {
  const h = ((hue % 360) + 360) % 360;
  let totalWeight = 0;
  const weights: number[] = [];

  for (const a of ARCHETYPES) {
    let dh = h - a.hue;
    if (dh > 180) dh -= 360;
    if (dh < -180) dh += 360;
    const w = Math.exp(-0.5 * (dh / BLEND_SPREAD) ** 2);
    weights.push(w);
    totalWeight += w;
  }

  const result: Archetype = {
    hue: h,
    lightChromaScale: 0,
    lightHueOffset: 0,
    darkChromaScale: 0,
    darkHueOffset: 0,
  };

  for (let i = 0; i < ARCHETYPES.length; i++) {
    const w = weights[i] / totalWeight;
    const a = ARCHETYPES[i];
    result.lightChromaScale += w * a.lightChromaScale;
    result.lightHueOffset += w * a.lightHueOffset;
    result.darkChromaScale += w * a.darkChromaScale;
    result.darkHueOffset += w * a.darkHueOffset;
  }

  return result;
}
