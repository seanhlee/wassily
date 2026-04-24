/**
 * Image Color Extraction.
 *
 * Drops an image → extracts dominant colors via k-means in OKLCH space.
 * Adaptive k (3-7) based on chromatic variance.
 * Vivid-core representatives (not averaged centroids) + gentle peak lift
 * chroma scaling preserves the image's relative intensity relationships.
 */

import { oklch } from "culori";
import type { OklchColor, Point } from "../types";
import { maxChroma } from "./gamut";

export interface ExtractionSample {
  color: OklchColor;
  source: Point; // normalized 0..1, relative to the image
}

export interface ExtractionResult {
  samples: ExtractionSample[];
  colors: OklchColor[]; // parallel to samples[].color; kept for existing callsites
  isSingleColor: boolean;
}

interface SampledPixel {
  color: OklchColor;
  x: number; // pixel x in the sampled image
  y: number; // pixel y in the sampled image
}

interface PaletteCandidate {
  peak: SampledPixel;
  color: OklchColor; // alias for peak.color, kept to minimize diff in scoring code
  center: OklchColor;
  count: number;
  coverage: number;
  intensity: number;
  neutral: boolean;
  score: number;
}

const EXTRACT_NEUTRAL_CHROMA = 0.045;
const MIN_CLUSTER_COVERAGE = 0.006;
const MEANINGFUL_NEUTRAL_COVERAGE = 0.12;
const CHROMA_LIFT_TARGET = 0.72;

/**
 * Extract dominant colors from an image element.
 * Returns 1-7 source-aware colors depending on image complexity.
 * Each returned sample carries a normalized `source` position in [0, 1],
 * relative to `imageData`'s pixel dimensions.
 */
export function extractColors(imageData: ImageData): ExtractionResult {
  const pixels = samplePixels(imageData, 2000);
  return runExtraction(pixels, imageData.width, imageData.height);
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
 * Gently lift extracted colors so the most vivid chromatic entry reaches
 * a healthy source-aware peak while preserving relative intensity.
 * This gives images some Wassily presence without full purification.
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

  // Lift quiet images up to the target, but never compress already-vivid input.
  const scale =
    peakIntensity < CHROMA_LIFT_TARGET ? CHROMA_LIFT_TARGET / peakIntensity : 1;

  return colors.map((color, i) => {
    if (color.c < 0.04) return color; // neutrals pass through unchanged

    // Scale this color's chroma relative to the peak
    const normalizedIntensity = Math.min(1, intensities[i] * scale);
    const maxC = maxChroma(color.l, color.h);
    const newC = normalizedIntensity * maxC;

    return { l: color.l, c: newC, h: color.h };
  });
}

/**
 * Sample up to N pixels from image data, converting to OKLCH and keeping the
 * source pixel coordinate on each sample. Coordinates are in the provided
 * imageData's pixel space; normalization happens once at the end of the
 * pipeline in `runExtraction`.
 *
 * TODO(phase 1.5): optional natural-size peak-chroma refinement. Current
 * peaks come from whatever resolution imageData arrives at (today that's
 * the 200px downscale from `dataUrlToImageData`). For sharper peak colors
 * and sub-downscale marker placement, we can re-sample the peak's local
 * region from a full-resolution canvas.
 */
function samplePixels(imageData: ImageData, maxSamples: number): SampledPixel[] {
  const { data, width, height } = imageData;
  const pixels: SampledPixel[] = [];
  const totalPixels = width * height;

  if (totalPixels <= maxSamples) {
    for (let i = 0; i < totalPixels; i++) {
      const idx = i * 4;
      const color = pixelToOklch(data, idx);
      if (color) {
        pixels.push({ color, x: i % width, y: Math.floor(i / width) });
      }
    }
    return pixels;
  }

  const cols = Math.max(1, Math.ceil(Math.sqrt((maxSamples * width) / height)));
  const rows = Math.max(1, Math.ceil(maxSamples / cols));

  for (let row = 0; row < rows; row++) {
    for (let col = 0; col < cols; col++) {
      if (pixels.length >= maxSamples) return pixels;

      const jitter = deterministicJitter(row, col);
      const x = Math.min(
        width - 1,
        Math.floor(((col + 0.25 + jitter.x * 0.5) / cols) * width),
      );
      const y = Math.min(
        height - 1,
        Math.floor(((row + 0.25 + jitter.y * 0.5) / rows) * height),
      );
      const color = pixelToOklch(data, (y * width + x) * 4);
      if (color) pixels.push({ color, x, y });
    }
  }

  return pixels;
}

