import type {
  OklchColor,
  RampConfig,
  RampSeedExactness,
  RampSolveMetadata,
  RampStop,
  TargetGamut,
} from "../types";
import {
  clampToGamut,
  fallbackGamutForTarget,
  isInGamut,
  maxChroma,
  solvingGamutForTarget,
} from "./gamut";
import { distanceLab, toLabVector } from "./pathGeometry";

const EXACTNESS_EPSILON = 1e-6;
export const DEFAULT_TARGET_GAMUT: TargetGamut = "dual";

interface BuildRampSolveMetadataOptions {
  solver: string;
  seedIndex?: number;
  targetGamut?: TargetGamut;
}

export function normalizeTargetGamut(targetGamut?: TargetGamut): TargetGamut {
  return targetGamut ?? DEFAULT_TARGET_GAMUT;
}

export function sourceSeedFromRampConfig(config: RampConfig): OklchColor {
  const solvingGamut = solvingGamutForTarget(normalizeTargetGamut(config.targetGamut));
  const seedLightness = config.seedLightness ?? 0.62;
  const seedChroma =
    config.seedChroma ?? Math.max(0.08, maxChroma(0.62, config.hue, solvingGamut) * 0.55);

  return {
    l: seedLightness,
    c: Math.max(0, seedChroma),
    h: ((config.hue % 360) + 360) % 360,
  };
}

function targetSeedForGamut(sourceSeed: OklchColor, targetGamut: TargetGamut): OklchColor {
  return clampToGamut(sourceSeed, solvingGamutForTarget(targetGamut));
}

function seedDistance(a: OklchColor, b: OklchColor): number {
  return distanceLab(toLabVector(a), toLabVector(b));
}

function nearestStopIndex(stops: readonly RampStop[], seed: OklchColor): number {
  let bestIndex = 0;
  let bestDelta = Infinity;
  stops.forEach((stop, index) => {
    const delta = seedDistance(stop.color, seed);
    if (delta < bestDelta) {
      bestIndex = index;
      bestDelta = delta;
    }
  });
  return bestIndex;
}

function isSourceInTargetGamut(sourceSeed: OklchColor, targetGamut: TargetGamut): boolean {
  return isInGamut(sourceSeed, solvingGamutForTarget(targetGamut));
}

function classifyExactness(
  sourceDelta: number,
  targetDelta: number,
  fallbackDelta: number | undefined,
  sourceInTargetGamut: boolean,
): RampSeedExactness {
  if (sourceDelta <= EXACTNESS_EPSILON) return "source-exact";
  if (targetDelta <= EXACTNESS_EPSILON) {
    return sourceInTargetGamut ? "target-exact" : "target-mapped";
  }
  if (fallbackDelta !== undefined && fallbackDelta <= EXACTNESS_EPSILON) {
    return "fallback-mapped";
  }
  return "unanchored";
}

export function buildRampSolveMetadata(
  stops: readonly RampStop[],
  config: RampConfig,
  options: BuildRampSolveMetadataOptions,
): RampSolveMetadata {
  if (stops.length === 0) {
    throw new Error("Cannot build ramp solve metadata for an empty ramp.");
  }

  const targetGamut = normalizeTargetGamut(options.targetGamut ?? config.targetGamut);
  const sourceSeed = sourceSeedFromRampConfig(config);
  const targetSeed = targetSeedForGamut(sourceSeed, targetGamut);
  const seedIndex =
    options.seedIndex !== undefined && stops[options.seedIndex]
      ? options.seedIndex
      : nearestStopIndex(stops, targetSeed);
  const anchor = stops[seedIndex];
  const sourceDelta = seedDistance(anchor.color, sourceSeed);
  const targetDelta = seedDistance(anchor.color, targetSeed);
  const fallbackGamut = fallbackGamutForTarget(targetGamut);
  const fallbackSeed =
    fallbackGamut === null ? undefined : clampToGamut(sourceSeed, fallbackGamut);
  const fallbackDelta =
    fallbackGamut === null || fallbackSeed === undefined
      ? undefined
      : seedDistance(clampToGamut(anchor.color, fallbackGamut), fallbackSeed);
  const seedFraction = stops.length > 1 ? seedIndex / (stops.length - 1) : 0.5;

  return {
    solver: options.solver,
    targetGamut,
    ...(fallbackGamut === null ? {} : { fallbackGamut }),
    fallbackPolicy: fallbackGamut === null ? "none" : "map-target-to-srgb",
    seedIndex,
    seedLabel: anchor.label,
    seedFraction,
    exactness: classifyExactness(
      sourceDelta,
      targetDelta,
      fallbackDelta,
      isSourceInTargetGamut(sourceSeed, targetGamut),
    ),
    seedDelta: {
      source: sourceDelta,
      target: targetDelta,
      ...(fallbackDelta === undefined ? {} : { fallback: fallbackDelta }),
    },
    sourceSeed,
    targetSeed,
    ...(fallbackSeed === undefined ? {} : { fallbackSeed }),
  };
}
