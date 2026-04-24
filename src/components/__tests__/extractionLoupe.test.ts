import { describe, it, expect } from "vitest";
import { computeLoupeOffset } from "../extractionLoupeMath";

describe("computeLoupeOffset", () => {
  const loupe = 140;
  const gap = 24;
  const vw = 1600;
  const vh = 1000;

  it("defaults to up-left of the cursor", () => {
    const { left, top } = computeLoupeOffset(800, 500, vw, vh, loupe, gap);
    expect(left).toBe(800 - (loupe + gap));
    expect(top).toBe(500 - (loupe + gap));
  });

  it("flips to the right when cursor is near the left edge", () => {
    const cursorX = 50; // default would be 50 - 164 = -114 (clipped)
    const { left } = computeLoupeOffset(cursorX, 500, vw, vh, loupe, gap);
    expect(left).toBe(cursorX + gap);
  });

  it("flips below when cursor is near the top edge", () => {
    const cursorY = 50;
    const { top } = computeLoupeOffset(800, cursorY, vw, vh, loupe, gap);
    expect(top).toBe(cursorY + gap);
  });

  it("clamps the right edge so the loupe never leaves the viewport", () => {
    const cursorX = vw - 10; // cursor near far right
    const { left } = computeLoupeOffset(cursorX, 500, vw, vh, loupe, gap);
    // Default (up-left) would place it inside; make sure clamp kicks in
    // if flip-right pushed it past the right edge.
    expect(left + loupe).toBeLessThanOrEqual(vw);
  });

  it("clamps the bottom edge so the loupe never leaves the viewport", () => {
    const cursorY = vh - 10;
    const { top } = computeLoupeOffset(800, cursorY, vw, vh, loupe, gap);
    expect(top + loupe).toBeLessThanOrEqual(vh);
  });

  it("skips the clamp when viewport dimensions are 0 (degraded environment)", () => {
    // In a headless / hidden preview, window.innerWidth can be 0. In that
    // case a clamp would push the loupe to -loupeSize; we'd rather keep the
    // natural flipped position than collapse off-screen.
    const { left, top } = computeLoupeOffset(225, 75, 0, 0, loupe, gap);
    expect(left).toBe(225 - (loupe + gap)); // default up-left math, no clamp
    expect(top).toBe(75 + gap); // flipped because 75 - 164 < 0
  });
});
