import type {
  OklchColor,
  RampConfig,
  RampSeedExactness,
  RampSolveMetadata,
  RampStop,
  TargetGamut,
} from "../types";
import { clampToGamut, isInGamut, maxChroma } from "./gamut";
import { distanceLab, toLabVector } from "./pathGeometry";

const EXACTNESS_EPSILON = 1e-6;

interface BuildRampSolveMetadataOptions {
  solver: string;
  seedIndex?: number;
  targetGamut?: TargetGamut;
}

export function normalizeTargetGamut(targetGamut?: TargetGamut): TargetGamut {
  const resolved = targetGamut ?? "srgb";
  if (resolved !== "srgb") {
    throw new Error(
      `Target gamut '${resolved}' is planned but not implemented yet. Current ramp solving supports 'srgb'.`,
    );
  }
  return resolved;
}

export function sourceSeedFromRampConfig(config: RampConfig): OklchColor {
  const seedLightness = config.seedLightness ?? 0.62;
  const seedChroma =
    config.seedChroma ?? Math.max(0.08, maxChroma(0.62, config.hue) * 0.55);

  return {
    l: seedLightness,
    c: Math.max(0, seedChroma),
    h: ((config.hue % 360) + 360) % 360,
  };
}

function targetSeedForGamut(sourceSeed: OklchColor, targetGamut: TargetGamut): OklchColor {
  normalizeTargetGamut(targetGamut);
  return clampToGamut(sourceSeed);
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
  normalizeTargetGamut(targetGamut);
  return isInGamut(sourceSeed);
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
  const fallbackDelta = undefined;
  const seedFraction = stops.length > 1 ? seedIndex / (stops.length - 1) : 0.5;

  return {
    solver: options.solver,
    targetGamut,
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
    },
    sourceSeed,
    targetSeed,
  };
}
