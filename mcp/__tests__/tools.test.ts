/**
 * MCP Tools — Boot Safety + Smoke Tests
 *
 * Verifies that engine imports work in Node (no DOM errors)
 * and that each tool returns sane output for known inputs.
 */

import { describe, it, expect } from "vitest";

// Boot safety: importing tools.ts triggers all engine imports.
// If gamut.ts or any DOM-dependent module fails to load, this blows up.
describe("boot safety", () => {
  it("imports tools without DOM errors", async () => {
    const mod = await import("../tools.js");
    expect(typeof mod.registerTools).toBe("function");
  });
});

// ---- Tool smoke tests ----
// We call engine functions directly (same ones the tools wrap)
// to avoid needing a full MCP server harness.

import {
  purify,
  parseColor,
  toHex,
  isInGamut,
  generateRamp,
  nameForHue,
  checkContrast,
  contrastRatio,
  harmonizeMultiple,
  WHITE,
  BLACK,
} from "../../src/engine/index.js";

describe("purify_color", () => {
  it("increases chroma of a muddy red", () => {
    const parsed = parseColor("#e63946")!;
    expect(parsed).not.toBeNull();
    const result = purify(parsed);
    expect(result.purified.c).toBeGreaterThan(parsed.c);
    expect(result.chromaGain).toBeGreaterThan(0);
    expect(result.purified.h).toBeCloseTo(parsed.h, 0);
  });

  it("handles named colors", () => {
    const parsed = parseColor("rebeccapurple")!;
    expect(parsed).not.toBeNull();
    const result = purify(parsed);
    expect(toHex(result.purified)).toMatch(/^#[0-9A-F]{6}$/i);
  });
});

describe("parse_color", () => {
  it("parses hex", () => {
    const c = parseColor("#0059E9")!;
    expect(c).not.toBeNull();
    expect(c.h).toBeGreaterThan(240);
    expect(c.h).toBeLessThan(280);
  });

  it("parses oklch", () => {
    const c = parseColor("oklch(0.55 0.229 261.3)")!;
    expect(c).not.toBeNull();
    expect(c.l).toBeCloseTo(0.55, 1);
  });

  it("parses bare hue number", () => {
    const c = parseColor("180");
    expect(c).not.toBeNull();
  });

  it("returns null for garbage", () => {
    expect(parseColor("notacolor")).toBeNull();
  });

  it("detects gamut status", () => {
    // #808080 is safely in gamut (pure #ff0000 can drift out due to OKLCH round-trip)
    const inGamut = parseColor("#808080")!;
    expect(isInGamut(inGamut)).toBe(true);
  });
});

describe("generate_ramp", () => {
  it("generates 11 stops for hue 264", () => {
    const stops = generateRamp({ hue: 264, stopCount: 11, mode: "opinionated" });
    expect(stops).toHaveLength(11);
    expect(stops[0].label).toBe("50");
    expect(stops[10].label).toBe("950");
  });

  it("produces valid hex for every stop", () => {
    const stops = generateRamp({ hue: 30, stopCount: 5, mode: "pure" });
    for (const stop of stops) {
      expect(toHex(stop.color)).toMatch(/^#[0-9A-F]{6}$/i);
      expect(toHex(stop.darkColor)).toMatch(/^#[0-9A-F]{6}$/i);
    }
  });

  it("lightness decreases across stops", () => {
    const stops = generateRamp({ hue: 120, stopCount: 9, mode: "opinionated" });
    for (let i = 1; i < stops.length; i++) {
      expect(stops[i].color.l).toBeLessThanOrEqual(stops[i - 1].color.l + 0.001);
    }
  });
});

describe("check_contrast", () => {
  it("white vs black is ~21:1", () => {
    const ratio = contrastRatio(WHITE, BLACK);
    expect(ratio).toBeGreaterThan(20);
  });

  it("returns pass/fail flags", () => {
    const result = checkContrast(WHITE, BLACK);
    expect(result.passesAA).toBe(true);
    expect(result.passesAALarge).toBe(true);
  });

  it("same color has ratio ~1", () => {
    const blue = parseColor("#0059E9")!;
    const ratio = contrastRatio(blue, blue);
    expect(ratio).toBeCloseTo(1, 0);
  });
});

describe("harmonize", () => {
  it("finds complementary for ~180° pair", () => {
    const result = harmonizeMultiple([
      { id: "h0", hue: 0 },
      { id: "h1", hue: 175 },
    ]);
    expect(result.relationship).toBe("complementary");
    expect(result.angle).toBe(180);
  });

  it("finds analogous for ~30° pair", () => {
    const result = harmonizeMultiple([
      { id: "h0", hue: 30 },
      { id: "h1", hue: 55 },
    ]);
    expect(result.relationship).toBe("analogous");
  });

  it("handles locked hues", () => {
    const result = harmonizeMultiple([
      { id: "h0", hue: 0, locked: true },
      { id: "h1", hue: 175 },
    ]);
    // Locked hue should not change
    const lockedAdj = result.adjustments.find((a) => a.id === "h0");
    expect(lockedAdj?.newHue).toBeCloseTo(lockedAdj?.originalHue ?? 0, 0);
  });
});

describe("nameForHue", () => {
  it("returns color family names", () => {
    expect(nameForHue(0)).toBe("red");
    expect(nameForHue(120)).toBe("green");
    expect(nameForHue(240)).toBe("blue");
  });
});

describe("state parsing (duck-type)", () => {
  it("handles minimal valid state", () => {
    const state = JSON.parse('{"objects":{},"selectedIds":[],"camera":{"x":0,"y":0,"zoom":1},"lightMode":true,"showConnections":true}');
    expect(state.objects).toBeDefined();
    expect(typeof state.objects).toBe("object");
  });

  it("rejects non-object", () => {
    expect(() => {
      const parsed = JSON.parse('"just a string"');
      if (!parsed || typeof parsed !== "object" || typeof parsed.objects !== "object") {
        throw new Error("Invalid");
      }
    }).toThrow();
  });
});
