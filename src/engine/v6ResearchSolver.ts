import type { OklchColor, RampConfig, RampStop, StopPreset } from "../types";
import { clampToGamut, isInGamut, maxChroma } from "./gamut";
import {
  addLab,
  buildSeedCenteredFrame,
  distanceLab,
  dotLab,
  labVectorToOklch,
  normalizeLab,
  reconstructPointFromSeedFrame,
  scaleLab,
  subtractLab,
  toLabVector,
  type LabVector,
} from "./pathGeometry";
import {
  buildV6SoftPrior,
  compareToV6SoftPrior,
  type V6SoftPriorComparison,
} from "./v6SoftPriors";
import { buildPathProfileFromSidePolylines } from "./v6PathProfiles";

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

const L_MAX = 0.98;
const L_FLOOR = 0.05;
const L_CEILING = 1.0;
const EPSILON = 1e-6;
const SOFT_PRIOR_WEIGHTS = {
  endpointReserve: 0.18,
  darkEndpointReserve: 0.5,
  endpointHueDrift: 0.12,
  lightEndpointIntensity: 0.18,
  darkEndpointIntensity: 0.28,
  seedTangentBias: 0.12,
  fullPathShape: 0.42,
  chromaDistribution: 0.24,
  energyTargets: 0.24,
} as const;

const DEFAULT_ARCHETYPE_CURVE: V6CurveParameters = {
  seedTangentRadial: 0,
  seedTangentNormal: 0,
  lightSeedHandleScale: 0.24,
  darkSeedHandleScale: 0.24,
  lightHandleScale: 0.34,
  darkHandleScale: 0.34,
};

export interface V6EndpointCandidate {
  color: OklchColor;
  hueOffset: number;
  lightness: number;
  intensity: number;
  score: number;
}

export interface V6CurveParameters {
  seedTangentRadial: number;
  seedTangentNormal: number;
  lightSeedHandleScale: number;
  darkSeedHandleScale: number;
  lightHandleScale: number;
  darkHandleScale: number;
}

export interface V6SolverParameters {
  lightEndpoint: V6EndpointCandidate;
  darkEndpoint: V6EndpointCandidate;
  curve: V6CurveParameters;
}

export interface V6EnergyBreakdown {
  gamutPenalty: number;
  lightnessPenalty: number;
  lightReservePenalty: number;
  curvature: number;
  jerk: number;
  hueWobble: number;
  continuousSpacingDistortion: number;
  spacingDistortion: number;
  seedStopTargetPenalty: number;
  lightEdgeParityPenalty: number;
  darkEdgeParityPenalty: number;
  worstAdjacentStepPenalty: number;
  worstThreeStepWindowPenalty: number;
  localStepSpreadPenalty: number;
  lightEntrancePenalty: number;
  seedPlacementPenalty: number;
  seedNeighborhoodAsymmetry: number;
  endpointHuePenalty: number;
  occupancyReward: number;
  endpointOccupancyReward: number;
  spanReward: number;
  endpointReservePriorPenalty: number;
  lightEndpointIntensityPriorPenalty: number;
  darkEndpointReservePriorPenalty: number;
  endpointIntensityPriorPenalty: number;
  darkEndpointIntensityPriorPenalty: number;
  endpointHueDriftPriorPenalty: number;
  seedTangentBiasPriorPenalty: number;
  fullPathPriorPenalty: number;
  chromaDistributionPriorPenalty: number;
  energyTargetPriorPenalty: number;
  selectedSoftPriorPenalty: number;
  total: number;
}

export interface V6SolveMetadata {
  solver: "v6" | "v6-archetype";
  score: number;
  lightBudget: number;
  darkBudget: number;
  totalBudget: number;
  seedIndex: number;
  seedFraction: number;
  parameters: V6SolverParameters;
  breakdown: V6EnergyBreakdown;
  softPrior: V6SoftPriorComparison;
}

type BaseV6SolveMetadata = Omit<V6SolveMetadata, "softPrior">;

export interface V6SolveResult {
  stops: RampStop[];
  metadata: V6SolveMetadata;
}

interface EndpointSearchContext {
  seed: OklchColor;
  seedLab: LabVector;
  seedIntensity: number;
}

interface V6EndpointGeometryCandidate {
  hue: number;
  lightness: number;
  localMax: number;
  hueOffset: number;
  score: number;
}

interface PathSolution {
  colors: OklchColor[];
  metadata: BaseV6SolveMetadata;
  softPrior: V6SoftPriorComparison;
}

interface V6ParameterVector {
  lightHueOffset: number;
  lightLightness: number;
  lightIntensity: number;
  darkHueOffset: number;
  darkLightness: number;
  darkIntensity: number;
  curve: V6CurveParameters;
}

interface PathMetrics {
  score: number;
  lightBudget: number;
  darkBudget: number;
  totalBudget: number;
  seedIndex: number;
  seedFraction: number;
  breakdown: V6EnergyBreakdown;
  softPrior: V6SoftPriorComparison;
}

interface FinePathPoint {
  lab: LabVector;
  color: OklchColor;
  distance: number;
}

interface SamplingPlan {
  seedIndex: number;
  lightIntervals: number[];
  darkIntervals: number[];
}

interface SampledPath {
  colors: OklchColor[];
  seedIndex: number;
  lightBudget: number;
  darkBudget: number;
  totalBudget: number;
  seedFraction: number;
}

const CACHE = new Map<string, V6SolveResult>();
const ARCHETYPE_CACHE = new Map<string, V6SolveResult>();

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

function chromaIntensity(color: OklchColor): number {
  const available = maxChroma(color.l, color.h);
  return available > EPSILON ? clamp(color.c / available, 0, 1) : 0;
}

function sanitizeSolvedColor(color: OklchColor): OklchColor {
  const constrained = clampToGamut({
    ...color,
    l: clamp(color.l, L_FLOOR, L_MAX),
  });
  return {
    l: clamp(constrained.l, L_FLOOR, L_MAX),
    c: Math.max(0, constrained.c),
    h: normalizeHue(constrained.h),
  };
}

function darkModeAdjust(
  l: number,
  c: number,
  h: number,
  t: number,
): OklchColor {
  let darkL = l;
  let darkC = c;
  const darkH = h;

  if (t < 0.3) {
    darkL = l - 0.03;
    darkC = c * 0.9;
  } else if (t < 0.6) {
    darkL = l + 0.06;
    darkC = c * 0.85;
  } else {
    darkL = l + 0.01;
    darkC = c * 1.05;
  }

  darkL = clamp(darkL, 0.05, 0.98);
  return clampToGamut({ l: darkL, c: darkC, h: darkH });
}

function generateCustomLabels(count: number): string[] {
  const labels: string[] = [];
  for (let i = 0; i < count; i++) {
    const raw = 50 + (900 * i) / Math.max(count - 1, 1);
    const snapped = i === 0 ? 50 : i === count - 1 ? 950 : Math.round(raw / 50) * 50;
    labels.push(String(snapped));
  }
  return labels;
}

function resolveLabels(stopCount: StopPreset | number): string[] {
  return stopCount in STOP_PRESETS
    ? STOP_PRESETS[stopCount as StopPreset]
    : generateCustomLabels(stopCount);
}

function clampEndpointLightness(
  side: "light" | "dark",
  context: EndpointSearchContext,
  lightness: number,
): number {
  return side === "light"
    ? clamp(lightness, context.seed.l, L_MAX)
    : clamp(lightness, L_FLOOR, context.seed.l);
}

