import { describe, expect, it } from "vitest";
import type { OklchColor } from "../../types";
import { maxChroma } from "../gamut";
import { distanceLab, toLabVector } from "../pathGeometry";
import {
  analyzeRamp,
  RESEARCH_SEEDS,
  researchSeedToRampConfig,
  type ResearchSeed,
} from "../research";
import {
  solveContinuousCompressedRamp,
  solveContinuousCurveRamp,
} from "../continuousCurveSolver";

function seedById(id: string) {
  const seed = RESEARCH_SEEDS.find((candidate) => candidate.id === id);
  if (!seed) throw new Error(`Missing research seed: ${id}`);
  return seed;
}

function colorDistance(a: Parameters<typeof toLabVector>[0], b: Parameters<typeof toLabVector>[0]) {
  return distanceLab(toLabVector(a), toLabVector(b));
}

function circularHueDelta(a: number, b: number): number {
  const delta = Math.abs((((a - b) % 360) + 540) % 360 - 180);
  return delta;
}

function relativeChroma(color: OklchColor) {
  const available = maxChroma(color.l, color.h);
  return available > 0 ? color.c / available : 0;
}

describe("continuous curve solver", () => {
  it("passes exactly through the seed while keeping the visible ramp monotone", { timeout: 20000 }, () => {
    for (const seedId of [
      "bright-lime",
      "cadmium-yellow",
      "cyan",
      "phthalo-green",
      "ultramarine",
      "violet",
    ]) {
      const seed = seedById(seedId);
      const solved = solveContinuousCurveRamp(researchSeedToRampConfig(seed));
      const analysis = analyzeRamp(solved.stops, seed);

      expect(solved.metadata.solver).toBe("continuous-curve");
      expect(analysis.seedDelta).toBeLessThan(1e-6);
      expect(analysis.lightRamp.lightness.nonIncreasing).toBe(true);
      expect(analysis.lightRamp.gamutViolations).toBe(0);
      expect(analysis.darkRamp.gamutViolations).toBe(0);
    }
  });

  it("keeps the compressed curve seed-exact while lowering boundary pressure", { timeout: 30000 }, () => {
    const pressureSeeds: ResearchSeed[] = [
      {
        id: "ochre-pressure",
        label: "Ochre Pressure",
        note: "Earth yellow that can ride the highlight gamut wall.",
        color: { l: 0.7, c: 0.115, h: 82 },
      },
      {
        id: "aqua-pressure",
        label: "Aqua Pressure",
        note: "Electric blue-green that can crowd the high-lightness gamut wall.",
        color: { l: 0.8, c: 0.13, h: 195 },
      },
      {
        id: "pine-pressure",
        label: "Pine Pressure",
        note: "Deep muted green with a high-pressure highlight path.",
        color: { l: 0.38, c: 0.095, h: 155 },
      },
    ];

    for (const seed of pressureSeeds) {
      const curve = solveContinuousCurveRamp(researchSeedToRampConfig(seed));
      const compressed = solveContinuousCompressedRamp(
        researchSeedToRampConfig(seed),
      );
      const curveAnalysis = analyzeRamp(curve.stops, seed);
      const compressedAnalysis = analyzeRamp(compressed.stops, seed);

      expect(compressed.metadata.solver).toBe("continuous-compressed");
      expect(compressedAnalysis.seedDelta).toBeLessThan(1e-6);
      expect(compressedAnalysis.lightRamp.lightness.nonIncreasing).toBe(true);
      expect(compressedAnalysis.lightRamp.gamutViolations).toBe(0);
      expect(compressedAnalysis.lightRamp.gamutPressure.max).toBeLessThanOrEqual(
        curveAnalysis.lightRamp.gamutPressure.max + 0.001,
      );
      expect(compressedAnalysis.lightRamp.adjacentDistance.worstAdjacentRatio).toBeLessThan(
        1.15,
      );
      if (seed.id === "aqua-pressure") {
        expect(compressed.stops[0].color.c).toBeGreaterThanOrEqual(
          curve.stops[0].color.c * 0.98,
        );
        expect(compressed.stops[0].color.l).toBeLessThan(curve.stops[0].color.l);
      }
    }
  });

  it("treats stop count as sampling resolution over the same canonical curve", { timeout: 20000 }, () => {
    const seed = seedById("cyan");
    const eleven = solveContinuousCurveRamp(
      researchSeedToRampConfig(seed, { stopCount: 11 }),
    );
    const thirteen = solveContinuousCurveRamp(
      researchSeedToRampConfig(seed, { stopCount: 13 }),
    );

    expect(eleven.stops).toHaveLength(11);
    expect(thirteen.stops).toHaveLength(13);
    expect(colorDistance(eleven.stops[0].color, thirteen.stops[0].color)).toBeLessThan(
      1e-6,
    );
    expect(
      colorDistance(eleven.stops.at(-1)!.color, thirteen.stops.at(-1)!.color),
    ).toBeLessThan(1e-6);
    expect(eleven.metadata.totalBudget).toBeCloseTo(thirteen.metadata.totalBudget, 6);
  });

  it("inherits the locked fairing seed placement instead of optimizing the seed to an endpoint", { timeout: 20000 }, () => {
    const expectedAnchors = new Map([
      ["bright-lime", "200"],
      ["cadmium-yellow", "200"],
      ["cyan", "300"],
      ["ultramarine", "700"],
    ]);

    for (const [seedId, label] of expectedAnchors) {
      const seed = seedById(seedId);
      const solved = solveContinuousCurveRamp(researchSeedToRampConfig(seed));
      const analysis = analyzeRamp(solved.stops, seed);

      expect(analysis.labels[analysis.seedStopIndex!]).toBe(label);
    }
  });

  it("places highlight-edge anchors at 50 instead of manufacturing a 50/100 shelf", { timeout: 20000 }, () => {
    const highlightEdgeSeeds: ResearchSeed[] = [
      seedById("very-light-seed"),
      {
        id: "highlight-edge-warm",
        label: "Highlight Edge Warm",
        note: "Very light warm seed with too little room above it for a separate highlight stop.",
        color: { l: 0.975, c: 0.038, h: 55 },
      },
      {
        id: "highlight-edge-cool",
        label: "Highlight Edge Cool",
        note: "Very light cool seed with too little room above it for a separate highlight stop.",
        color: { l: 0.975, c: 0.038, h: 215 },
      },
      {
        id: "highlight-edge-pink",
        label: "Highlight Edge Pink",
        note: "Very light pink seed with too little room above it for a separate highlight stop.",
        color: { l: 0.975, c: 0.038, h: 330 },
      },
    ];

    for (const seed of highlightEdgeSeeds) {
      const solved = solveContinuousCurveRamp(researchSeedToRampConfig(seed));
      const analysis = analyzeRamp(solved.stops, seed);
      const [topDistance, bridgeDistance] = analysis.lightRamp.adjacentDistance.values;
      const topBridgeRatio = topDistance / bridgeDistance;

      expect(analysis.labels[analysis.seedStopIndex!]).toBe("50");
      expect(analysis.seedDelta).toBeLessThan(1e-6);
      expect(analysis.lightRamp.lightness.flatSteps).toBe(0);
      expect(analysis.lightRamp.adjacentDistance.coefficientOfVariation).toBeLessThan(
        0.025,
      );
      expect(analysis.lightRamp.adjacentDistance.worstAdjacentRatio).toBeLessThan(1.08);
      expect(topBridgeRatio).toBeGreaterThanOrEqual(0.95);
      expect(topBridgeRatio).toBeLessThanOrEqual(1.06);
    }
  });

  it("keeps top-edge hard cases smooth without making paper the escape hatch", { timeout: 20000 }, () => {
    const expectations = new Map([
      ["cadmium-yellow", { minChroma: 0.025, maxWorstAdjacentRatio: 1.06 }],
      ["ultramarine", { minChroma: 0.006, maxWorstAdjacentRatio: 1.04 }],
    ]);

    for (const [seedId, expectation] of expectations) {
      const seed = seedById(seedId);
      const solved = solveContinuousCurveRamp(researchSeedToRampConfig(seed));
      const analysis = analyzeRamp(solved.stops, seed);
      const [topDistance, bridgeDistance] = analysis.lightRamp.adjacentDistance.values;
      const topBridgeRatio = topDistance / bridgeDistance;

      expect(analysis.seedDelta).toBeLessThan(1e-6);
      expect(analysis.lightRamp.adjacentDistance.coefficientOfVariation).toBeLessThan(
        0.02,
      );
      expect(analysis.lightRamp.adjacentDistance.worstAdjacentRatio).toBeLessThan(
        expectation.maxWorstAdjacentRatio,
      );
      expect(topBridgeRatio).toBeGreaterThanOrEqual(0.97);
      expect(topBridgeRatio).toBeLessThanOrEqual(1.04);
      expect(solved.stops[0].color.c).toBeGreaterThan(expectation.minChroma);
    }
  });

  it("restrains warm cusp highlights without flattening them into neutral paper", { timeout: 20000 }, () => {
    const expectations = new Map([
      ["bright-lime", { minChroma: 0.045, maxEndpointOccupancy: 0.58, maxBridgeOccupancy: 0.9 }],
      [
        "cadmium-yellow",
        {
          minChroma: 0.024,
          maxEndpointOccupancy: 0.65,
          maxBridgeOccupancy: 0.95,
          minWarmHueShift: 6,
        },
      ],
    ]);

    for (const [seedId, expectation] of expectations) {
      const seed = seedById(seedId);
      const solved = solveContinuousCurveRamp(researchSeedToRampConfig(seed));
      const analysis = analyzeRamp(solved.stops, seed);
      const [topDistance, bridgeDistance] = analysis.lightRamp.adjacentDistance.values;
      const topBridgeRatio = topDistance / bridgeDistance;

      expect(topBridgeRatio).toBeGreaterThanOrEqual(0.97);
      expect(topBridgeRatio).toBeLessThanOrEqual(1.04);
      expect(solved.stops[0].color.c).toBeGreaterThan(expectation.minChroma);
      expect(relativeChroma(solved.stops[0].color)).toBeLessThan(
        expectation.maxEndpointOccupancy,
      );
      expect(relativeChroma(solved.stops[1].color)).toBeLessThan(
        expectation.maxBridgeOccupancy,
      );
      if (expectation.minWarmHueShift !== undefined) {
        expect(circularHueDelta(solved.stops[0].color.h, seed.color.h)).toBeGreaterThan(
          expectation.minWarmHueShift,
        );
      }
    }
  });

  it("keeps saturated warm red highlights blushed instead of paper", { timeout: 20000 }, () => {
    const redFamilySeeds: Array<{
      seed: ResearchSeed;
      anchor: string;
      minEndpointChroma: number;
      minEndpointOccupancy: number;
      minTailChroma: number;
    }> = [
      {
        seed: {
          id: "orange-pressure",
          label: "Orange Pressure",
          note: "Saturated orange body color; checks tan highlights and muddy shadows.",
          color: { l: 0.68, c: 0.18, h: 48 },
        },
        anchor: "400",
        minEndpointChroma: 0.014,
        minEndpointOccupancy: 0.52,
        minTailChroma: 0.05,
      },
      {
        seed: {
          id: "coral-pressure",
          label: "Coral Pressure",
          note: "Red-orange brand color where highlights can become peach paper.",
          color: { l: 0.7, c: 0.16, h: 32 },
        },
        anchor: "400",
        minEndpointChroma: 0.013,
        minEndpointOccupancy: 0.52,
        minTailChroma: 0.07,
      },
      {
        seed: {
          id: "red-pressure",
          label: "Red Pressure",
          note: "Vivid red with difficult pink highlights and dark heat retention.",
          color: { l: 0.6, c: 0.21, h: 28 },
        },
        anchor: "500",
        minEndpointChroma: 0.014,
        minEndpointOccupancy: 0.52,
        minTailChroma: 0.075,
      },
    ];

    for (const expectation of redFamilySeeds) {
      const solved = solveContinuousCurveRamp(
        researchSeedToRampConfig(expectation.seed),
      );
      const analysis = analyzeRamp(solved.stops, expectation.seed);
      const [topDistance, bridgeDistance] = analysis.lightRamp.adjacentDistance.values;
      const topBridgeRatio = topDistance / bridgeDistance;
      const lightEndpoint = solved.stops[0].color;
      const darkEndpoint = solved.stops.at(-1)!.color;

      expect(analysis.labels[analysis.seedStopIndex!]).toBe(expectation.anchor);
      expect(analysis.seedDelta).toBeLessThan(1e-6);
      expect(topBridgeRatio).toBeGreaterThanOrEqual(0.97);
      expect(topBridgeRatio).toBeLessThanOrEqual(1.04);
      expect(analysis.lightRamp.adjacentDistance.worstAdjacentRatio).toBeLessThan(1.08);
      expect(lightEndpoint.l).toBeLessThanOrEqual(0.958);
      expect(lightEndpoint.c).toBeGreaterThan(expectation.minEndpointChroma);
      expect(relativeChroma(lightEndpoint)).toBeGreaterThan(
        expectation.minEndpointOccupancy,
      );
      expect(circularHueDelta(lightEndpoint.h, expectation.seed.color.h)).toBeLessThan(6);
      expect(darkEndpoint.c).toBeGreaterThan(expectation.minTailChroma);
      expect(circularHueDelta(darkEndpoint.h, expectation.seed.color.h)).toBeLessThan(2);
    }
  });

  it("keeps bright cyan highlights colored instead of glassy white", { timeout: 20000 }, () => {
    const cyanFamilySeeds: Array<{
      seed: ResearchSeed;
      anchor: string;
      maxEndpointLightness: number;
      minEndpointChroma: number;
      minTailChroma: number;
    }> = [
      {
        seed: seedById("cyan"),
        anchor: "300",
        maxEndpointLightness: 0.965,
        minEndpointChroma: 0.03,
        minTailChroma: 0.035,
      },
      {
        seed: {
          id: "sky-blue-pressure",
          label: "Sky Blue Pressure",
          note: "Clean blue-cyan highlight family.",
          color: { l: 0.72, c: 0.13, h: 230 },
        },
        anchor: "400",
        maxEndpointLightness: 0.965,
        minEndpointChroma: 0.015,
        minTailChroma: 0.04,
      },
      {
        seed: {
          id: "blue-cyan-pressure",
          label: "Blue Cyan Pressure",
          note: "Blue-leaning cyan perturbation.",
          color: { l: 0.76, c: 0.13, h: 220 },
        },
        anchor: "300",
        maxEndpointLightness: 0.965,
        minEndpointChroma: 0.018,
        minTailChroma: 0.035,
      },
    ];

    for (const expectation of cyanFamilySeeds) {
      const solved = solveContinuousCurveRamp(
        researchSeedToRampConfig(expectation.seed),
      );
      const analysis = analyzeRamp(solved.stops, expectation.seed);
      const [topDistance, bridgeDistance] = analysis.lightRamp.adjacentDistance.values;
      const topBridgeRatio = topDistance / bridgeDistance;
      const lightEndpoint = solved.stops[0].color;
      const darkEndpoint = solved.stops.at(-1)!.color;

      expect(analysis.labels[analysis.seedStopIndex!]).toBe(expectation.anchor);
      expect(analysis.seedDelta).toBeLessThan(1e-6);
      expect(topBridgeRatio).toBeGreaterThanOrEqual(0.97);
      expect(topBridgeRatio).toBeLessThanOrEqual(1.04);
      expect(analysis.lightRamp.adjacentDistance.worstAdjacentRatio).toBeLessThan(1.1);
      expect(lightEndpoint.l).toBeLessThanOrEqual(expectation.maxEndpointLightness);
      expect(lightEndpoint.c).toBeGreaterThan(expectation.minEndpointChroma);
      expect(circularHueDelta(lightEndpoint.h, expectation.seed.color.h)).toBeLessThan(3);
      expect(darkEndpoint.c).toBeGreaterThan(expectation.minTailChroma);
      expect(circularHueDelta(darkEndpoint.h, expectation.seed.color.h)).toBeLessThan(3);
    }
  });

  it("keeps deep blue highlights visibly blue instead of falling back to paper", { timeout: 20000 }, () => {
    const seed = seedById("ultramarine");
    const solved = solveContinuousCurveRamp(researchSeedToRampConfig(seed));
    const analysis = analyzeRamp(solved.stops, seed);
    const [topDistance, bridgeDistance] = analysis.lightRamp.adjacentDistance.values;
    const topBridgeRatio = topDistance / bridgeDistance;
    const lightEndpoint = solved.stops[0].color;

    expect(analysis.labels[analysis.seedStopIndex!]).toBe("700");
    expect(topBridgeRatio).toBeGreaterThanOrEqual(0.97);
    expect(topBridgeRatio).toBeLessThanOrEqual(1.04);
    expect(lightEndpoint.l).toBeLessThan(0.95);
    expect(lightEndpoint.c).toBeGreaterThan(0.018);
    expect(relativeChroma(lightEndpoint)).toBeGreaterThan(0.7);
    expect(relativeChroma(lightEndpoint)).toBeLessThan(0.8);
    expect(circularHueDelta(lightEndpoint.h, seed.color.h)).toBeLessThan(2);
  });

  it("keeps direct endpoint search in the seed family instead of crossing through neutral", { timeout: 20000 }, () => {
    const purple: ResearchSeed = {
      id: "purple-regression",
      label: "Purple Regression",
      note: "Catches endpoint search overshooting pale violet highlights into yellow paper.",
      color: { l: 0.58, c: 0.18, h: 295 },
    };
    const solved = solveContinuousCurveRamp(researchSeedToRampConfig(purple));
    const lightEndpoint = solved.stops[0].color;

    if (lightEndpoint.c > 0.015) {
      expect(circularHueDelta(lightEndpoint.h, purple.color.h)).toBeLessThan(45);
    }
  });
});
