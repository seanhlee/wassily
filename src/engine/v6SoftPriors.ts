import type { OklchColor } from "../types";
import {
  CURATED_REFERENCE_CORPUS,
  FAMILY_EXEMPLARS,
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
import {
  PATH_SAMPLE_PROGRESS,
  buildReferencePathProfile,
  type V6PathProfile,
  type V6PathProfileSample,
} from "./v6PathProfiles";

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
const PATH_FLOW_FLOOR = 0.06;
const PATH_OFFSET_FLOOR = 0.05;
const OCCUPANCY_FLOOR = 0.06;

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

export interface V6SoftPriorDeviation {
  value: number;
  mean: number;
  delta: number;
  normalized: number;
}

export interface V6SoftPriorPathSnapshotSample {
  progress: number;
  flow: V6SoftPriorTarget;
  radial: V6SoftPriorTarget;
  normal: V6SoftPriorTarget;
  occupancy: V6SoftPriorTarget;
}

export interface V6SoftPriorPathDeviationSample {
  progress: number;
  flow: V6SoftPriorDeviation;
  radial: V6SoftPriorDeviation;
  normal: V6SoftPriorDeviation;
  occupancy: V6SoftPriorDeviation;
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
  path: {
    light: V6SoftPriorPathSnapshotSample[];
    dark: V6SoftPriorPathSnapshotSample[];
  };
}

export interface V6SoftPriorContributor {
  referenceId: string;
  source: string;
  anchorLabel: (typeof REFERENCE_LABELS)[number];
  normalizedWeight: number;
}

export interface V6SoftPriorComparison {
  parameterPenalty: number;
  energyPenalty: number;
  pathPenalty: number;
  chromaDistributionPenalty: number;
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
  pathDeltas: {
    light: V6SoftPriorPathDeviationSample[];
    dark: V6SoftPriorPathDeviationSample[];
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
  path: V6PathProfile;
}

interface V6SoftPriorBundle {
  prior: V6SoftPriorSnapshot;
  contributors: V6SoftPriorContributor[];
}

const PRIOR_CACHE = new Map<string, V6SoftPriorBundle>();

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

function rotateHue(color: OklchColor, offset: number): OklchColor {
  return {
    ...color,
    h: normalizeHue(color.h + offset),
  };
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

function buildAlignedReferenceExample(
  seed: OklchColor,
  reference: ReferenceRamp,
  anchorIndex: number,
): ReferencePriorExample {
  const rawColors = REFERENCE_LABELS.map((label) => reference.stops[label]);
  const anchorLabel = REFERENCE_LABELS[anchorIndex];
  const anchorStop = rawColors[anchorIndex];
  const rotationOffset =
    reference.family === "neutral"
      ? 0
      : hueDelta(anchorStop.h, FAMILY_EXEMPLARS[reference.family].h);
  const alignedColors =
    rotationOffset === 0
      ? rawColors
      : rawColors.map((color) => rotateHue(color, rotationOffset));
  const alignedSeed = alignedColors[anchorIndex];
  const lightEndpoint = alignedColors[0];
  const darkEndpoint = alignedColors[alignedColors.length - 1];
  const lightShoulder = alignedColors[Math.max(anchorIndex - 1, 0)];
  const darkShoulder =
    alignedColors[Math.min(anchorIndex + 1, alignedColors.length - 1)];
  const frame = buildSeedCenteredFrame(lightEndpoint, alignedSeed, darkEndpoint);
  const lightProjection = projectShoulderToSeedFrame(frame, lightShoulder, "light");
  const darkProjection = projectShoulderToSeedFrame(frame, darkShoulder, "dark");
  const weight =
    reference.weight *
    familyAffinityForSeed(seed.h, seed.c, reference.family) *
    Math.max(referenceMatchWeight(seed, anchorStop), 0);

  return {
    referenceId: reference.id,
    source: reference.source,
    anchorLabel,
    weight,
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
    energy: computeReferenceEnergy(alignedColors, anchorIndex),
    path: buildReferencePathProfile(alignedColors, anchorIndex),
  };
}

function alignedReferenceExamples(seed: OklchColor): readonly ReferencePriorExample[] {
  return CURATED_REFERENCE_CORPUS.flatMap((reference) =>
    REFERENCE_LABELS.map((_, anchorIndex) =>
      buildAlignedReferenceExample(seed, reference, anchorIndex),
    ),
  );
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

function buildPathSnapshot(
  references: readonly ReferencePriorExample[],
  weights: readonly number[],
): V6SoftPriorSnapshot["path"] {
  const snapshotForSide = (
    side: keyof V6PathProfile,
  ): V6SoftPriorPathSnapshotSample[] =>
    PATH_SAMPLE_PROGRESS.map((progress, index) => ({
      progress,
      flow: target(
        references.map((reference) => reference.path[side][index].flow),
        weights,
      ),
      radial: target(
        references.map((reference) => reference.path[side][index].radial),
        weights,
      ),
      normal: target(
        references.map((reference) => reference.path[side][index].normal),
        weights,
      ),
      occupancy: target(
        references.map((reference) => reference.path[side][index].occupancy),
        weights,
      ),
    }));

  return {
    light: snapshotForSide("light"),
    dark: snapshotForSide("dark"),
  };
}

function buildSoftPriorBundle(seed: OklchColor): V6SoftPriorBundle {
  const cacheKey = seedCacheKey(seed);
  const cached = PRIOR_CACHE.get(cacheKey);
  if (cached) return cached;

  const rawReferences = alignedReferenceExamples(seed).filter(
    (reference) => reference.weight > EPSILON,
  );
  const normalizedReferences =
    rawReferences.length > 0
      ? (() => {
          const weightSum = rawReferences.reduce(
            (sum, reference) => sum + reference.weight,
            0,
          );
          return rawReferences.map((reference) => ({
            ...reference,
            weight: reference.weight / Math.max(weightSum, EPSILON),
          }));
        })()
      : CURATED_REFERENCE_CORPUS.flatMap((reference) =>
          REFERENCE_LABELS.map((_, anchorIndex) => {
            const example = buildAlignedReferenceExample(seed, reference, anchorIndex);
            return {
              ...example,
              weight:
                1 /
                (CURATED_REFERENCE_CORPUS.length * REFERENCE_LABELS.length),
            };
          }),
        );
  const weights = normalizedReferences.map((reference) => reference.weight);

  const prior: V6SoftPriorSnapshot = {
    parameters: {
      lightHueOffset: target(
        normalizedReferences.map((reference) => reference.parameters.lightHueOffset),
        weights,
      ),
      lightLightness: target(
        normalizedReferences.map((reference) => reference.parameters.lightLightness),
        weights,
      ),
      lightIntensity: target(
        normalizedReferences.map((reference) => reference.parameters.lightIntensity),
        weights,
      ),
      darkHueOffset: target(
        normalizedReferences.map((reference) => reference.parameters.darkHueOffset),
        weights,
      ),
      darkLightness: target(
        normalizedReferences.map((reference) => reference.parameters.darkLightness),
        weights,
      ),
      darkIntensity: target(
        normalizedReferences.map((reference) => reference.parameters.darkIntensity),
        weights,
      ),
      seedTangentRadial: target(
        normalizedReferences.map((reference) => reference.parameters.seedTangentRadial),
        weights,
      ),
      seedTangentNormal: target(
        normalizedReferences.map((reference) => reference.parameters.seedTangentNormal),
        weights,
      ),
    },
    energy: {
      curvature: target(
        normalizedReferences.map((reference) => reference.energy.curvature),
        weights,
      ),
      jerk: target(
        normalizedReferences.map((reference) => reference.energy.jerk),
        weights,
      ),
      hueWobble: target(
        normalizedReferences.map((reference) => reference.energy.hueWobble),
        weights,
      ),
      spacingDistortion: target(
        normalizedReferences.map((reference) => reference.energy.spacingDistortion),
        weights,
      ),
      seedNeighborhoodAsymmetry: target(
        normalizedReferences.map((reference) => reference.energy.seedNeighborhoodAsymmetry),
        weights,
      ),
      endpointHuePenalty: target(
        normalizedReferences.map((reference) => reference.energy.endpointHuePenalty),
        weights,
      ),
      occupancyReward: target(
        normalizedReferences.map((reference) => reference.energy.occupancyReward),
        weights,
      ),
      endpointOccupancyReward: target(
        normalizedReferences.map(
          (reference) => reference.energy.endpointOccupancyReward,
        ),
        weights,
      ),
      spanReward: target(
        normalizedReferences.map((reference) => reference.energy.spanReward),
        weights,
      ),
    },
    path: buildPathSnapshot(normalizedReferences, weights),
  };

  const bundle: V6SoftPriorBundle = {
    prior,
    contributors: normalizedReferences
      .map((reference, index) => ({
        referenceId: reference.referenceId,
        source: reference.source,
        anchorLabel: reference.anchorLabel,
        normalizedWeight: weights[index],
      }))
      .sort((a, b) => b.normalizedWeight - a.normalizedWeight)
      .slice(0, 5),
  };
  PRIOR_CACHE.set(cacheKey, bundle);
  return bundle;
}

function comparePathSide(
  samples: readonly V6PathProfileSample[],
  prior: readonly V6SoftPriorPathSnapshotSample[],
): V6SoftPriorPathDeviationSample[] {
  return prior.map((targetSample, index) => {
    const sample = samples[index] ?? samples[samples.length - 1];
    return {
      progress: targetSample.progress,
      flow: normalizeComparison(sample.flow, targetSample.flow, PATH_FLOW_FLOOR),
      radial: normalizeComparison(sample.radial, targetSample.radial, PATH_OFFSET_FLOOR),
      normal: normalizeComparison(sample.normal, targetSample.normal, PATH_OFFSET_FLOOR),
      occupancy: normalizeComparison(
        sample.occupancy,
        targetSample.occupancy,
        OCCUPANCY_FLOOR,
      ),
    };
  });
}

function interiorPathDeltas(
  deltas: readonly V6SoftPriorPathDeviationSample[],
): V6SoftPriorPathDeviationSample[] {
  return deltas.filter(
    (entry) => entry.progress > EPSILON && entry.progress < 1 - EPSILON,
  );
}

export function buildV6SoftPrior(seed: OklchColor): V6SoftPriorBundle {
  return buildSoftPriorBundle(seed);
}

export function compareToV6SoftPrior(
  seed: OklchColor,
  parameters: V6SoftPriorParameterValues,
  energy: V6SoftPriorEnergyValues,
  path: V6PathProfile,
): V6SoftPriorComparison {
  const bundle = buildSoftPriorBundle(seed);
  const { prior, contributors } = bundle;

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
    jerk: normalizeComparison(energy.jerk, prior.energy.jerk, ENERGY_FLOORS.jerk),
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

  const pathDeltas = {
    light: comparePathSide(path.light, prior.path.light),
    dark: comparePathSide(path.dark, prior.path.dark),
  };
  const interior = [
    ...interiorPathDeltas(pathDeltas.light),
    ...interiorPathDeltas(pathDeltas.dark),
  ];

  return {
    parameterPenalty: rmsPenalty(
      Object.values(parameterDeltas).map((entry) => entry.normalized),
    ),
    energyPenalty: rmsPenalty(
      Object.values(energyDeltas).map((entry) => entry.normalized),
    ),
    pathPenalty: rmsPenalty(
      interior.flatMap((entry) => [
        entry.flow.normalized,
        entry.radial.normalized,
        entry.normal.normalized,
      ]),
    ),
    chromaDistributionPenalty: rmsPenalty(
      interior.map((entry) => entry.occupancy.normalized),
    ),
    prior,
    contributors,
    parameterDeltas,
    energyDeltas,
    pathDeltas,
  };
}