function endpointLightnessCandidates(
  side: "light" | "dark",
  context: EndpointSearchContext,
): number[] {
  if (side === "light") {
    const min = clamp(context.seed.l, L_FLOOR, L_MAX);
    const range = Math.max(L_MAX - min, 0);
    return Array.from(
      new Set(
        [min, min + range * 0.35, min + range * 0.7, L_MAX].map((value) =>
          Number(clamp(value, min, L_MAX).toFixed(5)),
        ),
      ),
    );
  }

  const max = clamp(context.seed.l, L_FLOOR, L_MAX);
  const range = Math.max(max - L_FLOOR, 0);
  return Array.from(
    new Set(
      [L_FLOOR, L_FLOOR + range * 0.3, L_FLOOR + range * 0.65, max].map((value) =>
        Number(clamp(value, L_FLOOR, max).toFixed(5)),
      ),
    ),
  );
}

function buildEndpointGeometry(
  side: "light" | "dark",
  context: EndpointSearchContext,
  hueOffset: number,
  lightness: number,
): V6EndpointGeometryCandidate | null {
  const hue = normalizeHue(context.seed.h + hueOffset);
  const clampedLightness = clampEndpointLightness(side, context, lightness);

  const localMax = maxChroma(clampedLightness, hue);
  if (localMax <= EPSILON) return null;
  const candidateLab = toLabVector({
    l: clamp(clampedLightness, L_FLOOR, L_CEILING),
    c: localMax,
    h: hue,
  });
  const span = distanceLab(candidateLab, context.seedLab);
  const directionPenalty = Math.abs(hueDelta(context.seed.h, hue)) / 24;
  const spanWeight =
    side === "light"
      ? clampedLightness - context.seed.l
      : context.seed.l - clampedLightness;
  const score = spanWeight * 10 + localMax * 3 + span * 1.5 - directionPenalty;

  return {
    hue,
    lightness: clampedLightness,
    localMax,
    hueOffset,
    score,
  };
}

function buildEndpointCandidate(
  side: "light" | "dark",
  context: EndpointSearchContext,
  hueOffset: number,
  lightness: number,
  intensity: number,
): V6EndpointCandidate | null {
  const geometry = buildEndpointGeometry(side, context, hueOffset, lightness);
  if (!geometry) return null;

  const color = sanitizeSolvedColor({
    l: clamp(geometry.lightness, L_FLOOR, L_CEILING),
    c: geometry.localMax * intensity,
    h: geometry.hue,
  });

  return {
    color,
    hueOffset,
    lightness: geometry.lightness,
    intensity,
    score: geometry.score,
  };
}

function rankEndpointCandidates(
  side: "light" | "dark",
  context: EndpointSearchContext,
): V6EndpointGeometryCandidate[] {
  const hueOffsets =
    side === "light"
      ? [-12, -8, -4, -2, 0, 2, 4, 8]
      : [-12, -8, -4, 0, 4, 8, 12, 16];
  const lightnesses = endpointLightnessCandidates(side, context);

  const candidates = hueOffsets.flatMap((hueOffset) =>
    lightnesses
      .map((lightness) => buildEndpointGeometry(side, context, hueOffset, lightness))
      .filter((candidate): candidate is V6EndpointGeometryCandidate => candidate !== null),
  );

  return candidates.sort((a, b) => b.score - a.score).slice(0, 4);
}

function clampParameterVector(vector: V6ParameterVector): V6ParameterVector {
  return {
    lightHueOffset: clamp(vector.lightHueOffset, -18, 12),
    lightLightness: clamp(vector.lightLightness, L_FLOOR, L_MAX),
    lightIntensity: clamp(vector.lightIntensity, 0.02, 0.98),
    darkHueOffset: clamp(vector.darkHueOffset, -18, 20),
    darkLightness: clamp(vector.darkLightness, L_FLOOR, L_MAX),
    darkIntensity: clamp(vector.darkIntensity, 0.02, 0.98),
    curve: {
      seedTangentRadial: clamp(vector.curve.seedTangentRadial, -0.4, 0.4),
      seedTangentNormal: clamp(vector.curve.seedTangentNormal, -0.24, 0.24),
      lightSeedHandleScale: clamp(vector.curve.lightSeedHandleScale, 0.1, 0.45),
      darkSeedHandleScale: clamp(vector.curve.darkSeedHandleScale, 0.1, 0.45),
      lightHandleScale: clamp(vector.curve.lightHandleScale, 0.12, 0.42),
      darkHandleScale: clamp(vector.curve.darkHandleScale, 0.12, 0.42),
    },
  };
}

function buildParametersFromVector(
  context: EndpointSearchContext,
  vector: V6ParameterVector,
): V6SolverParameters | null {
  const lightEndpoint = buildEndpointCandidate(
    "light",
    context,
    vector.lightHueOffset,
    vector.lightLightness,
    vector.lightIntensity,
  );
  const darkEndpoint = buildEndpointCandidate(
    "dark",
    context,
    vector.darkHueOffset,
    vector.darkLightness,
    vector.darkIntensity,
  );

  if (!lightEndpoint || !darkEndpoint) return null;

  return {
    lightEndpoint,
    darkEndpoint,
    curve: vector.curve,
  };
}

function cubicBezier(
  p0: LabVector,
  p1: LabVector,
  p2: LabVector,
  p3: LabVector,
  t: number,
): LabVector {
  const mt = 1 - t;
  const mt2 = mt * mt;
  const t2 = t * t;
  return {
    l:
      p0.l * mt2 * mt +
      3 * p1.l * mt2 * t +
      3 * p2.l * mt * t2 +
      p3.l * t2 * t,
    a:
      p0.a * mt2 * mt +
      3 * p1.a * mt2 * t +
      3 * p2.a * mt * t2 +
      p3.a * t2 * t,
    b:
      p0.b * mt2 * mt +
      3 * p1.b * mt2 * t +
      3 * p2.b * mt * t2 +
      p3.b * t2 * t,
  };
}

function buildFinePath(
  seed: OklchColor,
  params: V6SolverParameters,
): { points: FinePathPoint[]; seedPointIndex: number } {
  const lightLab = toLabVector(params.lightEndpoint.color);
  const seedLab = toLabVector(seed);
  const darkLab = toLabVector(params.darkEndpoint.color);

  const lightToSeed = normalizeLab(subtractLab(seedLab, lightLab));
  const seedToDark = normalizeLab(subtractLab(darkLab, seedLab));
  const throughAxis = normalizeLab(subtractLab(darkLab, lightLab));
  const seedRadialSeed = {
    l: 0,
    a: seedLab.a,
    b: seedLab.b,
  };
  const seedRadial = normalizeLab(
    dotLab(seedRadialSeed, seedRadialSeed) > EPSILON
      ? seedRadialSeed
      : { l: 0, a: 1, b: 0 },
  );
  const seedNormal = normalizeLab({
    l: throughAxis.a * seedRadial.b - throughAxis.b * seedRadial.a,
    a: throughAxis.b * seedRadial.l - throughAxis.l * seedRadial.b,
    b: throughAxis.l * seedRadial.a - throughAxis.a * seedRadial.l,
  });

  const tangent = normalizeLab(
    addLab(
      scaleLab(throughAxis, 1),
      addLab(
        scaleLab(seedRadial, params.curve.seedTangentRadial),
        scaleLab(seedNormal, params.curve.seedTangentNormal),
      ),
    ),
  );

  const lightDistance = distanceLab(lightLab, seedLab);
  const darkDistance = distanceLab(seedLab, darkLab);
  const lightSeedHandle = lightDistance * params.curve.lightSeedHandleScale;
  const darkSeedHandle = darkDistance * params.curve.darkSeedHandleScale;
  const lightHandle = lightDistance * params.curve.lightHandleScale;
  const darkHandle = darkDistance * params.curve.darkHandleScale;

  const lightP0 = lightLab;
  const lightP1 = addLab(lightLab, scaleLab(lightToSeed, lightHandle));
  const lightP2 = addLab(seedLab, scaleLab(tangent, -lightSeedHandle));
  const lightP3 = seedLab;

  const darkP0 = seedLab;
  const darkP1 = addLab(seedLab, scaleLab(tangent, darkSeedHandle));
  const darkP2 = addLab(darkLab, scaleLab(seedToDark, -darkHandle));
  const darkP3 = darkLab;

  const lightSamples = Array.from({ length: 25 }, (_, index) =>
    cubicBezier(lightP0, lightP1, lightP2, lightP3, index / 24),
  );
  const darkSamples = Array.from({ length: 25 }, (_, index) =>
    cubicBezier(darkP0, darkP1, darkP2, darkP3, index / 24),
  ).slice(1);

  const labs = [...lightSamples, ...darkSamples];
  const seedPointIndex = lightSamples.length - 1;
  const points: FinePathPoint[] = [];
  let cumulative = 0;

  for (let index = 0; index < labs.length; index++) {
    if (index > 0) {
      cumulative += distanceLab(labs[index - 1], labs[index]);
    }
    const color = labVectorToOklch(labs[index], seed.h);
    points.push({
      lab: labs[index],
      color: {
        l: clamp(color.l, L_FLOOR, L_CEILING),
        c: Math.max(0, color.c ?? 0),
        h: color.h ?? seed.h,
      },
      distance: cumulative,
    });
  }

  return { points, seedPointIndex };
}

