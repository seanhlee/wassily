import { describe, it, expect } from "vitest";
import {
  maxChroma,
  chromaPeakLightness,
  isInGamut,
  clampToGamut,
  toHex,
  toOklchString,
  parseColor,
} from "../gamut";
import { purify, purifyColor, randomPurifiedColor } from "../purify";
import { generateRamp, nameForHue, uniqueRampName } from "../ramp";
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
    for (const count of [3, 5, 7, 9, 11] as const) {
      const stops = generateRamp({
        hue: 180,
        stopCount: count,
        mode: "opinionated",
      });
      expect(stops).toHaveLength(count);
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

  it("opinionated mode routes through the seeded v6 path", () => {
    for (const seedId of ["bright-lime", "cyan", "very-light-seed"] as const) {
      const seed = RESEARCH_SEEDS.find((candidate) => candidate.id === seedId)!;
      const analysis = analyzeRamp(generateRamp(researchSeedToRampConfig(seed)), seed);

      expect(analysis.seedStopIndex).not.toBeNull();
      expect(analysis.seedDelta).toBeLessThan(1e-6);
      expect(analysis.lightRamp.lightness.nonIncreasing).toBe(true);
    }
  });

  it("opinionated mode keeps edge cadence controlled for hard seeded ramps", () => {
    for (const seedId of ["bright-lime", "cadmium-yellow", "very-light-seed"] as const) {
      const seed = RESEARCH_SEEDS.find((candidate) => candidate.id === seedId)!;
      const analysis = analyzeRamp(generateRamp(researchSeedToRampConfig(seed)), seed);

      expect(analysis.lightRamp.adjacentDistance.lightEntranceRatio).toBeLessThan(1.03);
      expect(analysis.lightRamp.adjacentDistance.worstAdjacentRatio).toBeLessThan(1.05);
      expect(analysis.seedPlacementImbalance).not.toBeNull();
      expect(analysis.seedPlacementImbalance!).toBeLessThan(0.05);
    }
  });

  it("pure mode has constant hue across all stops", () => {
    const hue = 200;
    const stops = generateRamp({ hue, stopCount: 11, mode: "pure" });
    for (const stop of stops) {
      expect(stop.color.h).toBeCloseTo(hue, 0);
    }
  });

  it("opinionated mode preserves useful endpoint chroma for seeded chromatic ramps", () => {
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

    expect(brightLime.endpointLight.relativeChroma).toBeGreaterThan(0.95);
    expect(brightLime.endpointDark.relativeChroma).toBeGreaterThan(0.95);
    expect(ultramarine.endpointLight.relativeChroma).toBeGreaterThan(0.9);
    expect(ultramarine.endpointDark.chroma).toBeGreaterThan(0.01);
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

  it("single-color image returns purified result", () => {
    // All pixels at basically the same color
    const pixels = Array.from({ length: 100 }, () => ({
      l: 0.55,
      c: 0.1,
      h: 260,
    }));
    const result = extractFromPixels(pixels);
    expect(result.isSingleColor).toBe(true);
    expect(result.colors).toHaveLength(1);
    // Should be purified (chroma maximized)
    expect(result.colors[0].c).toBeGreaterThan(0.1);
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

  it("normalize-to-peak preserves relative chroma between colors", () => {
    // Two hues: one vivid, one subdued
    const vividOrange: OklchColor = { l: 0.6, c: 0.2, h: 50 };
    const mutedBlue: OklchColor = { l: 0.5, c: 0.08, h: 260 };

    const result = _normalizeChroma([vividOrange, mutedBlue]);

    // Orange (more vivid) should have higher chroma than blue (more muted)
    const orangeOut = result[0];
    const blueOut = result[1];
    expect(orangeOut.c).toBeGreaterThan(blueOut.c);

    // Orange should be near 95% of its gamut max
    const orangeMax = maxChroma(vividOrange.l, vividOrange.h);
    expect(orangeOut.c / orangeMax).toBeGreaterThan(0.85);
    expect(orangeOut.c / orangeMax).toBeLessThanOrEqual(1.0);

    // Blue should be proportionally lower
    const blueMax = maxChroma(mutedBlue.l, mutedBlue.h);
    expect(blueOut.c / blueMax).toBeLessThan(orangeOut.c / orangeMax);
  });

  it("normalize-to-peak leaves neutrals unchanged", () => {
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
