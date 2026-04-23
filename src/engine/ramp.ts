/**
 * App-facing ramp generation surface.
 *
 * `opinionated` delegates to the v6 solver.
 * `pure` remains a simple hue-constant baseline used for comparison.
 */

import type { RampConfig, RampStop, StopPreset } from "../types";
import { clampToGamut, maxChroma } from "./gamut";
import { solveV6ResearchRamp } from "./v6ResearchSolver";

const STOP_PRESETS: Record<StopPreset, string[]> = {
  3: ["200", "500", "800"],
  5: ["100", "300", "500", "700", "900"],
  7: ["100", "200", "400", "500", "600", "800", "900"],
  9: ["50", "100", "300", "400", "500", "600", "700", "900", "950"],
  11: [
    "50",
    "100",
    "200",
    "300",
    "400",
    "500",
    "600",
    "700",
    "800",
    "900",
    "950",
  ],
};

const L_MAX = 0.98;
const L_MIN = 0.25;

export function generateRamp(config: RampConfig): RampStop[] {
  const { hue, stopCount, mode } = config;
  if (mode === "opinionated") {
    return solveV6ResearchRamp(config).stops;
  }

  const labels =
    stopCount in STOP_PRESETS
      ? STOP_PRESETS[stopCount as StopPreset]
      : generateCustomLabels(stopCount);

  return labels.map((label, index) =>
    generatePureStop(label, hue, index, labels.length),
  );
}

function generatePureStop(
  label: string,
  seedHue: number,
  index: number,
  total: number,
): RampStop {
  const t = total > 1 ? index / (total - 1) : 0.5;
  const l = L_MAX - (L_MAX - L_MIN) * t;
  const c = maxChroma(l, seedHue) * 0.85;
  const color = clampToGamut({ l, c, h: seedHue });
  const darkColor = clampToGamut({
    l: Math.max(0.05, Math.min(0.98, l + 0.03)),
    c: c * 0.9,
    h: seedHue,
  });

  return { index, label, color, darkColor };
}

function generateCustomLabels(count: number): string[] {
  if (count <= 1) return ["500"];
  if (count === 2) return ["200", "800"];

  const labels: string[] = [];
  for (let i = 0; i < count; i++) {
    const t = i / (count - 1);
    const value = Math.round(50 + t * 900);
    const snapped = Math.round(value / 50) * 50;
    labels.push(String(snapped));
  }
  return labels;
}

const HUE_NAMES: [number, string][] = [
  [15, "red"],
  [40, "orange"],
  [65, "amber"],
  [100, "yellow"],
  [120, "lime"],
  [150, "green"],
  [180, "teal"],
  [210, "cyan"],
  [250, "blue"],
  [280, "indigo"],
  [310, "violet"],
  [340, "pink"],
  [360, "rose"],
];

export function nameForHue(hue: number): string {
  const normalized = ((hue % 360) + 360) % 360;
  for (const [threshold, name] of HUE_NAMES) {
    if (normalized < threshold) return name;
  }
  return "red";
}

export function uniqueRampName(hue: number, existingNames: string[]): string {
  const base = nameForHue(hue);
  if (!existingNames.includes(base)) return base;

  let i = 2;
  while (existingNames.includes(`${base}-${i}`)) i++;
  return `${base}-${i}`;
}
