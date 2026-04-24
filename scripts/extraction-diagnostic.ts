/**
 * Diagnostic: why does extraction return so many similar-looking colors?
 *
 * Runs a handful of representative fixtures through the extraction engine and
 * prints the internal knobs so we can see WHAT the algorithm decided and WHY.
 *
 * Run: npx tsx scripts/extraction-diagnostic.ts
 */

import { oklch } from "culori";
import type { OklchColor } from "../src/types";
import {
  extractFromPixels,
  _paletteComplexity,
  _targetPaletteCount,
  _oklchDistance,
} from "../src/engine/extract";
import { toHex } from "../src/engine/gamut";

interface Fixture {
  name: string;
  description: string;
  pixels: OklchColor[];
}

// ---- Fixture builders ----

function rgbToOklch(r: number, g: number, b: number): OklchColor {
  const c = oklch({ mode: "rgb", r: r / 255, g: g / 255, b: b / 255 })!;
  return { l: c.l ?? 0, c: c.c ?? 0, h: c.h ?? 0 };
}

/** Smooth linear RGB gradient. Pathological for clustering. */
function gradient(
  count: number,
  stops: [number, number, number][],
): OklchColor[] {
  const pixels: OklchColor[] = [];
  for (let i = 0; i < count; i++) {
    const t = i / (count - 1);
    const pos = t * (stops.length - 1);
    const a = Math.floor(pos);
    const b = Math.min(stops.length - 1, a + 1);
    const f = pos - a;
    const r = Math.round(stops[a][0] * (1 - f) + stops[b][0] * f);
    const g = Math.round(stops[a][1] * (1 - f) + stops[b][1] * f);
    const bl = Math.round(stops[a][2] * (1 - f) + stops[b][2] * f);
    pixels.push(rgbToOklch(r, g, bl));
  }
  return pixels;
}

/** Cluster of pixels around a centroid with small random jitter. */
function cluster(
  center: [number, number, number],
  count: number,
  jitter = 12,
): OklchColor[] {
  const pixels: OklchColor[] = [];
  for (let i = 0; i < count; i++) {
    const seed = Math.sin((i + 1) * 12.9898) * 43758.5453;
    const jx = ((seed - Math.floor(seed)) - 0.5) * 2 * jitter;
    const jy = ((Math.sin((i + 1) * 78.233) * 43758.5453) % 1) * jitter * 2 - jitter;
    const jz = ((Math.sin((i + 1) * 237.13) * 43758.5453) % 1) * jitter * 2 - jitter;
    pixels.push(
      rgbToOklch(
        Math.max(0, Math.min(255, center[0] + jx)),
        Math.max(0, Math.min(255, center[1] + jy)),
        Math.max(0, Math.min(255, center[2] + jz)),
      ),
    );
  }
  return pixels;
}

// ---- Analysis ----

function pairwiseDistances(colors: OklchColor[]): {
  min: number;
  mean: number;
  max: number;
} {
  if (colors.length < 2) return { min: 0, mean: 0, max: 0 };
  let min = Infinity;
  let max = -Infinity;
  let sum = 0;
  let n = 0;
  for (let i = 0; i < colors.length; i++) {
    for (let j = i + 1; j < colors.length; j++) {
      const d = _oklchDistance(colors[i], colors[j]);
      if (d < min) min = d;
      if (d > max) max = d;
      sum += d;
      n++;
    }
  }
  return { min, mean: sum / n, max };
}

function runFixture(f: Fixture) {
  // Wrap pixels as SampledPixel[] for the complexity calculation
  const sampled = f.pixels.map((color, i) => ({ color, x: i, y: 0 }));
  const complexity = _paletteComplexity(sampled);
  const targetCount = _targetPaletteCount(complexity);
  const result = extractFromPixels(f.pixels);
  const d = pairwiseDistances(result.colors);

  console.log(`\n=== ${f.name} ===`);
  console.log(`  ${f.description}`);
  console.log(`  pixels: ${f.pixels.length}`);
  console.log(`  complexity: ${complexity.toFixed(4)}`);
  console.log(`  targetCount: ${targetCount}`);
  console.log(`  isSingleColor: ${result.isSingleColor}`);
  console.log(`  palette (${result.colors.length}):`);
  for (const color of result.colors) {
    console.log(
      `    ${toHex(color)}  l=${color.l.toFixed(3)} c=${color.c.toFixed(3)} h=${color.h.toFixed(0)}`,
    );
  }
  console.log(
    `  pairwise OKLCH distance — min: ${d.min.toFixed(4)}, mean: ${d.mean.toFixed(4)}, max: ${d.max.toFixed(4)}`,
  );
}

// ---- Fixtures ----

const FIXTURES: Fixture[] = [
  {
    name: "smooth-gradient-rgb",
    description: "Red → green → blue linear gradient (the pathological case)",
    pixels: gradient(800, [
      [208, 40, 40],
      [48, 160, 72],
      [40, 88, 208],
    ]),
  },
  {
    name: "smooth-gradient-5-stop",
    description: "A 5-color hue rainbow gradient",
    pixels: gradient(800, [
      [220, 40, 40],
      [232, 168, 60],
      [48, 170, 76],
      [40, 112, 208],
      [140, 43, 174],
    ]),
  },
  {
    name: "natural-photo-like",
    description: "Four distinct color regions with per-pixel noise, like a photograph",
    pixels: [
      ...cluster([180, 120, 90], 300, 14), // warm skin-ish
      ...cluster([68, 104, 86], 260, 12), // foliage
      ...cluster([210, 210, 200], 200, 10), // quiet sky
      ...cluster([48, 72, 120], 180, 14), // shadow
    ],
  },
  {
    name: "strict-limited-palette",
    description: "Four solid colors, no per-pixel variance — should get 4 crisp ones",
    pixels: [
      ...Array.from({ length: 200 }, () => rgbToOklch(208, 40, 40)),
      ...Array.from({ length: 200 }, () => rgbToOklch(40, 200, 96)),
      ...Array.from({ length: 200 }, () => rgbToOklch(40, 88, 208)),
      ...Array.from({ length: 200 }, () => rgbToOklch(40, 40, 40)),
    ],
  },
  {
    name: "binary-two-color",
    description: "Two solid colors only — should return exactly 2",
    pixels: [
      ...Array.from({ length: 400 }, () => rgbToOklch(208, 40, 40)),
      ...Array.from({ length: 400 }, () => rgbToOklch(40, 88, 208)),
    ],
  },
  {
    name: "single-color-with-noise",
    description: "One color with small jitter — should collapse to 1",
    pixels: cluster([90, 120, 200], 800, 5),
  },
];

for (const f of FIXTURES) runFixture(f);
