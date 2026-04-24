import { maxChroma, toHex } from "./gamut";
import {
  RESEARCH_SEEDS,
  evaluateSeedRun,
  type EvaluateSeedOptions,
  type ResearchEngine,
  type ResearchSeed,
  type SeedEvaluationRun,
} from "./research";

export interface ResearchLabSwatch {
  label: string;
  hex: string;
  textHex: string;
  oklch: string;
}

export interface ResearchLabEngineSection {
  engine: ResearchEngine;
  run: SeedEvaluationRun;
  swatches: ResearchLabSwatch[];
  focus: ResearchLabFocusMetrics;
}

export interface ResearchLabSeedSection {
  seed: ResearchSeed;
  engines: ResearchLabEngineSection[];
}

export interface ResearchLabData {
  generatedAt: string;
  seeds: ResearchLabSeedSection[];
}

export type ResearchLabGate = "pass" | "tighten" | "fail";

export interface ResearchLabFocusMetrics {
  gate: ResearchLabGate;
  reasons: string[];
  seedStopLabel: string | null;
  seedDelta: number | null;
  seedPlacementImbalance: number | null;
  worstAdjacentRatio: number;
  worstThreeStepRatio: number;
  lightEntranceRatio: number;
  spacingCv: number;
  monotone: boolean;
  seedSplitLabel: string | null;
}

function formatOklch(l: number, c: number, h: number): string {
  return `oklch(${l.toFixed(3)} ${c.toFixed(3)} ${h.toFixed(1)})`;
}

function textHex(lightness: number): string {
  return lightness >= 0.72 ? "#111111" : "#f8f8f8";
}

function isHighLightnessCuspSeed(run: SeedEvaluationRun): boolean {
  const seed = run.analysis.seed?.color;
  if (!seed) return false;

  const available = maxChroma(seed.l, seed.h);
  const occupancy = available > 0 ? seed.c / available : 0;
  const yellowGreenWeight = Math.max(
    0,
    1 - Math.abs((((seed.h - 121 + 540) % 360) - 180)) / 44,
  );

  return (
    seed.l >= 0.88 &&
    seed.c >= 0.18 &&
    occupancy >= 0.9 &&
    yellowGreenWeight > 0
  );
}

