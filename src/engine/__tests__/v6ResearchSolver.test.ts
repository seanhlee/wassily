import { describe, expect, it } from "vitest";
import { RESEARCH_SEEDS, analyzeRamp, researchSeedToRampConfig } from "../research";
import { clampToGamut, isInGamut, maxChroma } from "../gamut";
import { solveV6ArchetypeRamp, solveV6ResearchRamp } from "../v6ResearchSolver";

describe("v6 research solver", () => {
  function createSeededRandom(seed: number): () => number {
    let state = seed >>> 0;
    return () => {
      state = (state * 1664525 + 1013904223) >>> 0;
      return state / 2 ** 32;
    };
  }

  it("keeps the exact seed as a hard constraint for representative chromatic seeds", { timeout: 10000 }, () => {
    for (const seedId of ["bright-lime", "cyan", "ultramarine"] as const) {
      const seed = RESEARCH_SEEDS.find((candidate) => candidate.id === seedId)!;
      const solved = solveV6ResearchRamp(researchSeedToRampConfig(seed));
      const analysis = analyzeRamp(solved.stops, seed);
      const displaySeed = clampToGamut(seed.color);

      expect(analysis.seedStopIndex).not.toBeNull();
      if (isInGamut(seed.color)) {
        expect(analysis.seedDelta).toBeLessThan(1e-6);
      } else {
        expect(solved.stops[solved.metadata.seedIndex].color).toEqual(displaySeed);
      }
      expect(analysis.lightRamp.gamutViolations).toBe(0);
      expect(analysis.lightRamp.lightness.nonIncreasing).toBe(true);
      expect(solved.metadata.seedIndex).toBe(analysis.seedStopIndex);
      expect(Number.isFinite(solved.metadata.breakdown.total)).toBe(true);
      expect(
        Number.isFinite(solved.metadata.breakdown.continuousSpacingDistortion),
      ).toBe(true);
      expect(Number.isFinite(solved.metadata.breakdown.spacingDistortion)).toBe(true);
      expect(Number.isFinite(solved.metadata.breakdown.seedStopTargetPenalty)).toBe(
        true,
      );
      expect(Number.isFinite(solved.metadata.breakdown.lightEdgeParityPenalty)).toBe(
        true,
      );
      expect(Number.isFinite(solved.metadata.breakdown.darkEdgeParityPenalty)).toBe(
        true,
      );
      expect(Number.isFinite(solved.metadata.breakdown.worstAdjacentStepPenalty)).toBe(
        true,
      );
      expect(
        Number.isFinite(solved.metadata.breakdown.worstThreeStepWindowPenalty),
      ).toBe(true);
      expect(Number.isFinite(solved.metadata.breakdown.localStepSpreadPenalty)).toBe(
        true,
      );
      expect(Number.isFinite(solved.metadata.breakdown.lightEntrancePenalty)).toBe(true);
      expect(Number.isFinite(solved.metadata.breakdown.seedPlacementPenalty)).toBe(
        true,
      );
      expect(
        Number.isFinite(solved.metadata.breakdown.selectedSoftPriorPenalty),
      ).toBe(true);
      expect(Number.isFinite(solved.metadata.softPrior.energyPenalty)).toBe(true);
      expect(Number.isFinite(solved.metadata.softPrior.parameterPenalty)).toBe(true);
      expect(solved.metadata.softPrior.contributors.length).toBeGreaterThan(0);
    }
  });

  it("solves a natural seed split for very light and very dark seeds", () => {
    const veryLight = RESEARCH_SEEDS.find((candidate) => candidate.id === "very-light-seed")!;
    const veryDark = RESEARCH_SEEDS.find((candidate) => candidate.id === "very-dark-seed")!;

    const lightSolved = solveV6ResearchRamp(researchSeedToRampConfig(veryLight));
    const darkSolved = solveV6ResearchRamp(researchSeedToRampConfig(veryDark));
    const lightAnalysis = analyzeRamp(lightSolved.stops, veryLight);
    const darkAnalysis = analyzeRamp(darkSolved.stops, veryDark);

    expect(lightSolved.metadata.seedIndex).toBeLessThan(4);
    expect(darkSolved.metadata.seedIndex).toBeGreaterThan(6);
    expect(lightSolved.metadata.lightBudget).toBeGreaterThan(0);
    expect(lightSolved.metadata.darkBudget).toBeGreaterThan(0);
    expect(darkSolved.metadata.lightBudget).toBeGreaterThan(0);
    expect(darkSolved.metadata.darkBudget).toBeGreaterThan(0);
    expect(lightAnalysis.lightRamp.lightness.nonIncreasing).toBe(true);
    expect(darkAnalysis.lightRamp.lightness.nonIncreasing).toBe(true);
    expect(
      Number.isFinite(lightSolved.metadata.breakdown.selectedSoftPriorPenalty),
    ).toBe(true);
    expect(lightSolved.metadata.breakdown.selectedSoftPriorPenalty).toBeGreaterThan(0);
    expect(Number.isFinite(lightSolved.metadata.softPrior.energyPenalty)).toBe(true);
    expect(Number.isFinite(darkSolved.metadata.softPrior.parameterPenalty)).toBe(true);
  });

  it("routes neutral seeds through the same solved path and prior-regularized objective", () => {
    for (const seedId of ["warm-neutral", "cool-neutral"] as const) {
      const seed = RESEARCH_SEEDS.find((candidate) => candidate.id === seedId)!;
      const solved = solveV6ResearchRamp(researchSeedToRampConfig(seed));
      const analysis = analyzeRamp(solved.stops, seed);

      expect(analysis.seedDelta).toBeLessThan(1e-6);
      expect(analysis.seedPlacementImbalance).not.toBeNull();
      expect(analysis.lightRamp.lightness.nonIncreasing).toBe(true);
      expect(solved.metadata.lightBudget).toBeGreaterThan(0);
      expect(solved.metadata.darkBudget).toBeGreaterThan(0);
      expect(solved.metadata.breakdown.selectedSoftPriorPenalty).toBeGreaterThan(0);
      expect(solved.metadata.softPrior.parameterPenalty).toBeGreaterThan(0);
    }
  });

  it("gives chromatic ramps semantic tint and ink roles", () => {
    for (const seedId of [
      "cyan",
      "bright-lime",
      "phthalo-green",
    ] as const) {
      const seed = RESEARCH_SEEDS.find((candidate) => candidate.id === seedId)!;
      const solved = solveV6ResearchRamp(researchSeedToRampConfig(seed));
      const analysis = analyzeRamp(solved.stops, seed);
      const stop50 = solved.stops.find((stop) => stop.label === "50")!;
      const stop950 = solved.stops.find((stop) => stop.label === "950")!;

      expect(stop50.color.l).toBeGreaterThanOrEqual(0.955);
      expect(stop50.color.l).toBeLessThanOrEqual(0.96);
      expect(stop50.color.c).toBeLessThan(seed.color.c * 0.45);
      if (seedId === "cyan") {
        expect(stop50.color.c / maxChroma(stop50.color.l, stop50.color.h)).toBeGreaterThan(
          0.75,
        );
      }
      if (seedId === "phthalo-green") {
        expect(stop50.color.c / maxChroma(stop50.color.l, stop50.color.h)).toBeGreaterThan(
          0.62,
        );
      }
      expect(stop950.color.l).toBeGreaterThan(0.24);
      expect(stop950.color.c).toBeGreaterThan(0.025);
      expect(analysis.lightRamp.lightness.nonIncreasing).toBe(true);
    }
  });

  it("keeps local step spread tight for neutral stable seeds", () => {
    for (const seedId of ["warm-neutral", "cool-neutral"] as const) {
      const seed = RESEARCH_SEEDS.find((candidate) => candidate.id === seedId)!;
      const solved = solveV6ResearchRamp(researchSeedToRampConfig(seed));
      const analysis = analyzeRamp(solved.stops, seed);

      expect(analysis.lightRamp.adjacentDistance.worstAdjacentRatio).toBeLessThan(1.18);
      expect(analysis.lightRamp.adjacentDistance.worstThreeStepRatio).toBeLessThan(1.26);
      expect(analysis.seedPlacementImbalance).not.toBeNull();
      expect(analysis.seedPlacementImbalance!).toBeLessThan(0.25);
    }
  });

  it("keeps blue-violet ink cadence open without losing chroma", () => {
    const seed = RESEARCH_SEEDS.find((candidate) => candidate.id === "ultramarine")!;
    const solved = solveV6ResearchRamp(researchSeedToRampConfig(seed));
    const analysis = analyzeRamp(solved.stops, seed);
    const stop950 = solved.stops.find((stop) => stop.label === "950")!;

    expect(analysis.lightRamp.adjacentDistance.coefficientOfVariation).toBeLessThan(0.4);
    expect(analysis.lightRamp.adjacentDistance.worstThreeStepRatio).toBeLessThan(2.15);
    expect(stop950.color.l).toBeGreaterThan(0.23);
    expect(stop950.color.l).toBeLessThan(0.25);
    expect(stop950.color.c).toBeGreaterThan(0.11);
  });

  it("sanitizes out-of-gamut snapped seeds in both v6 result builders", () => {
    const config = {
      hue: 10,
      seedLightness: 0.78,
      seedChroma: 0.14,
      stopCount: 11 as const,
      mode: "opinionated" as const,
    };
    const rawSeed = {
      l: config.seedLightness,
      c: config.seedChroma,
      h: config.hue,
    };
    const expectedSeed = clampToGamut(rawSeed);

    expect(isInGamut(rawSeed)).toBe(false);

    for (const solved of [solveV6ResearchRamp(config), solveV6ArchetypeRamp(config)]) {
      const seedStop = solved.stops[solved.metadata.seedIndex];

      for (const stop of solved.stops) {
        expect(isInGamut(stop.color)).toBe(true);
        expect(isInGamut(stop.darkColor)).toBe(true);
      }

      expect(seedStop.color).toEqual(expectedSeed);
    }
  });

  it(
    "stays stable across a deterministic spread of in-gamut random seeds and stop counts",
    { timeout: 20000 },
    () => {
      const random = createSeededRandom(0x6d2b79f5);
      const stopCounts = [3, 5, 7, 9, 11, 13] as const;

      for (let index = 0; index < 12; index++) {
        const hue = random() * 360;
        const lightness = 0.12 + random() * 0.84;
        const chroma = maxChroma(lightness, hue) * (0.12 + random() * 0.68);
        const stopCount = stopCounts[index % stopCounts.length];
        const seed = {
          id: `random-${index}`,
          label: `Random ${index}`,
          note: "Deterministic hardening sample.",
          color: { l: lightness, c: chroma, h: hue },
        } as const;

        const solved = solveV6ResearchRamp(researchSeedToRampConfig(seed, { stopCount }));
        const analysis = analyzeRamp(solved.stops, seed);

        expect(solved.stops).toHaveLength(stopCount);
        expect(analysis.seedStopIndex).not.toBeNull();
        expect(solved.metadata.seedIndex).toBe(analysis.seedStopIndex);
        expect(analysis.seedDelta).toBeLessThan(1e-6);
        expect(analysis.lightRamp.lightness.nonIncreasing).toBe(true);
        expect(Number.isFinite(solved.metadata.score)).toBe(true);
        expect(Number.isFinite(solved.metadata.breakdown.total)).toBe(true);
        expect(analysis.lightRamp.adjacentDistance.worstAdjacentRatio).toBeLessThan(2.5);
        expect(analysis.lightRamp.adjacentDistance.worstThreeStepRatio).toBeLessThan(2.65);
        expect(analysis.lightRamp.adjacentDistance.lightEntranceRatio).toBeLessThan(2.65);
        expect(analysis.seedPlacementImbalance).not.toBeNull();
        expect(analysis.seedPlacementImbalance!).toBeLessThan(1.5);
      }
    },
  );
});