function pixelToOklch(data: Uint8ClampedArray, idx: number): OklchColor | null {
  const r = data[idx] / 255;
  const g = data[idx + 1] / 255;
  const b = data[idx + 2] / 255;
  const a = data[idx + 3] / 255;

  // Skip transparent pixels
  if (a < 0.5) return null;

  const color = oklch({ mode: "rgb", r, g, b });
  if (color) {
    return {
      l: color.l,
      c: color.c ?? 0,
      h: color.h ?? 0,
    };
  }

  return null;
}

function deterministicJitter(row: number, col: number): { x: number; y: number } {
  const seed = Math.sin((row + 1) * 127.1 + (col + 1) * 311.7) * 43758.5453;
  const x = seed - Math.floor(seed);
  const ySeed = Math.sin((row + 1) * 269.5 + (col + 1) * 183.3) * 24634.6345;
  const y = ySeed - Math.floor(ySeed);
  return { x, y };
}

/** Palette complexity — hue/chroma diversity plus tonal spread. */
function paletteComplexity(pixels: SampledPixel[]): number {
  if (pixels.length < 2) return 0;
  const avgL = pixels.reduce((s, p) => s + p.color.l, 0) / pixels.length;
  const avgC = pixels.reduce((s, p) => s + p.color.c, 0) / pixels.length;
  const lVariance =
    pixels.reduce((s, p) => s + (p.color.l - avgL) ** 2, 0) / pixels.length;
  const cVariance =
    pixels.reduce((s, p) => s + (p.color.c - avgC) ** 2, 0) / pixels.length;
  const hues = pixels.filter((p) => p.color.c > 0.02).map((p) => p.color.h);
  const hueSpread = hues.length > 1 ? hueRange(hues) / 360 : 0;
  const hueConfidence = Math.min(1, avgC / 0.12);

  return (
    Math.sqrt(cVariance) +
    Math.sqrt(lVariance) * 0.55 +
    hueSpread * hueConfidence * 0.1
  );
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
  peak: SampledPixel; // vivid, dense-ish actual pixel in cluster
  count: number;
}

function gamutIntensity(color: OklchColor): number {
  if (color.c < EXTRACT_NEUTRAL_CHROMA) return 0;
  const maxC = maxChroma(color.l, color.h);
  return maxC > 0 ? color.c / maxC : 0;
}

function isExtractNeutral(color: OklchColor): boolean {
  return color.c < EXTRACT_NEUTRAL_CHROMA;
}

function nearestToCenter(
  members: SampledPixel[],
  center: OklchColor,
): SampledPixel {
  return members.reduce((best, p) =>
    oklchDistance(p.color, center) < oklchDistance(best.color, center)
      ? p
      : best,
  );
}

function pickRepresentative(
  members: SampledPixel[],
  center: OklchColor,
): SampledPixel {
  if (members.length === 0) {
    // Defensive fallback — kMeans doesn't actually call this with 0 members.
    return { color: center, x: 0, y: 0 };
  }
  if (isExtractNeutral(center)) return nearestToCenter(members, center);

  const scored = members
    .map((pixel) => ({
      pixel,
      intensity: gamutIntensity(pixel.color),
      distance: oklchDistance(pixel.color, center),
    }))
    .sort((a, b) => b.intensity - a.intensity);
  const poolSize = Math.max(1, Math.ceil(scored.length * 0.12));
  const vividCore = scored.slice(0, poolSize);

  return vividCore.reduce((best, candidate) =>
    candidate.distance < best.distance ? candidate : best,
  ).pixel;
}

