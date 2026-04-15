import { oklab as toOklab } from "culori";
import type { OklchColor, RampConfig, RampStop, StopPreset } from "../types";
import { contrastRatio, BLACK, WHITE } from "./contrast";
import { isInGamut, maxChroma } from "./gamut";
import { generateRamp } from "./ramp";
import { solveV6ResearchRamp, type V6SolveMetadata } from "./v6ResearchSolver";

export interface ResearchSeed {
  id: string;
  label: string;
  note: string;
  color: OklchColor;
}

export const RESEARCH_SEEDS: readonly ResearchSeed[] = [
  {
    id: "bright-lime",
    label: "Bright Lime",
    note: "Canonical hard case: luminous yellow-green seed with extreme high-lightness chroma.",
    color: { l: 0.931, c: 0.223, h: 121.082 },
  },
  {
    id: "cadmium-yellow",
    label: "Cadmium Yellow",
    note: "Bright yellow that stresses high-lightness chroma and warm shadow shaping.",
    color: { l: 0.9, c: 0.165, h: 98 },
  },
  {
    id: "cyan",
    label: "Cyan",
    note: "High-energy cyan where gamut geometry shifts quickly between highlights and shadows.",
    color: { l: 0.78, c: 0.14, h: 210 },
  },
  {
    id: "violet",
    label: "Violet",
    note: "Mid-dark vivid violet that often wants richer mids and inkier shadows.",
    color: { l: 0.62, c: 0.21, h: 315 },
  },
  {
    id: "ultramarine",
    label: "Ultramarine",
    note: "Deep vivid blue seed that tests dark retention and blue highlight presence.",
    color: { l: 0.47, c: 0.18, h: 265 },
  },
  {
    id: "phthalo-green",
    label: "Phthalo Green",
    note: "Cool deep green between green and cyan; useful for path-family blending pressure.",
    color: { l: 0.52, c: 0.16, h: 165 },
  },
  {
    id: "warm-neutral",
    label: "Warm Neutral",
    note: "Warm gray / bone family for neutral-specific behavior and temperature handling.",
    color: { l: 0.62, c: 0.018, h: 70 },
  },
  {
    id: "cool-neutral",
    label: "Cool Neutral",
    note: "Cool gray / slate family for neutral-specific behavior and temperature handling.",
    color: { l: 0.62, c: 0.018, h: 255 },
  },
  {
    id: "very-light-seed",
    label: "Very Light Seed",
    note: "Extreme top-end seed to catch endpoint collapse and seed-placement issues.",
    color: { l: 0.98, c: 0.072, h: 280 },
  },
  {
    id: "very-dark-seed",
    label: "Very Dark Seed",
    note: "Extreme low-end seed to catch shadow collapse and monotonicity issues.",
    color: { l: 0.2, c: 0.072, h: 280 },
  },
];

export interface DistanceStats {
  values: number[];
  mean: number;
  variance: number;
  min: number;
  max: number;
  coefficientOfVariation: number;
}

export interface LightnessStats {
  values: number[];
  strictlyDescending: boolean;
  nonIncreasing: boolean;
  violations: number;
  flatSteps: number;
  minStep: number;
  maxStep: number;
}

export interface EndpointStats {
  lightness: number;
  chroma: number;
  relativeChroma: number;
  contrastOnWhite: number;
  contrastOnBlack: number;
}

export interface RampVariantAnalysis {
  colors: OklchColor[];
  adjacentDistance: DistanceStats;
  lightness: LightnessStats;
  gamutViolations: number;
  maxHueDriftFromSeed: number;
}

export interface RampAnalysis {
  seed: ResearchSeed | null;
  labels: string[];
  seedStopIndex: number | null;
  seedDelta: number | null;
  endpointLight: EndpointStats;
  endpointDark: EndpointStats;
  lightRamp: RampVariantAnalysis;
  darkRamp: RampVariantAnalysis;
}

export interface EvaluateSeedOptions {
  stopCount?: StopPreset | number;
  mode?: RampConfig["mode"];
  engine?: ResearchEngine;
}

export type ResearchEngine = "v5" | "v6";

export interface SeedEvaluationRun {
  engine: ResearchEngine;
  stops: RampStop[];
  analysis: RampAnalysis;
  metadata: V6SolveMetadata | null;
}

export function researchSeedToRampConfig(
  seed: ResearchSeed,
  options: EvaluateSeedOptions = {},
): RampConfig {
  return {
    hue: seed.color.h,
    seedChroma: seed.color.c,
    seedLightness: seed.color.l,
    stopCount: options.stopCount ?? 11,
    mode: options.mode ?? "opinionated",
  };
}

