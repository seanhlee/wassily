import type { OklchColor } from "../types";
import { chromaPeakLightness, maxChroma, NEUTRAL_CHROMA } from "./gamut";
import { oklab as toOklab, oklch as toOklch } from "culori";

export type RampFamily = "generic" | "lime" | "ultramarine" | "cyan" | "neutral";

export interface FamilyProfile {
  lightEndpointThreshold: number;
  darkEndpointThreshold: number;
  lightEndpointHueOffset: number;
  lightShoulderHueOffset: number;
  darkShoulderHueOffset: number;
  darkEndpointHueOffset: number;
  lightEndpointIntensityScale: number;
  lightEndpointIntensityOffset: number;
  lightShoulderIntensityScale: number;
  lightShoulderIntensityOffset: number;
  darkShoulderIntensityScale: number;
  darkShoulderIntensityOffset: number;
  darkEndpointIntensityScale: number;
  darkEndpointIntensityOffset: number;
  lightShoulderMix: number;
  darkShoulderMix: number;
}

export type DerivedFamily = Exclude<RampFamily, "generic">;
type StopLabel =
  | "50"
  | "100"
  | "200"
  | "300"
  | "400"
  | "500"
  | "600"
  | "700"
  | "800"
  | "900"
  | "950";

type StopMap = Record<StopLabel, OklchColor>;

export interface ReferenceRamp {
  id: string;
  family: DerivedFamily;
  source: string;
  notes: string;
  weight: number;
  stops: StopMap;
}

export interface ControlPointSet {
  lightEndpoint: OklchColor;
  lightShoulder: OklchColor;
  seed: OklchColor;
  darkShoulder: OklchColor;
  darkEndpoint: OklchColor;
}

export interface FamilyFitReport {
  family: DerivedFamily;
  referenceIds: string[];
  sources: string[];
  anchorLabels: StopLabel[];
  profile: FamilyProfile;
  archetype: ControlPointSet;
}

const STOP_LABELS: StopLabel[] = [
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
];

const SHOULDER_MIX_TEMPLATES: Record<DerivedFamily, Pick<FamilyProfile, "lightShoulderMix" | "darkShoulderMix">> =
  {
    lime: {
      lightShoulderMix: 0.32,
      darkShoulderMix: 0.6,
    },
    ultramarine: {
      lightShoulderMix: 0.42,
      darkShoulderMix: 0.58,
    },
    cyan: {
      lightShoulderMix: 0.36,
      darkShoulderMix: 0.58,
    },
    neutral: {
      lightShoulderMix: 0.38,
      darkShoulderMix: 0.56,
    },
  };

const FAMILY_EXEMPLARS: Record<DerivedFamily, OklchColor> = {
  lime: { l: 0.931, c: 0.223, h: 121.082 },
  ultramarine: { l: 0.47, c: 0.18, h: 265 },
  cyan: { l: 0.78, c: 0.14, h: 210 },
  neutral: { l: 0.62, c: 0.018, h: 70 },
};

function stop(l: number, c: number, h: number): OklchColor {
  return { l, c, h };
}

