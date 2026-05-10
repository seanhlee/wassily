import { describe, it, expect } from "vitest";
import {
  maxChroma,
  chromaPeakLightness,
  isInGamut,
  clampToGamut,
  toHex,
  toOklchString,
  toDisplayP3String,
  parseColor,
} from "../gamut";
import { purify, purifyColor, randomPurifiedColor } from "../purify";
import { generateRamp, nameForHue, solveRamp, uniqueRampName } from "../ramp";
import {
  contrastRatio,
  checkContrast,
  swatchDots,
  WHITE,
  BLACK,
} from "../contrast";
import { harmonizePair, harmonizeMultiple } from "../harmonize";
import { RESEARCH_SEEDS, analyzeRamp, researchSeedToRampConfig } from "../research";
import type { OklchColor } from "../../types";

function circularHueDistance(a: number, b: number): number {
  const delta = Math.abs(a - b) % 360;
  return Math.min(delta, 360 - delta);
}

// ---- Gamut ----

describe("gamut", () => {
  it("maxChroma returns a positive value for any hue at mid lightness", () => {
    for (let h = 0; h < 360; h += 30) {
      const c = maxChroma(0.55, h);
      expect(c).toBeGreaterThan(0);
      expect(c).toBeLessThan(0.4);
    }
  });

  it("maxChroma is zero at L=0 and L=1", () => {
    expect(maxChroma(0, 0)).toBeLessThan(0.01);
    expect(maxChroma(1, 0)).toBeLessThan(0.01);
  });

  it("yellow has higher max chroma at high lightness than blue", () => {
    const yellowC = maxChroma(0.9, 90);
    const blueC = maxChroma(0.9, 260);
    expect(yellowC).toBeGreaterThan(blueC);
  });

  it("chromaPeakLightness finds a reasonable peak for blue", () => {
    const peak = chromaPeakLightness(260);
    expect(peak.l).toBeGreaterThan(0.3);
    expect(peak.l).toBeLessThan(0.7);
    expect(peak.maxC).toBeGreaterThan(0.1);
  });

  it("clampToGamut always produces in-gamut colors", () => {
    const outOfGamut: OklchColor = { l: 0.7, c: 0.35, h: 260 };
    const clamped = clampToGamut(outOfGamut);
    expect(isInGamut(clamped)).toBe(true);
    expect(clamped.c).toBeLessThan(outOfGamut.c);
    expect(clamped.l).toBeCloseTo(outOfGamut.l, 1);
  });

  it("distinguishes sRGB and display-p3 gamut boundaries", () => {
    const vividOrange: OklchColor = { l: 0.705, c: 0.213, h: 47.604 };

    expect(isInGamut(vividOrange)).toBe(false);
    expect(isInGamut(vividOrange, "display-p3")).toBe(true);

    const srgb = clampToGamut(vividOrange);
    const displayP3 = clampToGamut(vividOrange, "display-p3");

    expect(srgb.c).toBeLessThan(vividOrange.c);
    expect(displayP3.c).toBeCloseTo(vividOrange.c, 3);
    expect(maxChroma(vividOrange.l, vividOrange.h, "display-p3")).toBeGreaterThan(
      maxChroma(vividOrange.l, vividOrange.h),
    );
    expect(toDisplayP3String(vividOrange)).toMatch(/^color\(display-p3 /);
  });

  it("toHex produces valid uppercase hex strings", () => {
    const hex = toHex({ l: 0.55, c: 0.2, h: 260 });
    expect(hex).toMatch(/^#[0-9A-F]{6}$/);
  });

  it("toOklchString produces valid CSS oklch()", () => {
    const str = toOklchString({ l: 0.55, c: 0.229, h: 261.3 });
    expect(str).toMatch(/^oklch\(\d+\.\d+ \d+\.\d+ \d+\.\d+\)$/);
  });

  it("parseColor handles hex input", () => {
    const color = parseColor("#0059E9");
    expect(color).not.toBeNull();
    expect(color!.h).toBeGreaterThan(240);
    expect(color!.h).toBeLessThan(280);
  });

  it("parseColor handles oklch input", () => {
    const color = parseColor("oklch(0.55 0.229 261.3)");
    expect(color).not.toBeNull();
    expect(color!.l).toBeCloseTo(0.55, 1);
    expect(color!.h).toBeCloseTo(261.3, 0);
  });

  it("parseColor handles bare hue angle", () => {
    const color = parseColor("180");
    expect(color).not.toBeNull();
    expect(color!.h).toBe(180);
    expect(color!.l).toBeCloseTo(0.55, 1);
  });

  it("parseColor returns null for garbage", () => {
    expect(parseColor("notacolor")).toBeNull();
  });
});

// ---- Purification ----

describe("purification", () => {
  it("purify increases chroma of a desaturated color", () => {
    const muddy: OklchColor = { l: 0.55, c: 0.05, h: 260 };
    const result = purify(muddy);
    expect(result.purified.c).toBeGreaterThan(muddy.c);
    expect(result.chromaGain).toBeGreaterThan(0);
  });

  it("purify preserves hue exactly", () => {
    const color: OklchColor = { l: 0.55, c: 0.05, h: 123.4 };
    const result = purify(color);
    expect(result.purified.h).toBe(123.4);
  });

  it("purified color is always in gamut", () => {
    for (let h = 0; h < 360; h += 15) {
      const color: OklchColor = { l: 0.5, c: 0.01, h };
      const purified = purifyColor(color);
      expect(isInGamut(purified)).toBe(true);
    }
  });

  it("randomPurifiedColor produces in-gamut colors", () => {
    for (let i = 0; i < 20; i++) {
      const color = randomPurifiedColor();
      expect(isInGamut(color)).toBe(true);
      expect(color.c).toBeGreaterThan(0.05);
    }
  });
});

// ---- Ramp Generation ----

describe("ramp generation", () => {
  it("generates 11 stops for the default preset", () => {
    const stops = generateRamp({
      hue: 260,
      stopCount: 11,
      mode: "opinionated",
    });
    expect(stops).toHaveLength(11);
    expect(stops[0].label).toBe("50");
    expect(stops[10].label).toBe("950");
  });

  it("generates correct stop counts for all presets", () => {
    for (const count of [3, 5, 7, 9, 11, 13] as const) {
      const stops = generateRamp({
        hue: 180,
        stopCount: count,
        mode: "pure",
      });
      expect(stops).toHaveLength(count);
    }
  });

  it("uses expanded bridge labels for the 13-stop preset", () => {
    const stops = generateRamp({
      hue: 210,
      stopCount: 13,
      mode: "opinionated",
    });

    expect(stops.map((stop) => stop.label)).toEqual([
      "50",
      "75",
      "100",
      "200",
      "300",
      "400",
      "500",
      "600",
      "700",
      "800",
      "900",
      "925",
      "950",
    ]);
  });

  it("preserves legacy custom labels for one- and two-stop ramps in both modes", () => {
    for (const mode of ["opinionated", "pure"] as const) {
      expect(generateRamp({ hue: 180, stopCount: 1, mode }).map((stop) => stop.label)).toEqual([
        "500",
      ]);
      expect(generateRamp({ hue: 180, stopCount: 2, mode }).map((stop) => stop.label)).toEqual([
        "200",
        "800",
      ]);
    }
  });

  it("all ramp colors are in gamut", { timeout: 20000 }, () => {
    for (let h = 0; h < 360; h += 60) {
      const stops = generateRamp({
        hue: h,
        stopCount: 11,
        mode: "opinionated",
      });
      for (const stop of stops) {
        expect(isInGamut(stop.color)).toBe(true);
        expect(isInGamut(stop.darkColor)).toBe(true);
      }
    }
  });

  it("lightness decreases monotonically across stops", () => {
    const stops = generateRamp({
      hue: 260,
      stopCount: 11,
      mode: "opinionated",
    });
    for (let i = 1; i < stops.length; i++) {
      expect(stops[i].color.l).toBeLessThan(stops[i - 1].color.l);
    }
  });

  it("opinionated mode routes through the brand-exact fairing path", { timeout: 10000 }, () => {
    for (const seedId of ["bright-lime", "cyan", "very-light-seed"] as const) {
      const seed = RESEARCH_SEEDS.find((candidate) => candidate.id === seedId)!;
      const stops = generateRamp(researchSeedToRampConfig(seed));
      const analysis = analyzeRamp(stops, seed);

      expect(analysis.seedStopIndex).not.toBeNull();
      if (isInGamut(seed.color)) {
        expect(analysis.seedDelta).toBeLessThan(1e-6);
      } else {
        expect(stops[analysis.seedStopIndex!].color).toEqual(clampToGamut(seed.color));
      }
      expect(analysis.lightRamp.gamutViolations).toBe(0);
      expect(analysis.lightRamp.lightness.nonIncreasing).toBe(true);
    }
  });

  it("solveRamp preserves generateRamp compatibility while reporting sRGB exactness", () => {
    const seed = RESEARCH_SEEDS.find((candidate) => candidate.id === "bright-lime")!;
    const config = researchSeedToRampConfig(seed);
    const solved = solveRamp(config);

    expect(generateRamp(config)).toEqual(solved.stops);
    expect(solved.metadata.solver).toBe("brand-exact-fair");
    expect(solved.metadata.targetGamut).toBe("srgb");
    expect(solved.metadata.seedLabel).toBe(solved.stops[solved.metadata.seedIndex].label);
    expect(solved.metadata.seedDelta.target).toBeLessThan(1e-6);
    expect(solved.metadata.seedDelta.source).toBeGreaterThanOrEqual(
      solved.metadata.seedDelta.target,
    );
    expect(["source-exact", "target-mapped"]).toContain(solved.metadata.exactness);
  });

  it("solveRamp supports P3 source exactness and dual sRGB fallback metadata", () => {
    const config = {
      hue: 47.604,
      seedChroma: 0.213,
      seedLightness: 0.705,
      stopCount: 11,
      mode: "opinionated",
    } as const;

    const p3 = solveRamp({ ...config, targetGamut: "display-p3" });

    expect(generateRamp({ ...config, targetGamut: "display-p3" })).toEqual(p3.stops);
    expect(p3.metadata.targetGamut).toBe("display-p3");
    expect(p3.metadata.exactness).toBe("source-exact");
    expect(p3.metadata.seedDelta.source).toBeLessThan(1e-6);
    expect(p3.metadata.seedDelta.target).toBeLessThan(1e-6);
    expect(p3.metadata.seedDelta.fallback).toBeUndefined();
    expect(p3.metadata.fallbackSeed).toBeUndefined();
    expect(p3.metadata.fallbackPolicy).toBe("none");
    expect(p3.fallbackStops).toBeUndefined();
    expect(p3.stops.every((stop) => isInGamut(stop.color, "display-p3"))).toBe(true);
    expect(p3.stops.some((stop) => !isInGamut(stop.color))).toBe(true);

    const dual = solveRamp({ ...config, targetGamut: "dual" });

    expect(dual.metadata.targetGamut).toBe("dual");
    expect(dual.metadata.exactness).toBe("source-exact");
    expect(dual.metadata.fallbackGamut).toBe("srgb");
    expect(dual.metadata.fallbackPolicy).toBe("map-target-to-srgb");
    expect(dual.metadata.fallbackSeed).toBeDefined();
    expect(dual.fallbackStops).toHaveLength(dual.stops.length);
    expect(dual.metadata.seedDelta.source).toBeLessThan(1e-6);
    expect(dual.metadata.seedDelta.target).toBeLessThan(1e-6);
    expect(dual.metadata.seedDelta.fallback).toBeLessThan(1e-6);
    expect(isInGamut(dual.metadata.fallbackSeed!)).toBe(true);
    expect(dual.stops.every((stop) => isInGamut(stop.color, "display-p3"))).toBe(true);
    expect(dual.stops.some((stop) => !isInGamut(stop.color))).toBe(true);
    expect(dual.fallbackStops!.every((stop) => isInGamut(stop.color))).toBe(true);
  });

  it("adds sunny highlight shoulders for warm body seeds while preserving the P3 seed", () => {
    for (const seed of [
      { hue: 47.604, seedChroma: 0.213, seedLightness: 0.705 },
      { hue: 70.08, seedChroma: 0.188, seedLightness: 0.769 },
      { hue: 86.047, seedChroma: 0.184, seedLightness: 0.795 },
    ] as const) {
      const solved = solveRamp({
        ...seed,
        stopCount: 11,
        mode: "opinionated",
        targetGamut: "display-p3",
      });
      const top = solved.stops[0].color;
      const stop200 = solved.stops.find((stop) => stop.label === "200")!.color;
      const stop900 = solved.stops.find((stop) => stop.label === "900")!.color;
      const stop950 = solved.stops.find((stop) => stop.label === "950")!.color;
      const seedStop = solved.stops[solved.metadata.seedIndex].color;

      expect(solved.metadata.exactness).toBe("source-exact");
      expect(solved.metadata.seedDelta.source).toBeLessThan(1e-6);
      expect(seedStop.l).toBeCloseTo(seed.seedLightness, 3);
      expect(seedStop.c).toBeCloseTo(seed.seedChroma, 3);
      expect(seedStop.h).toBeCloseTo(seed.hue, 3);
      expect(top.l).toBeGreaterThan(0.975);
      expect(top.c).toBeGreaterThan(0.01);
      expect(top.c).toBeLessThan(seed.seedChroma * 0.2);
      expect(top.h).toBeGreaterThan(seed.hue);
      expect(circularHueDistance(top.h, seed.hue)).toBeGreaterThan(10);
      expect(stop200.c).toBeGreaterThan(seed.seedChroma * 0.35);
      expect(stop900.c).toBeGreaterThan(seed.seedChroma * 0.5);
      expect(stop950.c).toBeGreaterThan(seed.seedChroma * 0.33);
      expect(stop900.h).toBeLessThan(seed.hue);
      expect(circularHueDistance(stop900.h, seed.hue)).toBeGreaterThan(8);
    }
  });

  it("gives red, rose, and pink seeds blush shoulders and hot ink retention", () => {
    for (const seed of [
      {
        hue: 25.331,
        seedChroma: 0.237,
        seedLightness: 0.637,
        minTopHue: 18,
        maxTopHue: 21,
        minBodyHue: 26,
        maxBodyHue: 28,
        minInkHue: 24,
        maxInkHue: 27,
        minInkChroma: 0.135,
      },
      {
        hue: 16.439,
        seedChroma: 0.246,
        seedLightness: 0.645,
        minTopHue: 10,
        maxTopHue: 13,
        minBodyHue: 16,
        maxBodyHue: 18,
        minInkHue: 12,
        maxInkHue: 14,
        minInkChroma: 0.15,
      },
      {
        hue: 354.308,
        seedChroma: 0.241,
        seedLightness: 0.656,
        minTopHue: 342,
        maxTopHue: 345,
        minBodyHue: 0,
        maxBodyHue: 6,
        minInkHue: 2,
        maxInkHue: 5,
        minInkChroma: 0.148,
      },
    ] as const) {
      const solved = solveRamp({
        ...seed,
        stopCount: 11,
        mode: "opinionated",
        targetGamut: "display-p3",
      });
      const stop50 = solved.stops.find((stop) => stop.label === "50")!.color;
      const stop200 = solved.stops.find((stop) => stop.label === "200")!.color;
      const stop500 = solved.stops.find((stop) => stop.label === "500")!.color;
      const stop600 = solved.stops.find((stop) => stop.label === "600")!.color;
      const stop900 = solved.stops.find((stop) => stop.label === "900")!.color;
      const stop950 = solved.stops.find((stop) => stop.label === "950")!.color;

      expect(solved.stops[solved.metadata.seedIndex].label).toBe("500");
      expect(stop500.l).toBeCloseTo(seed.seedLightness, 3);
      expect(stop500.c).toBeCloseTo(seed.seedChroma, 3);
      expect(stop500.h).toBeCloseTo(seed.hue, 1);
      expect(stop50.l).toBeGreaterThan(0.966);
      expect(stop50.c).toBeGreaterThan(0.012);
      expect(stop50.c).toBeLessThan(0.016);
      expect(stop50.h).toBeGreaterThan(seed.minTopHue);
      expect(stop50.h).toBeLessThan(seed.maxTopHue);
      expect(stop200.c).toBeGreaterThan(0.06);
      expect(stop200.c).toBeLessThan(seed.seedChroma * 0.31);
      expect(stop600.c).toBeGreaterThan(seed.seedChroma);
      expect(stop600.h).toBeGreaterThan(seed.minBodyHue);
      expect(stop600.h).toBeLessThan(seed.maxBodyHue);
      expect(stop900.l).toBeGreaterThan(0.39);
      expect(stop900.c).toBeGreaterThan(seed.minInkChroma);
      expect(stop900.h).toBeGreaterThan(seed.minInkHue);
      expect(stop900.h).toBeLessThan(seed.maxInkHue);
      expect(stop950.l).toBeLessThan(0.286);
      expect(stop950.c).toBeGreaterThan(seed.seedChroma * 0.39);
    }
  });

  it("keeps amber and yellow shelves luminous before the warm ink tail", () => {
    const amber = solveRamp({
      hue: 70.08,
      seedChroma: 0.188,
      seedLightness: 0.769,
      stopCount: 11,
      mode: "opinionated",
      targetGamut: "display-p3",
    });
    const yellow = solveRamp({
      hue: 86.047,
      seedChroma: 0.184,
      seedLightness: 0.795,
      stopCount: 11,
      mode: "opinionated",
      targetGamut: "display-p3",
    });

    const amber200 = amber.stops.find((stop) => stop.label === "200")!.color;
    const amber300 = amber.stops.find((stop) => stop.label === "300")!.color;
    const amber400 = amber.stops.find((stop) => stop.label === "400")!.color;
    const amber950 = amber.stops.find((stop) => stop.label === "950")!.color;
    const yellow100 = yellow.stops.find((stop) => stop.label === "100")!.color;
    const yellow200 = yellow.stops.find((stop) => stop.label === "200")!.color;
    const yellow300 = yellow.stops.find((stop) => stop.label === "300")!.color;
    const yellow700 = yellow.stops.find((stop) => stop.label === "700")!.color;

    expect(amber200.h).toBeGreaterThan(93);
    expect(amber200.c).toBeGreaterThan(0.105);
    expect(amber300.h).toBeGreaterThan(89);
    expect(amber300.c).toBeGreaterThan(0.16);
    expect(amber400.h).toBeGreaterThan(80);
    expect(amber400.c).toBeGreaterThan(0.18);
    expect(amber950.c).toBeGreaterThan(0.075);
    expect(amber950.h).toBeGreaterThan(42);
    expect(amber950.h).toBeLessThan(52);
    expect(yellow100.l).toBeGreaterThan(0.968);
    expect(yellow100.l).toBeLessThan(0.976);
    expect(yellow100.c).toBeGreaterThan(0.068);
    expect(yellow100.c).toBeLessThan(0.078);
    expect(yellow100.c / maxChroma(yellow100.l, yellow100.h, "display-p3")).toBeLessThan(
      0.92,
    );
    expect(yellow200.h).toBeGreaterThan(100);
    expect(yellow200.c).toBeGreaterThan(0.12);
    expect(yellow300.h).toBeGreaterThan(96);
    expect(yellow300.c).toBeGreaterThan(0.17);
    expect(yellow700.h).toBeGreaterThan(62);
  });

  it("gives lime body seeds a center anchor and restrained botanical lights", () => {
    const lime = solveRamp({
      hue: 130.8,
      seedChroma: 0.233,
      seedLightness: 0.768,
      stopCount: 11,
      mode: "opinionated",
      targetGamut: "display-p3",
    });

    const lime50 = lime.stops.find((stop) => stop.label === "50")!.color;
    const lime100 = lime.stops.find((stop) => stop.label === "100")!.color;
    const lime200 = lime.stops.find((stop) => stop.label === "200")!.color;
    const lime300 = lime.stops.find((stop) => stop.label === "300")!.color;
    const lime400 = lime.stops.find((stop) => stop.label === "400")!.color;
    const lime500 = lime.stops.find((stop) => stop.label === "500")!;

    expect(lime.stops[lime.metadata.seedIndex].label).toBe("500");
    expect(lime500.color.l).toBeCloseTo(0.768, 3);
    expect(lime500.color.c).toBeCloseTo(0.233, 3);
    expect(lime500.color.h).toBeCloseTo(130.8, 1);
    expect(lime50.l).toBeGreaterThan(0.98);
    expect(lime50.c).toBeGreaterThan(0.025);
    expect(lime50.c).toBeLessThan(0.04);
    expect(lime50.h).toBeGreaterThan(118);
    expect(lime50.h).toBeLessThan(123);
    expect(lime100.c / maxChroma(lime100.l, lime100.h, "display-p3")).toBeLessThan(
      0.78,
    );
    expect(lime200.c).toBeGreaterThan(0.115);
    expect(lime300.c).toBeGreaterThan(0.18);
    expect(lime400.c).toBeGreaterThan(0.22);
  });

  it("gives verdant body seeds center anchors, airy shoulders, and cool ink", { timeout: 10000 }, () => {
    for (const seed of [
      {
        hue: 149.6,
        seedChroma: 0.219,
        seedLightness: 0.723,
        minTopChroma: 0.016,
        maxTopChroma: 0.026,
        minBodyChroma: 0.2,
        minTailHueShift: 3,
      },
      {
        hue: 162.5,
        seedChroma: 0.17,
        seedLightness: 0.696,
        minTopChroma: 0.018,
        maxTopChroma: 0.03,
        minBodyChroma: 0.155,
        minTailHueShift: 7,
      },
      {
        hue: 182.5,
        seedChroma: 0.14,
        seedLightness: 0.704,
        minTopChroma: 0.012,
        maxTopChroma: 0.022,
        minBodyChroma: 0.14,
        minTailHueShift: 8,
      },
    ] as const) {
      const solved = solveRamp({
        ...seed,
        stopCount: 11,
        mode: "opinionated",
        targetGamut: "display-p3",
      });
      const stop50 = solved.stops.find((stop) => stop.label === "50")!.color;
      const stop400 = solved.stops.find((stop) => stop.label === "400")!.color;
      const stop500 = solved.stops.find((stop) => stop.label === "500")!.color;
      const stop950 = solved.stops.find((stop) => stop.label === "950")!.color;

      expect(solved.stops[solved.metadata.seedIndex].label).toBe("500");
      expect(stop500.l).toBeCloseTo(seed.seedLightness, 3);
      expect(stop500.c).toBeCloseTo(seed.seedChroma, 3);
      expect(stop500.h).toBeCloseTo(seed.hue, 1);
      expect(stop50.l).toBeGreaterThan(0.975);
      expect(stop50.c).toBeGreaterThan(seed.minTopChroma);
      expect(stop50.c).toBeLessThan(seed.maxTopChroma);
      expect(stop400.c).toBeGreaterThan(seed.minBodyChroma);
      const tailHueShift = ((((stop950.h - seed.hue) % 360) + 540) % 360) - 180;
      expect(tailHueShift).toBeGreaterThan(seed.minTailHueShift);
      expect(stop950.c / maxChroma(stop950.l, stop950.h, "display-p3")).toBeLessThan(
        0.76,
      );
    }
  });

  it("gives cyan, sky, and blue seeds glass shoulders and saturated blue ink", { timeout: 10000 }, () => {
    for (const seed of [
      {
        hue: 215.2,
        seedChroma: 0.143,
        seedLightness: 0.715,
        minTopLightness: 0.978,
        minTopChroma: 0.017,
        maxTopChroma: 0.023,
        minTopHue: 200,
        maxTopHue: 206,
        hueDentLabel: "300",
        maxHueDent: 209,
        midTailLabel: "700",
        minMidTailChroma: 0.102,
        minTailHueShift: 12,
        minTailChroma: 0.052,
        maxTailChroma: 0.06,
      },
      {
        hue: 237.3,
        seedChroma: 0.169,
        seedLightness: 0.685,
        minTopLightness: 0.974,
        minTopChroma: 0.009,
        maxTopChroma: 0.015,
        minTopHue: 234,
        maxTopHue: 238,
        hueDentLabel: "300",
        maxHueDent: 231,
        midTailLabel: "700",
        minMidTailChroma: 0.125,
        minTailHueShift: 5,
        minTailChroma: 0.062,
        maxTailChroma: 0.07,
      },
      {
        hue: 259.8,
        seedChroma: 0.214,
        seedLightness: 0.623,
        minTopLightness: 0.967,
        minTopChroma: 0.011,
        maxTopChroma: 0.017,
        minTopHue: 252,
        maxTopHue: 257,
        hueDentLabel: "300",
        maxHueDent: 253,
        midTailLabel: "800",
        minMidTailChroma: 0.19,
        minTailHueShift: 7,
        minTailChroma: 0.086,
        maxTailChroma: 0.1,
      },
    ] as const) {
      const solved = solveRamp({
        ...seed,
        stopCount: 11,
        mode: "opinionated",
        targetGamut: "display-p3",
      });
      const stop50 = solved.stops.find((stop) => stop.label === "50")!.color;
      const stop500 = solved.stops.find((stop) => stop.label === "500")!.color;
      const hueDentStop = solved.stops.find(
        (stop) => stop.label === seed.hueDentLabel,
      )!.color;
      const midTailStop = solved.stops.find(
        (stop) => stop.label === seed.midTailLabel,
      )!.color;
      const stop950 = solved.stops.find((stop) => stop.label === "950")!.color;

      expect(solved.stops[solved.metadata.seedIndex].label).toBe("500");
      expect(stop500.l).toBeCloseTo(seed.seedLightness, 3);
      expect(stop500.c).toBeCloseTo(seed.seedChroma, 3);
      expect(stop500.h).toBeCloseTo(seed.hue, 1);
      expect(stop50.l).toBeGreaterThan(seed.minTopLightness);
      expect(stop50.c).toBeGreaterThan(seed.minTopChroma);
      expect(stop50.c).toBeLessThan(seed.maxTopChroma);
      expect(stop50.h).toBeGreaterThan(seed.minTopHue);
      expect(stop50.h).toBeLessThan(seed.maxTopHue);
      expect(hueDentStop.h).toBeLessThan(seed.maxHueDent);
      expect(midTailStop.c).toBeGreaterThan(seed.minMidTailChroma);
      const tailHueShift = ((((stop950.h - seed.hue) % 360) + 540) % 360) - 180;
      expect(tailHueShift).toBeGreaterThan(seed.minTailHueShift);
      expect(stop950.c).toBeGreaterThan(seed.minTailChroma);
      expect(stop950.c).toBeLessThan(seed.maxTailChroma);
    }
  });

  it("gives indigo, violet, purple, and fuchsia seeds airy lights and violet ink shelves", { timeout: 10000 }, () => {
    for (const seed of [
      {
        hue: 277.117,
        seedChroma: 0.233,
        seedLightness: 0.585,
        minTopLightness: 0.958,
        minTopChroma: 0.014,
        maxTopChroma: 0.019,
        maxHundredChroma: 0.04,
        minTwoHundredLightness: 0.85,
        minPeakRatio: 0.98,
        minSevenHundredChroma: 0.22,
        minNineHundredLightness: 0.33,
        minTailChroma: 0.1,
        maxTailChroma: 0.11,
      },
      {
        hue: 292.717,
        seedChroma: 0.25,
        seedLightness: 0.606,
        minTopLightness: 0.966,
        minTopChroma: 0.014,
        maxTopChroma: 0.017,
        maxHundredChroma: 0.036,
        minTwoHundredLightness: 0.875,
        minPeakRatio: 1.04,
        minSevenHundredChroma: 0.25,
        minNineHundredLightness: 0.36,
        minTailChroma: 0.13,
        maxTailChroma: 0.14,
      },
      {
        hue: 303.9,
        seedChroma: 0.265,
        seedLightness: 0.627,
        minTopLightness: 0.972,
        minTopChroma: 0.013,
        maxTopChroma: 0.016,
        maxHundredChroma: 0.035,
        minTwoHundredLightness: 0.89,
        minPeakRatio: 1.04,
        minSevenHundredChroma: 0.25,
        minNineHundredLightness: 0.37,
        minTailChroma: 0.14,
        maxTailChroma: 0.15,
      },
      {
        hue: 322.15,
        seedChroma: 0.295,
        seedLightness: 0.667,
        minTopLightness: 0.97,
        minTopChroma: 0.016,
        maxTopChroma: 0.019,
        maxHundredChroma: 0.045,
        minTwoHundredLightness: 0.89,
        minPeakRatio: 0.94,
        minSevenHundredChroma: 0.24,
        minNineHundredLightness: 0.38,
        minTailChroma: 0.13,
        maxTailChroma: 0.14,
      },
    ] as const) {
      const solved = solveRamp({
        ...seed,
        stopCount: 11,
        mode: "opinionated",
        targetGamut: "display-p3",
      });
      const stop50 = solved.stops.find((stop) => stop.label === "50")!.color;
      const stop100 = solved.stops.find((stop) => stop.label === "100")!.color;
      const stop200 = solved.stops.find((stop) => stop.label === "200")!.color;
      const stop400 = solved.stops.find((stop) => stop.label === "400")!.color;
      const stop500 = solved.stops.find((stop) => stop.label === "500")!.color;
      const stop600 = solved.stops.find((stop) => stop.label === "600")!.color;
      const stop700 = solved.stops.find((stop) => stop.label === "700")!.color;
      const stop900 = solved.stops.find((stop) => stop.label === "900")!.color;
      const stop950 = solved.stops.find((stop) => stop.label === "950")!.color;

      expect(solved.stops[solved.metadata.seedIndex].label).toBe("500");
      expect(stop500.l).toBeCloseTo(seed.seedLightness, 3);
      expect(stop500.c).toBeCloseTo(seed.seedChroma, 3);
      expect(stop500.h).toBeCloseTo(seed.hue, 1);
      expect(stop50.l).toBeGreaterThan(seed.minTopLightness);
      expect(stop50.c).toBeGreaterThan(seed.minTopChroma);
      expect(stop50.c).toBeLessThan(seed.maxTopChroma);
      expect(stop100.c).toBeLessThan(seed.maxHundredChroma);
      expect(stop200.l).toBeGreaterThan(seed.minTwoHundredLightness);
      expect(stop200.c).toBeLessThan(seed.seedChroma * 0.34);
      expect(stop400.c).toBeGreaterThan(seed.seedChroma * 0.74);
      expect(stop600.c).toBeGreaterThan(seed.seedChroma * seed.minPeakRatio);
      expect(stop700.c).toBeGreaterThan(seed.minSevenHundredChroma);
      expect(stop900.l).toBeGreaterThan(seed.minNineHundredLightness);
      expect(stop950.c).toBeGreaterThan(seed.minTailChroma);
      expect(stop950.c).toBeLessThan(seed.maxTailChroma);
    }
  });

  it("gives neutral and near-neutral seeds temperature-aware paper and ink", { timeout: 15000 }, () => {
    for (const seed of [
      {
        hue: 257.417,
        seedChroma: 0.046,
        seedLightness: 0.554,
        minTopChroma: 0.002,
        maxTopChroma: 0.004,
        minHundredChroma: 0.005,
        maxHundredChroma: 0.007,
        minTailChroma: 0.035,
        maxTailChroma: 0.043,
        maxTailLightness: 0.14,
      },
      {
        hue: 0,
        seedChroma: 0,
        seedLightness: 0.556,
        minTopChroma: 0,
        maxTopChroma: 0.0001,
        minHundredChroma: 0,
        maxHundredChroma: 0.0001,
        minTailChroma: 0,
        maxTailChroma: 0.0001,
        maxTailLightness: 0.15,
      },
      {
        hue: 58.071,
        seedChroma: 0.013,
        seedLightness: 0.553,
        minTopChroma: 0.0003,
        maxTopChroma: 0.0015,
        minHundredChroma: 0.001,
        maxHundredChroma: 0.002,
        minTailChroma: 0.002,
        maxTailChroma: 0.005,
        maxTailLightness: 0.15,
      },
      {
        hue: 322.5,
        seedChroma: 0.034,
        seedLightness: 0.542,
        minTopChroma: 0,
        maxTopChroma: 0.0001,
        minHundredChroma: 0.0035,
        maxHundredChroma: 0.0055,
        minTailChroma: 0.007,
        maxTailChroma: 0.011,
        maxTailLightness: 0.15,
      },
      {
        hue: 107.3,
        seedChroma: 0.031,
        seedLightness: 0.58,
        minTopChroma: 0.002,
        maxTopChroma: 0.004,
        minHundredChroma: 0.004,
        maxHundredChroma: 0.006,
        minTailChroma: 0.004,
        maxTailChroma: 0.007,
        maxTailLightness: 0.16,
      },
    ] as const) {
      const solved = solveRamp({
        ...seed,
        stopCount: 11,
        mode: "opinionated",
        targetGamut: "display-p3",
      });
      const stop50 = solved.stops.find((stop) => stop.label === "50")!.color;
      const stop100 = solved.stops.find((stop) => stop.label === "100")!.color;
      const stop300 = solved.stops.find((stop) => stop.label === "300")!.color;
      const stop400 = solved.stops.find((stop) => stop.label === "400")!.color;
      const stop500 = solved.stops.find((stop) => stop.label === "500")!.color;
      const stop950 = solved.stops.find((stop) => stop.label === "950")!.color;

      expect(solved.stops[solved.metadata.seedIndex].label).toBe("500");
      expect(stop500.l).toBeCloseTo(seed.seedLightness, 3);
      expect(stop500.c).toBeCloseTo(seed.seedChroma, 3);
      expect(stop500.h).toBeCloseTo(seed.hue, 1);
      expect(stop50.l).toBeGreaterThan(0.982);
      expect(stop50.c).toBeGreaterThanOrEqual(seed.minTopChroma);
      expect(stop50.c).toBeLessThan(seed.maxTopChroma);
      expect(stop100.l).toBeGreaterThan(0.96);
      expect(stop100.c).toBeGreaterThanOrEqual(seed.minHundredChroma);
      expect(stop100.c).toBeLessThan(seed.maxHundredChroma);
      expect(stop300.l).toBeGreaterThan(0.86);
      expect(stop400.l).toBeGreaterThan(0.7);
      expect(stop950.l).toBeLessThan(seed.maxTailLightness);
      expect(stop950.c).toBeGreaterThanOrEqual(seed.minTailChroma);
      expect(stop950.c).toBeLessThan(seed.maxTailChroma);
    }
  });

  it("solveRamp marks pure ramps as unanchored when they do not preserve the seed", () => {
    const solved = solveRamp({
      hue: 265,
      seedChroma: 0.18,
      seedLightness: 0.47,
      stopCount: 11,
      mode: "pure",
    });

    expect(solved.metadata.solver).toBe("pure");
    expect(solved.metadata.exactness).toBe("unanchored");
    expect(solved.metadata.seedDelta.target).toBeGreaterThan(1e-3);
  });

  it("opinionated mode gives hard chromatic ramps airy tints and colored ink", () => {
    for (const seedId of ["bright-lime", "cyan", "phthalo-green"] as const) {
      const seed = RESEARCH_SEEDS.find((candidate) => candidate.id === seedId)!;
      const stops = generateRamp(researchSeedToRampConfig(seed));
      const analysis = analyzeRamp(stops, seed);
      const stop50 = stops.find((stop) => stop.label === "50")!;
      const stop950 = stops.find((stop) => stop.label === "950")!;
      const maxTopLightness = seedId === "cyan" ? 0.965 : 0.96;

      expect(stop50.color.l).toBeGreaterThanOrEqual(0.955);
      expect(stop50.color.l).toBeLessThanOrEqual(maxTopLightness);
      expect(stop50.color.c).toBeLessThan(seed.color.c * 0.45);
      expect(stop950.color.l).toBeGreaterThan(0.24);
      expect(stop950.color.c).toBeGreaterThan(0.025);
      expect(analysis.lightRamp.lightness.nonIncreasing).toBe(true);
    }
  });

  it("pure mode has constant hue across all stops", () => {
    const hue = 200;
    const stops = generateRamp({ hue, stopCount: 11, mode: "pure" });
    for (const stop of stops) {
      expect(stop.color.h).toBeCloseTo(hue, 0);
    }
  });

  it("opinionated mode preserves useful role chroma for seeded chromatic ramps", () => {
    const brightLime = analyzeRamp(
      generateRamp(
        researchSeedToRampConfig(
          RESEARCH_SEEDS.find((candidate) => candidate.id === "bright-lime")!,
        ),
      ),
      RESEARCH_SEEDS.find((candidate) => candidate.id === "bright-lime")!,
    );
    const ultramarine = analyzeRamp(
      generateRamp(
        researchSeedToRampConfig(
          RESEARCH_SEEDS.find((candidate) => candidate.id === "ultramarine")!,
        ),
      ),
      RESEARCH_SEEDS.find((candidate) => candidate.id === "ultramarine")!,
    );

    expect(brightLime.endpointLight.relativeChroma).toBeLessThan(0.7);
    expect(brightLime.endpointDark.relativeChroma).toBeGreaterThan(0.6);
    expect(ultramarine.endpointLight.relativeChroma).toBeLessThan(0.75);
    expect(ultramarine.endpointDark.chroma).toBeGreaterThan(0.02);
  });

  it("keeps bright chromatic highlights anchored close to the seed hue", () => {
    for (const [seedId, maxHueDrift] of [
      ["bright-lime", 6],
      ["cyan", 6],
      ["phthalo-green", 6],
    ] as const) {
      const seed = RESEARCH_SEEDS.find((candidate) => candidate.id === seedId)!;
      const stops = generateRamp(researchSeedToRampConfig(seed));
      expect(circularHueDistance(stops[0].color.h, seed.color.h)).toBeLessThan(
        maxHueDrift,
      );
    }
  });

  it("opinionated mode keeps the bright chromatic dark tail visibly alive", () => {
    for (const [seedId, min900, min950] of [
      ["bright-lime", 0.189, 0.099],
      ["cadmium-yellow", 0.169, 0.082],
      ["cyan", 0.149, 0.065],
    ] as const) {
      const stops = generateRamp(
        researchSeedToRampConfig(
          RESEARCH_SEEDS.find((candidate) => candidate.id === seedId)!,
        ),
      );
      const stop900 = stops.find((stop) => stop.label === "900")!;
      const stop950 = stops.find((stop) => stop.label === "950")!;

      expect(stop900.color.l).toBeGreaterThan(min900);
      expect(stop950.color.l).toBeGreaterThan(min950);
    }
  });

  it("transitions family behavior smoothly across adjacent boundary hues", { timeout: 20000 }, () => {
    const baseConfig = {
      seedLightness: 0.62,
      seedChroma: 0.14,
      stopCount: 11 as const,
      mode: "opinionated" as const,
    };

    for (const [leftHue, rightHue] of [
      [150, 151],
      [239, 240],
      [285, 286],
    ]) {
      const leftRamp = generateRamp({ ...baseConfig, hue: leftHue });
      const rightRamp = generateRamp({ ...baseConfig, hue: rightHue });
      const leftTop = leftRamp[0].color;
      const rightTop = rightRamp[0].color;
      const leftDark = leftRamp.at(-1)!.color;
      const rightDark = rightRamp.at(-1)!.color;

      expect(Math.abs(leftTop.l - rightTop.l)).toBeLessThan(0.03);
      expect(Math.abs(leftTop.c - rightTop.c)).toBeLessThan(0.015);
      expect(circularHueDistance(leftDark.h, rightDark.h)).toBeLessThan(4);
    }
  });
});

// ---- Naming ----

describe("naming", () => {
  it("nameForHue maps common hues correctly", () => {
    expect(nameForHue(230)).toBe("blue");
    expect(nameForHue(260)).toBe("indigo");
    expect(nameForHue(0)).toBe("red");
    expect(nameForHue(120)).toBe("green");
    expect(nameForHue(50)).toBe("amber");
    expect(nameForHue(290)).toBe("violet");
  });

  it("uniqueRampName appends numbers for duplicates", () => {
    expect(uniqueRampName(230, [])).toBe("blue");
    expect(uniqueRampName(230, ["blue"])).toBe("blue-2");
    expect(uniqueRampName(230, ["blue", "blue-2"])).toBe("blue-3");
  });
});

// ---- Contrast ----

describe("contrast", () => {
  it("white on black has maximum contrast", () => {
    const ratio = contrastRatio(WHITE, BLACK);
    expect(ratio).toBeGreaterThan(20);
  });

  it("same color has contrast ratio of 1", () => {
    const color: OklchColor = { l: 0.5, c: 0.1, h: 200 };
    const ratio = contrastRatio(color, color);
    expect(ratio).toBeCloseTo(1, 0);
  });

  it("checkContrast reports AA pass/fail correctly", () => {
    const dark: OklchColor = { l: 0.2, c: 0.05, h: 260 };
    const light: OklchColor = { l: 0.95, c: 0.01, h: 260 };
    const result = checkContrast(dark, light);
    expect(result.passesAA).toBe(true);
    expect(result.ratio).toBeGreaterThan(4.5);
  });

  it("swatchDots works for a dark color (should pass on white)", () => {
    const dark: OklchColor = { l: 0.25, c: 0.1, h: 260 };
    const dots = swatchDots(dark);
    expect(dots.onWhite).toBe(true);
  });

  it("swatchDots works for a light color (should pass on black)", () => {
    const light: OklchColor = { l: 0.9, c: 0.02, h: 260 };
    const dots = swatchDots(light);
    expect(dots.onBlack).toBe(true);
  });
});

// ---- Harmonization ----

describe("harmonization", () => {
  it("finds complementary for hues ~180° apart", () => {
    const result = harmonizePair(0, 170);
    expect(result.relationship).toBe("complementary");
    expect(result.totalDisplacement).toBeLessThan(20);
  });

  it("finds triadic for hues ~120° apart", () => {
    const result = harmonizePair(0, 115);
    expect(result.relationship).toBe("triadic");
  });

  it("finds analogous for hues ~30° apart", () => {
    const result = harmonizePair(200, 225);
    expect(result.relationship).toBe("analogous");
  });

  it("respects locked hue (locked A stays put)", () => {
    const result = harmonizePair(0, 170, "a");
    const adjustA = result.adjustments.find((a) => a.id === "a")!;
    expect(adjustA.newHue).toBeCloseTo(0, 0);
  });

  it("harmonizeMultiple works for 3 hues", () => {
    const result = harmonizeMultiple([
      { id: "r", hue: 0 },
      { id: "g", hue: 115 },
      { id: "b", hue: 235 },
    ]);
    expect(result.relationship).toBe("triadic");
    expect(result.adjustments).toHaveLength(3);
  });

  it("handles hue wrap-around (350 and 10 are close)", () => {
    const result = harmonizePair(350, 10);
    expect(result.relationship).toBe("analogous");
    expect(result.totalDisplacement).toBeLessThan(15);
  });

  it("detects already-harmonized colors (displacement near 0)", () => {
    const result = harmonizePair(0, 180);
    expect(result.relationship).toBe("complementary");
    expect(result.totalDisplacement).toBeLessThan(1);
  });

  it("optimal assignment minimizes displacement for 3 hues", () => {
    // Hues near triadic positions — naive sort would assign badly
    const result = harmonizeMultiple([
      { id: "a", hue: 350 },
      { id: "b", hue: 110 },
      { id: "c", hue: 240 },
    ]);
    expect(result.relationship).toBe("triadic");
    // Optimal: 350->~0 (10°), 110->~120 (10°), 240->~240 (0°)
    // Naive sort gave 445° total. Optimal should be well under 100°.
    expect(result.totalDisplacement).toBeLessThan(100);
  });

  it("locked hues are pre-assigned to nearest target", () => {
    const result = harmonizeMultiple([
      { id: "a", hue: 45, locked: true },
      { id: "b", hue: 100 },
      { id: "c", hue: 200 },
    ]);
    const adjA = result.adjustments.find((a) => a.id === "a")!;
    expect(adjA.newHue).toBeCloseTo(45, 0); // locked stays put
  });

  it("clustered hues get analogous, not triadic", () => {
    // 3 teals spanning only 15° — should pick analogous (30°), not triadic (120°)
    const result = harmonizeMultiple([
      { id: "a", hue: 195 },
      { id: "b", hue: 200 },
      { id: "c", hue: 210 },
    ]);
    expect(result.relationship).toBe("analogous");
    // Displacement is moderate (~90°) since hues still need to spread to 30° spacing
    // but much less than triadic would require (~240°)
    expect(result.totalDisplacement).toBeLessThan(120);
  });

  it("wide-spread hues get tetradic or triadic", () => {
    // 3 hues spanning ~200° — characteristic angle ~100°, nearest to tetradic (90°)
    const result = harmonizeMultiple([
      { id: "a", hue: 0 },
      { id: "b", hue: 100 },
      { id: "c", hue: 200 },
    ]);
    expect(["tetradic", "triadic"]).toContain(result.relationship);
  });

  it("cycling via startAfter works for 3+ hues", () => {
    const hues = [
      { id: "a", hue: 195 },
      { id: "b", hue: 200 },
      { id: "c", hue: 210 },
    ];
    const r1 = harmonizeMultiple(hues);
    expect(r1.relationship).toBe("analogous");
    // Cycle past analogous → should pick a different relationship
    const r2 = harmonizeMultiple(hues, "analogous");
    expect(r2.relationship).not.toBe("analogous");
  });

  it("all locked hues stay unchanged", () => {
    const result = harmonizeMultiple([
      { id: "a", hue: 10, locked: true },
      { id: "b", hue: 130, locked: true },
      { id: "c", hue: 250, locked: true },
    ]);
    for (const adj of result.adjustments) {
      expect(adj.newHue).toBeCloseTo(adj.originalHue, 0);
    }
  });
});

// ---- Extraction ----

import { extractFromPixels, _normalizeChroma, _cullForDistinctiveness } from "../extract";

describe("extraction", () => {
  /** Helper: generate N pixels at given hue with some L/C variation */
  function makePixels(
    hue: number,
    count: number,
    baseC = 0.15,
    baseL = 0.5,
  ): OklchColor[] {
    return Array.from({ length: count }, (_, i) => ({
      h: hue + (i % 5) * 0.5, // slight hue jitter
      c: baseC + (i % 3) * 0.02,
      l: baseL + (i % 4) * 0.05,
    }));
  }

  it("extracts two distinct hues from a two-hue image", () => {
    const pixels = [
      ...makePixels(25, 50, 0.15), // red-orange
      ...makePixels(200, 50, 0.15), // cyan-blue
    ];
    const result = extractFromPixels(pixels);
    expect(result.isSingleColor).toBe(false);
    expect(result.colors.length).toBeGreaterThanOrEqual(2);

    // Should have one color near H~25 and one near H~200
    const hues = result.colors.map((c) => c.h);
    const hasRed = hues.some((h) => h > 15 && h < 40);
    const hasBlue = hues.some((h) => h > 185 && h < 215);
    expect(hasRed).toBe(true);
    expect(hasBlue).toBe(true);
  });

  it("single-color image gets a gentle source-aware chroma lift", () => {
    // All pixels at basically the same color
    const pixels = Array.from({ length: 100 }, () => ({
      l: 0.55,
      c: 0.1,
      h: 260,
    }));
    const result = extractFromPixels(pixels);
    expect(result.isSingleColor).toBe(true);
    expect(result.colors).toHaveLength(1);
    // Should be lifted, but not purified to the gamut wall.
    expect(result.colors[0].c).toBeGreaterThan(0.1);
    expect(result.colors[0].c).toBeLessThan(maxChroma(0.55, 260) * 0.8);
  });

  it("peak-chroma representative is used (not averaged centroid)", () => {
    // Mix of vivid and dull pixels at the same hue
    const pixels = [
      // Vivid pixels
      { l: 0.5, c: 0.25, h: 260 },
      { l: 0.5, c: 0.24, h: 261 },
      { l: 0.5, c: 0.23, h: 259 },
      // Dull pixels at same hue (would pull centroid down)
      ...Array.from({ length: 30 }, () => ({
        l: 0.5,
        c: 0.05,
        h: 260,
      })),
      // A second hue to ensure we get past single-color detection
      ...makePixels(60, 30, 0.15),
    ];
    const result = extractFromPixels(pixels);
    // The blue cluster's representative should be closer to 0.25 (peak)
    // than to the average (~0.07 if all averaged together)
    const blueColor = result.colors.find(
      (c) => c.h > 245 && c.h < 275,
    );
    expect(blueColor).toBeDefined();
    // After normalize-to-peak, it should be very vivid (the peak pixel was already high)
    expect(blueColor!.c).toBeGreaterThan(0.1);
  });

  it("gentle normalize-to-peak preserves relative chroma between colors", () => {
    // Two hues: one vivid, one subdued
    const vividOrange: OklchColor = { l: 0.6, c: 0.2, h: 50 };
    const mutedBlue: OklchColor = { l: 0.5, c: 0.08, h: 260 };

    const result = _normalizeChroma([vividOrange, mutedBlue]);

    // Orange (more vivid) should have higher chroma than blue (more muted)
    const orangeOut = result[0];
    const blueOut = result[1];
    expect(orangeOut.c).toBeGreaterThan(blueOut.c);

    // Orange should keep a healthy gamut-relative intensity.
    const orangeMax = maxChroma(vividOrange.l, vividOrange.h);
    expect(orangeOut.c / orangeMax).toBeGreaterThan(0.7);
    expect(orangeOut.c / orangeMax).toBeLessThanOrEqual(1.0);

    // Blue should be proportionally lower
    const blueMax = maxChroma(mutedBlue.l, mutedBlue.h);
    expect(blueOut.c / blueMax).toBeLessThan(orangeOut.c / orangeMax);
  });

  it("gentle normalize-to-peak leaves neutrals unchanged", () => {
    const neutral: OklchColor = { l: 0.5, c: 0.02, h: 0 };
    const vivid: OklchColor = { l: 0.5, c: 0.2, h: 120 };

    const result = _normalizeChroma([neutral, vivid]);

    // Neutral should pass through untouched
    expect(result[0].c).toBe(0.02);
    expect(result[0].l).toBe(0.5);
  });

  it("all-neutral image returns at least one color", () => {
    const pixels = Array.from({ length: 100 }, (_, i) => ({
      l: 0.3 + (i % 10) * 0.05,
      c: 0.01,
      h: 0,
    }));
    const result = extractFromPixels(pixels);
    expect(result.colors.length).toBeGreaterThanOrEqual(1);
  });

  it("treats tonal neutral images as palettes, not single color swatches", () => {
    const pixels = Array.from({ length: 240 }, (_, i) => ({
      l: 0.25 + (i % 12) * 0.045,
      c: 0.012,
      h: 0,
    }));
    const result = extractFromPixels(pixels);
    expect(result.isSingleColor).toBe(false);
    expect(result.colors.length).toBeGreaterThanOrEqual(2);
    expect(result.colors.every((c) => c.c < 0.05)).toBe(true);
  });

  it("keeps meaningful neutrals alongside chromatic colors", () => {
    const pixels = [
      ...Array.from({ length: 500 }, (_, i) => ({
        l: 0.78 + (i % 8) * 0.01,
        c: 0.012,
        h: 80,
      })),
      ...Array.from({ length: 300 }, (_, i) => ({
        l: 0.46 + (i % 8) * 0.015,
        c: 0.07 + (i % 4) * 0.004,
        h: 138 + (i % 5),
      })),
      ...Array.from({ length: 80 }, (_, i) => ({
        l: 0.55 + (i % 5) * 0.01,
        c: 0.17 + (i % 3) * 0.01,
        h: 24 + (i % 4),
      })),
    ];
    const result = extractFromPixels(pixels);
    const hues = result.colors.map((c) => c.h);
    expect(result.colors.length).toBeGreaterThanOrEqual(3);
    expect(result.colors.length).toBeLessThanOrEqual(7);
    expect(result.colors.some((c) => c.c < 0.05)).toBe(true);
    expect(hues.some((h) => h >= 125 && h <= 150)).toBe(true);
    expect(hues.some((h) => h >= 15 && h <= 35)).toBe(true);
  });

  it("ignores tiny vivid outliers when they are below palette coverage", () => {
    const pixels = [
      ...Array.from({ length: 900 }, (_, i) => ({
        l: 0.5 + (i % 8) * 0.01,
        c: 0.09 + (i % 4) * 0.005,
        h: 230 + (i % 4),
      })),
      ...Array.from({ length: 180 }, (_, i) => ({
        l: 0.82 + (i % 6) * 0.01,
        c: 0.012,
        h: 0,
      })),
      ...Array.from({ length: 4 }, (_, i) => ({
        l: 0.58,
        c: 0.25,
        h: 24 + i,
      })),
    ];
    const result = extractFromPixels(pixels);
    expect(result.colors.some((c) => c.h >= 15 && c.h <= 35)).toBe(false);
  });

  it("gamut-relative scoring does not favor yellow over blue", () => {
    // Equal numbers of yellow and blue pixels, both at ~80% of gamut potential
    const yellowMaxC = maxChroma(0.8, 90); // high for yellow
    const blueMaxC = maxChroma(0.45, 260); // lower absolute, but we match relative
    const pixels = [
      ...Array.from({ length: 50 }, () => ({
        l: 0.8,
        c: yellowMaxC * 0.8,
        h: 90,
      })),
      ...Array.from({ length: 50 }, () => ({
        l: 0.45,
        c: blueMaxC * 0.8,
        h: 260,
      })),
    ];
    const result = extractFromPixels(pixels);
    // Both hues should be present (neither should dominate)
    expect(result.colors.length).toBeGreaterThanOrEqual(2);
    const hues = result.colors.map((c) => c.h);
    const hasYellow = hues.some((h) => h > 70 && h < 110);
    const hasBlue = hues.some((h) => h > 240 && h < 280);
    expect(hasYellow).toBe(true);
    expect(hasBlue).toBe(true);
  });

  it("extracted colors are in gamut", () => {
    const pixels = [
      ...makePixels(0, 30, 0.2),
      ...makePixels(120, 30, 0.15),
      ...makePixels(240, 30, 0.18),
    ];
    const result = extractFromPixels(pixels);
    for (const color of result.colors) {
      expect(isInGamut(color)).toBe(true);
    }
  });

  // ---- Distinctiveness culling ----

  it("culls three similar blues down to fewer", () => {
    // Three blues at nearly identical H/C, only slight L variation
    const blues: OklchColor[] = [
      { l: 0.45, c: 0.18, h: 255 },
      { l: 0.48, c: 0.17, h: 260 },
      { l: 0.43, c: 0.16, h: 265 },
    ];
    const result = _cullForDistinctiveness(blues);
    // Should keep fewer than 3 — these are too similar
    expect(result.length).toBeLessThan(3);
    expect(result.length).toBeGreaterThanOrEqual(1);
  });

  it("keeps analogous hues that are sufficiently distinct", () => {
    // Three colors 40° apart — clearly distinct
    const colors: OklchColor[] = [
      { l: 0.5, c: 0.2, h: 0 },
      { l: 0.5, c: 0.2, h: 40 },
      { l: 0.5, c: 0.2, h: 80 },
    ];
    const result = _cullForDistinctiveness(colors);
    expect(result).toHaveLength(3);
  });

  it("removes neutrals when chromatic alternatives exist", () => {
    const colors: OklchColor[] = [
      { l: 0.5, c: 0.2, h: 260 }, // vivid blue
      { l: 0.6, c: 0.15, h: 30 }, // vivid orange
      { l: 0.5, c: 0.01, h: 0 }, // neutral gray
    ];
    const result = _cullForDistinctiveness(colors);
    // Gray should be removed (2 chromatic alternatives exist)
    expect(result.every((c) => c.c > 0.03)).toBe(true);
    expect(result.length).toBe(2);
  });

  it("keeps neutrals when they are the only option", () => {
    const colors: OklchColor[] = [
      { l: 0.5, c: 0.01, h: 0 },
      { l: 0.7, c: 0.02, h: 0 },
    ];
    const result = _cullForDistinctiveness(colors);
    expect(result.length).toBeGreaterThanOrEqual(1);
  });

  it("returns at least one color even if all are similar", () => {
    const colors: OklchColor[] = [
      { l: 0.5, c: 0.2, h: 260 },
      { l: 0.5, c: 0.2, h: 261 },
      { l: 0.5, c: 0.2, h: 262 },
    ];
    const result = _cullForDistinctiveness(colors);
    expect(result.length).toBeGreaterThanOrEqual(1);
  });

  it("produces deterministic results for the same pixel data", () => {
    const pixels = [
      ...makePixels(25, 50, 0.15),
      ...makePixels(200, 50, 0.15),
      ...makePixels(120, 30, 0.10),
    ];
    const r1 = extractFromPixels(pixels);
    const r2 = extractFromPixels(pixels);
    expect(r1.colors).toEqual(r2.colors);
    expect(r1.isSingleColor).toEqual(r2.isSingleColor);
  });

  it("extracts green from a muted olive-dominated image (not gold/red)", () => {
    // Simulates an olive-green car: mostly muted green with dark shadows
    // and small vivid red accents (taillights)
    const pixels = [
      // 70% — muted olive green (car body)
      ...Array.from({ length: 700 }, (_, i) => ({
        l: 0.35 + (i % 10) * 0.02,
        c: 0.06 + (i % 5) * 0.005,
        h: 125 + (i % 7) * 2,
      })),
      // 20% — dark neutrals (wheels, shadows)
      ...Array.from({ length: 200 }, (_, i) => ({
        l: 0.15 + (i % 8) * 0.02,
        c: 0.01,
        h: 0,
      })),
      // 10% — vivid red (taillights, accents)
      ...Array.from({ length: 100 }, (_, i) => ({
        l: 0.45 + (i % 5) * 0.01,
        c: 0.18 + (i % 3) * 0.02,
        h: 15 + (i % 4) * 2,
      })),
    ];
    const result = extractFromPixels(pixels);
    expect(result.isSingleColor).toBe(false);

    // The dominant olive-green hue must appear in the palette
    const hasGreen = result.colors.some((c) => c.h >= 100 && c.h <= 150);
    expect(hasGreen).toBe(true);
  });
});
