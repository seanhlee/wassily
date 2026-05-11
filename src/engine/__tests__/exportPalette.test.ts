import { describe, expect, it } from "vitest";
import type { Ramp } from "../../types";
import { solveRamp } from "../ramp";
import {
  formatRampSrgbHexList,
  getRampStopExportRows,
  serializePaletteExport,
} from "../exportPalette";

interface DesignTokenColor {
  $value: string;
  $type: "color";
  $extensions: {
    "com.wassily": {
      oklch: string;
      darkValue: string;
      darkOklch: string;
    };
  };
}

function makeRamp(name = "tw-orange-500"): Ramp {
  const config = {
    hue: 47.604,
    seedChroma: 0.213,
    seedLightness: 0.705,
    stopCount: 11,
    mode: "opinionated",
  } as const;
  const solved = solveRamp(config);

  return {
    id: "ramp-1",
    type: "ramp",
    name,
    seedHue: config.hue,
    seedChroma: config.seedChroma,
    seedLightness: config.seedLightness,
    stopCount: config.stopCount,
    mode: config.mode,
    position: { x: 0, y: 0 },
    stops: solved.stops,
    fallbackStops: solved.fallbackStops,
    solveMetadata: solved.metadata,
    targetGamut: solved.metadata.targetGamut,
  };
}

describe("palette export helpers", () => {
  it("exposes canonical OKLCH rows with explicit sRGB fallbacks", () => {
    const rows = getRampStopExportRows(makeRamp());

    expect(rows).toHaveLength(11);
    expect(rows[0].canonicalOklch).toMatch(/^oklch\(/);
    expect(rows[0].fallbackOklch).toMatch(/^oklch\(/);
    expect(rows[0].srgbHex).toMatch(/^#[0-9A-F]{6}$/);
    expect(rows.some((row) => row.canonicalOklch !== row.fallbackOklch)).toBe(true);
  });

  it("keeps Tailwind exports in canonical OKLCH", () => {
    const output = serializePaletteExport([makeRamp()], "tailwind", {
      brand: "tw-orange-500-500",
    });

    expect(output).toContain("--color-tw-orange-500-500: oklch(");
    expect(output).toContain("--color-brand: var(--color-tw-orange-500-500);");
    expect(output).not.toMatch(/#[0-9A-F]{6}/);
  });

  it("keeps design tokens portable while preserving canonical metadata", () => {
    const output = serializePaletteExport([makeRamp()], "tokens");
    const tokens = JSON.parse(output) as Record<
      string,
      Record<string, DesignTokenColor>
    >;
    const seed = tokens["tw-orange-500"]["500"];

    expect(seed.$value).toMatch(/^#[0-9A-F]{6}$/);
    expect(seed.$extensions["com.wassily"].oklch).toMatch(/^oklch\(/);
    expect(seed.$extensions["com.wassily"].darkValue).toMatch(
      /^#[0-9A-F]{6}$/,
    );
    expect(seed.$extensions["com.wassily"].darkOklch).toMatch(/^oklch\(/);
  });

  it("formats sRGB copy lists as one fallback hex per stop", () => {
    const output = formatRampSrgbHexList(makeRamp());

    expect(output.split("\n")).toHaveLength(11);
    expect(output.split("\n").every((line) => /^#[0-9A-F]{6}$/.test(line))).toBe(
      true,
    );
  });
});
