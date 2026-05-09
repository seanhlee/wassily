/**
 * App-facing ramp generation surface.
 *
 * `opinionated` delegates to the brand-exact fairing solver, which uses v6
 * as its base path and then smooths the final visible ramp around the exact seed.
 * `pure` remains a simple hue-constant baseline used for comparison.
 */

import type {
  ColorGamut,
  RampConfig,
  RampSolveResult,
  RampStop,
  StopPreset,
} from "../types";
import {
  clampToGamut,
  fallbackGamutForTarget,
  maxChroma,
  solvingGamutForTarget,
} from "./gamut";
import { solveBrandExactFairRamp } from "./brandExactFairingSolver";
import {
  buildRampSolveMetadata,
  normalizeTargetGamut,
} from "./rampContract";

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
  13: [
    "50",
    "75",
    "100",
    "200",
    "300",
    "400",
    "500",
    "600",
    "700",
    "800",
    "900",
    "925",
    "950",
  ],
};

const L_MAX = 0.98;
const L_MIN = 0.25;

export function generateRamp(config: RampConfig): RampStop[] {
  return solveRamp(config).stops;
}

export function solveRamp(config: RampConfig): RampSolveResult {
  const { hue, stopCount, mode } = config;
  const targetGamut = normalizeTargetGamut(config.targetGamut);
  const solvingGamut = solvingGamutForTarget(targetGamut);
  if (mode === "opinionated") {
    const solved = solveBrandExactFairRamp(config);
    const fallbackStops = buildFallbackStops(solved.stops, targetGamut);
    return {
      stops: solved.stops,
      ...(fallbackStops === undefined ? {} : { fallbackStops }),
      metadata: buildRampSolveMetadata(solved.stops, config, {
        solver: solved.metadata.solver,
        seedIndex: solved.metadata.seedIndex,
        targetGamut,
      }),
    };
  }

  const labels =
    stopCount in STOP_PRESETS
      ? STOP_PRESETS[stopCount as StopPreset]
      : generateCustomLabels(stopCount);

  const stops = labels.map((label, index) =>
    generatePureStop(label, hue, index, labels.length, solvingGamut),
  );
  const fallbackStops = buildFallbackStops(stops, targetGamut);

  return {
    stops,
    ...(fallbackStops === undefined ? {} : { fallbackStops }),
    metadata: buildRampSolveMetadata(stops, config, {
      solver: "pure",
      targetGamut,
    }),
  };
}

function buildFallbackStops(
  stops: readonly RampStop[],
  targetGamut: RampConfig["targetGamut"],
): RampStop[] | undefined {
  const fallbackGamut = fallbackGamutForTarget(targetGamut);
  if (fallbackGamut === null) return undefined;

  return stops.map((stop) => ({
    ...stop,
    color: clampToGamut(stop.color, fallbackGamut),
    darkColor: clampToGamut(stop.darkColor, fallbackGamut),
  }));
}

function generatePureStop(
  label: string,
  seedHue: number,
  index: number,
  total: number,
  targetGamut: ColorGamut = "srgb",
): RampStop {
  const t = total > 1 ? index / (total - 1) : 0.5;
  const l = L_MAX - (L_MAX - L_MIN) * t;
  const c = maxChroma(l, seedHue, targetGamut) * 0.85;
  const color = clampToGamut({ l, c, h: seedHue }, targetGamut);
  const darkColor = clampToGamut({
    l: Math.max(0.05, Math.min(0.98, l + 0.03)),
    c: c * 0.9,
    h: seedHue,
  }, targetGamut);

  return { index, label, color, darkColor };
}

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
