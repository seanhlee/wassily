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
}

export interface ResearchLabSeedSection {
  seed: ResearchSeed;
  engines: ResearchLabEngineSection[];
}

export interface ResearchLabData {
  generatedAt: string;
  seeds: ResearchLabSeedSection[];
}

function formatOklch(l: number, c: number, h: number): string {
  return `oklch(${l.toFixed(3)} ${c.toFixed(3)} ${h.toFixed(1)})`;
}

function textHex(lightness: number): string {
  return lightness >= 0.72 ? "#111111" : "#f8f8f8";
}

export function buildResearchLabData(
  seeds: readonly ResearchSeed[] = RESEARCH_SEEDS,
  options: Omit<EvaluateSeedOptions, "engine"> = {},
): ResearchLabData {
  const engines: ResearchEngine[] = ["v5", "v6"];
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
        };
      }),
    })),
  };
}