export const CURATED_REFERENCE_CORPUS: readonly ReferenceRamp[] = [
  {
    id: "tw-lime-v3",
    family: "lime",
    source: "Tailwind CSS v3 lime",
    notes: "Bright yellow-green family reference with clean, leafy darks.",
    weight: 0.75,
    stops: {
      "50": stop(0.986, 0.031, 120.8),
      "100": stop(0.967, 0.066, 122.3),
      "200": stop(0.938, 0.122, 124.3),
      "300": stop(0.897, 0.179, 126.7),
      "400": stop(0.849, 0.207, 128.8),
      "500": stop(0.768, 0.204, 130.8),
      "600": stop(0.648, 0.175, 131.7),
      "700": stop(0.532, 0.141, 131.6),
      "800": stop(0.453, 0.113, 130.9),
      "900": stop(0.405, 0.096, 131.1),
      "950": stop(0.274, 0.069, 132.1),
    },
  },
  {
    id: "tw-yellow-v3",
    family: "lime",
    source: "Tailwind CSS v3 yellow",
    notes: "Warm yellow-side counterweight for the lime family.",
    weight: 0.25,
    stops: {
      "50": stop(0.987, 0.026, 102.2),
      "100": stop(0.973, 0.069, 103.2),
      "200": stop(0.945, 0.124, 101.5),
      "300": stop(0.905, 0.166, 98.1),
      "400": stop(0.861, 0.173, 91.9),
      "500": stop(0.795, 0.162, 86),
      "600": stop(0.681, 0.142, 75.8),
      "700": stop(0.554, 0.121, 66.4),
      "800": stop(0.476, 0.103, 61.9),
      "900": stop(0.421, 0.09, 57.7),
      "950": stop(0.286, 0.064, 53.8),
    },
  },
  {
    id: "wa-blue-bright",
    family: "ultramarine",
    source: "Web Awesome bright blue",
    notes: "Blue-side ultramarine reference with strong colored highlights.",
    weight: 1,
    stops: {
      "50": stop(0.963, 0.02, 238.7),
      "100": stop(0.923, 0.041, 240.4),
      "200": stop(0.833, 0.091, 242.3),
      "300": stop(0.748, 0.137, 245.6),
      "400": stop(0.667, 0.136, 249.6),
      "500": stop(0.563, 0.132, 251.6),
      "600": stop(0.463, 0.113, 253.2),
      "700": stop(0.393, 0.095, 252.4),
      "800": stop(0.318, 0.079, 253.2),
      "900": stop(0.233, 0.059, 252.8),
      "950": stop(0.181, 0.045, 253.3),
    },
  },
  {
    id: "wa-cyan-bright",
    family: "cyan",
    source: "Web Awesome bright cyan",
    notes: "Clean cyan reference with cool, bluer darks.",
    weight: 0.5,
    stops: {
      "50": stop(0.961, 0.031, 204),
      "100": stop(0.914, 0.075, 204.3),
      "200": stop(0.827, 0.12, 207.3),
      "300": stop(0.741, 0.119, 210.5),
      "400": stop(0.659, 0.109, 212.4),
      "500": stop(0.553, 0.094, 215.2),
      "600": stop(0.457, 0.08, 215.3),
      "700": stop(0.384, 0.068, 215.5),
      "800": stop(0.314, 0.056, 215.6),
      "900": stop(0.229, 0.041, 217.2),
      "950": stop(0.18, 0.032, 213.8),
    },
  },
  {
    id: "tw-cyan-v3",
    family: "cyan",
    source: "Tailwind CSS v3 cyan",
    notes: "Higher-energy cyan reference with vivid midtones and inky shadows.",
    weight: 0.5,
    stops: {
      "50": stop(0.984, 0.019, 200.9),
      "100": stop(0.956, 0.044, 203.4),
      "200": stop(0.917, 0.077, 205),
      "300": stop(0.865, 0.115, 207.1),
      "400": stop(0.797, 0.134, 211.5),
      "500": stop(0.715, 0.126, 215.2),
      "600": stop(0.609, 0.111, 221.7),
      "700": stop(0.52, 0.094, 223.1),
      "800": stop(0.45, 0.077, 224.3),
      "900": stop(0.398, 0.066, 227.4),
      "950": stop(0.302, 0.054, 229.7),
    },
  },
  {
    id: "wa-gray-bright",
    family: "neutral",
    source: "Web Awesome bright gray",
    notes: "Cool neutral structure reference with more visible chroma in the mids.",
    weight: 0.35,
    stops: {
      "50": stop(0.961, 0.004, 271.4),
      "100": stop(0.925, 0.007, 268.5),
      "200": stop(0.838, 0.016, 266.3),
      "300": stop(0.754, 0.024, 266.9),
      "400": stop(0.67, 0.033, 267.1),
      "500": stop(0.564, 0.045, 268.1),
      "600": stop(0.465, 0.057, 265.4),
      "700": stop(0.394, 0.057, 266.9),
      "800": stop(0.318, 0.056, 267.9),
      "900": stop(0.235, 0.056, 268.5),
      "950": stop(0.185, 0.046, 268.4),
    },
  },
  {
    id: "tw-slate-v3",
    family: "neutral",
    source: "Tailwind CSS v3 slate",
    notes: "Cool neutral reference with blue-gray bias.",
    weight: 0.4,
    stops: {
      "50": stop(0.984, 0.003, 247.9),
      "100": stop(0.968, 0.007, 247.9),
      "200": stop(0.929, 0.013, 255.5),
      "300": stop(0.869, 0.02, 252.9),
      "400": stop(0.711, 0.035, 256.8),
      "500": stop(0.554, 0.041, 257.4),
      "600": stop(0.446, 0.037, 257.3),
      "700": stop(0.372, 0.039, 257.3),
      "800": stop(0.279, 0.037, 260),
      "900": stop(0.208, 0.04, 265.8),
      "950": stop(0.129, 0.041, 264.7),
    },
  },
  {
    id: "tw-stone-v3",
    family: "neutral",
    source: "Tailwind CSS v3 stone",
    notes: "Warm neutral reference with bone-to-umber progression.",
    weight: 0.25,
    stops: {
      "50": stop(0.985, 0.001, 106.4),
      "100": stop(0.97, 0.001, 106.4),
      "200": stop(0.923, 0.003, 48.7),
      "300": stop(0.869, 0.004, 56.4),
      "400": stop(0.716, 0.009, 56.3),
      "500": stop(0.553, 0.012, 58.1),
      "600": stop(0.444, 0.01, 73.6),
      "700": stop(0.374, 0.009, 67.6),
      "800": stop(0.268, 0.006, 34.3),
      "900": stop(0.216, 0.006, 56),
      "950": stop(0.147, 0.004, 49.2),
    },
  },
] as const;

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

