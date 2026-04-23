import type { OklchColor } from "../types";
import { toHex } from "./gamut";
import {
  CURATED_FAMILY_PROFILE_FITS,
  CURATED_REFERENCE_CORPUS,
  type ControlPointSet,
  type DerivedFamily,
  type FamilyFitReport,
  type ReferenceRamp,
  type ReferenceShoulderGeometryFit,
} from "./familyProfiles";
import {
  RESEARCH_SEEDS,
  evaluateSeed,
  researchSeedToRampConfig,
  type RampAnalysis,
  type ResearchSeed,
} from "./research";
import { generateRamp } from "./ramp";

export interface FamilyBoardSwatch {
  label: string;
  color: OklchColor;
  hex: string;
  textHex: string;
  oklch: string;
}

export interface FamilyBoardReference {
  id: string;
  source: string;
  notes: string;
  weight: number;
  anchorLabel: string;
  shoulderFit: ReferenceShoulderGeometryFit;
  swatches: FamilyBoardSwatch[];
}

export interface FamilyBoardSection {
  family: DerivedFamily;
  exemplarSeed: ResearchSeed;
  references: FamilyBoardReference[];
  fit: FamilyFitReport;
  archetypeControlPoints: FamilyBoardSwatch[];
  generatedRamp: FamilyBoardSwatch[];
  analysis: RampAnalysis;
}

export interface FamilyProfileBoardData {
  generatedAt: string;
  families: FamilyBoardSection[];
}

const FAMILY_EXEMPLAR_IDS: Record<DerivedFamily, string> = {
  lime: "bright-lime",
  "phthalo-green": "phthalo-green",
  cyan: "cyan",
  ultramarine: "ultramarine",
  violet: "violet",
  neutral: "warm-neutral",
};

const FAMILY_ORDER: DerivedFamily[] = [
  "lime",
  "phthalo-green",
  "cyan",
  "ultramarine",
  "violet",
  "neutral",
];

const CONTROL_POINT_LABELS = [
  "light endpoint",
  "light shoulder",
  "seed",
  "dark shoulder",
  "dark endpoint",
] as const;

function formatOklch(color: OklchColor): string {
  return `oklch(${color.l.toFixed(3)} ${color.c.toFixed(3)} ${color.h.toFixed(1)})`;
}

function swatchTextHex(color: OklchColor): string {
  return color.l >= 0.72 ? "#111111" : "#f8f8f8";
}

function toBoardSwatch(label: string, color: OklchColor): FamilyBoardSwatch {
  return {
    label,
    color,
    hex: toHex(color),
    textHex: swatchTextHex(color),
    oklch: formatOklch(color),
  };
}

function toReferenceEntry(
  reference: ReferenceRamp,
  anchorLabel: string,
  shoulderFit: ReferenceShoulderGeometryFit,
): FamilyBoardReference {
  return {
    id: reference.id,
    source: reference.source,
    notes: reference.notes,
    weight: reference.weight,
    anchorLabel,
    shoulderFit,
    swatches: Object.entries(reference.stops).map(([label, color]) =>
      toBoardSwatch(label, color),
    ),
  };
}

function controlPointsToSwatches(points: ControlPointSet): FamilyBoardSwatch[] {
  const values = [
    points.lightEndpoint,
    points.lightShoulder,
    points.seed,
    points.darkShoulder,
    points.darkEndpoint,
  ];
  return values.map((color, index) => toBoardSwatch(CONTROL_POINT_LABELS[index], color));
}

function getExemplarSeed(family: DerivedFamily): ResearchSeed {
  const seed = RESEARCH_SEEDS.find((candidate) => candidate.id === FAMILY_EXEMPLAR_IDS[family]);
  if (!seed) {
    throw new Error(`Missing research seed for family ${family}`);
  }
  return seed;
}

export function buildFamilyProfileBoardData(): FamilyProfileBoardData {
  const families = FAMILY_ORDER.map((family) => {
      const exemplarSeed = getExemplarSeed(family);
      const fit = CURATED_FAMILY_PROFILE_FITS[family];
      const references = CURATED_REFERENCE_CORPUS.filter(
        (reference) => reference.family === family,
      );
      const ramp = generateRamp(researchSeedToRampConfig(exemplarSeed));
      const analysis = evaluateSeed(exemplarSeed);

      return {
        family,
        exemplarSeed,
        references: references.map((reference, index) =>
          toReferenceEntry(
            reference,
            fit.anchorLabels[index],
            fit.shoulderGeometry.references[index],
          ),
        ),
        fit,
        archetypeControlPoints: controlPointsToSwatches(fit.archetype),
        generatedRamp: ramp.map((stop) => toBoardSwatch(stop.label, stop.color)),
        analysis,
      };
    });

  return {
    generatedAt: new Date().toISOString(),
    families,
  };
}
