import { oklab as toOklab } from "culori";
import type { OklchColor, RampConfig, RampStop, StopPreset } from "../types";
import { contrastRatio, BLACK, WHITE } from "./contrast";
import { clampToGamut, isInGamut, maxChroma } from "./gamut";
import {
  solveV6ArchetypeRamp,
  solveV6ResearchRamp,
  type V6SolveMetadata,
} from "./v6ResearchSolver";
import { solveBrandExactFairRamp } from "./brandExactFairingSolver";
import {
  solveContinuousCompressedRamp,
  solveContinuousCurveRamp,
} from "./continuousCurveSolver";

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
  worstAdjacentRatio: number;
  worstThreeStepRatio: number;
  lightEntranceRatio: number;
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

export interface GamutPressureStats {
  values: number[];
  mean: number;
  max: number;
  nearBoundaryStops: number;
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
  gamutPressure: GamutPressureStats;
  gamutViolations: number;
  maxHueDriftFromSeed: number;
}

export interface RampAnalysis {
  seed: ResearchSeed | null;
  labels: string[];
  seedStopIndex: number | null;
  sourceSeedDelta: number | null;
  targetSeedDelta: number | null;
  fallbackSeedDelta: number | null;
  seedDelta: number | null;
  seedPlacementImbalance: number | null;
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

export type ResearchEngine =
  | "v6-archetype"
  | "v6"
  | "brand-exact-fair"
  | "continuous-curve"
  | "continuous-compressed";

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
  const displaySeedColor = seedColor === null ? null : clampToGamut(seedColor);
  const seedMeta = seed && "color" in seed ? seed : null;
  const lightColors = stops.map((stop) => stop.color);
  const darkColors = stops.map((stop) => stop.darkColor);
  const lightRamp = analyzeVariant(lightColors, displaySeedColor);
  const darkRamp = analyzeVariant(darkColors, displaySeedColor);

  const seedStopIndex =
    displaySeedColor === null ? null : findNearestColorIndex(lightColors, displaySeedColor);
  const sourceSeedDelta =
    seedColor === null || seedStopIndex === null
      ? null
      : oklabDistance(lightColors[seedStopIndex], seedColor);
  const targetSeedDelta =
    displaySeedColor === null || seedStopIndex === null
      ? null
      : oklabDistance(lightColors[seedStopIndex], displaySeedColor);

  return {
    seed: seedMeta,
    labels: stops.map((stop) => stop.label),
    seedStopIndex,
    sourceSeedDelta,
    targetSeedDelta,
    fallbackSeedDelta: null,
    seedDelta: targetSeedDelta,
    seedPlacementImbalance:
      seedStopIndex === null
        ? null
        : computeSeedPlacementImbalance(lightRamp.adjacentDistance.values, seedStopIndex),
    endpointLight: analyzeEndpoint(lightColors[0]),
    endpointDark: analyzeEndpoint(lightColors[lightColors.length - 1]),
    lightRamp,
    darkRamp,
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
  const engine = options.engine ?? "brand-exact-fair";
  const solved =
    engine === "v6"
      ? solveV6ResearchRamp(config)
      : engine === "brand-exact-fair"
        ? solveBrandExactFairRamp(config)
        : engine === "continuous-curve"
          ? solveContinuousCurveRamp(config)
          : engine === "continuous-compressed"
            ? solveContinuousCompressedRamp(config)
            : solveV6ArchetypeRamp(config);

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
    gamutPressure: computeGamutPressureStats(colors),
    gamutViolations: colors.filter((color) => !isInGamut(color)).length,
    maxHueDriftFromSeed:
      seedColor === null
        ? 0
        : Math.max(...colors.map((color) => circularHueDelta(color.h, seedColor.h))),
  };
}

function computeGamutPressureStats(colors: OklchColor[]): GamutPressureStats {
  const values = colors.map((color) => {
    const available = maxChroma(color.l, color.h);
    return available > 0 ? color.c / available : color.c > 0 ? Infinity : 0;
  });

  return {
    values,
    mean: average(values.filter(Number.isFinite)),
    max: values.length === 0 ? 0 : Math.max(...values),
    nearBoundaryStops: values.filter((value) => value >= 0.88).length,
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
    worstAdjacentRatio: worstStepRatio(values, 2),
    worstThreeStepRatio: worstStepRatio(values, 3),
    lightEntranceRatio: computeLightEntranceRatio(values),
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

function worstStepRatio(values: readonly number[], windowSize: number): number {
  if (values.length === 0) return 1;
  if (windowSize <= 1) return 1;
  if (values.length < windowSize) {
    return Math.max(...values) / Math.max(Math.min(...values), 1e-9);
  }

  let worst = 1;
  for (let index = 0; index <= values.length - windowSize; index++) {
    const window = values.slice(index, index + windowSize);
    worst = Math.max(worst, Math.max(...window) / Math.max(Math.min(...window), 1e-9));
  }
  return worst;
}

function computeLightEntranceRatio(values: readonly number[]): number {
  if (values.length === 0) return 1;
  const frontDistances = values.slice(0, Math.min(2, values.length));
  const referenceWindow = values.slice(
    frontDistances.length,
    Math.min(frontDistances.length + 4, values.length),
  );
  const baseline = average(
    referenceWindow.length > 0 ? [...referenceWindow] : [...values],
  );
  if (baseline <= 1e-9) return 1;
  return Math.max(...frontDistances.map((value) => value / baseline), 1);
}

function computeSeedPlacementImbalance(
  distances: readonly number[],
  seedStopIndex: number,
): number {
  if (distances.length === 0) return 0;
  const left = distances.slice(0, seedStopIndex);
  const right = distances.slice(seedStopIndex);
  if (left.length === 0 || right.length === 0) return 0;

  const mean = average([...distances]);
  if (mean <= 1e-9) return 0;

  return Math.abs(average([...left]) - average([...right])) / mean;
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
