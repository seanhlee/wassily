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
import type { OklchColor } from "../../types";

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

  it("all ramp colors are in gamut", () => {
    for (let h = 0; h < 360; h += 30) {
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

  it("opinionated mode has warm shadow drift (hue increases in dark stops)", () => {
    const stops = generateRamp({
      hue: 200,
      stopCount: 11,
      mode: "opinionated",
    });
    const hue500 = stops[5].color.h; // 500
    const hue900 = stops[9].color.h; // 900
    // 900 should be warmer (higher hue) than 500
    const drift = (hue900 - hue500 + 360) % 360;
    expect(drift).toBeGreaterThan(0);
    expect(drift).toBeLessThan(20); // subtle, not extreme
  });

  it("opinionated mode has cool highlight lift (hue decreases in light stops)", () => {
    const stops = generateRamp({
      hue: 200,
      stopCount: 11,
      mode: "opinionated",
    });
    const hue50 = stops[0].color.h; // 50
    const hue500 = stops[5].color.h; // 500
    // 50 should be cooler (lower hue) than 500
    const drift = (hue500 - hue50 + 360) % 360;
    expect(drift).toBeGreaterThan(0);
    expect(drift).toBeLessThan(10);
  });

  it("pure mode has constant hue across all stops", () => {
    const hue = 200;
    const stops = generateRamp({ hue, stopCount: 11, mode: "pure" });
    for (const stop of stops) {
      expect(stop.color.h).toBeCloseTo(hue, 0);
    }
  });

  it("chroma is gamut-relative (not zero at extremes, peaks where gamut allows)", () => {
    const stops = generateRamp({
      hue: 260,
      stopCount: 11,
      mode: "opinionated",
    });
    // Every stop should have some chroma (gamut-relative, no zero rolloff)
    for (const stop of stops) {
      expect(stop.color.c).toBeGreaterThan(0);
    }
    // Blue peaks at low lightness (where gamut is largest)
    const chroma300 = stops[3].color.c;
    const chroma800 = stops[8].color.c;
    expect(chroma800).toBeGreaterThan(chroma300);
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
});
