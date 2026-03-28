/**
 * Ramp Generation.
 *
 * Promotes a swatch into a full color ramp with all six opinions applied.
 * Supports variable stop counts (3, 5, 7, 9, 11).
 */

import type { OklchColor, RampStop, RampConfig, StopPreset } from "../types";
import { maxChroma, clampToGamut } from "./gamut";

// ---- Stop Definitions ----

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

// ---- Opinionated Lightness Targets (11-stop reference) ----

const LIGHTNESS_MAP: Record<string, number> = {
  "50": 0.97,
  "100": 0.93,
  "200": 0.87,
  "300": 0.78,
  "400": 0.68,
  "500": 0.55,
  "600": 0.45,
  "700": 0.37,
  "800": 0.28,
  "900": 0.2,
  "950": 0.14,
};

// ---- Chroma Contouring (bell curve factors) ----

const CHROMA_FACTORS: Record<string, number> = {
  "50": 0.15,
  "100": 0.3,
  "200": 0.55,
  "300": 0.8,
  "400": 0.95,
  "500": 1.0,
  "600": 0.95,
  "700": 0.85,
  "800": 0.7,
  "900": 0.5,
  "950": 0.3,
};

// ---- Hue Drift ----

const HUE_DRIFT: Record<string, number> = {
  "50": -4, // cool highlight lift
  "100": -3,
  "200": -2,
  "300": 0,
  "400": 0,
  "500": 0,
  "600": +1,
  "700": +3, // warm shadow drift
  "800": +5,
  "900": +7,
  "950": +8,
};

// ---- Dark Mode Adjustments ----

const DARK_ADJUSTMENTS: Record<string, { lShift: number; cScale: number }> = {
  "50": { lShift: -0.04, cScale: 0.9 },
  "100": { lShift: -0.04, cScale: 0.9 },
  "200": { lShift: -0.03, cScale: 0.92 },
  "300": { lShift: -0.02, cScale: 0.95 },
  "400": { lShift: +0.03, cScale: 0.88 },
  "500": { lShift: +0.06, cScale: 0.85 },
  "600": { lShift: +0.08, cScale: 0.87 },
  "700": { lShift: +0.04, cScale: 0.95 },
  "800": { lShift: +0.02, cScale: 1.0 },
  "900": { lShift: +0.01, cScale: 1.05 },
  "950": { lShift: +0.01, cScale: 1.08 },
};

// ---- Generation ----

/**
 * Generate an opinionated ramp stop.
 */
function generateOpinionatedStop(
  label: string,
  seedHue: number,
): { light: OklchColor; dark: OklchColor } {
  const l = LIGHTNESS_MAP[label];
  const chromaFactor = CHROMA_FACTORS[label];
  const hueDrift = HUE_DRIFT[label];

  const h = (seedHue + hueDrift + 360) % 360;
  const maxC = maxChroma(l, h);
  const c = maxC * chromaFactor;

  const lightColor = clampToGamut({ l, c, h });

  // Dark mode variant
  const darkAdj = DARK_ADJUSTMENTS[label];
  const darkL = Math.max(0.05, Math.min(0.98, l + darkAdj.lShift));
  const darkH = (h + (label >= "700" ? 2 : 0) + 360) % 360; // extra warm drift in dark mode shadows
  const darkMaxC = maxChroma(darkL, darkH);
  const darkC = darkMaxC * chromaFactor * darkAdj.cScale;

  const darkColor = clampToGamut({ l: darkL, c: darkC, h: darkH });

  return { light: lightColor, dark: darkColor };
}

/**
 * Generate a pure (math-only) ramp stop.
 */
function generatePureStop(
  label: string,
  seedHue: number,
  index: number,
  total: number,
): { light: OklchColor; dark: OklchColor } {
  // Linear lightness interpolation
  const l = 0.97 - (index / (total - 1)) * (0.97 - 0.14);

  // 85% of gamut max, constant hue
  const maxC = maxChroma(l, seedHue);
  const c = maxC * 0.85;

  const color = clampToGamut({ l, c, h: seedHue });

  // Dark mode for pure mode: same simple adjustments
  const darkAdj = DARK_ADJUSTMENTS[label] ?? { lShift: 0, cScale: 1 };
  const darkL = Math.max(0.05, Math.min(0.98, l + darkAdj.lShift));
  const darkMaxC = maxChroma(darkL, seedHue);
  const darkC = darkMaxC * 0.85 * darkAdj.cScale;
  const darkColor = clampToGamut({ l: darkL, c: darkC, h: seedHue });

  return { light: color, dark: darkColor };
}

/**
 * Generate a full ramp from a config.
 */
export function generateRamp(config: RampConfig): RampStop[] {
  const { hue, stopCount, mode } = config;

  // Get stop labels for this count
  const labels =
    stopCount in STOP_PRESETS
      ? STOP_PRESETS[stopCount as StopPreset]
      : generateCustomLabels(stopCount);

  return labels.map((label, index) => {
    const { light, dark } =
      mode === "opinionated"
        ? generateOpinionatedStop(label, hue)
        : generatePureStop(label, hue, index, labels.length);

    return {
      index,
      label,
      color: light,
      darkColor: dark,
    };
  });
}

/**
 * Generate custom stop labels for non-preset counts.
 * Distributes labels between 50 and 950.
 */
function generateCustomLabels(count: number): string[] {
  if (count <= 1) return ["500"];
  if (count === 2) return ["200", "800"];

  const labels: string[] = [];
  for (let i = 0; i < count; i++) {
    const t = i / (count - 1);
    const value = Math.round(50 + t * 900);
    // Snap to nearest 50
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
  [80, "yellow"],
  [105, "lime"],
  [150, "green"],
  [180, "teal"],
  [210, "cyan"],
  [250, "blue"],
  [280, "indigo"],
  [310, "violet"],
  [340, "pink"],
  [360, "rose"],
];

/** Get a name for a hue angle */
export function nameForHue(hue: number): string {
  const normalized = ((hue % 360) + 360) % 360;
  for (const [threshold, name] of HUE_NAMES) {
    if (normalized < threshold) return name;
  }
  return "red"; // wraps around
}

/**
 * Get a unique ramp name, given existing names on the canvas.
 */
export function uniqueRampName(hue: number, existingNames: string[]): string {
  const base = nameForHue(hue);
  if (!existingNames.includes(base)) return base;

  let i = 2;
  while (existingNames.includes(`${base}-${i}`)) i++;
  return `${base}-${i}`;
}
