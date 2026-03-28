/**
 * Color Purification.
 *
 * Every color that enters Wassily is purified to its ideal OKLCH expression.
 * Hue is sacred — never changed. Chroma is maximized to the sRGB gamut boundary.
 * If the input lightness sits in a "chroma valley," lightness nudges toward the peak.
 */

import type { OklchColor } from "../types";
import { maxChroma, chromaPeakLightness } from "./gamut";

export interface PurificationResult {
  original: OklchColor;
  purified: OklchColor;
  chromaGain: number; // how much chroma was added (0 = already optimal)
  lightnessShift: number; // how much lightness was nudged (0 = no shift)
}

/**
 * Purify a color: maximize chroma at its hue, optionally nudge lightness
 * out of chroma valleys.
 */
export function purify(color: OklchColor): PurificationResult {
  const { l, c, h } = color;

  // Find max chroma at current lightness
  const maxC = maxChroma(l, h);

  // Check if we're in a chroma valley — if max chroma at this lightness
  // is significantly less than the hue's peak chroma, nudge lightness
  const peak = chromaPeakLightness(h);
  const chromaRatio = maxC / peak.maxC;

  let purifiedL = l;
  let purifiedC = maxC;

  if (chromaRatio < 0.5) {
    // We're in a deep valley — nudge lightness toward the peak
    // Nudge proportionally: deeper valley = bigger nudge, but never more than 0.15
    const nudgeAmount = Math.min(0.15, (1 - chromaRatio) * 0.2);
    const direction = peak.l > l ? 1 : -1;
    purifiedL = l + direction * nudgeAmount;
    purifiedL = Math.max(0.1, Math.min(0.95, purifiedL));
    purifiedC = maxChroma(purifiedL, h);
  }

  const purified: OklchColor = { l: purifiedL, c: purifiedC, h };

  return {
    original: color,
    purified,
    chromaGain: purifiedC - c,
    lightnessShift: purifiedL - l,
  };
}

/**
 * Quick purify — just returns the purified color without metadata.
 * Used internally when we just need the result.
 */
export function purifyColor(color: OklchColor): OklchColor {
  return purify(color).purified;
}

/**
 * Create a purified color from a random hue.
 * Places it at L=0.55 (the anchor lightness) with maximum chroma.
 */
export function randomPurifiedColor(): OklchColor {
  const h = Math.random() * 360;
  const l = 0.55;
  const c = maxChroma(l, h);
  return { l, c, h };
}
