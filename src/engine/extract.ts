/**
 * Image Color Extraction.
 *
 * Drops an image → extracts dominant colors via k-means in OKLCH space.
 * Adaptive k (3-7) based on chromatic variance.
 * Peak-chroma representatives (not averaged centroids) + normalize-to-peak
 * chroma scaling preserves the image's relative intensity relationships.
 */

import { oklch } from "culori";
import type { OklchColor } from "../types";
import { purifyColor } from "./purify";
import { maxChroma } from "./gamut";

interface ExtractionResult {
  colors: OklchColor[];
  isSingleColor: boolean;
}

/**
 * Extract dominant colors from an image element.
 * Returns 1-7 purified colors depending on image complexity.
 */
export function extractColors(imageData: ImageData): ExtractionResult {
  const pixels = samplePixels(imageData, 2000);

  if (pixels.length === 0) {
    return { colors: [{ l: 0.5, c: 0, h: 0 }], isSingleColor: true };
  }

  // Check if it's basically one color
  const variance = chromaticVariance(pixels);
  if (variance < 0.005) {
    const avg = averageColor(pixels);
    return { colors: [purifyColor(avg)], isSingleColor: true };
  }

  // Adaptive k based on variance
  const k = Math.min(7, Math.max(3, Math.round(variance * 80)));

  // Run k-means in OKLCH space
  const clusters = kMeans(pixels, k, 20);

  // Sort by perceptual prominence (centroid chroma × cluster size weight)
  const sorted = clusters
    .filter((c) => c.count > 0)
    .sort((a, b) => {
      const scoreA =
        (a.center.c / Math.max(0.01, maxChroma(a.center.l, a.center.h))) *
        Math.sqrt(a.count);
      const scoreB =
        (b.center.c / Math.max(0.01, maxChroma(b.center.l, b.center.h))) *
        Math.sqrt(b.count);
      return scoreB - scoreA;
    });

  // Cull near-duplicates and neutrals — keep only distinct palette entries
  const distinct = cullForDistinctiveness(sorted.map((c) => c.peak));

  // Normalize chroma: the most vivid color hits near-max, quieter colors
  // scale proportionally. Preserves the image's chroma relationships
  // instead of flattening everything to gamut max.
  const colors = normalizeChroma(distinct);

  return { colors, isSingleColor: false };
}

/**
 * Load an image file and return its ImageData.
 */
export function imageFileToImageData(file: File): Promise<ImageData> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const url = URL.createObjectURL(file);

    img.onload = () => {
      // Scale down for performance — max 200px on longest side
      const maxDim = 200;
      const scale = Math.min(1, maxDim / Math.max(img.width, img.height));
      const w = Math.round(img.width * scale);
      const h = Math.round(img.height * scale);

      const canvas = document.createElement("canvas");
      canvas.width = w;
      canvas.height = h;
      const ctx = canvas.getContext("2d")!;
      ctx.drawImage(img, 0, 0, w, h);

      const imageData = ctx.getImageData(0, 0, w, h);
      URL.revokeObjectURL(url);
      resolve(imageData);
    };

    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("Failed to load image"));
    };

    img.src = url;
  });
}

/**
 * Convert a data URL to ImageData for on-demand color extraction.
 */
export function dataUrlToImageData(dataUrl: string): Promise<ImageData> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      const maxDim = 200;
      const scale = Math.min(1, maxDim / Math.max(img.width, img.height));
      const w = Math.round(img.width * scale);
      const h = Math.round(img.height * scale);

      const canvas = document.createElement("canvas");
      canvas.width = w;
      canvas.height = h;
      const ctx = canvas.getContext("2d")!;
      ctx.drawImage(img, 0, 0, w, h);

      resolve(ctx.getImageData(0, 0, w, h));
    };
    img.onerror = () => reject(new Error("Failed to load image"));
    img.src = dataUrl;
  });
}

/**
 * Create a data URL from a File for display on canvas.
 */
export function fileToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

// ---- Internals ----

/**
 * Normalize extracted colors so the most vivid hits near-max chroma
 * while preserving relative intensity relationships.
 * Like audio mastering — peak normalization, not clipping.
 */
