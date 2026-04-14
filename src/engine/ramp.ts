/**
 * Ramp Generation v2.
 *
 * Based on research from ColorBox, Tailwind v4, and Radix Colors.
 * Uses parametric easing curves instead of fixed lookup tables.
 * Chroma is gamut-relative — expressed as a percentage of the
 * maximum available at each (L, H) point.
 */

import type { OklchColor, RampStop, RampConfig, StopPreset } from "../types";
import { maxChroma, clampToGamut, NEUTRAL_CHROMA } from "./gamut";
import { interpolate, oklch as toOklch, oklab as toOklab } from "culori";

// ---- Stop Presets ----

const STOP_PRESETS: Record<StopPreset, string[]> = {
  3: ["200", "500", "800"],
  5: ["100", "300", "500", "700", "900"],
  7: ["100", "200", "400", "500", "600", "800", "900"],
  9: ["50", "100", "300", "400", "500", "600", "700", "900", "950"],
  11: [
    "50",
    "100",
    "200",
    "300",
    "400",
    "500",
    "600",
    "700",
    "800",
    "900",
    "950",
  ],
};

// ---- Easing Functions ----

/** Quadratic ease-in: slow start, fast end */
function easeInQuad(t: number): number {
  return t * t;
}

/** Cubic ease-in: slower start, faster end */
function easeInCubic(t: number): number {
  return t * t * t;
}

// ---- Lightness Curve ----

const L_MAX = 0.98;
const L_MIN = 0.25;

/**
 * Compute lightness for a given stop position (0=lightest, 1=darkest).
 * Uses easeInQuad — more resolution in the light/mid range,
 * compressed in the darks.
 */
function lightnessAt(t: number): number {
  return L_MAX - (L_MAX - L_MIN) * easeInQuad(t);
}

// ---- Hue Drift ----

/**
 * Hue rotation toward amber for dark stops.
 *
 * Yellow-green hues need massive rotation (up to 50°) to avoid
 * olive. Blue/red/purple need only subtle warming (5-8°).
 *
 * The rotation uses easeInCubic — accelerating toward the dark end.
 */
function hueDriftAt(t: number, seedHue: number): number {
  const h = ((seedHue % 360) + 360) % 360;

  // Cool highlight lift for light stops (t < 0.3)
  if (t < 0.3) {
    const coolAmount = (0.3 - t) / 0.3; // 1 at t=0, 0 at t=0.3
    return -coolAmount * 4; // up to -4° cooler
  }

  // Warm drift for dark stops (t > 0.4)
  if (t <= 0.4) return 0;

  const warmT = (t - 0.4) / 0.6; // normalized 0-1 for the warm zone

  // Target hue for darkest stops: warm amber (H≈50)
  const warmTarget = 50;
  let delta = warmTarget - h;
  if (delta > 180) delta -= 360;
  if (delta < -180) delta += 360;

  // Intensity: yellow-green zone gets full drift, others get subtle
  let intensity: number;
  if (h >= 60 && h <= 130) {
    // Yellow-green: full intensity
    const center = 95;
    const spread = 35;
    intensity = Math.exp(-0.5 * ((h - center) / spread) ** 2);
    intensity = 0.3 + intensity * 0.7; // minimum 30%, max 100%
  } else if (h > 130 && h <= 180) {
    // Teal: tapering
    intensity = 0.3 * (1 - (h - 130) / 50);
  } else {
    // Blue, purple, red: subtle base drift
    return easeInQuad(warmT) * 8; // up to +8°
  }

  const maxShift = Math.abs(delta);
  const direction = delta >= 0 ? 1 : -1;

  return direction * Math.min(maxShift, 55) * easeInCubic(warmT) * intensity;
}

// ---- Dark Mode Adjustments ----

function darkModeAdjust(
  l: number,
  c: number,
  h: number,
  t: number,
): OklchColor {
  let darkL = l;
  let darkC = c;
  const darkH = h;

  if (t < 0.3) {
    // Light stops: reduce lightness slightly (avoid harsh white on dark bg)
    darkL = l - 0.03;
    darkC = c * 0.9;
  } else if (t < 0.6) {
    // Mid stops: bump lightness, reduce chroma (avoid vibration)
    darkL = l + 0.06;
    darkC = c * 0.85;
  } else {
    // Dark stops: slight chroma boost for richness
    darkL = l + 0.01;
    darkC = c * 1.05;
  }

  darkL = Math.max(0.05, Math.min(0.98, darkL));
  return clampToGamut({ l: darkL, c: darkC, h: darkH });
}

// ---- Neutral Ramp ----

