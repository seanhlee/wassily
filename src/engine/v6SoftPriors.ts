import type { OklchColor } from "../types";
import {
  CURATED_REFERENCE_CORPUS,
  familyAffinityForSeed,
  type ReferenceRamp,
} from "./familyProfiles";
import {
  addLab,
  buildSeedCenteredFrame,
  distanceLab,
  projectShoulderToSeedFrame,
  scaleLab,
  toLabVector,
} from "./pathGeometry";
import { maxChroma } from "./gamut";

const REFERENCE_LABELS = [
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
] as const;

const ENDPOINT_LIGHTNESS_FLOOR = 0.02;
const ENDPOINT_INTENSITY_FLOOR = 0.08;
const HUE_OFFSET_FLOOR = 2;
const TANGENT_FLOOR = 0.06;

const ENERGY_FLOORS = {
  curvature: 0.02,
  jerk: 0.03,
  hueWobble: 0.75,
  spacingDistortion: 0.05,
  seedNeighborhoodAsymmetry: 0.01,
  endpointHuePenalty: 2,
  occupancyReward: 0.05,
  endpointOccupancyReward: 0.05,
  spanReward: 0.03,
} as const;

const HUE_SIGMA = 34;
const CHROMA_SIGMA = 0.08;
const LIGHTNESS_SIGMA = 0.18;
const EPSILON = 1e-6;

export interface V6SoftPriorParameterValues {
  lightHueOffset: number;
  lightLightness: number;
  lightIntensity: number;
  darkHueOffset: number;
  darkLightness: number;
  darkIntensity: number;
  seedTangentRadial: number;
  seedTangentNormal: number;
}

export interface V6SoftPriorEnergyValues {
  curvature: number;
  jerk: number;
  hueWobble: number;
  spacingDistortion: number;
  seedNeighborhoodAsymmetry: number;
  endpointHuePenalty: number;
  occupancyReward: number;
  endpointOccupancyReward: number;
  spanReward: number;
}

export interface V6SoftPriorTarget {
  mean: number;
  deviation: number;
}

export interface V6SoftPriorSnapshot {
  parameters: {
    lightHueOffset: V6SoftPriorTarget;
    lightLightness: V6SoftPriorTarget;
    lightIntensity: V6SoftPriorTarget;
    darkHueOffset: V6SoftPriorTarget;
    darkLightness: V6SoftPriorTarget;
    darkIntensity: V6SoftPriorTarget;
    seedTangentRadial: V6SoftPriorTarget;
    seedTangentNormal: V6SoftPriorTarget;
  };
  energy: {
    curvature: V6SoftPriorTarget;
    jerk: V6SoftPriorTarget;
    hueWobble: V6SoftPriorTarget;
    spacingDistortion: V6SoftPriorTarget;
    seedNeighborhoodAsymmetry: V6SoftPriorTarget;
    endpointHuePenalty: V6SoftPriorTarget;
    occupancyReward: V6SoftPriorTarget;
    endpointOccupancyReward: V6SoftPriorTarget;
    spanReward: V6SoftPriorTarget;
  };
}

export interface V6SoftPriorContributor {
  referenceId: string;
  source: string;
  normalizedWeight: number;
}

export interface V6SoftPriorDeviation {
  value: number;
  mean: number;
  delta: number;
  normalized: number;
}

export interface V6SoftPriorComparison {
  parameterPenalty: number;
  energyPenalty: number;
  prior: V6SoftPriorSnapshot;
  contributors: V6SoftPriorContributor[];
  parameterDeltas: {
    lightHueOffset: V6SoftPriorDeviation;
    lightLightness: V6SoftPriorDeviation;
    lightIntensity: V6SoftPriorDeviation;
    darkHueOffset: V6SoftPriorDeviation;
    darkLightness: V6SoftPriorDeviation;
    darkIntensity: V6SoftPriorDeviation;
    seedTangentRadial: V6SoftPriorDeviation;
    seedTangentNormal: V6SoftPriorDeviation;
  };
  energyDeltas: {
    curvature: V6SoftPriorDeviation;
    jerk: V6SoftPriorDeviation;
    hueWobble: V6SoftPriorDeviation;
    spacingDistortion: V6SoftPriorDeviation;
    seedNeighborhoodAsymmetry: V6SoftPriorDeviation;
    endpointHuePenalty: V6SoftPriorDeviation;
    occupancyReward: V6SoftPriorDeviation;
    endpointOccupancyReward: V6SoftPriorDeviation;
    spanReward: V6SoftPriorDeviation;
  };
}