function buildFinePathFromLabs(
  labs: readonly LabVector[],
  fallbackHue: number,
): { points: FinePathPoint[]; seedPointIndex: number } {
  const points: FinePathPoint[] = [];
  let cumulative = 0;

  for (let index = 0; index < labs.length; index++) {
    if (index > 0) {
      cumulative += distanceLab(labs[index - 1], labs[index]);
    }
    const color = labVectorToOklch(labs[index], fallbackHue);
    points.push({
      lab: labs[index],
      color: {
        l: clamp(color.l, L_FLOOR, L_CEILING),
        c: Math.max(0, color.c ?? 0),
        h: color.h ?? fallbackHue,
      },
      distance: cumulative,
    });
  }

  return {
    points,
    seedPointIndex: Math.floor(labs.length / 2),
  };
}

function interpolateFinePath(points: FinePathPoint[], targetDistance: number): OklchColor {
  if (targetDistance <= 0) return points[0].color;
  if (targetDistance >= points[points.length - 1].distance) {
    return points[points.length - 1].color;
  }

  for (let index = 1; index < points.length; index++) {
    if (targetDistance <= points[index].distance) {
      const start = points[index - 1];
      const end = points[index];
      const span = end.distance - start.distance;
      const mix = span > EPSILON ? (targetDistance - start.distance) / span : 0;
      return labVectorToOklch(
        {
          l: start.lab.l + (end.lab.l - start.lab.l) * mix,
          a: start.lab.a + (end.lab.a - start.lab.a) * mix,
          b: start.lab.b + (end.lab.b - start.lab.b) * mix,
        },
        start.color.h,
      );
    }
  }

  return points[points.length - 1].color;
}

function deriveSeedIndex(
  lightBudget: number,
  darkBudget: number,
  totalStops: number,
): { index: number; fraction: number } {
  const totalBudget = Math.max(lightBudget + darkBudget, EPSILON);
  const fraction = lightBudget / totalBudget;
  if (totalStops <= 2) {
    return { index: Math.round(fraction * Math.max(totalStops - 1, 1)), fraction };
  }
  const rawIndex = Math.round(fraction * (totalStops - 1));
  const edgeThreshold = totalBudget / Math.max(totalStops * 3, 1);
  const minIndex = lightBudget <= edgeThreshold ? 0 : 1;
  const maxIndex = darkBudget <= edgeThreshold ? totalStops - 1 : totalStops - 2;
  return {
    index: clamp(rawIndex, minIndex, maxIndex),
    fraction,
  };
}

function stopFractionForIndex(seedIndex: number, totalStops: number): number {
  if (totalStops <= 1) return 0.5;
  return clamp(seedIndex, 0, totalStops - 1) / (totalStops - 1);
}

function uniformIntervals(count: number): number[] {
  if (count <= 0) return [];
  return Array.from({ length: count }, () => 1 / count);
}

function normalizeIntervals(intervals: readonly number[], count: number): number[] {
  if (count <= 0) return [];
  const values =
    intervals.length === count
      ? intervals.map((value) => Math.max(value, 0))
      : uniformIntervals(count);
  const sum = values.reduce((total, value) => total + value, 0);
  if (sum <= EPSILON) return uniformIntervals(count);
  return values.map((value) => value / sum);
}

function buildSamplingPlan(
  lightBudget: number,
  darkBudget: number,
  totalStops: number,
  seedIndex?: number,
): SamplingPlan {
  const derived =
    seedIndex === undefined
      ? deriveSeedIndex(lightBudget, darkBudget, totalStops).index
      : clamp(seedIndex, 0, Math.max(totalStops - 1, 0));
  return {
    seedIndex: derived,
    lightIntervals: uniformIntervals(derived),
    darkIntervals: uniformIntervals(totalStops - derived - 1),
  };
}

function sampleSolvedPath(
  seed: OklchColor,
  points: FinePathPoint[],
  seedPointIndex: number,
  labels: string[],
  plan?: SamplingPlan,
): SampledPath {
  const lightBudget = points[seedPointIndex].distance;
  const totalBudget = points[points.length - 1].distance;
  const darkBudget = Math.max(totalBudget - lightBudget, 0);
  const { fraction: seedFraction } = deriveSeedIndex(
    lightBudget,
    darkBudget,
    labels.length,
  );
  const resolvedPlan =
    plan === undefined
      ? buildSamplingPlan(lightBudget, darkBudget, labels.length)
      : {
          seedIndex: clamp(plan.seedIndex, 0, Math.max(labels.length - 1, 0)),
          lightIntervals: plan.lightIntervals,
          darkIntervals: plan.darkIntervals,
        };
  const seedIndex = resolvedPlan.seedIndex;
  const lightIntervals = normalizeIntervals(resolvedPlan.lightIntervals, seedIndex);
  const darkIntervals = normalizeIntervals(
    resolvedPlan.darkIntervals,
    labels.length - seedIndex - 1,
  );

  const lightTargets =
    seedIndex <= 0
      ? []
      : (() => {
          const targets = [0];
          let cumulative = 0;
          for (let index = 0; index < seedIndex - 1; index++) {
            cumulative += lightIntervals[index] * lightBudget;
            targets.push(cumulative);
          }
          return targets;
        })();
  const lightColors =
    seedIndex === 0
      ? [seed]
      : [
          ...lightTargets.map((distance) =>
            sanitizeSolvedColor(interpolateFinePath(points, distance)),
          ),
          seed,
        ];

  let darkCumulative = 0;
  const darkColors = darkIntervals.map((interval) => {
    darkCumulative += interval * darkBudget;
    return sanitizeSolvedColor(interpolateFinePath(points, lightBudget + darkCumulative));
  });

  return {
    colors: [...lightColors, ...darkColors].map((color, index) =>
      index === seedIndex ? seed : sanitizeSolvedColor(color),
    ),
    seedIndex,
    lightBudget,
    darkBudget,
    totalBudget,
    seedFraction,
  };
}

function average(values: number[]): number {
  return values.length === 0
    ? 0
    : values.reduce((sum, value) => sum + value, 0) / values.length;
}

function pairwiseDistances(colors: OklchColor[]): number[] {
  const distances: number[] = [];
  for (let index = 1; index < colors.length; index++) {
    distances.push(distanceLab(toLabVector(colors[index - 1]), toLabVector(colors[index])));
  }
  return distances;
}

function fineSegmentDistances(
  points: readonly FinePathPoint[],
  startIndex: number,
  endIndex: number,
): number[] {
  const distances: number[] = [];
  for (let index = Math.max(startIndex + 1, 1); index <= endIndex; index++) {
    distances.push(points[index].distance - points[index - 1].distance);
  }
  return distances;
}

function coefficientOfVariation(values: number[]): number {
  const mean = average(values);
  if (mean <= EPSILON) return 0;
  const variance = average(values.map((value) => (value - mean) ** 2));
  return Math.sqrt(variance) / mean;
}

