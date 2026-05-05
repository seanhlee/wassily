import type { OklchColor } from "../types";

/**
 * Ring stroke color for a marker dot. Contrast is computed against the fill,
 * not the image underneath — this stays stable during drag and is cheap. The
 * 0.6 threshold sits near perceptual mid-gray in OKLCH space.
 */
export function adaptiveRingStroke(color: OklchColor): "#000" | "#fff" {
  return color.l > 0.6 ? "#000" : "#fff";
}
