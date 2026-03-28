/**
 * WCAG Contrast Ratio calculation.
 *
 * Calculates contrast ratios between colors for AA compliance checking.
 * Used by swatch dots and connection lines.
 */

import { rgb } from "culori";
import type { OklchColor, ContrastResult } from "../types";
import { toCulori } from "./gamut";

/**
 * Calculate relative luminance from linear RGB values.
 * Per WCAG 2.x specification.
 */
function relativeLuminance(r: number, g: number, b: number): number {
  const [rs, gs, bs] = [r, g, b].map((c) => {
    const clamped = Math.max(0, Math.min(1, c));
    return clamped <= 0.03928
      ? clamped / 12.92
      : Math.pow((clamped + 0.055) / 1.055, 2.4);
  });
  return 0.2126 * rs + 0.7152 * gs + 0.0722 * bs;
}

/**
 * Calculate WCAG 2.x contrast ratio between two colors.
 * Returns a value between 1 and 21.
 */
export function contrastRatio(a: OklchColor, b: OklchColor): number {
  const rgbA = rgb(toCulori(a));
  const rgbB = rgb(toCulori(b));

  const lumA = relativeLuminance(rgbA.r, rgbA.g, rgbA.b);
  const lumB = relativeLuminance(rgbB.r, rgbB.g, rgbB.b);

  const lighter = Math.max(lumA, lumB);
  const darker = Math.min(lumA, lumB);

  return (lighter + 0.05) / (darker + 0.05);
}

/**
 * Full contrast check between two colors.
 */
export function checkContrast(a: OklchColor, b: OklchColor): ContrastResult {
  const ratio = contrastRatio(a, b);
  return {
    ratio: Math.round(ratio * 10) / 10, // round to 1 decimal
    passesAA: ratio >= 4.5,
    passesAALarge: ratio >= 3,
  };
}

/** White in OKLCH */
export const WHITE: OklchColor = { l: 1, c: 0, h: 0 };

/** Black in OKLCH */
export const BLACK: OklchColor = { l: 0, c: 0, h: 0 };

/**
 * Check what a color passes against — used for swatch dots.
 */
export function swatchDots(color: OklchColor): {
  onWhite: boolean;
  onBlack: boolean;
} {
  return {
    onWhite: contrastRatio(color, WHITE) >= 4.5,
    onBlack: contrastRatio(color, BLACK) >= 4.5,
  };
}