function normalizedAdjacentDelta(values: readonly number[]): number {
  const mean = average([...values]);
  if (mean <= EPSILON || values.length < 2) return 0;
  return (
    average(
      values.slice(1).map((value, index) => Math.abs(value - values[index]) / mean),
    ) || 0
  );
}

function continuousSpacingDistortion(
  points: readonly FinePathPoint[],
  seedPointIndex: number,
): number {
  const lightSegments = fineSegmentDistances(points, 0, seedPointIndex);
  const darkSegments = fineSegmentDistances(points, seedPointIndex, points.length - 1);
  const sidePenalties = [lightSegments, darkSegments]
    .filter((segments) => segments.length > 0)
    .map(
      (segments) =>
        coefficientOfVariation([...segments]) * 0.65 +
        normalizedAdjacentDelta(segments) * 0.35,
    );

  return average(sidePenalties);
}

function lightEntranceDistortion(distances: readonly number[]): number {
  if (distances.length === 0) return 0;
  const frontDistances = distances.slice(0, Math.min(2, distances.length));
  const referenceWindow = distances.slice(
    frontDistances.length,
    Math.min(frontDistances.length + 4, distances.length),
  );
  const baseline = average(
    referenceWindow.length > 0 ? [...referenceWindow] : [...distances],
  );
  if (baseline <= EPSILON) return 0;

  const allowances = [1.01, 1.03];
  return rmsPenalty(
    frontDistances.map((distance, index) =>
      Math.max(
        0,
        distance / baseline - (allowances[index] ?? allowances[allowances.length - 1]),
      ),
    ),
  );
}

function stepPairRatio(a: number, b: number): number {
  return Math.max(a, b) / Math.max(Math.min(a, b), EPSILON);
}

function edgeParityPenalty(
  distances: readonly number[],
  side: "light" | "dark",
  allowance: number,
): number {
  if (distances.length < 2) return 0;
  const first =
    side === "light" ? distances[0] : distances[Math.max(distances.length - 2, 0)];
  const second =
    side === "light" ? distances[1] : distances[Math.max(distances.length - 1, 0)];
  return stepRatioPenalty(stepPairRatio(first, second), allowance);
}

function worstStepRatio(distances: readonly number[], windowSize: number): number {
  if (distances.length === 0) return 1;
  if (windowSize <= 1) return 1;
  if (distances.length < windowSize) {
    return Math.max(...distances) / Math.max(Math.min(...distances), EPSILON);
  }

  let worst = 1;
  for (let index = 0; index <= distances.length - windowSize; index++) {
    const window = distances.slice(index, index + windowSize);
    worst = Math.max(
      worst,
      Math.max(...window) / Math.max(Math.min(...window), EPSILON),
    );
  }
  return worst;
}

function stepRatioPenalty(ratio: number, allowance: number): number {
  return Math.max(0, ratio - allowance);
}

function localStepSpreadPenalty(
  worstAdjacentRatio: number,
  worstThreeStepRatio: number,
): number {
  return (
    stepRatioPenalty(worstAdjacentRatio, 1.04) * 1.1 +
    stepRatioPenalty(worstThreeStepRatio, 1.06)
  );
}

function seedPlacementPenalty(
  distances: readonly number[],
  seedIndex: number,
): number {
  if (distances.length === 0) return 0;
  const left = distances.slice(0, seedIndex);
  const right = distances.slice(seedIndex);
  if (left.length === 0 || right.length === 0) return 0;
  const mean = average([...distances]);
  if (mean <= EPSILON) return 0;
  const imbalance = Math.abs(average([...left]) - average([...right])) / mean;
  return Math.max(0, imbalance - 0.03);
}

function seedStopTargetPenalty(
  seedFraction: number,
  seedIndex: number,
  totalStops: number,
): number {
  return Math.max(0, Math.abs(seedFraction - stopFractionForIndex(seedIndex, totalStops)) - 0.001);
}

function minimumLightReserve(seed: OklchColor): number {
  if (seed.l >= 0.97) return 0.01;
  return clamp(Math.min(L_MAX - seed.l, 0.08) * 0.75 + seed.c * 0.08, 0.03, 0.09);
}

function samplingLightnessPenalty(colors: readonly OklchColor[]): number {
  const penalty = colors.slice(1).reduce((sum, color, index) => {
    const delta = color.l - colors[index].l;
    return delta > 1e-4 ? sum + delta - 1e-4 : sum;
  }, 0);
  return penalty > 0 ? 1_000_000 + penalty * 10_000 : 0;
}

function rmsPenalty(values: readonly number[]): number {
  return Math.sqrt(average(values.map((value) => value ** 2)));
}