function weightedMean(
  values: readonly number[],
  weights: readonly number[],
): number {
  const totalWeight = weights.reduce((sum, weight) => sum + weight, 0);
  return (
    values.reduce((sum, value, index) => sum + value * weights[index], 0) /
    totalWeight
  );
}

function controlPointIntensity(point: OklchColor): number {
  const available = maxChroma(point.l, point.h);
  return available > 0 ? clamp(point.c / available, 0, 1.5) : 0;
}

function averageColor(
  points: readonly OklchColor[],
  weights: readonly number[],
): OklchColor {
  const labs = points.map((point) =>
    toOklab({ mode: "oklch", l: point.l, c: point.c, h: point.h })!,
  );
  const avg = {
    mode: "oklab" as const,
    l: weightedMean(
      labs.map((lab) => lab.l),
      weights,
    ),
    a: weightedMean(
      labs.map((lab) => lab.a),
      weights,
    ),
    b: weightedMean(
      labs.map((lab) => lab.b),
      weights,
    ),
  };
  const color = toOklch(avg)!;
  return {
    l: color.l,
    c: color.c ?? 0,
    h: normalizeHue(color.h ?? 0),
  };
}

function nearestAnchorLabel(stops: StopMap, exemplar: OklchColor): StopLabel {
  const exemplarLab = toOklab({ mode: "oklch", ...exemplar })!;
  let bestLabel = STOP_LABELS[0];
  let bestDistance = Infinity;

  for (const label of STOP_LABELS) {
    const pointLab = toOklab({ mode: "oklch", ...stops[label] })!;
    const distance = Math.sqrt(
      (pointLab.l - exemplarLab.l) ** 2 +
        (pointLab.a - exemplarLab.a) ** 2 +
        (pointLab.b - exemplarLab.b) ** 2,
    );
    if (distance < bestDistance) {
      bestDistance = distance;
      bestLabel = label;
    }
  }

  return bestLabel;
}

function getReferenceControlPoints(reference: ReferenceRamp): {
  anchorLabel: StopLabel;
  controlPoints: ControlPointSet;
} {
  const exemplar = FAMILY_EXEMPLARS[reference.family];
  const anchorLabel = nearestAnchorLabel(reference.stops, exemplar);
  const anchorIndex = STOP_LABELS.indexOf(anchorLabel);
  const lightShoulderLabel = STOP_LABELS[Math.max(0, anchorIndex - 1)];
  const darkShoulderLabel =
    STOP_LABELS[Math.min(STOP_LABELS.length - 1, anchorIndex + 1)];

  return {
    anchorLabel,
    controlPoints: {
      lightEndpoint: reference.stops["50"],
      lightShoulder: reference.stops[lightShoulderLabel],
      seed: reference.stops[anchorLabel],
      darkShoulder: reference.stops[darkShoulderLabel],
      darkEndpoint: reference.stops["950"],
    },
  };
}

function deriveIntensityModel(
  exemplarSeedIntensity: number,
  targetIntensity: number,
): { scale: number; offset: number } {
  if (exemplarSeedIntensity < 0.05) {
    return {
      scale: 0,
      offset: clamp(targetIntensity, 0, 0.05),
    };
  }

  return {
    scale: clamp(targetIntensity / exemplarSeedIntensity, 0, 1.5),
    offset: 0,
  };
}

