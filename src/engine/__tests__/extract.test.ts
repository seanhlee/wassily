/**
 * Phase 1: engine metadata — source positions are preserved through extraction.
 *
 * These tests cover the new `samples[].source` field, its normalization, and
 * the parallel `colors` alias. Existing extraction behavior is exercised by
 * engine.test.ts and remains unchanged.
 */

import { describe, it, expect } from "vitest";
import { extractColors, extractFromPixels } from "../extract";
import type { OklchColor } from "../../types";

/**
 * Minimal ImageData-shaped object for tests. Only `.data`, `.width`, `.height`
 * are read by the engine, so we don't depend on a DOM polyfill.
 */
function makeImageData(
  width: number,
  height: number,
  fill: (x: number, y: number) => [number, number, number],
): ImageData {
  const data = new Uint8ClampedArray(width * height * 4);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const [r, g, b] = fill(x, y);
      const idx = (y * width + x) * 4;
      data[idx] = r;
      data[idx + 1] = g;
      data[idx + 2] = b;
      data[idx + 3] = 255;
    }
  }
  return { data, width, height, colorSpace: "srgb" } as unknown as ImageData;
}

describe("extraction: samples + source positions", () => {
  it("samples and colors are parallel (same length, same color values)", () => {
    const pixels: OklchColor[] = [
      ...Array.from({ length: 40 }, () => ({ l: 0.55, c: 0.2, h: 30 })),
      ...Array.from({ length: 40 }, () => ({ l: 0.45, c: 0.18, h: 250 })),
    ];
    const result = extractFromPixels(pixels);

    expect(result.samples.length).toBe(result.colors.length);
    result.samples.forEach((sample, i) => {
      expect(sample.color).toEqual(result.colors[i]);
    });
  });

  it("source positions are normalized to [0, 1]", () => {
    const pixels: OklchColor[] = [
      ...Array.from({ length: 60 }, () => ({ l: 0.5, c: 0.2, h: 30 })),
      ...Array.from({ length: 60 }, () => ({ l: 0.4, c: 0.18, h: 140 })),
      ...Array.from({ length: 60 }, () => ({ l: 0.45, c: 0.19, h: 260 })),
    ];
    const result = extractFromPixels(pixels);

    for (const { source } of result.samples) {
      expect(source.x).toBeGreaterThanOrEqual(0);
      expect(source.x).toBeLessThanOrEqual(1);
      expect(source.y).toBeGreaterThanOrEqual(0);
      expect(source.y).toBeLessThanOrEqual(1);
    }
  });

  it("left-half red, right-half blue: each source falls on its expected side", () => {
    const W = 40;
    const H = 40;
    const data = makeImageData(W, H, (x) =>
      x < W / 2 ? [220, 40, 40] : [40, 60, 220],
    );
    const result = extractColors(data);

    const reds = result.samples.filter(
      (s) => s.color.h > 10 && s.color.h < 60,
    );
    const blues = result.samples.filter(
      (s) => s.color.h > 240 && s.color.h < 290,
    );

    expect(reds.length).toBeGreaterThan(0);
    expect(blues.length).toBeGreaterThan(0);

    // Red pixels occupy x ∈ [0, W/2 - 1] → source.x < 0.5.
    // Blue pixels occupy x ∈ [W/2, W - 1] → source.x ≥ 0.5.
    for (const r of reds) expect(r.source.x).toBeLessThan(0.5);
    for (const b of blues) expect(b.source.x).toBeGreaterThanOrEqual(0.5);
  });

  it("single-color path: one sample with source at center", () => {
    const pixels: OklchColor[] = Array.from({ length: 80 }, () => ({
      l: 0.5,
      c: 0.18,
      h: 140,
    }));
    const result = extractFromPixels(pixels);

    expect(result.isSingleColor).toBe(true);
    expect(result.samples).toHaveLength(1);
    expect(result.samples[0].source).toEqual({ x: 0.5, y: 0.5 });
  });

  it("empty-pixel fallback: synthetic center sample", () => {
    const result = extractFromPixels([]);

    expect(result.isSingleColor).toBe(true);
    expect(result.samples).toHaveLength(1);
    expect(result.samples[0].source).toEqual({ x: 0.5, y: 0.5 });
  });

  it("regression: produces expected hue coverage on a mixed fixture", () => {
    // Two clearly distinct chromatic regions — engine should find both.
    const pixels: OklchColor[] = [
      ...Array.from({ length: 80 }, (_, i) => ({
        l: 0.5 + (i % 8) * 0.01,
        c: 0.18,
        h: 30 + (i % 4),
      })),
      ...Array.from({ length: 80 }, (_, i) => ({
        l: 0.45 + (i % 8) * 0.01,
        c: 0.17,
        h: 250 + (i % 4),
      })),
    ];
    const result = extractFromPixels(pixels);

    expect(result.colors.length).toBeGreaterThanOrEqual(2);
    const hues = result.colors.map((c) => c.h);
    expect(hues.some((h) => h > 10 && h < 60)).toBe(true);
    expect(hues.some((h) => h > 240 && h < 290)).toBe(true);
  });
});