function unwrapHueSequence(colors: OklchColor[]): number[] {
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

function samplingObjective(sampled: SampledPath, labels: string[]): number {
  const distances = pairwiseDistances(sampled.colors);
  const lightStops = sampled.seedIndex;
  const darkStops = labels.length - sampled.seedIndex - 1;
  const lightEdgePenalty = edgeParityPenalty(
    distances,
    "light",
    lightStops <= 2 ? 1.008 : 1.015,
  );
  const darkEdgePenalty = edgeParityPenalty(
    distances,
    "dark",
    darkStops <= 2 ? 1.008 : 1.015,
  );

  return (
    samplingLightnessPenalty(sampled.colors) +
    seedStopTargetPenalty(sampled.seedFraction, sampled.seedIndex, labels.length) * 180 +
    coefficientOfVariation(distances) * 36 +
    stepRatioPenalty(worstStepRatio(distances, 2), 1.025) * 120 +
    stepRatioPenalty(worstStepRatio(distances, 3), 1.04) * 92 +
    seedPlacementPenalty(distances, sampled.seedIndex) * 88 +
    lightEdgePenalty * 170 +
    darkEdgePenalty * 136 +
    lightEntranceDistortion(distances) * 48
  );
}

function evaluateSamplingPlan(
  seed: OklchColor,
  points: FinePathPoint[],
  seedPointIndex: number,
  labels: string[],
  plan: SamplingPlan,
): { plan: SamplingPlan; sampled: SampledPath; objective: number } {
  const sampled = sampleSolvedPath(seed, points, seedPointIndex, labels, plan);
  return {
    plan,
    sampled,
    objective: samplingObjective(sampled, labels),
  };
}

function candidateSeedIndices(
  lightBudget: number,
  darkBudget: number,
  totalStops: number,
): number[] {
  const { index: baseIndex, fraction } = deriveSeedIndex(lightBudget, darkBudget, totalStops);
  const rawIndex = fraction * Math.max(totalStops - 1, 1);
  const candidates = new Set<number>([
    baseIndex,
    Math.floor(rawIndex),
    Math.ceil(rawIndex),
    baseIndex - 2,
    baseIndex - 1,
    baseIndex + 1,
    baseIndex + 2,
  ]);

  if (baseIndex <= 2) {
    candidates.add(0);
    candidates.add(1);
    candidates.add(2);
  }
  if (baseIndex >= totalStops - 3) {
    candidates.add(totalStops - 1);
    candidates.add(totalStops - 2);
    candidates.add(totalStops - 3);
  }

  return [...candidates]
    .filter((value) => Number.isFinite(value))
    .map((value) => clamp(Math.round(value), 0, Math.max(totalStops - 1, 0)))
    .sort((a, b) => a - b)
    .filter((value, index, values) => index === 0 || value !== values[index - 1]);
}

function minimumIntervalShare(count: number): number {
  return count <= 1 ? 1 : 0.18 / count;
}

function transferSamplingPlan(
  plan: SamplingPlan,
  side: "light" | "dark",
  from: number,
  to: number,
  delta: number,
): SamplingPlan | null {
  const current = side === "light" ? plan.lightIntervals : plan.darkIntervals;
  if (current.length < 2 || from === to) return null;
  if (from < 0 || from >= current.length || to < 0 || to >= current.length) return null;
  const minShare = minimumIntervalShare(current.length);
  if (current[from] - delta < minShare) return null;

  const updated = [...current];
  updated[from] -= delta;
  updated[to] += delta;

  return side === "light"
    ? { ...plan, lightIntervals: updated }
    : { ...plan, darkIntervals: updated };
}

function repairSamplingPlan(
  seed: OklchColor,
  points: FinePathPoint[],
  seedPointIndex: number,
  labels: string[],
  startPlan: SamplingPlan,
): SamplingPlan {
  let best = evaluateSamplingPlan(seed, points, seedPointIndex, labels, startPlan);
  const deltas = [0.08, 0.04, 0.02, 0.01, 0.005];

  for (const delta of deltas) {
    let improved = true;
    while (improved) {
      improved = false;
      for (const side of ["light", "dark"] as const) {
        const intervals =
          side === "light" ? best.plan.lightIntervals : best.plan.darkIntervals;
        if (intervals.length < 2) continue;

        for (let index = 0; index < intervals.length - 1; index++) {
          for (const [from, to] of [
            [index, index + 1],
            [index + 1, index],
          ] as const) {
            const candidatePlan = transferSamplingPlan(best.plan, side, from, to, delta);
            if (!candidatePlan) continue;
            const candidate = evaluateSamplingPlan(
              seed,
              points,
              seedPointIndex,
              labels,
              candidatePlan,
            );
            if (candidate.objective + 1e-9 < best.objective) {
              best = candidate;
              improved = true;
            }
          }
        }
      }
    }
  }

  return best.plan;
}

function buildOptimizedSamplingPlan(
  seed: OklchColor,
  points: FinePathPoint[],
  seedPointIndex: number,
  labels: string[],
): SamplingPlan {
  const lightBudget = points[seedPointIndex].distance;
  const totalBudget = points[points.length - 1].distance;
  const darkBudget = Math.max(totalBudget - lightBudget, 0);
  const seedIndices = candidateSeedIndices(lightBudget, darkBudget, labels.length);

  let best:
    | { plan: SamplingPlan; sampled: SampledPath; objective: number }
    | null = null;

  for (const seedIndex of seedIndices) {
    const basePlan = buildSamplingPlan(lightBudget, darkBudget, labels.length, seedIndex);
    const repairedPlan = repairSamplingPlan(
      seed,
      points,
      seedPointIndex,
      labels,
      basePlan,
    );
    const candidate = evaluateSamplingPlan(
      seed,
      points,
      seedPointIndex,
      labels,
      repairedPlan,
    );
    if (!best || candidate.objective + 1e-9 < best.objective) {
      best = candidate;
    }
  }

  return best?.plan ?? buildSamplingPlan(lightBudget, darkBudget, labels.length);
}

function computePathMetrics(
  seed: OklchColor,
  params: V6SolverParameters,
  labels: string[],
  points: FinePathPoint[],
  seedPointIndex: number,
  samplingPlan?: SamplingPlan,
): { colors: OklchColor[]; metrics: PathMetrics } {
  const sampled = sampleSolvedPath(seed, points, seedPointIndex, labels, samplingPlan);
  const colors = sampled.colors;

  const gamutPenalty = average(
    points.map((point) => {
      if (isInGamut(point.color)) return 0;
      const clamped = clampToGamut(point.color);
      return distanceLab(toLabVector(point.color), toLabVector(clamped));
    }),
  );

  const lightnessPenalty = colors.slice(1).reduce((sum, color, index) => {
    const delta = color.l - colors[index].l;
    return delta > 1e-4 ? sum + delta - 1e-4 : sum;
  }, 0);
  const hardLightnessPenalty =
    lightnessPenalty > 0 ? 1_000_000 + lightnessPenalty * 10_000 : 0;

  const labs = points.map((point) => point.lab);
  const curvature = average(
    labs.slice(2).map((point, index) =>
      distanceLab(
        point,
        addLab(scaleLab(labs[index + 1], 2), scaleLab(labs[index], -1)),
      ),
    ),
  );
  const jerk = average(
    labs.slice(3).map((point, index) =>
      distanceLab(
        point,
        addLab(
          scaleLab(labs[index + 2], 3),
          addLab(scaleLab(labs[index + 1], -3), labs[index]),
        ),
      ),
    ),
  );

  const hues = unwrapHueSequence(points.map((point) => point.color));
  const hueWobble = average(
    hues.slice(2).map((hue, index) =>
      Math.abs(hue - 2 * hues[index + 1] + hues[index]),
    ),
  );

  // Encourage uniform perceptual density on the continuous path itself before
  // the stop ladder is sampled, so seed placement and cadence emerge from a
  // smoother path rather than being judged mostly after discretization.
  const pathDensityDistortion = continuousSpacingDistortion(points, seedPointIndex);
  const sampledDistances = pairwiseDistances(colors);
  const discreteSpacing = coefficientOfVariation(sampledDistances);
  const seedStopTargetPenaltyValue = seedStopTargetPenalty(
    sampled.seedFraction,
    sampled.seedIndex,
    labels.length,
  );
  const lightEdgeParityPenalty = edgeParityPenalty(
    sampledDistances,
    "light",
    sampled.seedIndex <= 2 ? 1.008 : 1.015,
  );
  const darkEdgeParityPenalty = edgeParityPenalty(
    sampledDistances,
    "dark",
    labels.length - sampled.seedIndex - 1 <= 2 ? 1.008 : 1.015,
  );
  const worstAdjacentStepRatio = worstStepRatio(sampledDistances, 2);
  const worstThreeStepRatio = worstStepRatio(sampledDistances, 3);
  const worstAdjacentStepPenalty = stepRatioPenalty(worstAdjacentStepRatio, 1.04);
  const worstThreeStepWindowPenalty = stepRatioPenalty(worstThreeStepRatio, 1.06);
  const worstLocalStepSpread = localStepSpreadPenalty(
    worstAdjacentStepRatio,
    worstThreeStepRatio,
  );
  const lightEntrancePenalty = lightEntranceDistortion(sampledDistances);
  const discreteSeedPlacementPenalty = seedPlacementPenalty(
    sampledDistances,
    sampled.seedIndex,
  );
  const occupancy = average(
    points.map((point) => {
      const localMax = maxChroma(point.color.l, point.color.h);
      return localMax > EPSILON ? point.color.c / localMax : 0;
    }),
  );
  const endpointOccupancy =
    average(
      [params.lightEndpoint.color, params.darkEndpoint.color].map((color) => {
        const localMax = maxChroma(color.l, color.h);
        return localMax > EPSILON ? color.c / localMax : 0;
      }),
    ) || 0;
  const spanReward = sampled.totalBudget;
  const lightReservePenalty = Math.max(
    0,
    minimumLightReserve(seed) - sampled.lightBudget,
  );

  const localSeedAsymmetry = Math.abs(
    sampled.lightBudget / Math.max(sampled.seedIndex, 1) -
      sampled.darkBudget / Math.max(labels.length - sampled.seedIndex - 1, 1),
  );
  const endpointHuePenalty =
    Math.abs(hueDelta(seed.h, params.lightEndpoint.color.h)) * 0.5 +
    Math.abs(hueDelta(seed.h, params.darkEndpoint.color.h)) * 0.35;
  const pathProfile = buildPathProfileFromSidePolylines(
    seed,
    params.lightEndpoint.color,
    params.darkEndpoint.color,
    points.slice(0, seedPointIndex + 1).map((point) => point.color).reverse(),
    points.slice(seedPointIndex).map((point) => point.color),
  );
  const softPrior = compareToV6SoftPrior(
    seed,
    {
      lightHueOffset: params.lightEndpoint.hueOffset,
      lightLightness: params.lightEndpoint.lightness,
      lightIntensity: params.lightEndpoint.intensity,
      darkHueOffset: params.darkEndpoint.hueOffset,
      darkLightness: params.darkEndpoint.lightness,
      darkIntensity: params.darkEndpoint.intensity,
      seedTangentRadial: params.curve.seedTangentRadial,
      seedTangentNormal: params.curve.seedTangentNormal,
    },
    {
      curvature,
      jerk,
      hueWobble,
      spacingDistortion: discreteSpacing,
      seedNeighborhoodAsymmetry: localSeedAsymmetry,
      endpointHuePenalty,
      occupancyReward: occupancy,
      endpointOccupancyReward: endpointOccupancy,
      spanReward,
    },
    pathProfile,
  );
  const endpointReservePriorPenalty = rmsPenalty([
    softPrior.parameterDeltas.lightLightness.normalized,
    softPrior.parameterDeltas.darkLightness.normalized,
  ]);
  const darkEndpointReservePriorPenalty = Math.abs(
    softPrior.parameterDeltas.darkLightness.normalized,
  );
  const lightEndpointIntensityPriorPenalty = Math.abs(
    softPrior.parameterDeltas.lightIntensity.normalized,
  );
  const endpointIntensityPriorPenalty = rmsPenalty([
    softPrior.parameterDeltas.lightIntensity.normalized,
    softPrior.parameterDeltas.darkIntensity.normalized,
  ]);
  const darkEndpointIntensityPriorPenalty = Math.abs(
    softPrior.parameterDeltas.darkIntensity.normalized,
  );
  const endpointHueDriftPriorPenalty = rmsPenalty([
    softPrior.parameterDeltas.lightHueOffset.normalized,
    softPrior.parameterDeltas.darkHueOffset.normalized,
  ]);
  const seedTangentBiasPriorPenalty = rmsPenalty([
    softPrior.parameterDeltas.seedTangentRadial.normalized,
    softPrior.parameterDeltas.seedTangentNormal.normalized,
  ]);
  const fullPathPriorPenalty = softPrior.pathPenalty;
  const chromaDistributionPriorPenalty = softPrior.chromaDistributionPenalty;
  const energyTargetPriorPenalty = softPrior.energyPenalty;
  const selectedSoftPriorPenalty =
    endpointReservePriorPenalty * SOFT_PRIOR_WEIGHTS.endpointReserve +
    darkEndpointReservePriorPenalty * SOFT_PRIOR_WEIGHTS.darkEndpointReserve +
    endpointHueDriftPriorPenalty * SOFT_PRIOR_WEIGHTS.endpointHueDrift +
    lightEndpointIntensityPriorPenalty * SOFT_PRIOR_WEIGHTS.lightEndpointIntensity +
    darkEndpointIntensityPriorPenalty * SOFT_PRIOR_WEIGHTS.darkEndpointIntensity +
    seedTangentBiasPriorPenalty * SOFT_PRIOR_WEIGHTS.seedTangentBias +
    fullPathPriorPenalty * SOFT_PRIOR_WEIGHTS.fullPathShape +
    chromaDistributionPriorPenalty * SOFT_PRIOR_WEIGHTS.chromaDistribution +
    energyTargetPriorPenalty * SOFT_PRIOR_WEIGHTS.energyTargets;

  const score =
    gamutPenalty * 400 +
    hardLightnessPenalty +
    lightReservePenalty * 150 +
    curvature * 1.4 +
    jerk * 2.4 +
    hueWobble * 0.04 +
    pathDensityDistortion * 10 +
    discreteSpacing * 24 +
    seedStopTargetPenaltyValue * 90 +
    lightEdgeParityPenalty * 132 +
    darkEdgeParityPenalty * 108 +
    worstAdjacentStepPenalty * 110 +
    worstThreeStepWindowPenalty * 80 +
    worstLocalStepSpread * 28 +
    lightEntrancePenalty * 44 +
    discreteSeedPlacementPenalty * 68 +
    localSeedAsymmetry * 18 -
    endpointOccupancy * 2 +
    occupancy * 1.5 -
    spanReward * 1 +
    endpointHuePenalty * 0.35 +
    selectedSoftPriorPenalty;

  const breakdown: V6EnergyBreakdown = {
    gamutPenalty,
    lightnessPenalty: hardLightnessPenalty,
    lightReservePenalty,
    curvature,
    jerk,
    hueWobble,
    continuousSpacingDistortion: pathDensityDistortion,
    spacingDistortion: discreteSpacing,
    seedStopTargetPenalty: seedStopTargetPenaltyValue,
    lightEdgeParityPenalty,
    darkEdgeParityPenalty,
    worstAdjacentStepPenalty,
    worstThreeStepWindowPenalty,
    localStepSpreadPenalty: worstLocalStepSpread,
    lightEntrancePenalty,
    seedPlacementPenalty: discreteSeedPlacementPenalty,
    seedNeighborhoodAsymmetry: localSeedAsymmetry,
    endpointHuePenalty,
    occupancyReward: occupancy,
    endpointOccupancyReward: endpointOccupancy,
    spanReward,
    endpointReservePriorPenalty,
    lightEndpointIntensityPriorPenalty,
    darkEndpointReservePriorPenalty,
    endpointIntensityPriorPenalty,
    darkEndpointIntensityPriorPenalty,
    endpointHueDriftPriorPenalty,
    seedTangentBiasPriorPenalty,
    fullPathPriorPenalty,
    chromaDistributionPriorPenalty,
    energyTargetPriorPenalty,
    selectedSoftPriorPenalty,
    total: score,
  };

  return {
    colors,
    metrics: {
      score,
      lightBudget: sampled.lightBudget,
      darkBudget: sampled.darkBudget,
      totalBudget: sampled.totalBudget,
      seedIndex: sampled.seedIndex,
      seedFraction: sampled.seedFraction,
      breakdown,
      softPrior,
    },
  };
}

function computePathScore(
  seed: OklchColor,
  params: V6SolverParameters,
  labels: string[],
): { colors: OklchColor[]; metrics: PathMetrics } {
  const { points, seedPointIndex } = buildFinePath(seed, params);
  return computePathMetrics(seed, params, labels, points, seedPointIndex);
}

function samplingHardeningRank(metrics: PathMetrics): number {
  const { breakdown } = metrics;
  const invalidPenalty =
    Number.isFinite(metrics.score) &&
    Number.isFinite(breakdown.total) &&
    Number.isFinite(breakdown.lightEntrancePenalty) &&
    Number.isFinite(breakdown.worstAdjacentStepPenalty) &&
    Number.isFinite(breakdown.worstThreeStepWindowPenalty) &&
    Number.isFinite(breakdown.seedPlacementPenalty) &&
    Number.isFinite(breakdown.seedStopTargetPenalty)
      ? 0
      : 1_000_000_000;

  return (
    invalidPenalty +
    breakdown.lightnessPenalty * 1000 +
    breakdown.lightEntrancePenalty * 320 +
    breakdown.lightEdgeParityPenalty * 280 +
    breakdown.darkEdgeParityPenalty * 220 +
    breakdown.worstAdjacentStepPenalty * 240 +
    breakdown.worstThreeStepWindowPenalty * 180 +
    breakdown.localStepSpreadPenalty * 120 +
    breakdown.seedPlacementPenalty * 160 +
    breakdown.seedStopTargetPenalty * 150 +
    breakdown.spacingDistortion * 64 +
    breakdown.continuousSpacingDistortion * 28 +
    metrics.score
  );
}

function computeFinalPathScore(
  seed: OklchColor,
  params: V6SolverParameters,
  labels: string[],
  points: FinePathPoint[],
  seedPointIndex: number,
): { colors: OklchColor[]; metrics: PathMetrics } {
  const baseline = computePathMetrics(seed, params, labels, points, seedPointIndex);
  const optimizedPlan = buildOptimizedSamplingPlan(
    seed,
    points,
    seedPointIndex,
    labels,
  );
  const optimized = computePathMetrics(
    seed,
    params,
    labels,
    points,
    seedPointIndex,
    optimizedPlan,
  );
  return samplingHardeningRank(optimized.metrics) <= samplingHardeningRank(baseline.metrics)
    ? optimized
    : baseline;
}

function archetypeVectorFromPrior(seed: OklchColor): V6ParameterVector {
  const prior = buildV6SoftPrior(seed).prior;
  return clampParameterVector({
    lightHueOffset: prior.parameters.lightHueOffset.mean,
    lightLightness: prior.parameters.lightLightness.mean,
    lightIntensity: prior.parameters.lightIntensity.mean,
    darkHueOffset: prior.parameters.darkHueOffset.mean,
    darkLightness: prior.parameters.darkLightness.mean,
    darkIntensity: prior.parameters.darkIntensity.mean,
    curve: {
      ...DEFAULT_ARCHETYPE_CURVE,
      seedTangentRadial: prior.parameters.seedTangentRadial.mean,
      seedTangentNormal: prior.parameters.seedTangentNormal.mean,
    },
  });
}

function buildArchetypeFinePath(
  seed: OklchColor,
  params: V6SolverParameters,
): { points: FinePathPoint[]; seedPointIndex: number } {
  const prior = buildV6SoftPrior(seed).prior;
  const frame = buildSeedCenteredFrame(
    params.lightEndpoint.color,
    seed,
    params.darkEndpoint.color,
  );
  const lightInteriorLabs = prior.path.light
    .slice(1, -1)
    .map((sample) =>
      reconstructPointFromSeedFrame(frame, {
        flow: sample.flow.mean,
        radial: sample.radial.mean,
        normal: sample.normal.mean,
      }),
    )
    .reverse();
  const darkInteriorLabs = prior.path.dark.slice(1, -1).map((sample) =>
    reconstructPointFromSeedFrame(frame, {
      flow: sample.flow.mean,
      radial: sample.radial.mean,
      normal: sample.normal.mean,
    }),
  );
  const labs = [
    toLabVector(params.lightEndpoint.color),
    ...lightInteriorLabs,
    toLabVector(seed),
    ...darkInteriorLabs,
    toLabVector(params.darkEndpoint.color),
  ];
  const seedPointIndex = 1 + lightInteriorLabs.length;
  return {
    ...buildFinePathFromLabs(labs, seed.h),
    seedPointIndex,
  };
}

function evaluateParameterVector(
  context: EndpointSearchContext,
  labels: string[],
  vector: V6ParameterVector,
):
  | {
      colors: OklchColor[];
      metrics: PathMetrics;
      parameters: V6SolverParameters;
      vector: V6ParameterVector;
    }
  | null {
  const clampedVector = clampParameterVector(vector);
  const parameters = buildParametersFromVector(context, clampedVector);
  if (!parameters) return null;
  const scored = computePathScore(context.seed, parameters, labels);
  return {
    colors: scored.colors,
    metrics: scored.metrics,
    parameters,
    vector: clampedVector,
  };
}

function refineParameterVector(
  context: EndpointSearchContext,
  labels: string[],
  start: V6ParameterVector,
):
  | {
      colors: OklchColor[];
      metrics: PathMetrics;
      parameters: V6SolverParameters;
      vector: V6ParameterVector;
    }
  | null {
  let best = evaluateParameterVector(context, labels, start);
  if (!best) return null;

  const tweaks: Array<{
    apply: (vector: V6ParameterVector, delta: number) => V6ParameterVector;
    step: number;
  }> = [
    {
      apply: (vector, delta) => ({ ...vector, lightHueOffset: vector.lightHueOffset + delta }),
      step: 2,
    },
    {
      apply: (vector, delta) => ({ ...vector, lightLightness: vector.lightLightness + delta }),
      step: 0.03,
    },
    {
      apply: (vector, delta) => ({ ...vector, lightIntensity: vector.lightIntensity + delta }),
      step: 0.08,
    },
    {
      apply: (vector, delta) => ({ ...vector, darkHueOffset: vector.darkHueOffset + delta }),
      step: 2,
    },
    {
      apply: (vector, delta) => ({ ...vector, darkLightness: vector.darkLightness + delta }),
      step: 0.03,
    },
    {
      apply: (vector, delta) => ({ ...vector, darkIntensity: vector.darkIntensity + delta }),
      step: 0.08,
    },
    {
      apply: (vector, delta) => ({
        ...vector,
        curve: { ...vector.curve, seedTangentRadial: vector.curve.seedTangentRadial + delta },
      }),
      step: 0.08,
    },
    {
      apply: (vector, delta) => ({
        ...vector,
        curve: { ...vector.curve, seedTangentNormal: vector.curve.seedTangentNormal + delta },
      }),
      step: 0.05,
    },
    {
      apply: (vector, delta) => ({
        ...vector,
        curve: {
          ...vector.curve,
          lightSeedHandleScale: vector.curve.lightSeedHandleScale + delta,
        },
      }),
      step: 0.04,
    },
    {
      apply: (vector, delta) => ({
        ...vector,
        curve: {
          ...vector.curve,
          darkSeedHandleScale: vector.curve.darkSeedHandleScale + delta,
        },
      }),
      step: 0.04,
    },
    {
      apply: (vector, delta) => ({
        ...vector,
        curve: { ...vector.curve, lightHandleScale: vector.curve.lightHandleScale + delta },
      }),
      step: 0.04,
    },
    {
      apply: (vector, delta) => ({
        ...vector,
        curve: { ...vector.curve, darkHandleScale: vector.curve.darkHandleScale + delta },
      }),
      step: 0.04,
    },
  ];

  for (let pass = 0; pass < 3; pass++) {
    let improved = true;
    while (improved) {
      improved = false;
      for (const tweak of tweaks) {
        const scaledStep = tweak.step / 2 ** pass;
        for (const delta of [-scaledStep, scaledStep]) {
          const candidate = evaluateParameterVector(
            context,
            labels,
            tweak.apply(best.vector, delta),
          );
          if (candidate && candidate.metrics.score + 1e-9 < best.metrics.score) {
            best = candidate;
            improved = true;
          }
        }
      }
    }
  }

  return best;
}

function solvePath(
  seed: OklchColor,
  labels: string[],
): PathSolution {
  const context: EndpointSearchContext = {
    seed,
    seedLab: toLabVector(seed),
    seedIntensity: chromaIntensity(seed),
  };
  const lightCandidates = rankEndpointCandidates("light", context);
  const darkCandidates = rankEndpointCandidates("dark", context);
  const initialEndpointIntensity = clamp(context.seedIntensity, 0.03, 0.9);

  let best:
    | {
        colors: OklchColor[];
        metrics: PathMetrics;
        parameters: V6SolverParameters;
        vector: V6ParameterVector;
      }
    | null = null;

  for (const lightEndpoint of lightCandidates) {
    for (const darkEndpoint of darkCandidates) {
      for (const seedTangentRadial of [-0.2, 0, 0.2]) {
        for (const seedTangentNormal of [-0.12, 0, 0.12]) {
          for (const seedHandleScale of [0.16, 0.24, 0.32]) {
            for (const lightHandleScale of [0.22, 0.34]) {
              for (const darkHandleScale of [0.22, 0.34]) {
                const vector: V6ParameterVector = {
                  lightHueOffset: lightEndpoint.hueOffset,
                  lightLightness: lightEndpoint.lightness,
                  lightIntensity: initialEndpointIntensity,
                  darkHueOffset: darkEndpoint.hueOffset,
                  darkLightness: darkEndpoint.lightness,
                  darkIntensity: initialEndpointIntensity,
                  curve: {
                    seedTangentRadial,
                    seedTangentNormal,
                    lightSeedHandleScale: seedHandleScale,
                    darkSeedHandleScale: seedHandleScale,
                    lightHandleScale,
                    darkHandleScale,
                  },
                };
                const candidate = evaluateParameterVector(context, labels, vector);
                if (candidate && (!best || candidate.metrics.score < best.metrics.score)) {
                  best = candidate;
                }
              }
            }
          }
        }
      }
    }
  }

  if (!best) {
    const fallbackColors = Array.from({ length: labels.length }, () => seed);
    return {
      colors: fallbackColors,
      metadata: {
        solver: "v6",
        score: Number.POSITIVE_INFINITY,
        lightBudget: 0,
        darkBudget: 0,
        totalBudget: 0,
        seedIndex: Math.floor(labels.length / 2),
        seedFraction: 0.5,
        parameters: {
          lightEndpoint: {
            color: seed,
            hueOffset: 0,
            lightness: seed.l,
            intensity: 0,
            score: 0,
          },
          darkEndpoint: {
            color: seed,
            hueOffset: 0,
            lightness: seed.l,
            intensity: 0,
            score: 0,
          },
          curve: {
            seedTangentRadial: 0,
            seedTangentNormal: 0,
            lightSeedHandleScale: 0,
            darkSeedHandleScale: 0,
            lightHandleScale: 0,
            darkHandleScale: 0,
          },
        },
        breakdown: {
          gamutPenalty: 0,
          lightnessPenalty: 0,
          lightReservePenalty: 0,
          curvature: 0,
          jerk: 0,
          hueWobble: 0,
          continuousSpacingDistortion: 0,
          spacingDistortion: 0,
          seedStopTargetPenalty: 0,
          lightEdgeParityPenalty: 0,
          darkEdgeParityPenalty: 0,
          localStepSpreadPenalty: 0,
          lightEntrancePenalty: 0,
          worstAdjacentStepPenalty: 0,
          worstThreeStepWindowPenalty: 0,
          seedNeighborhoodAsymmetry: 0,
          seedPlacementPenalty: 0,
          endpointHuePenalty: 0,
          occupancyReward: 0,
          endpointOccupancyReward: 0,
          spanReward: 0,
          endpointReservePriorPenalty: 0,
          lightEndpointIntensityPriorPenalty: 0,
          darkEndpointReservePriorPenalty: 0,
          endpointIntensityPriorPenalty: 0,
          darkEndpointIntensityPriorPenalty: 0,
          endpointHueDriftPriorPenalty: 0,
          seedTangentBiasPriorPenalty: 0,
          fullPathPriorPenalty: 0,
          chromaDistributionPriorPenalty: 0,
          energyTargetPriorPenalty: 0,
          selectedSoftPriorPenalty: 0,
          total: Number.POSITIVE_INFINITY,
        },
      },
      softPrior: compareToV6SoftPrior(
        seed,
        {
          lightHueOffset: 0,
          lightLightness: seed.l,
          lightIntensity: 0,
          darkHueOffset: 0,
          darkLightness: seed.l,
          darkIntensity: 0,
          seedTangentRadial: 0,
          seedTangentNormal: 0,
        },
        {
          curvature: 0,
          jerk: 0,
          hueWobble: 0,
          spacingDistortion: 0,
          seedNeighborhoodAsymmetry: 0,
          endpointHuePenalty: 0,
          occupancyReward: 0,
          endpointOccupancyReward: 0,
          spanReward: 0,
        },
        buildPathProfileFromSidePolylines(seed, seed, seed, [seed], [seed]),
      ),
    };
  }

  const refined = refineParameterVector(context, labels, best.vector);
  if (refined) {
    best = refined;
  }

  const { points, seedPointIndex } = buildFinePath(seed, best.parameters);
  const finalized = computeFinalPathScore(
    seed,
    best.parameters,
    labels,
    points,
    seedPointIndex,
  );

  return {
    colors: finalized.colors,
    metadata: {
      solver: "v6",
      score: finalized.metrics.score,
      lightBudget: finalized.metrics.lightBudget,
      darkBudget: finalized.metrics.darkBudget,
      totalBudget: finalized.metrics.totalBudget,
      seedIndex: finalized.metrics.seedIndex,
      seedFraction: finalized.metrics.seedFraction,
      parameters: best.parameters,
      breakdown: finalized.metrics.breakdown,
    },
    softPrior: finalized.metrics.softPrior,
  };
}

function solveArchetypePath(
  seed: OklchColor,
  labels: string[],
): PathSolution {
  const context: EndpointSearchContext = {
    seed,
    seedLab: toLabVector(seed),
    seedIntensity: chromaIntensity(seed),
  };
  const vector = archetypeVectorFromPrior(seed);
  const parameters = buildParametersFromVector(context, vector);

  if (!parameters) {
    return solvePath(seed, labels);
  }

  const { points, seedPointIndex } = buildArchetypeFinePath(seed, parameters);
  const scored = computeFinalPathScore(
    seed,
    parameters,
    labels,
    points,
    seedPointIndex,
  );

  return {
    colors: scored.colors,
    metadata: {
      solver: "v6-archetype",
      score: scored.metrics.score,
      lightBudget: scored.metrics.lightBudget,
      darkBudget: scored.metrics.darkBudget,
      totalBudget: scored.metrics.totalBudget,
      seedIndex: scored.metrics.seedIndex,
      seedFraction: scored.metrics.seedFraction,
      parameters,
      breakdown: scored.metrics.breakdown,
    },
    softPrior: scored.metrics.softPrior,
  };
}

export function solveV6ResearchRamp(config: RampConfig): V6SolveResult {
  const labels = resolveLabels(config.stopCount);
  const seed: OklchColor = {
    l: clamp(config.seedLightness ?? 0.62, L_FLOOR, L_CEILING),
    c: Math.max(0, config.seedChroma ?? Math.max(0.08, maxChroma(0.62, config.hue) * 0.55)),
    h: normalizeHue(config.hue),
  };
  const cacheKey = [
    normalizeHue(config.hue).toFixed(3),
    (config.seedChroma ?? -1).toFixed(4),
    (config.seedLightness ?? -1).toFixed(4),
    labels.join(","),
  ].join("|");
  const cached = CACHE.get(cacheKey);
  if (cached) return cached;

  const solution = solvePath(seed, labels);

  const result: V6SolveResult = {
    stops: labels.map((label, index) => {
      const color =
        index === solution.metadata.seedIndex
          ? seed
          : sanitizeSolvedColor(solution.colors[index]);
      const t = labels.length > 1 ? index / (labels.length - 1) : 0.5;
      return {
        index,
        label,
        color,
        darkColor: darkModeAdjust(color.l, color.c, color.h, t),
      };
    }),
    metadata: {
      ...solution.metadata,
      softPrior: solution.softPrior,
    },
  };

  CACHE.set(cacheKey, result);
  return result;
}

export function solveV6ArchetypeRamp(config: RampConfig): V6SolveResult {
  const labels = resolveLabels(config.stopCount);
  const seed: OklchColor = {
    l: clamp(config.seedLightness ?? 0.62, L_FLOOR, L_CEILING),
    c: Math.max(0, config.seedChroma ?? Math.max(0.08, maxChroma(0.62, config.hue) * 0.55)),
    h: normalizeHue(config.hue),
  };
  const cacheKey = [
    "archetype",
    normalizeHue(config.hue).toFixed(3),
    (config.seedChroma ?? -1).toFixed(4),
    (config.seedLightness ?? -1).toFixed(4),
    labels.join(","),
  ].join("|");
  const cached = ARCHETYPE_CACHE.get(cacheKey);
  if (cached) return cached;

  const solution = solveArchetypePath(seed, labels);
  const result: V6SolveResult = {
    stops: labels.map((label, index) => {
      const color =
        index === solution.metadata.seedIndex
          ? seed
          : sanitizeSolvedColor(solution.colors[index]);
      const t = labels.length > 1 ? index / (labels.length - 1) : 0.5;
      return {
        index,
        label,
        color,
        darkColor: darkModeAdjust(color.l, color.c, color.h, t),
      };
    }),
    metadata: {
      ...solution.metadata,
      softPrior: solution.softPrior,
    },
  };

  ARCHETYPE_CACHE.set(cacheKey, result);
  return result;
}