function deriveFamilyProfile(family: DerivedFamily): FamilyFitReport {
  const references = CURATED_REFERENCE_CORPUS.filter(
    (reference) => reference.family === family,
  );
  const exemplar = FAMILY_EXEMPLARS[family];
  const seedIntensity = controlPointIntensity(exemplar);
  const referenceFits = references.map((reference) => ({
    reference,
    ...getReferenceControlPoints(reference),
  }));
  const weights = referenceFits.map((fit) => fit.reference.weight);

  const archetype: ControlPointSet = {
    lightEndpoint: averageColor(
      referenceFits.map((fit) => fit.controlPoints.lightEndpoint),
      weights,
    ),
    lightShoulder: averageColor(
      referenceFits.map((fit) => fit.controlPoints.lightShoulder),
      weights,
    ),
    seed: averageColor(
      referenceFits.map((fit) => fit.controlPoints.seed),
      weights,
    ),
    darkShoulder: averageColor(
      referenceFits.map((fit) => fit.controlPoints.darkShoulder),
      weights,
    ),
    darkEndpoint: averageColor(
      referenceFits.map((fit) => fit.controlPoints.darkEndpoint),
      weights,
    ),
  };

  const lightEndpointThreshold = clamp(
    maxChroma(archetype.lightEndpoint.l, archetype.lightEndpoint.h) /
      Math.max(chromaPeakLightness(archetype.lightEndpoint.h).maxC, 1e-6),
    0.05,
    0.45,
  );
  const darkEndpointThreshold = clamp(
    maxChroma(archetype.darkEndpoint.l, archetype.darkEndpoint.h) /
      Math.max(chromaPeakLightness(archetype.darkEndpoint.h).maxC, 1e-6),
    0.05,
    0.45,
  );

  const lightEndpointIntensity = deriveIntensityModel(
    seedIntensity,
    controlPointIntensity(archetype.lightEndpoint),
  );
  const lightShoulderIntensity = deriveIntensityModel(
    seedIntensity,
    controlPointIntensity(archetype.lightShoulder),
  );
  const darkShoulderIntensity = deriveIntensityModel(
    seedIntensity,
    controlPointIntensity(archetype.darkShoulder),
  );
  const darkEndpointIntensity = deriveIntensityModel(
    seedIntensity,
    controlPointIntensity(archetype.darkEndpoint),
  );

  const hueOffsets =
    family === "neutral"
      ? {
          lightEndpointHueOffset: 0,
          lightShoulderHueOffset: 0,
          darkShoulderHueOffset: 0,
          darkEndpointHueOffset: 0,
        }
      : {
          lightEndpointHueOffset: hueDelta(exemplar.h, archetype.lightEndpoint.h),
          lightShoulderHueOffset: hueDelta(exemplar.h, archetype.lightShoulder.h),
          darkShoulderHueOffset: hueDelta(exemplar.h, archetype.darkShoulder.h),
          darkEndpointHueOffset: hueDelta(exemplar.h, archetype.darkEndpoint.h),
        };

  const profile: FamilyProfile = {
    lightEndpointThreshold,
    darkEndpointThreshold,
    ...hueOffsets,
    lightEndpointIntensityScale: lightEndpointIntensity.scale,
    lightEndpointIntensityOffset: lightEndpointIntensity.offset,
    lightShoulderIntensityScale: lightShoulderIntensity.scale,
    lightShoulderIntensityOffset: lightShoulderIntensity.offset,
    darkShoulderIntensityScale: darkShoulderIntensity.scale,
    darkShoulderIntensityOffset: darkShoulderIntensity.offset,
    darkEndpointIntensityScale: darkEndpointIntensity.scale,
    darkEndpointIntensityOffset: darkEndpointIntensity.offset,
    ...SHOULDER_MIX_TEMPLATES[family],
  };

  return {
    family,
    referenceIds: referenceFits.map((fit) => fit.reference.id),
    sources: referenceFits.map((fit) => fit.reference.source),
    anchorLabels: referenceFits.map((fit) => fit.anchorLabel),
    profile,
    archetype,
  };
}

export const GENERIC_FAMILY_PROFILE: FamilyProfile = {
  lightEndpointThreshold: 0.25,
  darkEndpointThreshold: 0.25,
  lightEndpointHueOffset: 0,
  lightShoulderHueOffset: -1,
  darkShoulderHueOffset: 4,
  darkEndpointHueOffset: 8,
  lightEndpointIntensityScale: 1,
  lightEndpointIntensityOffset: 0,
  lightShoulderIntensityScale: 1,
  lightShoulderIntensityOffset: 0,
  darkShoulderIntensityScale: 1,
  darkShoulderIntensityOffset: 0,
  darkEndpointIntensityScale: 1,
  darkEndpointIntensityOffset: 0,
  lightShoulderMix: 0.35,
  darkShoulderMix: 0.55,
};

export const CURATED_FAMILY_PROFILE_FITS: Record<DerivedFamily, FamilyFitReport> = {
  lime: deriveFamilyProfile("lime"),
  ultramarine: deriveFamilyProfile("ultramarine"),
  cyan: deriveFamilyProfile("cyan"),
  neutral: deriveFamilyProfile("neutral"),
};

export const FAMILY_PROFILES: Record<RampFamily, FamilyProfile> = {
  generic: GENERIC_FAMILY_PROFILE,
  lime: CURATED_FAMILY_PROFILE_FITS.lime.profile,
  ultramarine: CURATED_FAMILY_PROFILE_FITS.ultramarine.profile,
  cyan: CURATED_FAMILY_PROFILE_FITS.cyan.profile,
  neutral: CURATED_FAMILY_PROFILE_FITS.neutral.profile,
};

export function isNeutralFamily(seedChroma?: number): boolean {
  return seedChroma !== undefined && seedChroma < NEUTRAL_CHROMA;
}