function normalizeChroma(colors: OklchColor[]): OklchColor[] {
  // Compute gamut-relative intensity for each color
  const intensities = colors.map((color) => {
    if (color.c < 0.04) return 0; // neutral — no intensity to normalize
    const maxC = maxChroma(color.l, color.h);
    return maxC > 0 ? color.c / maxC : 0;
  });

  // Find the peak intensity
  const peakIntensity = Math.max(...intensities, 0.01); // floor to avoid div/0

  // Target: the peak color reaches 95% of gamut max (slight headroom)
  const TARGET = 0.95;
  const scale = TARGET / peakIntensity;

  return colors.map((color, i) => {
    if (color.c < 0.04) return color; // neutrals pass through unchanged

    // Scale this color's chroma relative to the peak
    const normalizedIntensity = Math.min(1, intensities[i] * scale);
    const maxC = maxChroma(color.l, color.h);
    const newC = normalizedIntensity * maxC;

    return { l: color.l, c: newC, h: color.h };
  });
}

/** Sample up to N pixels from image data, converting to OKLCH */
function samplePixels(imageData: ImageData, maxSamples: number): OklchColor[] {
  const { data, width, height } = imageData;
  const totalPixels = width * height;
  const step = Math.max(1, Math.floor(totalPixels / maxSamples));
  const pixels: OklchColor[] = [];

  for (let i = 0; i < totalPixels; i += step) {
    const idx = i * 4;
    const r = data[idx] / 255;
    const g = data[idx + 1] / 255;
    const b = data[idx + 2] / 255;
    const a = data[idx + 3] / 255;

    // Skip transparent pixels
    if (a < 0.5) continue;

    const color = oklch({ mode: "rgb", r, g, b });
    if (color) {
      pixels.push({
        l: color.l,
        c: color.c ?? 0,
        h: color.h ?? 0,
      });
    }
  }

  return pixels;
}

/** Chromatic variance — how colorfully diverse the image is */
function chromaticVariance(pixels: OklchColor[]): number {
  if (pixels.length < 2) return 0;
  const avgC = pixels.reduce((s, p) => s + p.c, 0) / pixels.length;
  const variance =
    pixels.reduce((s, p) => s + (p.c - avgC) ** 2, 0) / pixels.length;
  // Also consider hue spread
  const hues = pixels.filter((p) => p.c > 0.02).map((p) => p.h);
  const hueSpread = hues.length > 1 ? hueRange(hues) / 360 : 0;
  return Math.sqrt(variance) + hueSpread * 0.1;
}

/** Range of hues (accounting for circular wraparound) */
function hueRange(hues: number[]): number {
  if (hues.length < 2) return 0;
  const sorted = [...hues].sort((a, b) => a - b);
  let maxGap = 0;
  for (let i = 1; i < sorted.length; i++) {
    maxGap = Math.max(maxGap, sorted[i] - sorted[i - 1]);
  }
  // Check wraparound gap
  maxGap = Math.max(maxGap, 360 - sorted[sorted.length - 1] + sorted[0]);
  return 360 - maxGap;
}

/** Simple average color */
function averageColor(pixels: OklchColor[]): OklchColor {
  const n = pixels.length;
  const l = pixels.reduce((s, p) => s + p.l, 0) / n;
  const c = pixels.reduce((s, p) => s + p.c, 0) / n;
  // Circular mean for hue
  const sinSum = pixels.reduce(
    (s, p) => s + Math.sin((p.h * Math.PI) / 180),
    0,
  );
  const cosSum = pixels.reduce(
    (s, p) => s + Math.cos((p.h * Math.PI) / 180),
    0,
  );
  const h = ((Math.atan2(sinSum, cosSum) * 180) / Math.PI + 360) % 360;
  return { l, c, h };
}

/** OKLCH distance (simplified — treats hue linearly for clustering) */
function oklchDistance(a: OklchColor, b: OklchColor): number {
  const dl = a.l - b.l;
  const dc = a.c - b.c;
  // Hue distance (circular)
  let dh = Math.abs(a.h - b.h);
  if (dh > 180) dh = 360 - dh;
  // Weight hue by chroma (low chroma = hue doesn't matter)
  // Boost for muted-but-chromatic colors (C > 0.03): smooth ramp from
  // 0 to 0.002 over C = 0.03..0.07, no discontinuity at the boundary.
  const avgC = (a.c + b.c) / 2;
  const boost =
    avgC > 0.03 ? 0.002 * Math.min(1, (avgC - 0.03) / 0.04) : 0;
  const hueWeight = avgC * 0.025 + boost;
  return Math.sqrt(dl * dl + dc * dc + dh * dh * hueWeight * hueWeight);
}

interface Cluster {
  center: OklchColor; // averaged center (used for k-means convergence)
  peak: OklchColor; // highest-chroma actual pixel in cluster
  count: number;
}