/** Simple seeded PRNG (mulberry32) */
function mulberry32(seed: number): () => number {
  return () => {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Derive a deterministic seed from pixel data */
function pixelSeed(pixels: SampledPixel[]): number {
  let h = 0;
  const step = Math.max(1, Math.floor(pixels.length / 64));
  for (let i = 0; i < pixels.length; i += step) {
    const { color } = pixels[i];
    h = (h * 31 + ((color.l * 1000) | 0)) | 0;
    h = (h * 31 + ((color.c * 1000) | 0)) | 0;
    h = (h * 31 + ((color.h * 10) | 0)) | 0;
  }
  return h;
}

/** Run k-means N times with different seeds, return the best clustering (lowest WCSS) */
function bestOfN(
  pixels: SampledPixel[],
  k: number,
  maxIter: number,
  n: number,
): Cluster[] {
  const seed = pixelSeed(pixels);
  let bestClusters: Cluster[] = [];
  let bestWCSS = Infinity;

  for (let run = 0; run < n; run++) {
    const random = mulberry32(seed + run);
    const { clusters, wcss } = kMeans(pixels, k, maxIter, random);
    if (wcss < bestWCSS) {
      bestWCSS = wcss;
      bestClusters = clusters;
    }
  }
  return bestClusters;
}

/** K-means clustering in OKLCH space */
function kMeans(
  pixels: SampledPixel[],
  k: number,
  maxIter: number,
  random: () => number,
): { clusters: Cluster[]; wcss: number } {
  // Initialize centers using k-means++
  const centers: OklchColor[] = [];
  centers.push(pixels[Math.floor(random() * pixels.length)].color);

  for (let i = 1; i < k; i++) {
    const distances = pixels.map((p) => {
      const minDist = Math.min(
        ...centers.map((c) => oklchDistance(p.color, c)),
      );
      return minDist * minDist;
    });
    const totalDist = distances.reduce((s, d) => s + d, 0);
    let r = random() * totalDist;
    for (let j = 0; j < pixels.length; j++) {
      r -= distances[j];
      if (r <= 0) {
        centers.push(pixels[j].color);
        break;
      }
    }
    if (centers.length <= i) {
      centers.push(pixels[Math.floor(random() * pixels.length)].color);
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
        const d = oklchDistance(pixels[i].color, centers[j]);
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
      const members = pixels.filter((_, idx) => assignments[idx] === j);
      if (members.length > 0) {
        centers[j] = averageColor(members.map((m) => m.color));
      }
    }
  }

  // Compute WCSS (within-cluster sum of squared distances)
  let wcss = 0;
  for (let i = 0; i < pixels.length; i++) {
    const d = oklchDistance(pixels[i].color, centers[assignments[i]]);
    wcss += d * d;
  }

  // Build clusters with peak-chroma representatives
  const clusters = centers.map((center, j) => {
    const members = pixels.filter((_, i) => assignments[i] === j);
    const peak = pickRepresentative(members, center);
    return { center, peak, count: members.length };
  });

  return { clusters, wcss };
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

function targetPaletteCount(complexity: number): number {
  // The × 24 coefficient (down from 42) moves the 7-cap saturation point
  // from complexity ~0.12 to ~0.20. Smooth gradients sit in the 0.12-0.17
  // range; photos and rich palettes sit at 0.19+. This dampens the gradient
  // over-extraction case without clipping real palettes.
  return Math.min(7, Math.max(2, Math.round(2 + complexity * 24)));
}

function candidateScore(candidate: Omit<PaletteCandidate, "score">): number {
  const coverage = Math.sqrt(candidate.coverage);
  if (candidate.neutral) {
    const tonalPresence = Math.min(
      1,
      Math.abs(candidate.color.l - 0.5) * 1.6 + 0.2,
    );
    return coverage * 0.72 + tonalPresence * 0.12;
  }

  return (
    coverage * 0.48 +
    candidate.intensity * 0.42 +
    Math.min(0.1, candidate.color.c * 0.5)
  );
}

function toPaletteCandidate(
  cluster: Cluster,
  totalPixels: number,
): PaletteCandidate {
  const coverage = cluster.count / totalPixels;
  const neutral =
    isExtractNeutral(cluster.center) || isExtractNeutral(cluster.peak.color);
  const intensity = gamutIntensity(cluster.peak.color);
  const base = {
    peak: cluster.peak,
    color: cluster.peak.color,
    center: cluster.center,
    count: cluster.count,
    coverage,
    intensity,
    neutral,
  };
  return { ...base, score: candidateScore(base) };
}

function paletteDistanceThreshold(
  a: PaletteCandidate,
  b: PaletteCandidate,
): number {
  if (a.neutral && b.neutral) return 0.11;
  if (a.neutral || b.neutral) return 0.09;
  // Chromatic-vs-chromatic: was 0.08, raised to 0.12 to cull visually
  // redundant near-hues on gradients and near-hue photo regions. Pairs
  // inside 0.12 OKLCH distance usually read as "the same color" to the eye
  // even when their hues differ by 20-30°.
  return 0.12;
}

function isDistinctCandidate(
  candidate: PaletteCandidate,
  accepted: PaletteCandidate[],
): boolean {
  return !accepted.some(
    (color) =>
      oklchDistance(candidate.color, color.color) <
      paletteDistanceThreshold(candidate, color),
  );
}

function selectCoherentPalette(
  clusters: Cluster[],
  totalPixels: number,
  targetCount: number,
): SampledPixel[] {
  const candidates = clusters
    .filter((cluster) => cluster.count > 0)
    .map((cluster) => toPaletteCandidate(cluster, totalPixels))
    .sort((a, b) => b.score - a.score);

  if (candidates.length === 0) {
    return [{ color: { l: 0.5, c: 0, h: 0 }, x: 0, y: 0 }];
  }

  const neutralCoverage = candidates
    .filter((candidate) => candidate.neutral)
    .reduce((sum, candidate) => sum + candidate.coverage, 0);
  const chromaticCoverage = candidates
    .filter((candidate) => !candidate.neutral)
    .reduce((sum, candidate) => sum + candidate.coverage, 0);
  const allNeutral = chromaticCoverage < 0.08;
  const neutralLimit = allNeutral
    ? Math.min(targetCount, 4)
    : neutralCoverage >= MEANINGFUL_NEUTRAL_COVERAGE
      ? 2
      : 1;

  const accepted: PaletteCandidate[] = [];

  const tryAccept = (
    candidate: PaletteCandidate,
    options: { ignoreNeutralLimit?: boolean } = {},
  ): boolean => {
    if (accepted.length >= targetCount) return false;
    if (candidate.coverage < MIN_CLUSTER_COVERAGE) return false;
    if (candidate.neutral && !options.ignoreNeutralLimit) {
      if (!allNeutral && neutralCoverage < MEANINGFUL_NEUTRAL_COVERAGE) {
        return false;
      }
      const neutralCount = accepted.filter((color) => color.neutral).length;
      if (neutralCount >= neutralLimit) return false;
    }
    if (!isDistinctCandidate(candidate, accepted)) return false;

    accepted.push(candidate);
    return true;
  };

  for (const candidate of candidates) {
    tryAccept(candidate);
  }

  if (!allNeutral && neutralCoverage >= MEANINGFUL_NEUTRAL_COVERAGE) {
    const hasNeutral = accepted.some((candidate) => candidate.neutral);
    const neutral = candidates
      .filter((candidate) => candidate.neutral)
      .sort((a, b) => b.coverage - a.coverage || b.score - a.score)[0];
    if (!hasNeutral && neutral && isDistinctCandidate(neutral, accepted)) {
      if (accepted.length < targetCount) {
        accepted.push(neutral);
      } else {
        const replaceIndex = accepted.findIndex((candidate) => !candidate.neutral);
        if (replaceIndex >= 0) accepted[replaceIndex] = neutral;
      }
    }
  }

  for (const candidate of candidates) {
    if (accepted.length >= Math.min(2, targetCount)) break;
    tryAccept(candidate, { ignoreNeutralLimit: true });
  }

  const fallback = accepted.length > 0 ? accepted : [candidates[0]];
  return fallback
    .slice()
    .sort((a, b) => {
      if (allNeutral && a.neutral && b.neutral) return b.color.l - a.color.l;
      return b.score - a.score;
    })
    .map((candidate) => candidate.peak);
}

function runExtraction(
  pixels: SampledPixel[],
  width: number,
  height: number,
): ExtractionResult {
  if (pixels.length === 0) {
    const fallback: OklchColor = { l: 0.5, c: 0, h: 0 };
    return {
      samples: [{ color: fallback, source: { x: 0.5, y: 0.5 } }],
      colors: [fallback],
      isSingleColor: true,
    };
  }

  // Check if it's basically one color. The complexity metric includes
  // lightness so tonal/neutral images can still produce real palettes.
  const complexity = paletteComplexity(pixels);
  if (complexity < 0.012) {
    const avg = averageColor(pixels.map((p) => p.color));
    const [scaled] = normalizeChroma([avg]);
    const color = scaled ?? avg;
    return {
      samples: [{ color, source: { x: 0.5, y: 0.5 } }],
      colors: [color],
      isSingleColor: true,
    };
  }

  // Adaptive k based on palette complexity.
  const targetCount = targetPaletteCount(complexity);
  const k = Math.min(8, Math.max(2, targetCount + 1));

  // Run k-means 5 times with seeded PRNG, pick best clustering.
  const clusters = bestOfN(pixels, k, 20, 5);
  const selected = selectCoherentPalette(clusters, pixels.length, targetCount);
  // normalizeChroma operates on colors only; zip the normalized coords back in.
  const scaled = normalizeChroma(selected.map((s) => s.color));
  const samples: ExtractionSample[] = selected.map((s, i) => ({
    color: scaled[i],
    source: { x: s.x / width, y: s.y / height },
  }));

  return {
    samples,
    colors: samples.map((s) => s.color),
    isSingleColor: false,
  };
}

// ---- Test helpers ----

/**
 * Extract colors from pre-sampled OKLCH pixels (no ImageData needed).
 * Exposed for unit testing — same logic as extractColors minus the
 * pixel sampling step. Tests that only read `.colors` are unaffected by the
 * samples/source additions; synthetic linear coordinates are attached so the
 * pipeline is uniform.
 */
export function extractFromPixels(pixels: OklchColor[]): ExtractionResult {
  const width = Math.max(1, pixels.length);
  const sampled: SampledPixel[] = pixels.map((color, i) => ({
    color,
    x: i,
    y: 0,
  }));
  return runExtraction(sampled, width, 1);
}

/** Exposed for direct unit testing */
export {
  normalizeChroma as _normalizeChroma,
  cullForDistinctiveness as _cullForDistinctiveness,
  paletteComplexity as _paletteComplexity,
  targetPaletteCount as _targetPaletteCount,
  oklchDistance as _oklchDistance,
};