function generateNeutralStop(
  t: number,
  seedHue: number,
  seedChroma: number,
): { light: OklchColor; dark: OklchColor } {
  const l = lightnessAt(t);
  const drift = hueDriftAt(t, seedHue);
  const h = (((seedHue + drift) % 360) + 360) % 360;
  const c = seedChroma * (0.5 + 0.5 * (1 - Math.abs(t - 0.5) * 2));

  const light = clampToGamut({ l, c, h });
  const dark = darkModeAdjust(l, c, h, t);
  return { light, dark };
}

// ---- OKLab Arc-Length Interpolation ----

/**
 * Arc-length parameterized 3-point OKLab interpolation.
 *
 * Three anchors: tinted white → seed → hue-drifted dark, interpolated
 * in Cartesian OKLab. Stops are sampled at equal OKLab Euclidean distances
 * along the two-segment path, giving perceptually even steps.
 *
 * The seed naturally falls wherever its OKLab distance from white places it —
 * light seeds land near the top, dark seeds near the bottom, mid-tones near
 * the center. No explicit seed classification needed; the geometry adapts.
 *
 * The white endpoint is tinted (max gamut chroma at L_MAX, scaled by seed
 * intensity) so the lightest stop carries the seed's hue character.
 * The dark endpoint carries the full hue drift (amber warming) and
 * gamut-relative chroma at L_MIN.
 */
function interpolateArcLength(
  seedL: number,
  seedC: number,
  seedH: number,
  seedIntensity: number,
  totalStops: number,
): OklchColor[] {
  // White endpoint: slightly below L_MAX so the gamut has room for visible
  // chroma. At L=0.98 most hues get C≈0.009 — invisible. At 0.96, twice that.
  // If the seed is lighter, expand to include it (avoids path doubling back).
  const whiteL = Math.max(0.96, seedL);
  const whiteC = maxChroma(whiteL, seedH) * seedIntensity;
  const whiteEnd = { mode: "oklch" as const, l: whiteL, c: whiteC, h: seedH };

  const seedPt = { mode: "oklch" as const, l: seedL, c: seedC, h: seedH };

  // Dark endpoint: L_MIN, full hue drift, gamut-relative chroma.
  // If the seed is at or below L_MIN, push the dark endpoint further down
  // so the path doesn't double back or collapse to zero length.
  const fullDrift = hueDriftAt(1.0, seedH);
  const darkH = (((seedH + fullDrift) % 360) + 360) % 360;
  const darkL = L_MIN < seedL ? L_MIN : Math.max(0.05, seedL - 0.05);
  const darkC = maxChroma(darkL, darkH) * seedIntensity;
  const darkEnd = { mode: "oklch" as const, l: darkL, c: darkC, h: darkH };

  // Convert to OKLab for distance computation
  const whiteOklab = toOklab(whiteEnd)!;
  const seedOklab = toOklab(seedPt)!;
  const darkOklab = toOklab(darkEnd)!;

  // OKLab Euclidean distances for each segment
  const d1 = Math.sqrt(
    (whiteOklab.l - seedOklab.l) ** 2 +
      (whiteOklab.a - seedOklab.a) ** 2 +
      (whiteOklab.b - seedOklab.b) ** 2,
  );
  const d2 = Math.sqrt(
    (seedOklab.l - darkOklab.l) ** 2 +
      (seedOklab.a - darkOklab.a) ** 2 +
      (seedOklab.b - darkOklab.b) ** 2,
  );
  const total = d1 + d2;

  // Build segment interpolators
  const interpLight = interpolate([whiteEnd, seedPt], "oklab");
  const interpDark = interpolate([seedPt, darkEnd], "oklab");

  // Sample at equal OKLab distance intervals
  const seedFrac = total > 0 ? d1 / total : 0.5;
  const results: OklchColor[] = [];
  let snapIndex = 0;
  let snapDist = Infinity;

  for (let i = 0; i < totalStops; i++) {
    const frac = totalStops > 1 ? i / (totalStops - 1) : 0.5;
    const targetDist = frac * total;

    let color;
    if (targetDist <= d1) {
      const segT = d1 > 0 ? targetDist / d1 : 0;
      color = toOklch(interpLight(segT));
    } else {
      const segT = d2 > 0 ? (targetDist - d1) / d2 : 0;
      color = toOklch(interpDark(segT));
    }

    results.push(
      clampToGamut({
        l: color!.l,
        c: color!.c ?? 0,
        h: color!.h ?? seedH,
      }),
    );

    // Track which stop is closest to the seed's arc-length position
    const dist = Math.abs(frac - seedFrac);
    if (dist < snapDist) {
      snapDist = dist;
      snapIndex = i;
    }
  }

  // Snap the closest stop to the seed's exact color
  results[snapIndex] = clampToGamut({ l: seedL, c: seedC, h: seedH });
  return results;
}