export function analyzeRamp(
  stops: RampStop[],
  seed?: OklchColor | ResearchSeed,
): RampAnalysis {
  const seedColor = seed ? ("color" in seed ? seed.color : seed) : null;
  const seedMeta = seed && "color" in seed ? seed : null;
  const lightColors = stops.map((stop) => stop.color);
  const darkColors = stops.map((stop) => stop.darkColor);

  const seedStopIndex =
    seedColor === null ? null : findNearestColorIndex(lightColors, seedColor);
  const seedDelta =
    seedColor === null || seedStopIndex === null
      ? null
      : oklabDistance(lightColors[seedStopIndex], seedColor);

  return {
    seed: seedMeta,
    labels: stops.map((stop) => stop.label),
    seedStopIndex,
    seedDelta,
    endpointLight: analyzeEndpoint(lightColors[0]),
    endpointDark: analyzeEndpoint(lightColors[lightColors.length - 1]),
    lightRamp: analyzeVariant(lightColors, seedColor),
    darkRamp: analyzeVariant(darkColors, seedColor),
  };
}

export function evaluateSeed(
  seed: ResearchSeed,
  options: EvaluateSeedOptions = {},
): RampAnalysis {
  return evaluateSeedRun(seed, options).analysis;
}

export function evaluateSeedSuite(
  seeds: readonly ResearchSeed[] = RESEARCH_SEEDS,
  options: EvaluateSeedOptions = {},
): Record<string, RampAnalysis> {
  return Object.fromEntries(
    seeds.map((seed) => [seed.id, evaluateSeed(seed, options)]),
  );
}

export function evaluateSeedRun(
  seed: ResearchSeed,
  options: EvaluateSeedOptions = {},
): SeedEvaluationRun {
  const config = researchSeedToRampConfig(seed, options);
  const engine = options.engine ?? "v5";
  const solved =
    engine === "v6"
      ? solveV6ResearchRamp(config)
      : { stops: generateRamp(config), metadata: null };

  return {
    engine,
    stops: solved.stops,
    analysis: analyzeRamp(solved.stops, seed),
    metadata: solved.metadata,
  };
}

function analyzeVariant(
  colors: OklchColor[],
  seedColor: OklchColor | null,
): RampVariantAnalysis {
  return {
    colors,
    adjacentDistance: computeDistanceStats(colors),
    lightness: computeLightnessStats(colors),
    gamutViolations: colors.filter((color) => !isInGamut(color)).length,
    maxHueDriftFromSeed:
      seedColor === null
        ? 0
        : Math.max(...colors.map((color) => circularHueDelta(color.h, seedColor.h))),
  };
}

function analyzeEndpoint(color: OklchColor): EndpointStats {
  const maxC = maxChroma(color.l, color.h);
  return {
    lightness: color.l,
    chroma: color.c,
    relativeChroma: maxC > 0 ? color.c / maxC : 0,
    contrastOnWhite: contrastRatio(color, WHITE),
    contrastOnBlack: contrastRatio(color, BLACK),
  };
}

function computeDistanceStats(colors: OklchColor[]): DistanceStats {
  const values = pairwiseDistances(colors);
  const mean = average(values);
  const variance = average(values.map((value) => (value - mean) ** 2));
  return {
    values,
    mean,
    variance,
    min: values.length === 0 ? 0 : Math.min(...values),
    max: values.length === 0 ? 0 : Math.max(...values),
    coefficientOfVariation: mean > 0 ? Math.sqrt(variance) / mean : 0,
  };
}

function computeLightnessStats(colors: OklchColor[]): LightnessStats {
  const values = colors.map((color) => color.l);
  const deltas = values.slice(1).map((value, index) => value - values[index]);
  const epsilon = 1e-6;
  const flatSteps = deltas.filter((delta) => Math.abs(delta) <= epsilon).length;
  const violations = deltas.filter((delta) => delta > epsilon).length;
  return {
    values,
    strictlyDescending: deltas.every((delta) => delta < -epsilon),
    nonIncreasing: deltas.every((delta) => delta <= epsilon),
    violations,
    flatSteps,
    minStep: deltas.length === 0 ? 0 : Math.min(...deltas),
    maxStep: deltas.length === 0 ? 0 : Math.max(...deltas),
  };
}

function pairwiseDistances(colors: OklchColor[]): number[] {
  const distances: number[] = [];
  for (let i = 1; i < colors.length; i++) {
    distances.push(oklabDistance(colors[i - 1], colors[i]));
  }
  return distances;
}

function oklabDistance(a: OklchColor, b: OklchColor): number {
  const aLab = toOklab({ mode: "oklch", l: a.l, c: a.c, h: a.h })!;
  const bLab = toOklab({ mode: "oklch", l: b.l, c: b.c, h: b.h })!;
  return Math.sqrt(
    (aLab.l - bLab.l) ** 2 +
      (aLab.a - bLab.a) ** 2 +
      (aLab.b - bLab.b) ** 2,
  );
}

function findNearestColorIndex(colors: OklchColor[], target: OklchColor): number {
  let bestIndex = 0;
  let bestDistance = Number.POSITIVE_INFINITY;

  for (let i = 0; i < colors.length; i++) {
    const distance = oklabDistance(colors[i], target);
    if (distance < bestDistance) {
      bestDistance = distance;
      bestIndex = i;
    }
  }

  return bestIndex;
}

function circularHueDelta(a: number, b: number): number {
  const delta = Math.abs(a - b) % 360;
  return delta > 180 ? 360 - delta : delta;
}

function average(values: number[]): number {
  return values.length === 0
    ? 0
    : values.reduce((sum, value) => sum + value, 0) / values.length;
}
