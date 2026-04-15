import { describe, expect, it } from "vitest";
import { RESEARCH_SEEDS, analyzeRamp, researchSeedToRampConfig } from "../research";
import { isInGamut } from "../gamut";
import { distanceLab, toLabVector } from "../pathGeometry";
import { solveV6ResearchRamp } from "../v6ResearchSolver";

describe("v6 research solver", () => {
  it("keeps the exact seed as a hard constraint for representative chromatic seeds", () => {
    for (const seedId of ["bright-lime", "cyan", "ultramarine"] as const) {
      const seed = RESEARCH_SEEDS.find((candidate) => candidate.id === seedId)!;
      const solved = solveV6ResearchRamp(researchSeedToRampConfig(seed));
      const analysis = analyzeRamp(solved.stops, seed);
      const expectedGamutViolations = isInGamut(seed.color) ? 0 : 1;

      expect(analysis.seedStopIndex).not.toBeNull();
      expect(analysis.seedDelta).toBeLessThan(1e-6);
      expect(analysis.lightRamp.gamutViolations).toBe(expectedGamutViolations);
      expect(analysis.lightRamp.lightness.nonIncreasing).toBe(true);
      expect(solved.metadata.seedIndex).toBe(analysis.seedStopIndex);
      expect(Number.isFinite(solved.metadata.breakdown.total)).toBe(true);
      expect(
        Number.isFinite(solved.metadata.breakdown.continuousSpacingDistortion),
      ).toBe(true);
      expect(Number.isFinite(solved.metadata.breakdown.spacingDistortion)).toBe(true);
      expect(Number.isFinite(solved.metadata.breakdown.lightEntrancePenalty)).toBe(true);
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
      expect(analysis.lightRamp.lightness.nonIncreasing).toBe(true);
      expect(solved.metadata.lightBudget).toBeGreaterThan(0);
      expect(solved.metadata.darkBudget).toBeGreaterThan(0);
      expect(solved.metadata.breakdown.selectedSoftPriorPenalty).toBeGreaterThan(0);
      expect(solved.metadata.softPrior.parameterPenalty).toBeGreaterThan(0);
    }
  });

  it("avoids a front-loaded perceptual jump at the light entrance for representative seeds", () => {
    for (const seedId of ["warm-neutral", "cool-neutral", "cyan"] as const) {
      const seed = RESEARCH_SEEDS.find((candidate) => candidate.id === seedId)!;
      const solved = solveV6ResearchRamp(researchSeedToRampConfig(seed));
      const distances = solved.stops.slice(1).map((stop, index) =>
        distanceLab(toLabVector(solved.stops[index].color), toLabVector(stop.color)),
      );
      const averageDistance =
        distances.reduce((sum, distance) => sum + distance, 0) / distances.length;

      expect(distances[0] / averageDistance).toBeLessThan(1.08);
      expect(distances[1] / averageDistance).toBeLessThan(1.08);
    }
  });
});
