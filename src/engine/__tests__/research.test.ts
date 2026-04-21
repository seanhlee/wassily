import { describe, expect, it } from "vitest";
import type { RampStop } from "../../types";
import {
  CURATED_FAMILY_PROFILE_FITS,
  CURATED_REFERENCE_CORPUS,
} from "../familyProfiles";
import { generateRamp } from "../ramp";
import {
  RESEARCH_SEEDS,
  analyzeRamp,
  evaluateSeed,
  evaluateSeedSuite,
  researchSeedToRampConfig,
} from "../research";

describe("research harness", () => {
  it("derives the target family profiles from a curated reference corpus", () => {
    expect(CURATED_REFERENCE_CORPUS.map((reference) => reference.id)).toEqual(
      expect.arrayContaining([
        "tw-lime-v3",
        "tw-yellow-v3",
        "wa-blue-bright",
        "wa-cyan-bright",
        "tw-cyan-v3",
        "wa-gray-bright",
        "tw-slate-v3",
        "tw-stone-v3",
      ]),
    );

    expect(CURATED_FAMILY_PROFILE_FITS.lime.referenceIds).toEqual([
      "tw-lime-v3",
      "tw-yellow-v3",
    ]);
    expect(CURATED_FAMILY_PROFILE_FITS.ultramarine.anchorLabels).toEqual(["600"]);
    expect(CURATED_FAMILY_PROFILE_FITS.cyan.referenceIds).toEqual([
      "wa-cyan-bright",
      "tw-cyan-v3",
    ]);
    expect(CURATED_FAMILY_PROFILE_FITS.neutral.referenceIds).toHaveLength(3);

    for (const fit of Object.values(CURATED_FAMILY_PROFILE_FITS)) {
      expect(fit.shoulderGeometry.references).toHaveLength(fit.referenceIds.length);
      expect(fit.shoulderGeometry.lightProgress).toBeGreaterThan(0);
      expect(fit.shoulderGeometry.lightProgress).toBeLessThan(1);
      expect(fit.shoulderGeometry.darkProgress).toBeGreaterThan(0);
      expect(fit.shoulderGeometry.darkProgress).toBeLessThan(1);
      expect(Number.isFinite(fit.shoulderGeometry.lightRadial)).toBe(true);
      expect(Number.isFinite(fit.shoulderGeometry.lightNormal)).toBe(true);
      expect(Number.isFinite(fit.shoulderGeometry.darkRadial)).toBe(true);
      expect(Number.isFinite(fit.shoulderGeometry.darkNormal)).toBe(true);
    }

    expect(CURATED_FAMILY_PROFILE_FITS.neutral.profile.lightShoulderRadial).toBe(0);
    expect(CURATED_FAMILY_PROFILE_FITS.neutral.profile.lightShoulderNormal).toBe(0);
    expect(CURATED_FAMILY_PROFILE_FITS.neutral.profile.darkShoulderRadial).toBe(0);
    expect(CURATED_FAMILY_PROFILE_FITS.neutral.profile.darkShoulderNormal).toBe(0);
  });

  it("includes the documented hard-color seed suite", () => {
    expect(RESEARCH_SEEDS.map((seed) => seed.id)).toEqual(
      expect.arrayContaining([
        "bright-lime",
        "cadmium-yellow",
        "cyan",
        "violet",
        "ultramarine",
        "phthalo-green",
        "warm-neutral",
        "cool-neutral",
        "very-light-seed",
        "very-dark-seed",
      ]),
    );
  });

  it("builds a seeded ramp config from a research seed", () => {
    const seed = RESEARCH_SEEDS.find((candidate) => candidate.id === "bright-lime")!;
    const config = researchSeedToRampConfig(seed);

    expect(config.hue).toBe(seed.color.h);
    expect(config.seedChroma).toBe(seed.color.c);
    expect(config.seedLightness).toBe(seed.color.l);
    expect(config.stopCount).toBe(11);
    expect(config.mode).toBe("opinionated");
  });

  it("evaluates a seed with finite metrics and exact seed placement", () => {
    const seed = RESEARCH_SEEDS.find((candidate) => candidate.id === "ultramarine")!;
    const analysis = evaluateSeed(seed);

    expect(analysis.seedStopIndex).not.toBeNull();
    expect(analysis.seedDelta).toBeLessThan(1e-6);
    expect(analysis.labels).toHaveLength(11);
    expect(analysis.lightRamp.adjacentDistance.mean).toBeGreaterThan(0);
    expect(Number.isFinite(analysis.lightRamp.adjacentDistance.variance)).toBe(true);
    expect(analysis.lightRamp.gamutViolations).toBe(0);
    expect(analysis.darkRamp.gamutViolations).toBe(0);
    expect(analysis.endpointLight.relativeChroma).toBeGreaterThanOrEqual(0);
    expect(analysis.endpointLight.relativeChroma).toBeLessThanOrEqual(1.001);
    expect(analysis.endpointDark.relativeChroma).toBeGreaterThanOrEqual(0);
    expect(analysis.endpointDark.relativeChroma).toBeLessThanOrEqual(1.001);
  });

  it("evaluates the whole seed suite", { timeout: 20000 }, () => {
    const results = evaluateSeedSuite();

    expect(Object.keys(results)).toHaveLength(RESEARCH_SEEDS.length);
    for (const seed of RESEARCH_SEEDS) {
      expect(results[seed.id]).toBeDefined();
      expect(results[seed.id].labels.length).toBe(11);
    }
  });

  it("detects non-descending lightness on a contrived ramp fixture", () => {
    const stops: RampStop[] = [
      {
        index: 0,
        label: "50",
        color: { l: 0.96, c: 0.03, h: 250 },
        darkColor: { l: 0.92, c: 0.03, h: 250 },
      },
      {
        index: 1,
        label: "100",
        color: { l: 0.97, c: 0.04, h: 250 },
        darkColor: { l: 0.9, c: 0.04, h: 250 },
      },
      {
        index: 2,
        label: "200",
        color: { l: 0.9, c: 0.05, h: 250 },
        darkColor: { l: 0.84, c: 0.05, h: 250 },
      },
    ];

    const analysis = analyzeRamp(stops);

    expect(analysis.lightRamp.lightness.strictlyDescending).toBe(false);
    expect(analysis.lightRamp.lightness.nonIncreasing).toBe(false);
    expect(analysis.lightRamp.lightness.violations).toBeGreaterThan(0);
  });

  it("eliminates the old top-end plateau for the very-light seed ramp", () => {
    const seed = RESEARCH_SEEDS.find((candidate) => candidate.id === "very-light-seed")!;
    const analysis = analyzeRamp(generateRamp(researchSeedToRampConfig(seed)), seed);

    expect(analysis.seedDelta).toBeLessThan(1e-6);
    expect(analysis.endpointLight.lightness).toBeGreaterThanOrEqual(seed.color.l);
    expect(analysis.lightRamp.lightness.nonIncreasing).toBe(true);
    expect(analysis.lightRamp.lightness.flatSteps).toBeLessThanOrEqual(1);
    expect(analysis.lightRamp.adjacentDistance.lightEntranceRatio).toBeLessThan(1.03);
  });

  it("uses cusp-aware top endpoints so narrow-near-white hues carry color", () => {
    const ultramarine = evaluateSeed(
      RESEARCH_SEEDS.find((candidate) => candidate.id === "ultramarine")!,
    );
    const brightLime = evaluateSeed(
      RESEARCH_SEEDS.find((candidate) => candidate.id === "bright-lime")!,
    );

    expect(ultramarine.endpointLight.chroma).toBeGreaterThan(0.015);
    expect(ultramarine.endpointLight.relativeChroma).toBeGreaterThan(0.85);

    expect(brightLime.endpointLight.lightness).toBeGreaterThan(0.96);
    expect(brightLime.endpointLight.chroma).toBeGreaterThan(0.04);
  });

  it("applies family-aware dark behavior for lime, ultramarine, cyan, and neutral", () => {
    const lime = evaluateSeed(
      RESEARCH_SEEDS.find((candidate) => candidate.id === "bright-lime")!,
    );
    const ultramarine = evaluateSeed(
      RESEARCH_SEEDS.find((candidate) => candidate.id === "ultramarine")!,
    );
    const cyan = evaluateSeed(
      RESEARCH_SEEDS.find((candidate) => candidate.id === "cyan")!,
    );
    const warmNeutral = evaluateSeed(
      RESEARCH_SEEDS.find((candidate) => candidate.id === "warm-neutral")!,
    );
    const coolNeutral = evaluateSeed(
      RESEARCH_SEEDS.find((candidate) => candidate.id === "cool-neutral")!,
    );

    const limeDark = lime.lightRamp.colors.at(-1)!;
    expect(limeDark.h).toBeGreaterThan(110);
    expect(lime.endpointDark.relativeChroma).toBeGreaterThan(0.95);

    const ultramarineDark = ultramarine.lightRamp.colors.at(-1)!;
    expect(Math.abs(ultramarineDark.h - 265)).toBeLessThan(3);
    expect(ultramarineDark.c).toBeGreaterThan(0.01);

    const cyanDark = cyan.lightRamp.colors.at(-1)!;
    expect(cyan.lightRamp.maxHueDriftFromSeed).toBeLessThan(15);
    expect(cyanDark.h).toBeGreaterThan(205);

    expect(warmNeutral.endpointLight.chroma).toBeLessThan(0.005);
    expect(warmNeutral.endpointDark.chroma).toBeLessThan(0.02);
    expect(coolNeutral.endpointLight.chroma).toBeLessThan(0.005);
    expect(coolNeutral.endpointDark.chroma).toBeLessThan(0.02);
  });
});