/** K-means clustering in OKLCH space */
function kMeans(pixels: OklchColor[], k: number, maxIter: number): Cluster[] {
  // Initialize centers using k-means++
  const centers: OklchColor[] = [];
  centers.push(pixels[Math.floor(Math.random() * pixels.length)]);

  for (let i = 1; i < k; i++) {
    const distances = pixels.map((p) => {
      const minDist = Math.min(...centers.map((c) => oklchDistance(p, c)));
      return minDist * minDist;
    });
    const totalDist = distances.reduce((s, d) => s + d, 0);
    let r = Math.random() * totalDist;
    for (let j = 0; j < pixels.length; j++) {
      r -= distances[j];
      if (r <= 0) {
        centers.push(pixels[j]);
        break;
      }
    }
    if (centers.length <= i) {
      centers.push(pixels[Math.floor(Math.random() * pixels.length)]);
    }
  }

  // Iterate
  const assignments = new Array(pixels.length).fill(0);

  for (let iter = 0; iter < maxIter; iter++) {
    // Assign pixels to nearest center
    let changed = false;
    for (let i = 0; i < pixels.length; i++) {
      let minDist = Infinity;
      let minIdx = 0;
      for (let j = 0; j < centers.length; j++) {
        const d = oklchDistance(pixels[i], centers[j]);
        if (d < minDist) {
          minDist = d;
          minIdx = j;
        }
      }
      if (assignments[i] !== minIdx) {
        assignments[i] = minIdx;
        changed = true;
      }
    }

    if (!changed) break;

    // Update centers
    for (let j = 0; j < centers.length; j++) {
      const members = pixels.filter((_, i) => assignments[i] === j);
      if (members.length > 0) {
        centers[j] = averageColor(members);
      }
    }
  }

  // Build clusters with peak-chroma representatives
  return centers.map((center, j) => {
    const members = pixels.filter((_, i) => assignments[i] === j);
    const peak =
      members.length > 0
        ? members.reduce((best, p) => (p.c > best.c ? p : best), members[0])
        : center;
    return { center, peak, count: members.length };
  });
}

/**
 * Keep only colors that are meaningfully distinct from each other.
 * Processes in prominence order (input must be pre-sorted).
 * Replaces separate merge + neutral-filter passes.
 */
function cullForDistinctiveness(colors: OklchColor[]): OklchColor[] {
  const MIN_DISTANCE = 0.08;
  const accepted: OklchColor[] = [];

  for (const color of colors) {
    if (accepted.length === 0) {
      accepted.push(color);
      continue;
    }
    const tooClose = accepted.some(
      (a) => oklchDistance(color, a) < MIN_DISTANCE,
    );
    if (!tooClose) {
      accepted.push(color);
    }
  }

  // Remove near-neutrals if chromatic alternatives exist
  const chromatic = accepted.filter((c) => c.c > 0.03);
  if (chromatic.length >= 2) return chromatic;

  return accepted.length > 0 ? accepted : [colors[0]];
}

// ---- Test helpers ----

/**
 * Extract colors from pre-sampled OKLCH pixels (no ImageData needed).
 * Exposed for unit testing — same logic as extractColors minus the
 * pixel sampling step.
 */
export function extractFromPixels(pixels: OklchColor[]): ExtractionResult {
  if (pixels.length === 0) {
    return { colors: [{ l: 0.5, c: 0, h: 0 }], isSingleColor: true };
  }

  const variance = chromaticVariance(pixels);
  if (variance < 0.005) {
    const avg = averageColor(pixels);
    return { colors: [purifyColor(avg)], isSingleColor: true };
  }

  const k = Math.min(7, Math.max(3, Math.round(variance * 80)));
  const clusters = kMeans(pixels, k, 20);

  const sorted = clusters
    .filter((c) => c.count > 0)
    .sort((a, b) => {
      const scoreA =
        (a.center.c / Math.max(0.01, maxChroma(a.center.l, a.center.h))) *
        Math.sqrt(a.count);
      const scoreB =
        (b.center.c / Math.max(0.01, maxChroma(b.center.l, b.center.h))) *
        Math.sqrt(b.count);
      return scoreB - scoreA;
    });

  const distinct = cullForDistinctiveness(sorted.map((c) => c.peak));
  const colors = normalizeChroma(distinct);

  return { colors, isSingleColor: false };
}

/** Exposed for direct unit testing */
export { normalizeChroma as _normalizeChroma, cullForDistinctiveness as _cullForDistinctiveness };