interface ReferencePriorExample {
  referenceId: string;
  source: string;
  anchorLabel: (typeof REFERENCE_LABELS)[number];
  weight: number;
  seed: OklchColor;
  parameters: V6SoftPriorParameterValues;
  energy: V6SoftPriorEnergyValues;
}

const ALIGNED_REFERENCE_CACHE = new Map<string, readonly ReferencePriorExample[]>();

function normalizeHue(hue: number): number {
  return ((hue % 360) + 360) % 360;
}

function hueDelta(from: number, to: number): number {
  let delta = normalizeHue(to) - normalizeHue(from);
  if (delta > 180) delta -= 360;
  if (delta < -180) delta += 360;
  return delta;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function average(values: readonly number[]): number {
  return values.length === 0
    ? 0
    : values.reduce((sum, value) => sum + value, 0) / values.length;
}

function weightedMean(
  values: readonly number[],
  weights: readonly number[],
): number {
  const totalWeight = Math.max(
    weights.reduce((sum, weight) => sum + weight, 0),
    EPSILON,
  );
  return (
    values.reduce((sum, value, index) => sum + value * weights[index], 0) /
    totalWeight
  );
}

function weightedDeviation(
  values: readonly number[],
  weights: readonly number[],
  mean: number,
): number {
  const totalWeight = Math.max(
    weights.reduce((sum, weight) => sum + weight, 0),
    EPSILON,
  );
  return Math.sqrt(
    values.reduce(
      (sum, value, index) => sum + weights[index] * (value - mean) ** 2,
      0,
    ) / totalWeight,
  );
}

function gaussian(distance: number, sigma: number): number {
  return Math.exp(-0.5 * (distance / sigma) ** 2);
}

function endpointIntensity(color: OklchColor): number {
  const available = maxChroma(color.l, color.h);
  return available > EPSILON ? clamp(color.c / available, 0, 1.1) : 0;
}

function unwrappedHues(colors: readonly OklchColor[]): number[] {
  const result: number[] = [];
  for (const color of colors) {
    if (result.length === 0) {
      result.push(color.h);
      continue;
    }
    const previous = result[result.length - 1];
    result.push(previous + hueDelta(previous, color.h));
  }
  return result;
}

function pairwiseDistances(colors: readonly OklchColor[]): number[] {
  const distances: number[] = [];
  for (let index = 1; index < colors.length; index++) {
    distances.push(
      distanceLab(toLabVector(colors[index - 1]), toLabVector(colors[index])),
    );
  }
  return distances;
}

function coefficientOfVariation(values: readonly number[]): number {
  const mean = average(values);
  if (mean <= EPSILON) return 0;
  const variance = average(values.map((value) => (value - mean) ** 2));
  return Math.sqrt(variance) / mean;
}

function computeReferenceEnergy(
  colors: readonly OklchColor[],
  seedIndex: number,
): V6SoftPriorEnergyValues {
  const labs = colors.map((color) => toLabVector(color));
  const hues = unwrappedHues(colors);
  const distances = pairwiseDistances(colors);
  const seed = colors[seedIndex];
  const lightEndpoint = colors[0];
  const darkEndpoint = colors[colors.length - 1];
  const lightSideDistances = distances.slice(0, seedIndex);
  const darkSideDistances = distances.slice(seedIndex);

  return {
    curvature: average(
      labs.slice(2).map((point, index) =>
        distanceLab(
          point,
          addLab(scaleLab(labs[index + 1], 2), scaleLab(labs[index], -1)),
        ),
      ),
    ),
    jerk: average(
      labs.slice(3).map((point, index) =>
        distanceLab(
          point,
          addLab(
            scaleLab(labs[index + 2], 3),
            addLab(scaleLab(labs[index + 1], -3), labs[index]),
          ),
        ),
      ),
    ),
    hueWobble: average(
      hues.slice(2).map((hue, index) =>
        Math.abs(hue - 2 * hues[index + 1] + hues[index]),
      ),
    ),
    spacingDistortion: coefficientOfVariation(distances),
    seedNeighborhoodAsymmetry: Math.abs(
      average(lightSideDistances) - average(darkSideDistances),
    ),
    endpointHuePenalty:
      Math.abs(hueDelta(seed.h, lightEndpoint.h)) * 0.5 +
      Math.abs(hueDelta(seed.h, darkEndpoint.h)) * 0.35,
    occupancyReward: average(
      colors.map((color) => {
        const available = maxChroma(color.l, color.h);
        return available > EPSILON ? color.c / available : 0;
      }),
    ),
    endpointOccupancyReward: average(
      [lightEndpoint, darkEndpoint].map((color) => {
        const available = maxChroma(color.l, color.h);
        return available > EPSILON ? color.c / available : 0;
      }),
    ),
    spanReward: distances.reduce((sum, distance) => sum + distance, 0),
  };
}

function seedCacheKey(seed: OklchColor): string {
  return `${seed.l.toFixed(5)}:${seed.c.toFixed(5)}:${normalizeHue(seed.h).toFixed(2)}`;
}

function referenceMatchWeight(seed: OklchColor, stop: OklchColor): number {
  return (
    gaussian(Math.abs(hueDelta(seed.h, stop.h)), HUE_SIGMA) *
    gaussian(Math.abs(seed.c - stop.c), CHROMA_SIGMA) *
    gaussian(Math.abs(seed.l - stop.l), LIGHTNESS_SIGMA)
  );
}

function buildAlignedReferencePrior(
  seed: OklchColor,
  reference: ReferenceRamp,
): ReferencePriorExample {
  const colors = REFERENCE_LABELS.map((label) => reference.stops[label]);
  let anchorLabel: (typeof REFERENCE_LABELS)[number] = REFERENCE_LABELS[0];
  let anchorIndex = 0;
  let bestWeight = -1;

  for (const [index, label] of REFERENCE_LABELS.entries()) {
    const matchWeight = referenceMatchWeight(seed, reference.stops[label]);
    if (matchWeight > bestWeight) {
      bestWeight = matchWeight;
      anchorLabel = label;
      anchorIndex = index;
    }
  }

  const alignedSeed = reference.stops[anchorLabel];
  const lightEndpoint = reference.stops["50"];
  const darkEndpoint = reference.stops["950"];
  const lightShoulder =
    reference.stops[REFERENCE_LABELS[Math.max(anchorIndex - 1, 0)]];
  const darkShoulder =
    reference.stops[
      REFERENCE_LABELS[Math.min(anchorIndex + 1, REFERENCE_LABELS.length - 1)]
    ];
  const frame = buildSeedCenteredFrame(lightEndpoint, alignedSeed, darkEndpoint);
  const lightProjection = projectShoulderToSeedFrame(frame, lightShoulder, "light");
  const darkProjection = projectShoulderToSeedFrame(frame, darkShoulder, "dark");

  return {
    referenceId: reference.id,
    source: reference.source,
    anchorLabel,
    weight:
      reference.weight *
      familyAffinityForSeed(seed.h, seed.c, reference.family) *
      Math.max(bestWeight, 0),
    seed: alignedSeed,
    parameters: {
      lightHueOffset: hueDelta(alignedSeed.h, lightEndpoint.h),
      lightLightness: lightEndpoint.l,
      lightIntensity: endpointIntensity(lightEndpoint),
      darkHueOffset: hueDelta(alignedSeed.h, darkEndpoint.h),
      darkLightness: darkEndpoint.l,
      darkIntensity: endpointIntensity(darkEndpoint),
      seedTangentRadial: clamp(
        (lightProjection.radial + darkProjection.radial) / 2,
        -0.4,
        0.4,
      ),
      seedTangentNormal: clamp(
        (lightProjection.normal + darkProjection.normal) / 2,
        -0.24,
        0.24,
      ),
    },
    energy: computeReferenceEnergy(colors, anchorIndex),
  };
}

function alignedReferencePriors(seed: OklchColor): readonly ReferencePriorExample[] {
  const cacheKey = seedCacheKey(seed);
  const cached = ALIGNED_REFERENCE_CACHE.get(cacheKey);
  if (cached) return cached;

  const raw = CURATED_REFERENCE_CORPUS.map((reference) =>
    buildAlignedReferencePrior(seed, reference),
  );
  const weightSum = raw.reduce((total, reference) => total + reference.weight, 0);
  const normalized =
    weightSum > EPSILON
      ? raw.map((reference) => ({
          ...reference,
          weight: reference.weight / weightSum,
        }))
      : raw.map((reference, index) => ({
          ...reference,
          weight:
            CURATED_REFERENCE_CORPUS[index].weight /
            Math.max(
              CURATED_REFERENCE_CORPUS.reduce(
                (total, candidate) => total + candidate.weight,
                0,
              ),
              EPSILON,
            ),
        }));

  ALIGNED_REFERENCE_CACHE.set(cacheKey, normalized);
  return normalized;
}

function target(
  values: readonly number[],
  weights: readonly number[],
): V6SoftPriorTarget {
  const mean = weightedMean(values, weights);
  return {
    mean,
    deviation: weightedDeviation(values, weights, mean),
  };
}

function normalizeComparison(
  value: number,
  prior: V6SoftPriorTarget,
  floor: number,
): V6SoftPriorDeviation {
  const delta = value - prior.mean;
  return {
    value,
    mean: prior.mean,
    delta,
    normalized: delta / Math.max(prior.deviation, floor),
  };
}

function rmsPenalty(values: readonly number[]): number {
  return Math.sqrt(average(values.map((value) => value ** 2)));
}

export function compareToV6SoftPrior(
  seed: OklchColor,
  parameters: V6SoftPriorParameterValues,
  energy: V6SoftPriorEnergyValues,
): V6SoftPriorComparison {
  const references = alignedReferencePriors(seed);
  const weights = references.map((reference) => reference.weight);
  const prior: V6SoftPriorSnapshot = {
    parameters: {
      lightHueOffset: target(
        references.map((reference) => reference.parameters.lightHueOffset),
        weights,
      ),
      lightLightness: target(
        references.map((reference) => reference.parameters.lightLightness),
        weights,
      ),
      lightIntensity: target(
        references.map((reference) => reference.parameters.lightIntensity),
        weights,
      ),
      darkHueOffset: target(
        references.map((reference) => reference.parameters.darkHueOffset),
        weights,
      ),
      darkLightness: target(
        references.map((reference) => reference.parameters.darkLightness),
        weights,
      ),
      darkIntensity: target(
        references.map((reference) => reference.parameters.darkIntensity),
        weights,
      ),
      seedTangentRadial: target(
        references.map((reference) => reference.parameters.seedTangentRadial),
        weights,
      ),
      seedTangentNormal: target(
        references.map((reference) => reference.parameters.seedTangentNormal),
        weights,
      ),
    },
    energy: {
      curvature: target(
        references.map((reference) => reference.energy.curvature),
        weights,
      ),
      jerk: target(
        references.map((reference) => reference.energy.jerk),
        weights,
      ),
      hueWobble: target(
        references.map((reference) => reference.energy.hueWobble),
        weights,
      ),
      spacingDistortion: target(
        references.map((reference) => reference.energy.spacingDistortion),
        weights,
      ),
      seedNeighborhoodAsymmetry: target(
        references.map((reference) => reference.energy.seedNeighborhoodAsymmetry),
        weights,
      ),
      endpointHuePenalty: target(
        references.map((reference) => reference.energy.endpointHuePenalty),
        weights,
      ),
      occupancyReward: target(
        references.map((reference) => reference.energy.occupancyReward),
        weights,
      ),
      endpointOccupancyReward: target(
        references.map((reference) => reference.energy.endpointOccupancyReward),
        weights,
      ),
      spanReward: target(
        references.map((reference) => reference.energy.spanReward),
        weights,
      ),
    },
  };

  const parameterDeltas = {
    lightHueOffset: normalizeComparison(
      parameters.lightHueOffset,
      prior.parameters.lightHueOffset,
      HUE_OFFSET_FLOOR,
    ),
    lightLightness: normalizeComparison(
      parameters.lightLightness,
      prior.parameters.lightLightness,
      ENDPOINT_LIGHTNESS_FLOOR,
    ),
    lightIntensity: normalizeComparison(
      parameters.lightIntensity,
      prior.parameters.lightIntensity,
      ENDPOINT_INTENSITY_FLOOR,
    ),
    darkHueOffset: normalizeComparison(
      parameters.darkHueOffset,
      prior.parameters.darkHueOffset,
      HUE_OFFSET_FLOOR,
    ),
    darkLightness: normalizeComparison(
      parameters.darkLightness,
      prior.parameters.darkLightness,
      ENDPOINT_LIGHTNESS_FLOOR,
    ),
    darkIntensity: normalizeComparison(
      parameters.darkIntensity,
      prior.parameters.darkIntensity,
      ENDPOINT_INTENSITY_FLOOR,
    ),
    seedTangentRadial: normalizeComparison(
      parameters.seedTangentRadial,
      prior.parameters.seedTangentRadial,
      TANGENT_FLOOR,
    ),
    seedTangentNormal: normalizeComparison(
      parameters.seedTangentNormal,
      prior.parameters.seedTangentNormal,
      TANGENT_FLOOR,
    ),
  };

  const energyDeltas = {
    curvature: normalizeComparison(
      energy.curvature,
      prior.energy.curvature,
      ENERGY_FLOORS.curvature,
    ),
    jerk: normalizeComparison(
      energy.jerk,
      prior.energy.jerk,
      ENERGY_FLOORS.jerk,
    ),
    hueWobble: normalizeComparison(
      energy.hueWobble,
      prior.energy.hueWobble,
      ENERGY_FLOORS.hueWobble,
    ),
    spacingDistortion: normalizeComparison(
      energy.spacingDistortion,
      prior.energy.spacingDistortion,
      ENERGY_FLOORS.spacingDistortion,
    ),
    seedNeighborhoodAsymmetry: normalizeComparison(
      energy.seedNeighborhoodAsymmetry,
      prior.energy.seedNeighborhoodAsymmetry,
      ENERGY_FLOORS.seedNeighborhoodAsymmetry,
    ),
    endpointHuePenalty: normalizeComparison(
      energy.endpointHuePenalty,
      prior.energy.endpointHuePenalty,
      ENERGY_FLOORS.endpointHuePenalty,
    ),
    occupancyReward: normalizeComparison(
      energy.occupancyReward,
      prior.energy.occupancyReward,
      ENERGY_FLOORS.occupancyReward,
    ),
    endpointOccupancyReward: normalizeComparison(
      energy.endpointOccupancyReward,
      prior.energy.endpointOccupancyReward,
      ENERGY_FLOORS.endpointOccupancyReward,
    ),
    spanReward: normalizeComparison(
      energy.spanReward,
      prior.energy.spanReward,
      ENERGY_FLOORS.spanReward,
    ),
  };

  return {
    parameterPenalty: rmsPenalty(
      Object.values(parameterDeltas).map((entry) => entry.normalized),
    ),
    energyPenalty: rmsPenalty(
      Object.values(energyDeltas).map((entry) => entry.normalized),
    ),
    prior,
    contributors: references.map((reference, index) => ({
      referenceId: reference.referenceId,
      source: reference.source,
      normalizedWeight: weights[index],
    }))
      .sort((a, b) => b.normalizedWeight - a.normalizedWeight)
      .slice(0, 3),
    parameterDeltas,
    energyDeltas,
  };
}
