import { oklab as toOklab, oklch as toOklch } from "culori";
import type { OklchColor } from "../types";

const EPSILON = 1e-6;

export interface LabVector {
  l: number;
  a: number;
  b: number;
}

export interface SeedCenteredFrame {
  origin: LabVector;
  flowAxis: LabVector;
  radialAxis: LabVector;
  normalAxis: LabVector;
  lightExtent: number;
  darkExtent: number;
  transverseScale: number;
}

export interface SeedFrameCoordinates {
  progress: number;
  radial: number;
  normal: number;
}

export interface SeedFramePointCoordinates {
  flow: number;
  radial: number;
  normal: number;
}

export type SeedFrameSide = "light" | "dark";

export function toLabVector(color: OklchColor): LabVector {
  const lab = toOklab({ mode: "oklch", ...color })!;
  return { l: lab.l, a: lab.a, b: lab.b };
}

export function labVectorToOklch(
  vector: LabVector,
  fallbackHue: number,
): OklchColor {
  const color = toOklch({ mode: "oklab", l: vector.l, a: vector.a, b: vector.b })!;
  return {
    l: color.l,
    c: color.c ?? 0,
    h: color.h ?? fallbackHue,
  };
}

export function addLab(a: LabVector, b: LabVector): LabVector {
  return { l: a.l + b.l, a: a.a + b.a, b: a.b + b.b };
}

export function subtractLab(a: LabVector, b: LabVector): LabVector {
  return { l: a.l - b.l, a: a.a - b.a, b: a.b - b.b };
}

export function scaleLab(vector: LabVector, scalar: number): LabVector {
  return {
    l: vector.l * scalar,
    a: vector.a * scalar,
    b: vector.b * scalar,
  };
}

export function dotLab(a: LabVector, b: LabVector): number {
  return a.l * b.l + a.a * b.a + a.b * b.b;
}

export function crossLab(a: LabVector, b: LabVector): LabVector {
  return {
    l: a.a * b.b - a.b * b.a,
    a: a.b * b.l - a.l * b.b,
    b: a.l * b.a - a.a * b.l,
  };
}

export function normLab(vector: LabVector): number {
  return Math.sqrt(dotLab(vector, vector));
}

export function normalizeLab(vector: LabVector): LabVector {
  const magnitude = normLab(vector);
  return magnitude > EPSILON ? scaleLab(vector, 1 / magnitude) : vector;
}

export function orthogonalizeLab(vector: LabVector, axis: LabVector): LabVector {
  return subtractLab(vector, scaleLab(axis, dotLab(vector, axis)));
}

export function distanceLab(a: LabVector, b: LabVector): number {
  return normLab(subtractLab(a, b));
}

function chooseFallbackPerpendicular(axis: LabVector): LabVector {
  const candidates: LabVector[] = [
    { l: 0, a: 1, b: 0 },
    { l: 0, a: 0, b: 1 },
    { l: 1, a: 0, b: 0 },
  ];

  let best = candidates[0];
  let bestNorm = 0;
  for (const candidate of candidates) {
    const orthogonal = orthogonalizeLab(candidate, axis);
    const magnitude = normLab(orthogonal);
    if (magnitude > bestNorm) {
      best = orthogonal;
      bestNorm = magnitude;
    }
  }

  return best;
}

function pickFlowAxis(lightVec: LabVector, darkVec: LabVector): LabVector {
  const candidates = [
    subtractLab(lightVec, darkVec),
    lightVec,
    scaleLab(darkVec, -1),
  ];

  for (const candidate of candidates) {
    if (normLab(candidate) > EPSILON) {
      return normalizeLab(candidate);
    }
  }

  return normalizeLab({ l: 1, a: 0, b: 0 });
}

export function buildSeedCenteredFrame(
  lightEndpoint: OklchColor,
  seed: OklchColor,
  darkEndpoint: OklchColor,
): SeedCenteredFrame {
  const origin = toLabVector(seed);
  const lightVec = subtractLab(toLabVector(lightEndpoint), origin);
  const darkVec = subtractLab(toLabVector(darkEndpoint), origin);
  const flowAxis = pickFlowAxis(lightVec, darkVec);

  const seedChromaCandidate = orthogonalizeLab(
    { l: 0, a: origin.a, b: origin.b },
    flowAxis,
  );
  const endpointCandidate = orthogonalizeLab(addLab(lightVec, darkVec), flowAxis);
  const radialSource =
    normLab(seedChromaCandidate) > EPSILON
      ? seedChromaCandidate
      : normLab(endpointCandidate) > EPSILON
        ? endpointCandidate
        : chooseFallbackPerpendicular(flowAxis);
  const radialAxis = normalizeLab(radialSource);

  const normalSource = crossLab(flowAxis, radialAxis);
  const normalAxis =
    normLab(normalSource) > EPSILON
      ? normalizeLab(normalSource)
      : normalizeLab(chooseFallbackPerpendicular(flowAxis));

  return {
    origin,
    flowAxis,
    radialAxis,
    normalAxis,
    lightExtent: Math.max(dotLab(lightVec, flowAxis), EPSILON),
    darkExtent: Math.max(-dotLab(darkVec, flowAxis), EPSILON),
    transverseScale: Math.max(
      (Math.max(dotLab(lightVec, flowAxis), 0) + Math.max(-dotLab(darkVec, flowAxis), 0)) /
        2,
      EPSILON,
    ),
  };
}

export function projectShoulderToSeedFrame(
  frame: SeedCenteredFrame,
  shoulder: OklchColor,
  side: SeedFrameSide,
): SeedFrameCoordinates {
  const projected = projectPointToSeedFrame(frame, shoulder);

  return {
    progress: side === "light" ? projected.flow : -projected.flow,
    radial: projected.radial,
    normal: projected.normal,
  };
}

export function projectPointToSeedFrame(
  frame: SeedCenteredFrame,
  point: OklchColor | LabVector,
): SeedFramePointCoordinates {
  const vector =
    "a" in point && "b" in point
      ? point
      : toLabVector(point);
  const offset = subtractLab(vector, frame.origin);
  const signedLongitudinal = dotLab(offset, frame.flowAxis);
  const extent =
    signedLongitudinal >= 0 ? frame.lightExtent : frame.darkExtent;

  return {
    flow: signedLongitudinal / Math.max(extent, EPSILON),
    radial: dotLab(offset, frame.radialAxis) / frame.transverseScale,
    normal: dotLab(offset, frame.normalAxis) / frame.transverseScale,
  };
}

export function reconstructShoulderFromSeedFrame(
  frame: SeedCenteredFrame,
  side: SeedFrameSide,
  coordinates: SeedFrameCoordinates,
): LabVector {
  return reconstructPointFromSeedFrame(frame, {
    flow: side === "light" ? coordinates.progress : -coordinates.progress,
    radial: coordinates.radial,
    normal: coordinates.normal,
  });
}

export function reconstructPointFromSeedFrame(
  frame: SeedCenteredFrame,
  coordinates: SeedFramePointCoordinates,
): LabVector {
  const longitudinal =
    coordinates.flow >= 0
      ? coordinates.flow * frame.lightExtent
      : coordinates.flow * frame.darkExtent;

  return addLab(
    frame.origin,
    addLab(
      scaleLab(frame.flowAxis, longitudinal),
      addLab(
        scaleLab(frame.radialAxis, coordinates.radial * frame.transverseScale),
        scaleLab(frame.normalAxis, coordinates.normal * frame.transverseScale),
      ),
    ),
  );
}
