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
 * Uses easeOutQuad — more resolution in the light/mid range,
 * compressed in the darks. Matches Tailwind v4's distribution.
 */
function lightnessAt(t: number): number {
  // easeInQuad: stays bright for light stops, drops steeply for darks
  // Matches Tailwind v4's lightness distribution
  return L_MAX - (L_MAX - L_MIN) * easeInQuad(t);
}

// ---- Chroma Curve ----

/**
 * Chroma intensity curve — gamut-relative.
 *
 * Returns a value 0-1 representing what fraction of the gamut
 * maximum to use at this position in the ramp. Peaks around
 * t=0.3-0.5 (stops 300-500) with an asymmetric falloff.
 *
 * seedIntensity scales the peak — a vivid seed pushes the whole
 * ramp more saturated, a muted seed keeps it restrained.
 */
function chromaIntensityAt(_t: number, seedIntensity: number): number {
  // Flat percentage of gamut max. The gamut boundary itself provides
  // all the shaping — it rolls off naturally at extreme lightness.
  // No artificial bell curve or edge rolloff needed.
  return 0.92 * seedIntensity;
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

// ---- Main Generation ----

export function generateRamp(config: RampConfig): RampStop[] {
  const { hue, stopCount, mode, seedChroma, seedLightness } = config;
  const isNeutral = seedChroma !== undefined && seedChroma < NEUTRAL_CHROMA;

  const labels =
    stopCount in STOP_PRESETS
      ? STOP_PRESETS[stopCount as StopPreset]
      : generateCustomLabels(stopCount);

  // Compute seed intensity: how vivid is the seed relative to
  // the gamut max at its lightness? This scales the whole ramp.
  let seedIntensity = 1.0;
  if (seedChroma !== undefined && seedLightness !== undefined && !isNeutral) {
    const seedMaxC = maxChroma(seedLightness, hue);
    seedIntensity = seedMaxC > 0 ? Math.min(seedChroma / seedMaxC, 1.0) : 1.0;
    // Boost slightly — seeds from images may be below max
    seedIntensity = Math.min(seedIntensity * 1.2, 1.0);
  }

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
    const l = lightnessAt(t);
    const drift = hueDriftAt(t, hue);
    const h = (((hue + drift) % 360) + 360) % 360;

    // Gamut-relative chroma
    const gamutMax = maxChroma(l, h);
    const intensity = chromaIntensityAt(t, seedIntensity);
    const c = gamutMax * intensity;

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
