import type { ColorGamut, OklchColor } from "../types";
import { clampToGamut, maxChroma } from "./gamut";

export interface ResolvedSemanticRampProfile {
  id: string;
  weight: number;
  lightColor(linearProgress: number, seedIndex: number): OklchColor;
  lightBlend(linearProgress: number): number;
  darkColor(normalColor: OklchColor, linearProgress: number): OklchColor;
  darkBlend(linearProgress: number): number;
  seedIndexPenalty?(seedIndex: number, lastIndex: number): number;
}

interface WarmBodyPrior {
  weight: number;
  endpoint: OklchColor;
  yellowness: number;
}

interface GoldBodyPrior {
  weight: number;
  endpoint: OklchColor;
  goldness: number;
}

interface LimeBodyPrior {
  weight: number;
  endpoint: OklchColor;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

function smoothstep(edge0: number, edge1: number, value: number): number {
  const t = clamp((value - edge0) / (edge1 - edge0), 0, 1);
  return t * t * (3 - 2 * t);
}

function normalizeHue(hue: number): number {
  return ((hue % 360) + 360) % 360;
}

function hueDelta(from: number, to: number): number {
  return ((((to - from) % 360) + 540) % 360) - 180;
}

function hueDistance(a: number, b: number): number {
  return Math.abs(hueDelta(a, b));
}

function mixHue(from: number, to: number, t: number): number {
  return normalizeHue(from + hueDelta(from, to) * clamp(t, 0, 1));
}

function relativeChroma(color: OklchColor, targetGamut: ColorGamut): number {
  const available = maxChroma(color.l, color.h, targetGamut);
  return available > 1e-9 ? color.c / available : 0;
}

function warmBodyProfileWeight(
  seed: OklchColor,
  targetGamut: ColorGamut,
): number {
  const hue = normalizeHue(seed.h);
  const hueWeight = clamp(1 - hueDistance(seed.h, 48) / 26, 0, 1);
  const warmRangeGate = smoothstep(34, 45, hue) * (1 - smoothstep(58, 70, hue));
  const intensityWeight = Math.max(
    clamp((relativeChroma(seed, targetGamut) - 0.48) / 0.28, 0, 1),
    clamp((seed.c - 0.1) / 0.08, 0, 1),
  );
  const bodyLightnessWeight =
    clamp((seed.l - 0.58) / 0.13, 0, 1) *
    clamp((0.89 - seed.l) / 0.1, 0, 1);

  return hueWeight * warmRangeGate * intensityWeight * bodyLightnessWeight;
}

function goldBodyProfileWeight(
  seed: OklchColor,
  targetGamut: ColorGamut,
): number {
  const hue = normalizeHue(seed.h);
  const amberWeight = clamp(1 - hueDistance(seed.h, 70) / 24, 0, 1);
  const yellowWeight = clamp(1 - hueDistance(seed.h, 86) / 30, 0, 1);
  const hueWeight = Math.max(amberWeight, yellowWeight);
  const goldRangeGate = smoothstep(58, 68, hue) * (1 - smoothstep(98, 110, hue));
  const intensityWeight = Math.max(
    clamp((relativeChroma(seed, targetGamut) - 0.48) / 0.28, 0, 1),
    clamp((seed.c - 0.1) / 0.08, 0, 1),
  );
  const bodyLightnessWeight =
    clamp((seed.l - 0.64) / 0.11, 0, 1) *
    clamp((0.9 - seed.l) / 0.1, 0, 1);

  return hueWeight * goldRangeGate * intensityWeight * bodyLightnessWeight;
}

function limeBodyProfileWeight(
  seed: OklchColor,
  targetGamut: ColorGamut,
): number {
  const hue = normalizeHue(seed.h);
  const hueWeight = clamp(1 - hueDistance(seed.h, 130) / 18, 0, 1);
  const limeRangeGate = smoothstep(108, 118, hue) * (1 - smoothstep(138, 148, hue));
  const intensityWeight = Math.max(
    clamp((relativeChroma(seed, targetGamut) - 0.52) / 0.28, 0, 1),
    clamp((seed.c - 0.12) / 0.08, 0, 1),
  );
  const bodyLightnessWeight =
    clamp((seed.l - 0.64) / 0.1, 0, 1) *
    clamp((0.88 - seed.l) / 0.09, 0, 1);

  return hueWeight * limeRangeGate * intensityWeight * bodyLightnessWeight;
}

function warmShoulderHue(seedHue: number): number {
  const hue = normalizeHue(seedHue);
  if (hue <= 50) return 74;
  if (hue <= 72) return lerp(74, 96, smoothstep(50, 72, hue));
  if (hue <= 96) return lerp(96, 103, smoothstep(72, 96, hue));
  return 103;
}

function warmBodyPrior(
  seed: OklchColor,
  targetGamut: ColorGamut,
): WarmBodyPrior | null {
  const weight = warmBodyProfileWeight(seed, targetGamut);
  if (weight <= 0.02) return null;

  const yellowness = smoothstep(50, 92, normalizeHue(seed.h));
  const h = warmShoulderHue(seed.h);
  const l = lerp(0.984, 0.99, yellowness);
  const seedRatio = lerp(0.12, 0.145, yellowness);
  const occupancy = lerp(0.86, 0.9, yellowness);
  const c = Math.min(seed.c * seedRatio, maxChroma(l, h, targetGamut) * occupancy);

  return {
    weight,
    yellowness,
    endpoint: clampToGamut({ l, c, h }, targetGamut),
  };
}

function goldBodyPrior(
  seed: OklchColor,
  targetGamut: ColorGamut,
): GoldBodyPrior | null {
  const weight = goldBodyProfileWeight(seed, targetGamut);
  if (weight <= 0.02) return null;

  const goldness = smoothstep(70, 90, normalizeHue(seed.h));
  const h = lerp(96, 103, goldness);
  const l = lerp(0.987, 0.99, goldness);
  const seedRatio = lerp(0.13, 0.145, goldness);
  const occupancy = lerp(0.9, 0.82, goldness);
  const c = Math.min(seed.c * seedRatio, maxChroma(l, h, targetGamut) * occupancy);

  return {
    weight,
    goldness,
    endpoint: clampToGamut({ l, c, h }, targetGamut),
  };
}

function limeBodyPrior(
  seed: OklchColor,
  targetGamut: ColorGamut,
): LimeBodyPrior | null {
  const weight = limeBodyProfileWeight(seed, targetGamut);
  if (weight <= 0.02) return null;

  const h = lerp(118, 121, smoothstep(120, 136, normalizeHue(seed.h)));
  const l = 0.986;
  const c = Math.min(seed.c * 0.13, maxChroma(l, h, targetGamut) * 0.76);

  return {
    weight,
    endpoint: clampToGamut({ l, c, h }, targetGamut),
  };
}

function warmLightColor(
  seed: OklchColor,
  prior: WarmBodyPrior,
  linearProgress: number,
  seedIndex: number,
  targetGamut: ColorGamut,
): OklchColor {
  const progress = clamp(linearProgress, 0, 1);
  const shelfExponent =
    seedIndex >= 5
      ? lerp(1.32, 1.55, prior.yellowness)
      : seedIndex <= 3
      ? lerp(3.3, 3.75, prior.yellowness)
      : lerp(1.75, 2.35, prior.yellowness);
  const chromaExponent = lerp(1.18, 0.55, prior.yellowness);
  const hueExponent = lerp(1.75, 2.25, prior.yellowness);

  return clampToGamut({
    l: clamp(
      lerp(prior.endpoint.l, seed.l, progress ** shelfExponent),
      0.02,
      0.995,
    ),
    c: Math.max(0, lerp(prior.endpoint.c, seed.c, progress ** chromaExponent)),
    h: mixHue(prior.endpoint.h, seed.h, progress ** hueExponent),
  }, targetGamut);
}

function goldLightColor(
  seed: OklchColor,
  prior: GoldBodyPrior,
  linearProgress: number,
  seedIndex: number,
  targetGamut: ColorGamut,
): OklchColor {
  const progress = clamp(linearProgress, 0, 1);
  const shelfExponent =
    seedIndex >= 5
      ? lerp(1.36, 1.48, prior.goldness)
      : seedIndex <= 3
      ? lerp(3.2, 3.9, prior.goldness)
      : lerp(1.9, 2.45, prior.goldness);
  const earlyRestraint = smoothstep(
    lerp(0.12, 0.06, prior.goldness),
    lerp(0.36, 0.34, prior.goldness),
    progress,
  );
  const baseChromaProgress = progress ** lerp(0.82, 0.55, prior.goldness);
  const earlyShelfBoost =
    prior.goldness *
    0.06 *
    smoothstep(0.12, 0.2, progress) *
    (1 - smoothstep(0.34, 0.48, progress));
  const shelfBoost =
    lerp(0.3, 0.18, prior.goldness) *
    smoothstep(0.3, 0.62, progress) *
    (1 - smoothstep(0.92, 1, progress));
  const restrainedChromaProgress = progress ** 1.05;
  const chromaProgress = clamp(
    lerp(
      restrainedChromaProgress,
      baseChromaProgress + shelfBoost,
      earlyRestraint,
    ) + earlyShelfBoost,
    0,
    1,
  );
  const hueExponent = lerp(3.4, 4.2, prior.goldness);
  const earlyShelfDrop =
    prior.goldness *
    0.012 *
    smoothstep(0.1, 0.18, progress) *
    (1 - smoothstep(0.34, 0.52, progress));
  const earlyOccupancyCapStrength =
    prior.goldness *
    smoothstep(0.16, 0.24, progress) *
    (1 - smoothstep(0.34, 0.48, progress));

  const color = clampToGamut({
    l: clamp(
      lerp(prior.endpoint.l, seed.l, progress ** shelfExponent) - earlyShelfDrop,
      0.02,
      0.995,
    ),
    c: Math.max(0, lerp(prior.endpoint.c, seed.c, chromaProgress)),
    h: mixHue(prior.endpoint.h, seed.h, progress ** hueExponent),
  }, targetGamut);
  const earlyOccupancyCap = lerp(1.02, 0.84, earlyOccupancyCapStrength);

  return {
    ...color,
    c: Math.min(
      color.c,
      maxChroma(color.l, color.h, targetGamut) * earlyOccupancyCap,
    ),
  };
}

function limeLightColor(
  seed: OklchColor,
  prior: LimeBodyPrior,
  linearProgress: number,
  seedIndex: number,
  targetGamut: ColorGamut,
): OklchColor {
  const progress = clamp(linearProgress, 0, 1);
  const shelfExponent = seedIndex >= 5 ? 1.72 : seedIndex <= 3 ? 1.48 : 1.62;
  const baseChromaProgress = progress ** 1.05;
  const bodyShelfBoost =
    0.26 *
    smoothstep(0.28, 0.62, progress) *
    (1 - smoothstep(0.92, 1, progress));
  const chromaProgress = clamp(baseChromaProgress + bodyShelfBoost, 0, 1.04);
  const color = clampToGamut({
    l: clamp(
      lerp(prior.endpoint.l, seed.l, progress ** shelfExponent),
      0.02,
      0.995,
    ),
    c: Math.max(0, lerp(prior.endpoint.c, seed.c, chromaProgress)),
    h: mixHue(prior.endpoint.h, seed.h, progress),
  }, targetGamut);
  const lightOccupancyCap =
    0.76 +
    0.24 * smoothstep(0.58, 0.86, progress) +
    0.04 * smoothstep(0.86, 1, progress);

  return {
    ...color,
    c: Math.min(
      color.c,
      maxChroma(color.l, color.h, targetGamut) * lightOccupancyCap,
    ),
  };
}

function warmDarkInkColor(
  seed: OklchColor,
  prior: WarmBodyPrior,
  normalColor: OklchColor,
  linearProgress: number,
  targetGamut: ColorGamut,
): OklchColor {
  const progress = clamp(linearProgress, 0, 1);
  const tailHue = normalizeHue(seed.h - lerp(10, 33, prior.yellowness));
  const hue = mixHue(
    seed.h,
    tailHue,
    smoothstep(0.04, lerp(0.42, 0.78, prior.yellowness ** 2), progress),
  );
  const tailLightness = lerp(0.272, 0.286, prior.yellowness);
  const lightnessExponent = lerp(1.18, 1.65, smoothstep(0.55, 0.9, progress));
  const l = Math.max(
    normalColor.l,
    lerp(seed.l, tailLightness, progress ** lightnessExponent),
  );
  const seedOccupancy = relativeChroma(seed, targetGamut);
  const tailOccupancy = lerp(0.8, 0.86, prior.yellowness);
  const occupancy = lerp(
    Math.min(seedOccupancy * 0.98, 1),
    tailOccupancy,
    progress ** 1.25,
  );
  const chromaFade = lerp(0.38, 0.56, prior.yellowness);
  const c = Math.min(
    seed.c * (1 - chromaFade * progress ** 1.55),
    maxChroma(l, hue, targetGamut) * occupancy,
  );

  return clampToGamut({ l, c: Math.max(0, c), h: hue }, targetGamut);
}

function goldDarkInkColor(
  seed: OklchColor,
  prior: GoldBodyPrior,
  normalColor: OklchColor,
  linearProgress: number,
  targetGamut: ColorGamut,
): OklchColor {
  const progress = clamp(linearProgress, 0, 1);
  const tailHue = normalizeHue(seed.h - lerp(24, 32, prior.goldness));
  const hue = mixHue(
    seed.h,
    tailHue,
    smoothstep(0.04, lerp(0.36, 0.86, prior.goldness), progress),
  );
  const tailLightness = lerp(0.279, 0.286, prior.goldness);
  const lightnessExponent = lerp(
    0.92,
    1.24,
    prior.goldness,
  ) + smoothstep(0.62, 0.88, progress) * 0.3;
  const l = lerp(seed.l, tailLightness, progress ** lightnessExponent);
  const seedOccupancy = relativeChroma(seed, targetGamut);
  const tailOccupancy = lerp(0.94, 0.86, prior.goldness);
  const occupancy = lerp(
    Math.min(seedOccupancy * 0.98, 1),
    tailOccupancy,
    progress ** 1.2,
  );
  const chromaFade = lerp(0.52, 0.58, prior.goldness);
  const c = Math.min(
    seed.c * (1 - chromaFade * progress ** 1.5),
    maxChroma(l, hue, targetGamut) * occupancy,
  );
  const target = clampToGamut({ l, c: Math.max(0, c), h: hue }, targetGamut);

  return {
    l: lerp(normalColor.l, target.l, 0.94),
    c: target.c,
    h: target.h,
  };
}

function resolveWarmBodyProfile(
  seed: OklchColor,
  targetGamut: ColorGamut,
): ResolvedSemanticRampProfile | null {
  const prior = warmBodyPrior(seed, targetGamut);
  if (!prior) return null;

  return {
    id: "warm-body",
    weight: prior.weight,
    lightColor: (linearProgress, seedIndex) =>
      warmLightColor(seed, prior, linearProgress, seedIndex, targetGamut),
    lightBlend: () => prior.weight,
    darkColor: (normalColor, linearProgress) =>
      warmDarkInkColor(seed, prior, normalColor, linearProgress, targetGamut),
    darkBlend: (linearProgress) =>
      prior.weight * smoothstep(0.02, 0.45, linearProgress),
  };
}

function resolveGoldBodyProfile(
  seed: OklchColor,
  targetGamut: ColorGamut,
): ResolvedSemanticRampProfile | null {
  const prior = goldBodyPrior(seed, targetGamut);
  if (!prior) return null;

  return {
    id: "gold-body",
    weight: prior.weight,
    lightColor: (linearProgress, seedIndex) =>
      goldLightColor(seed, prior, linearProgress, seedIndex, targetGamut),
    lightBlend: () => prior.weight,
    darkColor: (normalColor, linearProgress) =>
      goldDarkInkColor(seed, prior, normalColor, linearProgress, targetGamut),
    darkBlend: (linearProgress) =>
      prior.weight * smoothstep(0.02, 0.38, linearProgress),
  };
}

function resolveLimeBodyProfile(
  seed: OklchColor,
  targetGamut: ColorGamut,
): ResolvedSemanticRampProfile | null {
  const prior = limeBodyPrior(seed, targetGamut);
  if (!prior) return null;

  return {
    id: "lime-body",
    weight: prior.weight,
    lightColor: (linearProgress, seedIndex) =>
      limeLightColor(seed, prior, linearProgress, seedIndex, targetGamut),
    lightBlend: () => prior.weight,
    darkColor: (normalColor) => normalColor,
    darkBlend: () => 0,
    seedIndexPenalty: (seedIndex, lastIndex) => {
      const bodyIndex = Math.round(lastIndex * 0.5);
      return prior.weight * 2.1 * Math.abs(seedIndex - bodyIndex);
    },
  };
}

export function resolveSemanticRampProfiles(
  seed: OklchColor,
  targetGamut: ColorGamut,
): ResolvedSemanticRampProfile[] {
  return [
    resolveWarmBodyProfile(seed, targetGamut),
    resolveGoldBodyProfile(seed, targetGamut),
    resolveLimeBodyProfile(seed, targetGamut),
  ].filter(
    (profile): profile is ResolvedSemanticRampProfile => profile !== null,
  );
}