// ---- Main Generation ----

export function generateRamp(config: RampConfig): RampStop[] {
  const { hue, stopCount, mode, seedChroma, seedLightness } = config;
  const isNeutral = seedChroma !== undefined && seedChroma < NEUTRAL_CHROMA;

  const labels =
    stopCount in STOP_PRESETS
      ? STOP_PRESETS[stopCount as StopPreset]
      : generateCustomLabels(stopCount);

  // Compute seed intensity: raw gamut-relative chroma ratio (no boost).
  // This ensures the ramp naturally reproduces the seed's chroma level.
  let seedIntensity = 1.0;
  if (seedChroma !== undefined && seedLightness !== undefined && !isNeutral) {
    const seedMaxC = maxChroma(seedLightness, hue);
    seedIntensity = seedMaxC > 0 ? Math.min(seedChroma / seedMaxC, 1.0) : 1.0;
  }

  // Pre-compute OKLab-interpolated stops when we have a seed.
  const hasSeed =
    seedLightness !== undefined &&
    seedChroma !== undefined &&
    !isNeutral;
  const interpolated = hasSeed
    ? interpolateArcLength(
        seedLightness!,
        seedChroma!,
        hue,
        seedIntensity,
        labels.length,
      )
    : null;

  return labels.map((label, index) => {
    const t = labels.length > 1 ? index / (labels.length - 1) : 0.5;

    if (isNeutral) {
      const { light, dark } = generateNeutralStop(t, hue, seedChroma!);
      return { index, label, color: light, darkColor: dark };
    }

    if (mode === "pure") {
      return generatePureStop(label, hue, index, labels.length);
    }

    // ---- Opinionated generation ----

    // OKLab interpolation: white → seed → dark, seed at center
    if (interpolated) {
      const color = interpolated[index];
      const dark = darkModeAdjust(color.l, color.c, color.h, t);
      return { index, label, color, darkColor: dark };
    }

    // Fallback: parametric (no seed provided)
    const l = lightnessAt(t);
    const drift = hueDriftAt(t, hue);
    const h = (((hue + drift) % 360) + 360) % 360;
    const gamutMax = maxChroma(l, h);
    const c = gamutMax * seedIntensity;

    const light = clampToGamut({ l, c, h });
    const dark = darkModeAdjust(l, c, h, t);

    return { index, label, color: light, darkColor: dark };
  });
}

// ---- Pure Mode ----

function generatePureStop(
  label: string,
  seedHue: number,
  index: number,
  total: number,
): { index: number; label: string; color: OklchColor; darkColor: OklchColor } {
  const t = total > 1 ? index / (total - 1) : 0.5;
  const l = L_MAX - (L_MAX - L_MIN) * t; // linear
  const mc = maxChroma(l, seedHue);
  const c = mc * 0.85;
  const color = clampToGamut({ l, c, h: seedHue });
  const darkColor = clampToGamut({
    l: Math.max(0.05, Math.min(0.98, l + 0.03)),
    c: c * 0.9,
    h: seedHue,
  });
  return { index, label, color, darkColor };
}

// ---- Helpers ----

function generateCustomLabels(count: number): string[] {
  if (count <= 1) return ["500"];
  if (count === 2) return ["200", "800"];
  const labels: string[] = [];
  for (let i = 0; i < count; i++) {
    const t = i / (count - 1);
    const value = Math.round(50 + t * 900);
    const snapped = Math.round(value / 50) * 50;
    labels.push(String(snapped));
  }
  return labels;
}

// ---- Naming ----

const HUE_NAMES: [number, string][] = [
  [15, "red"],
  [40, "orange"],
  [65, "amber"],
  [100, "yellow"],
  [120, "lime"],
  [150, "green"],
  [180, "teal"],
  [210, "cyan"],
  [250, "blue"],
  [280, "indigo"],
  [310, "violet"],
  [340, "pink"],
  [360, "rose"],
];

export function nameForHue(hue: number): string {
  const normalized = ((hue % 360) + 360) % 360;
  for (const [threshold, name] of HUE_NAMES) {
    if (normalized < threshold) return name;
  }
  return "red";
}

export function uniqueRampName(hue: number, existingNames: string[]): string {
  const base = nameForHue(hue);
  if (!existingNames.includes(base)) return base;
  let i = 2;
  while (existingNames.includes(`${base}-${i}`)) i++;
  return `${base}-${i}`;
}
