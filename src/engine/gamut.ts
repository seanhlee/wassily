/**
 * Gamut mapping utilities.
 *
 * All generated colors must be in-gamut for sRGB.
 * When desired chroma exceeds the boundary, chroma is reduced (never lightness).
 */

import { oklch, rgb, displayable, clampChroma, type Oklch } from "culori";
import type { OklchColor } from "../types";

/** Convert our OklchColor to culori's format */
export function toCulori(color: OklchColor): Oklch {
  return { mode: "oklch", l: color.l, c: color.c, h: color.h };
}

/** Convert culori Oklch back to our format */
export function fromCulori(color: Oklch): OklchColor {
  return { l: color.l, c: color.c ?? 0, h: color.h ?? 0 };
}

/** Check if an OKLCH color is displayable in sRGB */
export function isInGamut(color: OklchColor): boolean {
  return displayable(toCulori(color));
}

/** Clamp a color to sRGB gamut by reducing chroma (never lightness) */
export function clampToGamut(color: OklchColor): OklchColor {
  const clamped = clampChroma(toCulori(color), "oklch");
  return fromCulori(clamped as Oklch);
}

/**
 * Find the maximum chroma for a given lightness and hue in sRGB gamut.
 * Binary search — fast and precise.
 */
export function maxChroma(l: number, h: number): number {
  let lo = 0;
  let hi = 0.4; // OKLCH chroma rarely exceeds ~0.37
  const epsilon = 0.001;

  while (hi - lo > epsilon) {
    const mid = (lo + hi) / 2;
    if (displayable({ mode: "oklch", l, c: mid, h })) {
      lo = mid;
    } else {
      hi = mid;
    }
  }

  return lo;
}

/**
 * Find the lightness where a hue achieves its absolute maximum chroma.
 * This is the hue's "chroma peak" — used in purification when the input
 * lightness sits in a chroma valley.
 */
export function chromaPeakLightness(h: number): {
  l: number;
  maxC: number;
} {
  let bestL = 0.5;
  let bestC = 0;

  // Sweep lightness in coarse steps, then refine
  for (let l = 0.1; l <= 0.95; l += 0.05) {
    const c = maxChroma(l, h);
    if (c > bestC) {
      bestC = c;
      bestL = l;
    }
  }

  // Refine around the peak
  const lo = Math.max(0.05, bestL - 0.05);
  const hi = Math.min(0.95, bestL + 0.05);
  for (let l = lo; l <= hi; l += 0.005) {
    const c = maxChroma(l, h);
    if (c > bestC) {
      bestC = c;
      bestL = l;
    }
  }

  return { l: bestL, maxC: bestC };
}

/** Convert OklchColor to hex string (uppercase) */
export function toHex(color: OklchColor): string {
  const rgbColor = rgb(toCulori(color));
  const r = Math.round(Math.max(0, Math.min(1, rgbColor.r)) * 255);
  const g = Math.round(Math.max(0, Math.min(1, rgbColor.g)) * 255);
  const b = Math.round(Math.max(0, Math.min(1, rgbColor.b)) * 255);
  return `#${r.toString(16).padStart(2, "0")}${g.toString(16).padStart(2, "0")}${b.toString(16).padStart(2, "0")}`.toUpperCase();
}

/** Format an OklchColor as a CSS oklch() string */
export function toOklchString(color: OklchColor): string {
  return `oklch(${color.l.toFixed(3)} ${color.c.toFixed(3)} ${color.h.toFixed(1)})`;
}

/** Parse any CSS color string into OklchColor */
export function parseColor(input: string): OklchColor | null {
  const trimmed = input.trim();

  // Try as a bare hue angle (e.g., "261")
  const asNumber = Number(trimmed);
  if (!isNaN(asNumber) && asNumber >= 0 && asNumber <= 360) {
    // Bare hue — create at ideal lightness and max chroma
    return { l: 0.55, c: maxChroma(0.55, asNumber), h: asNumber };
  }

  // Try culori's parser (handles hex, rgb, hsl, oklch, named colors, etc.)
  const parsed = oklch(trimmed);
  if (parsed) {
    return fromCulori(parsed);
  }

  return null;
}