function evaluateFocusGate(run: SeedEvaluationRun): ResearchLabFocusMetrics {
  const { analysis, metadata } = run;
  const reasons: string[] = [];
  let gate: ResearchLabGate = "pass";
  const edgeSeedStop =
    analysis.seedStopIndex !== null &&
    (analysis.seedStopIndex <= 2 || analysis.seedStopIndex >= analysis.labels.length - 3);
  const chromaticSeed = (analysis.seed?.color.c ?? 0) >= 0.05;
  const stableNeutralSeed = !chromaticSeed && !edgeSeedStop;
  const highLightnessCuspSeed = isHighLightnessCuspSeed(run);

  const escalate = (nextGate: ResearchLabGate, reason: string): void => {
    if (nextGate === "fail" || gate === "pass") gate = nextGate;
    reasons.push(reason);
  };

  const judgeMetric = (
    label: string,
    value: number | null,
    passThreshold: number,
    failThreshold: number,
    formatter: (metric: number) => string,
  ): void => {
    if (value === null || Number.isNaN(value)) {
      escalate("fail", `${label} n/a`);
      return;
    }
    if (value > failThreshold) {
      escalate("fail", `${label} ${formatter(value)}`);
    } else if (value > passThreshold) {
      escalate("tighten", `${label} ${formatter(value)}`);
    }
  };

  if (!analysis.lightRamp.lightness.nonIncreasing) {
    escalate("fail", "non-monotone");
  }

  judgeMetric("seed delta", analysis.seedDelta, 1e-6, 1e-4, (value) =>
    value.toFixed(4),
  );
  judgeMetric(
    "worst adj",
    analysis.lightRamp.adjacentDistance.worstAdjacentRatio,
    chromaticSeed ? 2.2 : stableNeutralSeed ? 1.18 : 1.04,
    chromaticSeed ? 2.5 : stableNeutralSeed ? 1.28 : 1.08,
    (value) => `${value.toFixed(3)}x`,
  );
  judgeMetric(
    "worst 3-step",
    analysis.lightRamp.adjacentDistance.worstThreeStepRatio,
    chromaticSeed ? 2.55 : stableNeutralSeed ? 1.26 : edgeSeedStop ? 1.07 : 1.055,
    chromaticSeed ? 2.85 : stableNeutralSeed ? 1.36 : 1.1,
    (value) => `${value.toFixed(3)}x`,
  );
  judgeMetric(
    "light edge",
    analysis.lightRamp.adjacentDistance.lightEntranceRatio,
    highLightnessCuspSeed ? 2.55 : chromaticSeed ? 2.35 : stableNeutralSeed ? 1.12 : 1.045,
    highLightnessCuspSeed ? 2.85 : chromaticSeed ? 2.65 : stableNeutralSeed ? 1.25 : 1.08,
    (value) => `${value.toFixed(3)}x`,
  );
  judgeMetric(
    "split balance",
    analysis.seedPlacementImbalance,
    chromaticSeed ? 1.3 : stableNeutralSeed ? 0.25 : edgeSeedStop ? 0.075 : 0.04,
    chromaticSeed ? 1.5 : stableNeutralSeed ? 0.32 : edgeSeedStop ? 0.085 : 0.08,
    (value) => value.toFixed(3),
  );
  judgeMetric(
    "distance cv",
    analysis.lightRamp.adjacentDistance.coefficientOfVariation,
    chromaticSeed ? 0.48 : stableNeutralSeed ? 0.13 : edgeSeedStop ? 0.055 : 0.025,
    chromaticSeed ? 0.58 : stableNeutralSeed ? 0.18 : edgeSeedStop ? 0.06 : 0.05,
    (value) => value.toFixed(3),
  );

  const seedStopLabel =
    analysis.seedStopIndex === null ? null : analysis.labels[analysis.seedStopIndex];

  return {
    gate,
    reasons,
    seedStopLabel,
    seedDelta: analysis.seedDelta,
    seedPlacementImbalance: analysis.seedPlacementImbalance,
    worstAdjacentRatio: analysis.lightRamp.adjacentDistance.worstAdjacentRatio,
    worstThreeStepRatio: analysis.lightRamp.adjacentDistance.worstThreeStepRatio,
    lightEntranceRatio: analysis.lightRamp.adjacentDistance.lightEntranceRatio,
    spacingCv: analysis.lightRamp.adjacentDistance.coefficientOfVariation,
    monotone: analysis.lightRamp.lightness.nonIncreasing,
    seedSplitLabel:
      metadata === null
        ? null
        : `${metadata.seedIndex} @ ${(metadata.seedFraction * 100).toFixed(1)}%`,
  };
}

export function buildResearchLabData(
  seeds: readonly ResearchSeed[] = RESEARCH_SEEDS,
  options: Omit<EvaluateSeedOptions, "engine"> = {},
): ResearchLabData {
  const engines: ResearchEngine[] = ["v6-archetype", "v6"];
  return {
    generatedAt: new Date().toISOString(),
    seeds: seeds.map((seed) => ({
      seed,
      engines: engines.map((engine) => {
        const run = evaluateSeedRun(seed, { ...options, engine });
        return {
          engine,
          run,
          swatches: run.stops.map((stop) => ({
            label: stop.label,
            hex: toHex(stop.color),
            textHex: textHex(stop.color.l),
            oklch: formatOklch(stop.color.l, stop.color.c, stop.color.h),
          })),
          focus: evaluateFocusGate(run),
        };
      }),
    })),
  };
}
