import type { OklchColor, RampConfig, RampStop } from "../types";
import { clampToGamut } from "./gamut";
import {
  distanceLab,
  labVectorToOklch,
  toLabVector,
  type LabVector,
} from "./pathGeometry";
import { solveV6ResearchRamp, type V6SolveResult } from "./v6ResearchSolver";

function clamp01(value: number, min = 0.02, max = 0.98): number {
  return Math.min(max, Math.max(min, value));
}

function lerpLab(a: LabVector, b: LabVector, t: number): LabVector {
  return {
    l: a.l + (b.l - a.l) * t,
    a: a.a + (b.a - a.a) * t,
    b: a.b + (b.b - a.b) * t,
  };
}

function colorFromLab(lab: LabVector, fallbackHue: number): OklchColor {
  const color = labVectorToOklch(lab, fallbackHue);
  return clampToGamut({
    l: clamp01(color.l),
    c: Math.max(0, color.c ?? 0),
    h: Number.isFinite(color.h) ? color.h : fallbackHue,
  });
}

function pairwiseDistances(stops: readonly RampStop[]): number[] {
  return stops.slice(1).map((stop, index) =>
    distanceLab(toLabVector(stops[index].color), toLabVector(stop.color)),
  );
}

function average(values: readonly number[]): number {
  return values.length === 0
    ? 0
    : values.reduce((sum, value) => sum + value, 0) / values.length;
}

function coefficientOfVariation(values: readonly number[]): number {
  const mean = average(values);
  if (mean <= 1e-9) return 0;
  const variance = average(values.map((value) => (value - mean) ** 2));
  return Math.sqrt(variance) / mean;
}

function worstStepRatio(values: readonly number[], windowSize: number): number {
  if (values.length === 0 || windowSize <= 1) return 1;
  if (values.length < windowSize) {
    return Math.max(...values) / Math.max(Math.min(...values), 1e-9);
  }

  let worst = 1;
  for (let index = 0; index <= values.length - windowSize; index++) {
    const window = values.slice(index, index + windowSize);
    worst = Math.max(
      worst,
      Math.max(...window) / Math.max(Math.min(...window), 1e-9),
    );
  }
  return worst;
}

function seedPlacementImbalance(
  distances: readonly number[],
  seedIndex: number,
): number {
  const left = distances.slice(0, seedIndex);
  const right = distances.slice(seedIndex);
  if (left.length === 0 || right.length === 0) return 0;
  const mean = average(distances);
  if (mean <= 1e-9) return 0;
  return Math.abs(average(left) - average(right)) / mean;
}

function seedKinkRatio(stops: readonly RampStop[], seedIndex: number): number {
  const distances = pairwiseDistances(stops);
  if (seedIndex <= 0 || seedIndex >= stops.length - 1) return 1;
  const left = distances[seedIndex - 1];
  const right = distances[seedIndex];
  return Math.max(left, right) / Math.max(Math.min(left, right), 1e-9);
}

function topEdgeEvennessPenalty(distances: readonly number[]): number {
  if (distances.length < 2) return 0;
  const mean = average(distances);
  if (mean <= 1e-9) return 0;
  const ratio = distances[0] / mean;
  return Math.max(0, ratio - 1.08) * 4.8 + Math.max(0, 0.78 - ratio) * 1.2;
}

function fairVisibleStops(
  baseStops: readonly RampStop[],
  exactSeed: OklchColor,
  seedIndex: number,
  lightEase: number,
): RampStop[] {
  const lastIndex = baseStops.length - 1;
  const lightEndpoint = toLabVector(baseStops[0].color);
  const darkEndpoint = toLabVector(baseStops[lastIndex].color);
  const seedLab = toLabVector(exactSeed);

  return baseStops.map((stop, index) => {
    let color: OklchColor;
    if (index === seedIndex) {
      color = exactSeed;
    } else if (index < seedIndex) {
      const linearProgress = seedIndex <= 0 ? 1 : index / seedIndex;
      const progress = linearProgress ** lightEase;
      color = colorFromLab(lerpLab(lightEndpoint, seedLab, progress), exactSeed.h);
    } else {
      const progress =
        lastIndex <= seedIndex ? 1 : (index - seedIndex) / (lastIndex - seedIndex);
      color = colorFromLab(lerpLab(seedLab, darkEndpoint, progress), exactSeed.h);
    }

    return {
      ...stop,
      color,
    };
  });
}

function scoreCandidate(stops: readonly RampStop[], seedIndex: number): number {
  const distances = pairwiseDistances(stops);
  const lightnessViolation = stops.slice(1).some(
    (stop, index) => stop.color.l > stops[index].color.l + 1e-4,
  );
  const lightPenalty = lightnessViolation ? 1_000 : 0;

  return (
    lightPenalty +
    coefficientOfVariation(distances) * 2.2 +
    Math.max(0, worstStepRatio(distances, 2) - 1) * 1.4 +
    Math.max(0, worstStepRatio(distances, 3) - 1) * 0.7 +
    Math.max(0, seedKinkRatio(stops, seedIndex) - 1) * 1.2 +
    topEdgeEvennessPenalty(distances) +
    seedPlacementImbalance(distances, seedIndex) * 0.8
  );
}

export function solveBrandExactFairRamp(config: RampConfig): V6SolveResult {
  const base = solveV6ResearchRamp(config);
  const exactSeed = base.stops[base.metadata.seedIndex]?.color ?? {
    l: config.seedLightness ?? 0.62,
    c: config.seedChroma ?? 0.12,
    h: config.hue,
  };

  let bestStops = base.stops;
  let bestSeedIndex = base.metadata.seedIndex;
  let bestScore = Infinity;

  const lastIndex = base.stops.length - 1;
  const candidateSeedIndices =
    base.stops.length <= 2
      ? [Math.min(lastIndex, Math.max(0, base.metadata.seedIndex))]
      : Array.from(
          { length: 5 },
          (_, index) => base.metadata.seedIndex + index - 2,
        )
          .map((index) => Math.min(lastIndex - 1, Math.max(1, index)))
          .filter((index, position, values) => values.indexOf(index) === position);

  // Math wins here: the visible light side should be evenly spaced, not
  // hand-eased into a paper metaphor.
  const lightEases = [1] as const;

  for (const seedIndex of candidateSeedIndices) {
    for (const lightEase of lightEases) {
      const candidate = fairVisibleStops(
        base.stops,
        exactSeed,
        seedIndex,
        lightEase,
      );
      const score = scoreCandidate(candidate, seedIndex);
      if (score < bestScore) {
        bestStops = candidate;
        bestSeedIndex = seedIndex;
        bestScore = score;
      }
    }
  }

  return {
    stops: bestStops.map((stop, index) => ({ ...stop, index })),
    metadata: {
      ...base.metadata,
      solver: "brand-exact-fair",
      score: bestScore,
      seedIndex: bestSeedIndex,
      seedFraction:
        bestStops.length > 1 ? bestSeedIndex / (bestStops.length - 1) : 0.5,
    },
  };
}
