import type { OklchColor, RampConfig, RampStop } from "../types";
import { clampToGamut, maxChroma } from "./gamut";
import {
  distanceLab,
  labVectorToOklch,
  normalizeLab,
  scaleLab,
  subtractLab,
  toLabVector,
  type LabVector,
} from "./pathGeometry";
import { solveBrandExactFairRamp } from "./brandExactFairingSolver";
import { solveV6ResearchRamp, type V6SolveResult } from "./v6ResearchSolver";

const CURVE_SAMPLE_COUNT = 96;
const CURVE_CACHE = new Map<string, V6SolveResult>();
const COMPRESSED_CACHE = new Map<string, V6SolveResult>();

type ContinuousCurveMode = "continuous-curve" | "continuous-compressed";

interface CurveSample {
  lab: LabVector;
  distance: number;
}

interface CurveGeometry {
  lightSegment: CurveSample[];
  darkSegment: CurveSample[];
  lightLab: LabVector;
  darkLab: LabVector;
  score: number;
}

interface HighlightEndpointModel {
  weight: number;
  targetHue: number;
  targetLightness: number;
  targetEndpointOccupancy: number;
  targetBridgeOccupancy: number;
  lightnessOffsets: readonly number[];
}

interface SeedPlacementPolicy {
  preferredFraction: number;
  allowEndpointSeed: boolean;
}

interface CurveBuildOptions {
  compressGamut: boolean;
}

