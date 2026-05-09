import type { ColorGamut, OklchColor, RampConfig, RampStop } from "../types";
import { clampToGamut, maxChroma, solvingGamutForTarget } from "./gamut";
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

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

function smoothstep(edge0: number, edge1: number, value: number): number {
  const t = clamp((value - edge0) / (edge1 - edge0), 0, 1);
  return t * t * (3 - 2 * t);
}

function normalizeHue(hue: number): number {
  return ((hue % 360) + 360) % 360;
}

function hueDelta(from: number, to: number): number {
  return ((((to - from) % 360) + 540) % 360) - 180;
}

function hueDistance(a: number, b: number): number {
  return Math.abs(hueDelta(a, b));
}

function mixHue(from: number, to: number, t: number): number {
  return normalizeHue(from + hueDelta(from, to) * clamp(t, 0, 1));
}

function relativeChroma(color: OklchColor, targetGamut: ColorGamut): number {
  const available = maxChroma(color.l, color.h, targetGamut);
  return available > 1e-9 ? color.c / available : 0;
}

function lerpLab(a: LabVector, b: LabVector, t: number): LabVector {
  return {
    l: a.l + (b.l - a.l) * t,
    a: a.a + (b.a - a.a) * t,
    b: a.b + (b.b - a.b) * t,
  };
}

function mixColorsInLab(
  a: OklchColor,
  b: OklchColor,
  t: number,
  fallbackHue: number,
  targetGamut: ColorGamut,
): OklchColor {
  return colorFromLab(
    lerpLab(toLabVector(a), toLabVector(b), clamp(t, 0, 1)),
    fallbackHue,
    targetGamut,
  );
}

function colorFromLab(
  lab: LabVector,
  fallbackHue: number,
  targetGamut: ColorGamut,
): OklchColor {
  const color = labVectorToOklch(lab, fallbackHue);
  return clampToGamut({
    l: clamp01(color.l, 0.02, 0.995),
    c: Math.max(0, color.c ?? 0),
    h: Number.isFinite(color.h) ? color.h : fallbackHue,
  }, targetGamut);
}

interface WarmHighlightPrior {
  weight: number;
  endpoint: OklchColor;
  yellowness: number;
}

interface BrandExactFairingOptions {
  warmHighlightShoulder?: boolean;
}

function warmBodyHighlightWeight(
  seed: OklchColor,
  targetGamut: ColorGamut,
): number {
  const orangeWeight = clamp(1 - hueDistance(seed.h, 50) / 22, 0, 1);
  const amberWeight = clamp(1 - hueDistance(seed.h, 72) / 28, 0, 1);
  const yellowWeight = clamp(1 - hueDistance(seed.h, 90) / 28, 0, 1);
  const hueWeight = Math.max(orangeWeight, amberWeight, yellowWeight);
  const intensityWeight = Math.max(
    clamp((relativeChroma(seed, targetGamut) - 0.48) / 0.28, 0, 1),
    clamp((seed.c - 0.1) / 0.08, 0, 1),
  );
  const bodyLightnessWeight =
    clamp((seed.l - 0.58) / 0.13, 0, 1) *
    clamp((0.89 - seed.l) / 0.1, 0, 1);

  return hueWeight * intensityWeight * bodyLightnessWeight;
}

function warmShoulderHue(seedHue: number): number {
  const hue = normalizeHue(seedHue);
  if (hue <= 50) return 74;
  if (hue <= 72) return lerp(74, 96, smoothstep(50, 72, hue));
  if (hue <= 96) return lerp(96, 103, smoothstep(72, 96, hue));
  return 103;
}

function warmHighlightPrior(
  seed: OklchColor,
  targetGamut: ColorGamut,
): WarmHighlightPrior | null {
  const weight = warmBodyHighlightWeight(seed, targetGamut);
  if (weight <= 0.02) return null;

  const yellowness = smoothstep(50, 92, normalizeHue(seed.h));
  const h = warmShoulderHue(seed.h);
  const l = lerp(0.982, 0.988, yellowness);
  const seedRatio = lerp(0.08, 0.15, yellowness);
  const occupancy = lerp(0.7, 0.84, yellowness);
  const c = Math.min(seed.c * seedRatio, maxChroma(l, h, targetGamut) * occupancy);

  return {
    weight,
    yellowness,
    endpoint: clampToGamut({ l, c, h }, targetGamut),
  };
}

function warmHighlightColor(
  seed: OklchColor,
  prior: WarmHighlightPrior,
  linearProgress: number,
  seedIndex: number,
  targetGamut: ColorGamut,
): OklchColor {
  const progress = clamp(linearProgress, 0, 1);
  const shelfExponent =
    seedIndex <= 3
      ? lerp(3.1, 3.55, prior.yellowness)
      : lerp(1.9, 2.25, prior.yellowness);
  const chromaExponent = lerp(1.6, 1.32, prior.yellowness);
  const hueExponent = lerp(1.75, 2.25, prior.yellowness);

  return clampToGamut({
    l: clamp(
      lerp(prior.endpoint.l, seed.l, progress ** shelfExponent),
      0.02,
      0.995,
    ),
    c: Math.max(0, lerp(prior.endpoint.c, seed.c, progress ** chromaExponent)),
    h: mixHue(prior.endpoint.h, seed.h, progress ** hueExponent),
  }, targetGamut);
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
  targetGamut: ColorGamut,
  options: BrandExactFairingOptions,
): RampStop[] {
  const lastIndex = baseStops.length - 1;
  const lightEndpoint = toLabVector(baseStops[0].color);
  const darkEndpoint = toLabVector(baseStops[lastIndex].color);
  const seedLab = toLabVector(exactSeed);
  const warmPrior =
    options.warmHighlightShoulder === false
      ? null
      : warmHighlightPrior(exactSeed, targetGamut);

  return baseStops.map((stop, index) => {
    let color: OklchColor;
    if (index === seedIndex) {
      color = exactSeed;
    } else if (index < seedIndex) {
      const linearProgress = seedIndex <= 0 ? 1 : index / seedIndex;
      const progress = linearProgress ** lightEase;
      color = colorFromLab(lerpLab(lightEndpoint, seedLab, progress), exactSeed.h, targetGamut);
      if (warmPrior) {
        color = mixColorsInLab(
          color,
          warmHighlightColor(
            exactSeed,
            warmPrior,
            linearProgress,
            seedIndex,
            targetGamut,
          ),
          warmPrior.weight,
          exactSeed.h,
          targetGamut,
        );
      }
    } else {
      const progress =
        lastIndex <= seedIndex ? 1 : (index - seedIndex) / (lastIndex - seedIndex);
      color = colorFromLab(lerpLab(seedLab, darkEndpoint, progress), exactSeed.h, targetGamut);
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

export function solveBrandExactFairRamp(
  config: RampConfig,
  options: BrandExactFairingOptions = {},
): V6SolveResult {
  const targetGamut = solvingGamutForTarget(config.targetGamut);
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
        targetGamut,
        options,
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
