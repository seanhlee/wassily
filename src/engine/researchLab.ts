import { toHex } from "./gamut";
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

function evaluateFocusGate(run: SeedEvaluationRun): ResearchLabFocusMetrics {
  const { analysis, metadata } = run;
  const reasons: string[] = [];
  let gate: ResearchLabGate = "pass";

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
    1.04,
    1.08,
    (value) => `${value.toFixed(3)}x`,
  );
  judgeMetric(
    "worst 3-step",
    analysis.lightRamp.adjacentDistance.worstThreeStepRatio,
    1.05,
    1.1,
    (value) => `${value.toFixed(3)}x`,
  );
  judgeMetric(
    "light edge",
    analysis.lightRamp.adjacentDistance.lightEntranceRatio,
    1.04,
    1.08,
    (value) => `${value.toFixed(3)}x`,
  );
  judgeMetric(
    "split balance",
    analysis.seedPlacementImbalance,
    0.04,
    0.08,
    (value) => value.toFixed(3),
  );
  judgeMetric(
    "distance cv",
    analysis.lightRamp.adjacentDistance.coefficientOfVariation,
    0.02,
    0.05,
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