interface RawCurvePoint {
  lab: LabVector;
  color: OklchColor;
  pressure: number;
  t: number;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function smoothstep(edge0: number, edge1: number, value: number): number {
  const t = clamp((value - edge0) / (edge1 - edge0), 0, 1);
  return t * t * (3 - 2 * t);
}

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

function hueDistance(a: number, b: number): number {
  return Math.abs((((a - b) % 360) + 540) % 360 - 180);
}

function normalizeHue(hue: number): number {
  return ((hue % 360) + 360) % 360;
}

function relativeChroma(color: OklchColor): number {
  const available = maxChroma(color.l, color.h);
  return available > 1e-9 ? color.c / available : 0;
}

function highestLightnessForVisibleChroma(
  hue: number,
  upperLightness: number,
  lowerLightness: number,
  occupancy: number,
  targetChroma: number,
): number {
  const lower = clamp(lowerLightness, 0.02, upperLightness);
  const upper = clamp(upperLightness, lower, 0.98);
  if (maxChroma(upper, hue) * occupancy >= targetChroma) return upper;
  if (maxChroma(lower, hue) * occupancy < targetChroma) return lower;

  let lo = lower;
  let hi = upper;
  for (let index = 0; index < 18; index++) {
    const mid = (lo + hi) / 2;
    if (maxChroma(mid, hue) * occupancy >= targetChroma) {
      lo = mid;
    } else {
      hi = mid;
    }
  }
  return lo;
}

function lowestLightnessForVisibleChroma(
  hue: number,
  lowerLightness: number,
  upperLightness: number,
  occupancy: number,
  targetChroma: number,
): number {
  const lower = clamp(lowerLightness, 0.02, upperLightness);
  const upper = clamp(upperLightness, lower, 0.98);
  if (maxChroma(lower, hue) * occupancy >= targetChroma) return lower;
  if (maxChroma(upper, hue) * occupancy < targetChroma) return upper;

  let lo = lower;
  let hi = upper;
  for (let index = 0; index < 18; index++) {
    const mid = (lo + hi) / 2;
    if (maxChroma(mid, hue) * occupancy >= targetChroma) {
      hi = mid;
    } else {
      lo = mid;
    }
  }
  return hi;
}

function warmCuspComponents(seed: OklchColor): {
  yellowWeight: number;
  limeWeight: number;
  weight: number;
} {
  const yellowWeight = clamp(1 - hueDistance(seed.h, 98) / 34, 0, 1);
  const limeWeight = clamp(1 - hueDistance(seed.h, 121) / 44, 0, 1);
  const hueWeight = Math.max(yellowWeight, limeWeight);
  const lightnessWeight = clamp((seed.l - 0.84) / 0.1, 0, 1);
  const chromaWeight = clamp((relativeChroma(seed) - 0.68) / 0.26, 0, 1);

  return {
    yellowWeight,
    limeWeight,
    weight: hueWeight * lightnessWeight * chromaWeight,
  };
}

function warmCuspHighlightModel(
  seed: OklchColor,
  baseLightEndpoint: OklchColor,
): HighlightEndpointModel | null {
  const { yellowWeight, limeWeight, weight } = warmCuspComponents(seed);
  if (weight <= 0.1) return null;

  const yellowOnly = yellowWeight * (1 - limeWeight);
  const targetHueOffset = -(yellowOnly * 9 + limeWeight * 3);

  return {
    weight,
    targetHue: normalizeHue(seed.h + targetHueOffset),
    targetLightness: clamp(Math.max(seed.l, baseLightEndpoint.l), seed.l, 0.98),
    targetEndpointOccupancy: clamp(0.48 + yellowOnly * 0.14 + limeWeight * 0.01, 0.42, 0.62),
    targetBridgeOccupancy: clamp(0.82 + limeWeight * 0.04 - yellowWeight * 0.04, 0.76, 0.9),
    lightnessOffsets: [0, 0.006, 0.012, 0.022],
  };
}

function coolNarrowHighlightModel(
  seed: OklchColor,
  baseLightEndpoint: OklchColor,
): HighlightEndpointModel | null {
  const blueVioletWeight = clamp(1 - hueDistance(seed.h, 265) / 42, 0, 1);
  const depthWeight = clamp((0.68 - seed.l) / 0.24, 0, 1);
  const chromaWeight = clamp((relativeChroma(seed) - 0.52) / 0.28, 0, 1);
  const paleEndpointWeight = clamp((0.56 - relativeChroma(baseLightEndpoint)) / 0.18, 0, 1);
  const weight = blueVioletWeight * depthWeight * chromaWeight * paleEndpointWeight;
  if (weight <= 0.1) return null;
  const targetEndpointOccupancy = clamp(0.8 + blueVioletWeight * 0.06, 0.78, 0.88);
  const targetVisibleChroma = clamp(seed.c * 0.13, 0.022, 0.028);
  const targetLightness = highestLightnessForVisibleChroma(
    seed.h,
    baseLightEndpoint.l,
    Math.max(seed.l, 0.92),
    targetEndpointOccupancy,
    targetVisibleChroma,
  );

  return {
    weight,
    targetHue: seed.h,
    targetLightness,
    targetEndpointOccupancy,
    targetBridgeOccupancy: 0.82,
    lightnessOffsets: [-0.004, 0, 0.004],
  };
}

function brightCyanHighlightModel(seed: OklchColor): HighlightEndpointModel | null {
  const cyanWeight = clamp(1 - hueDistance(seed.h, 215) / 30, 0, 1);
  if (cyanWeight <= 0.45) return null;
  const lightBodyWeight = clamp((seed.l - 0.66) / 0.14, 0, 1);
  const chromaWeight = clamp((relativeChroma(seed) - 0.5) / 0.24, 0, 1);
  const weight = cyanWeight * lightBodyWeight * chromaWeight;
  if (weight <= 0.1) return null;

  return {
    weight,
    targetHue: seed.h,
    targetLightness: 0.958,
    targetEndpointOccupancy: clamp(0.78 + cyanWeight * 0.06, 0.74, 0.86),
    targetBridgeOccupancy: 0.9,
    lightnessOffsets: [-0.006, 0, 0.006],
  };
}

function warmRedHighlightModel(seed: OklchColor): HighlightEndpointModel | null {
  const redWeight = clamp(1 - hueDistance(seed.h, 28) / 24, 0, 1);
  const orangeWeight = clamp(1 - hueDistance(seed.h, 48) / 24, 0, 1);
  const hueWeight = Math.max(redWeight, orangeWeight);
  const chromaWeight = clamp((relativeChroma(seed) - 0.48) / 0.24, 0, 1);
  const bodyWeight = clamp((0.86 - seed.l) / 0.22, 0, 1);
  const weight = hueWeight * chromaWeight * bodyWeight;
  if (weight <= 0.1) return null;

  return {
    weight,
    targetHue: seed.h,
    targetLightness: 0.946,
    targetEndpointOccupancy: clamp(0.64 + redWeight * 0.04 - orangeWeight * 0.03, 0.58, 0.7),
    targetBridgeOccupancy: 0.9,
    lightnessOffsets: [-0.004, 0, 0.004],
  };
}

function highlightEndpointModel(
  seed: OklchColor,
  baseLightEndpoint: OklchColor,
): HighlightEndpointModel | null {
  return (
    warmCuspHighlightModel(seed, baseLightEndpoint) ??
    brightCyanHighlightModel(seed) ??
    coolNarrowHighlightModel(seed, baseLightEndpoint) ??
    warmRedHighlightModel(seed)
  );
}

function hermiteComponent(
  p0: number,
  p1: number,
  m0: number,
  m1: number,
  t: number,
): number {
  const t2 = t * t;
  const t3 = t2 * t;
  return (
    (2 * t3 - 3 * t2 + 1) * p0 +
    (t3 - 2 * t2 + t) * m0 +
    (-2 * t3 + 3 * t2) * p1 +
    (t3 - t2) * m1
  );
}

function hermiteLab(
  p0: LabVector,
  p1: LabVector,
  m0: LabVector,
  m1: LabVector,
  t: number,
): LabVector {
  return {
    l: lerp(p0.l, p1.l, t),
    a: hermiteComponent(p0.a, p1.a, m0.a, m1.a, t),
    b: hermiteComponent(p0.b, p1.b, m0.b, m1.b, t),
  };
}

function rawColorFromLab(lab: LabVector, fallbackHue: number): OklchColor {
  const color = labVectorToOklch(lab, fallbackHue);
  return {
    l: clamp(color.l, 0.02, 0.98),
    c: Math.max(0, color.c),
    h: Number.isFinite(color.h) ? color.h : fallbackHue,
  };
}

function colorFromLab(lab: LabVector, fallbackHue: number): OklchColor {
  return clampToGamut(rawColorFromLab(lab, fallbackHue));
}

function labFromColor(color: OklchColor): LabVector {
  return toLabVector(color);
}

function normalizeEndpointLightness(
  endpoint: OklchColor,
  seed: OklchColor,
  side: "light" | "dark",
): LabVector {
  const lab = toLabVector(endpoint);
  const seedLab = toLabVector(seed);
  if (side === "light") {
    lab.l = Math.max(lab.l, seedLab.l);
  } else {
    lab.l = Math.min(lab.l, seedLab.l);
  }
  return labFromColor(colorFromLab(lab, seed.h));
}

function gamutPressure(color: OklchColor): number {
  const available = maxChroma(color.l, color.h);
  return available > 1e-9 ? color.c / available : color.c > 0 ? Infinity : 0;
}

function pressureLimitForSide(side: "light" | "dark"): number {
  return side === "light" ? 0.88 : 0.92;
}

function compressCurveColor(
  point: RawCurvePoint,
  side: "light" | "dark",
  segmentPressure: number,
): OklchColor {
  const softLimit = pressureLimitForSide(side);
  const segmentStrength = smoothstep(softLimit, 1.08, segmentPressure);
  if (segmentStrength <= 0) return clampToGamut(point.color);

  const seedFade = side === "light" ? 1 - point.t : point.t;
  const endpointWeight = side === "light" ? 1 - point.t : point.t;
  const pressureWeight = smoothstep(softLimit - 0.08, 1.04, point.pressure);
  const localWeight =
    segmentStrength *
    endpointWeight ** 0.72 *
    (0.35 + pressureWeight * 0.65) *
    seedFade;

  if (localWeight <= 1e-6) return clampToGamut(point.color);

  const hue = normalizeHue(point.color.h);
  const aquaHighlightWeight =
    side === "light" && point.color.l >= 0.94
      ? smoothstep(18, 4, hueDistance(hue, 195))
      : 0;
  const occupancyCeiling = lerp(1, softLimit, localWeight);
  const chromaCompression = lerp(0.08, 0.015, aquaHighlightWeight);
  const desiredChroma = point.color.c * (1 - chromaCompression * localWeight);
  const lightnessShift = lerp(0.045, 0.07, aquaHighlightWeight) * localWeight;
  let lightness = point.color.l;

  if (maxChroma(lightness, hue) * occupancyCeiling < desiredChroma) {
    lightness =
      side === "light"
        ? highestLightnessForVisibleChroma(
            hue,
            lightness,
            Math.max(0.02, lightness - lightnessShift),
            occupancyCeiling,
            desiredChroma,
          )
        : lowestLightnessForVisibleChroma(
            hue,
            lightness,
            Math.min(0.98, lightness + lightnessShift),
            occupancyCeiling,
            desiredChroma,
          );
  }

  const chroma = Math.min(
    desiredChroma,
    maxChroma(lightness, hue) * occupancyCeiling,
  );

  return clampToGamut({
    l: lightness,
    c: Math.max(0, chroma),
    h: hue,
  });
}

function finishCurveSamples(colors: readonly OklchColor[]): CurveSample[] {
  const samples: CurveSample[] = [];
  let distance = 0;
  let previous: LabVector | null = null;

  for (const color of colors) {
    const lab = labFromColor(color);
    if (previous) distance += distanceLab(previous, lab);
    samples.push({ lab, distance });
    previous = lab;
  }

  return samples;
}

function buildSegment(
  p0: LabVector,
  p1: LabVector,
  m0: LabVector,
  m1: LabVector,
  fallbackHue: number,
  side: "light" | "dark",
  options: CurveBuildOptions,
): CurveSample[] {
  const rawPoints: RawCurvePoint[] = [];

  for (let index = 0; index <= CURVE_SAMPLE_COUNT; index++) {
    const t = index / CURVE_SAMPLE_COUNT;
    const lab = hermiteLab(p0, p1, m0, m1, t);
    const color = rawColorFromLab(lab, fallbackHue);
    rawPoints.push({
      lab,
      color,
      pressure: gamutPressure(color),
      t,
    });
  }

  if (!options.compressGamut) {
    return finishCurveSamples(
      rawPoints.map((point) => clampToGamut(point.color)),
    );
  }

  const segmentPressure = Math.max(
    ...rawPoints
      .filter((point) =>
        side === "light" ? point.t < 0.999 : point.t > 0.001,
      )
      .map((point) => point.pressure),
    0,
  );

  return finishCurveSamples(
    rawPoints.map((point) => compressCurveColor(point, side, segmentPressure)),
  );
}

function buildCurveGeometry(
  lightLab: LabVector,
  seedLab: LabVector,
  darkLab: LabVector,
  fallbackHue: number,
  seedTangentFactor: number,
  options: CurveBuildOptions,
): Omit<CurveGeometry, "score"> {
  const throughAxis = normalizeLab(subtractLab(darkLab, lightLab));
  const lightDistance = distanceLab(lightLab, seedLab);
  const darkDistance = distanceLab(seedLab, darkLab);

  return {
    lightLab,
    darkLab,
    lightSegment: buildSegment(
      lightLab,
      seedLab,
      scaleLab(subtractLab(seedLab, lightLab), 0.95),
      scaleLab(throughAxis, lightDistance * seedTangentFactor),
      fallbackHue,
      "light",
      options,
    ),
    darkSegment: buildSegment(
      seedLab,
      darkLab,
      scaleLab(throughAxis, darkDistance * seedTangentFactor),
      scaleLab(subtractLab(darkLab, seedLab), 0.95),
      fallbackHue,
      "dark",
      options,
    ),
  };
}

function sampleSegment(
  samples: readonly CurveSample[],
  fraction: number,
  fallbackHue: number,
): OklchColor {
  if (samples.length === 0) {
    return { l: 0.62, c: 0, h: fallbackHue };
  }

  const total = samples[samples.length - 1].distance;
  if (total <= 1e-9 || fraction <= 0) {
    return colorFromLab(samples[0].lab, fallbackHue);
  }
  if (fraction >= 1) {
    return colorFromLab(samples[samples.length - 1].lab, fallbackHue);
  }

  const target = total * fraction;
  const upperIndex = samples.findIndex((sample) => sample.distance >= target);
  const upper = samples[Math.max(1, upperIndex)];
  const lower = samples[Math.max(0, upperIndex - 1)];
  const span = upper.distance - lower.distance;
  const t = span > 1e-9 ? (target - lower.distance) / span : 0;

  return colorFromLab(
    {
      l: lerp(lower.lab.l, upper.lab.l, t),
      a: lerp(lower.lab.a, upper.lab.a, t),
      b: lerp(lower.lab.b, upper.lab.b, t),
    },
    fallbackHue,
  );
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

function worstAdjacentRatio(values: readonly number[]): number {
  if (values.length === 0) return 1;
  return Math.max(...values) / Math.max(Math.min(...values), 1e-9);
}

function seedKinkRatio(stops: readonly RampStop[], seedIndex: number): number {
  const distances = pairwiseDistances(stops);
  if (seedIndex <= 0 || seedIndex >= stops.length - 1) return 1;
  const left = distances[seedIndex - 1];
  const right = distances[seedIndex];
  return Math.max(left, right) / Math.max(Math.min(left, right), 1e-9);
}

function hasLightnessViolation(stops: readonly RampStop[]): boolean {
  return stops.slice(1).some(
    (stop, index) => stop.color.l > stops[index].color.l + 1e-4,
  );
}

function darkModeAdjust(
  l: number,
  c: number,
  h: number,
  t: number,
): OklchColor {
  let darkL = l;
  let darkC = c;

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

  return clampToGamut({ l: clamp(darkL, 0.05, 0.98), c: darkC, h });
}

function buildStops(
  labels: readonly string[],
  lightSegment: readonly CurveSample[],
  darkSegment: readonly CurveSample[],
  seed: OklchColor,
  seedIndex: number,
): RampStop[] {
  const lastIndex = labels.length - 1;
  const darkIntervals = lastIndex - seedIndex;

  return labels.map((label, index) => {
    let color: OklchColor;
    if (index === seedIndex) {
      color = seed;
    } else if (index < seedIndex) {
      color = sampleSegment(lightSegment, index / seedIndex, seed.h);
    } else {
      color = sampleSegment(
        darkSegment,
        darkIntervals <= 0 ? 1 : (index - seedIndex) / darkIntervals,
        seed.h,
      );
    }

    const t = lastIndex > 0 ? index / lastIndex : 0.5;
    return {
      index,
      label,
      color,
      darkColor: darkModeAdjust(color.l, color.c, color.h, t),
    };
  });
}

function scoreStops(stops: readonly RampStop[], seedIndex: number): number {
  const distances = pairwiseDistances(stops);
  return (
    (hasLightnessViolation(stops) ? 1_000 : 0) +
    coefficientOfVariation(distances) * 3 +
    Math.max(0, worstAdjacentRatio(distances) - 1) * 1.8 +
    Math.max(0, seedKinkRatio(stops, seedIndex) - 1) * 1.2
  );
}

function chooseStops(
  labels: readonly string[],
  lightSegment: readonly CurveSample[],
  darkSegment: readonly CurveSample[],
  seed: OklchColor,
  preferredSeedFraction: number,
  allowEndpointSeed = false,
): { stops: RampStop[]; seedIndex: number; score: number } {
  if (labels.length <= 1) {
    return {
      stops: buildStops(labels, lightSegment, darkSegment, seed, 0),
      seedIndex: 0,
      score: 0,
    };
  }

  const lastIndex = labels.length - 1;
  const interiorMin = labels.length > 2 && !allowEndpointSeed ? 1 : 0;
  const interiorMax =
    labels.length > 2 && !allowEndpointSeed ? lastIndex - 1 : lastIndex;
  const idealSeedIndex = clamp(
    Math.round(lastIndex * preferredSeedFraction),
    interiorMin,
    interiorMax,
  );
  const stops = buildStops(labels, lightSegment, darkSegment, seed, idealSeedIndex);
  return {
    stops,
    seedIndex: idealSeedIndex,
    score: scoreStops(stops, idealSeedIndex),
  };
}

function endpointCandidateColor(
  base: OklchColor,
  seed: OklchColor,
  side: "light" | "dark",
  lightnessOffset: number,
  chromaScale: number,
): OklchColor {
  const lightness =
    side === "light"
      ? Math.max(seed.l, base.l + lightnessOffset)
      : Math.min(seed.l, base.l + lightnessOffset);
  const hue = base.c < 0.025 ? seed.h : base.h;

  return clampToGamut({
    l: clamp(lightness, 0.02, 0.98),
    c: Math.max(0, base.c * chromaScale),
    h: Number.isFinite(hue) ? hue : seed.h,
  });
}

function endpointCandidates(
  base: OklchColor,
  seed: OklchColor,
  side: "light" | "dark",
): LabVector[] {
  const highlightModel =
    side === "light" ? highlightEndpointModel(seed, base) : null;
  const lightnessOffsets =
    highlightModel
      ? highlightModel.lightnessOffsets
      : side === "light"
        ? [-0.008, 0, 0.012, 0.022]
        : [-0.04, -0.02, 0, 0.02];
  const chromaScales =
    highlightModel
      ? [0.78, 0.9, 1, 1.1]
      : [0.9, 1, 1.1];
  const candidates = [normalizeEndpointLightness(base, seed, side)];
  const keys = new Set(candidates.map((candidate) =>
    `${candidate.l.toFixed(4)}|${candidate.a.toFixed(4)}|${candidate.b.toFixed(4)}`,
  ));

  if (highlightModel) {
    const hueCandidates = [
      highlightModel.targetHue - 4,
      highlightModel.targetHue,
      highlightModel.targetHue + 4,
      base.h,
    ];
    const occupancyCandidates = [
      highlightModel.targetEndpointOccupancy - 0.04,
      highlightModel.targetEndpointOccupancy,
      highlightModel.targetEndpointOccupancy + 0.06,
      relativeChroma(base),
    ];

    for (const lightnessOffset of lightnessOffsets) {
      const lightness = clamp(
        highlightModel.targetLightness + lightnessOffset,
        seed.l,
        0.98,
      );
      for (const hue of hueCandidates) {
        for (const occupancy of occupancyCandidates) {
          const normalizedHue = normalizeHue(hue);
          const color = clampToGamut({
            l: lightness,
            c: maxChroma(lightness, normalizedHue) * clamp(occupancy, 0.24, 0.76),
            h: normalizedHue,
          });
          const lab = labFromColor(color);
          const key = `${lab.l.toFixed(4)}|${lab.a.toFixed(4)}|${lab.b.toFixed(4)}`;
          if (!keys.has(key)) {
            candidates.push(lab);
            keys.add(key);
          }
        }
      }
    }
  } else {
    for (const lightnessOffset of lightnessOffsets) {
      for (const chromaScale of chromaScales) {
        const lab = labFromColor(
          endpointCandidateColor(base, seed, side, lightnessOffset, chromaScale),
        );
        const key = `${lab.l.toFixed(4)}|${lab.a.toFixed(4)}|${lab.b.toFixed(4)}`;
        if (!keys.has(key)) {
          candidates.push(lab);
          keys.add(key);
        }
      }
    }
  }

  return candidates;
}

function resolveSeedPlacementPolicy(
  canonicalLabels: readonly string[],
  baseLightEndpoint: OklchColor,
  seed: OklchColor,
  baseDarkEndpoint: OklchColor,
  preferredSeedFraction: number,
): SeedPlacementPolicy {
  if (canonicalLabels.length <= 1) {
    return { preferredFraction: 0, allowEndpointSeed: true };
  }

  const lastIndex = canonicalLabels.length - 1;
  const preferredSeedIndex = clamp(
    Math.round(lastIndex * preferredSeedFraction),
    1,
    Math.max(1, lastIndex - 1),
  );
  const seedLab = toLabVector(seed);
  const lightLab = normalizeEndpointLightness(baseLightEndpoint, seed, "light");
  const darkLab = normalizeEndpointLightness(baseDarkEndpoint, seed, "dark");
  const lightDistance = distanceLab(lightLab, seedLab);
  const darkDistance = distanceLab(seedLab, darkLab);
  const lightStep = lightDistance / Math.max(1, preferredSeedIndex);
  const darkStep = darkDistance / Math.max(1, lastIndex - preferredSeedIndex);
  const lightnessRoom = 0.98 - seed.l;
  const hasHighlightShelf =
    seed.l >= 0.955 &&
    lightStep < darkStep * 0.35 &&
    lightnessRoom < darkStep * 0.45;

  if (hasHighlightShelf) {
    return { preferredFraction: 0, allowEndpointSeed: true };
  }

  return { preferredFraction: preferredSeedFraction, allowEndpointSeed: false };
}

function highlightEndpointPenalty(
  model: HighlightEndpointModel | null,
  sampledStops: readonly RampStop[],
): number {
  if (!model || sampledStops.length === 0) return 0;

  const first = sampledStops[0].color;
  const second = sampledStops[1]?.color ?? first;
  const firstOccupancyDelta =
    (relativeChroma(first) - model.targetEndpointOccupancy) / 0.08;
  const secondOccupancyExcess =
    Math.max(0, relativeChroma(second) - model.targetBridgeOccupancy) / 0.08;
  const firstLightnessDelta = (first.l - model.targetLightness) / 0.008;
  const firstHueDelta = hueDistance(first.h, model.targetHue) / 6;

  return (
    model.weight *
    (firstOccupancyDelta ** 2 * 0.28 +
      secondOccupancyExcess ** 2 * 0.05 +
      firstLightnessDelta ** 2 * 0.3 +
      firstHueDelta ** 2 * 0.08)
  );
}

function solveCanonicalGeometry(
  canonicalLabels: readonly string[],
  baseLightEndpoint: OklchColor,
  seedLab: LabVector,
  baseDarkEndpoint: OklchColor,
  seed: OklchColor,
  seedPlacement: SeedPlacementPolicy,
  options: CurveBuildOptions,
): CurveGeometry {
  const baseLightLab = normalizeEndpointLightness(baseLightEndpoint, seed, "light");
  const baseDarkLab = normalizeEndpointLightness(baseDarkEndpoint, seed, "dark");
  const lightHighlightModel = highlightEndpointModel(seed, baseLightEndpoint);
  const lightCandidates = endpointCandidates(baseLightEndpoint, seed, "light");
  const darkCandidates = endpointCandidates(baseDarkEndpoint, seed, "dark");
  const seedTangentFactors = [0.55, 0.8, 0.95, 1.1] as const;
  let best: CurveGeometry | null = null;

  for (const lightLab of lightCandidates) {
    for (const darkLab of darkCandidates) {
      for (const seedTangentFactor of seedTangentFactors) {
        const geometry = buildCurveGeometry(
          lightLab,
          seedLab,
          darkLab,
          seed.h,
          seedTangentFactor,
          options,
        );
        const sampled = chooseStops(
          canonicalLabels,
          geometry.lightSegment,
          geometry.darkSegment,
          seed,
          seedPlacement.preferredFraction,
          seedPlacement.allowEndpointSeed,
        );
        const endpointDrift =
          distanceLab(lightLab, baseLightLab) + distanceLab(darkLab, baseDarkLab);
        const tuningDrift = Math.abs(seedTangentFactor - 0.95);
        const highlightRestraint = highlightEndpointPenalty(
          lightHighlightModel,
          sampled.stops,
        );
        const score =
          sampled.score + endpointDrift * 2.2 + tuningDrift * 0.05 + highlightRestraint;

        if (!best || score < best.score) {
          best = { ...geometry, score };
        }
      }
    }
  }

  return best!;
}

function cacheKey(config: RampConfig): string {
  return [
    config.stopCount,
    config.hue.toFixed(3),
    (config.seedChroma ?? -1).toFixed(4),
    (config.seedLightness ?? -1).toFixed(4),
  ].join("|");
}

function solveContinuousCurveRampWithMode(
  config: RampConfig,
  mode: ContinuousCurveMode,
): V6SolveResult {
  const cache = mode === "continuous-compressed" ? COMPRESSED_CACHE : CURVE_CACHE;
  const key = cacheKey(config);
  const cached = cache.get(key);
  if (cached) return cached;

  const labelSource = solveV6ResearchRamp(config);
  const canonical = solveBrandExactFairRamp({ ...config, stopCount: 11 });
  const labels = labelSource.stops.map((stop) => stop.label);
  const canonicalLabels = canonical.stops.map((stop) => stop.label);
  const exactSeed = canonical.stops[canonical.metadata.seedIndex].color;
  const lightEndpoint = canonical.stops[0].color;
  const darkEndpoint = canonical.stops[canonical.stops.length - 1].color;
  const seedPlacement = resolveSeedPlacementPolicy(
    canonicalLabels,
    lightEndpoint,
    exactSeed,
    darkEndpoint,
    canonical.metadata.seedFraction,
  );

  const seedLab = toLabVector(exactSeed);
  const geometry = solveCanonicalGeometry(
    canonicalLabels,
    lightEndpoint,
    seedLab,
    darkEndpoint,
    exactSeed,
    seedPlacement,
    {
      compressGamut: mode === "continuous-compressed",
    },
  );
  const best = chooseStops(
    labels,
    geometry.lightSegment,
    geometry.darkSegment,
    exactSeed,
    seedPlacement.preferredFraction,
    seedPlacement.allowEndpointSeed,
  );
  const lightBudget = geometry.lightSegment[geometry.lightSegment.length - 1].distance;
  const darkBudget = geometry.darkSegment[geometry.darkSegment.length - 1].distance;
  const totalBudget = lightBudget + darkBudget;

  const result: V6SolveResult = {
    stops: best.stops,
    metadata: {
      ...canonical.metadata,
      solver: mode,
      score: best.score,
      lightBudget,
      darkBudget,
      totalBudget,
      seedIndex: best.seedIndex,
      seedFraction:
        labels.length > 1 ? best.seedIndex / (labels.length - 1) : 0.5,
    },
  };

  cache.set(key, result);
  return result;
}

export function solveContinuousCurveRamp(config: RampConfig): V6SolveResult {
  return solveContinuousCurveRampWithMode(config, "continuous-curve");
}

export function solveContinuousCompressedRamp(config: RampConfig): V6SolveResult {
  return solveContinuousCurveRampWithMode(config, "continuous-compressed");
}
