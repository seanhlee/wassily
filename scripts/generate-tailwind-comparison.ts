import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { oklab as toOklab } from "culori";
import type {
  ColorGamut,
  OklchColor,
  RampSeedExactness,
  RampSolveResult,
  TargetGamut,
} from "../src/types";
import { solveRamp } from "../src/engine/ramp";
import { isInGamut, maxChroma, toHex } from "../src/engine/gamut";
import {
  GENERATED_FONT_FACE_CSS,
  GENERATED_TEXT_FONT,
  copyGeneratedFonts,
} from "./researchTypography";

const TAILWIND_VERSION = "4.3.0";
const TAILWIND_THEME_URL = `https://unpkg.com/tailwindcss@${TAILWIND_VERSION}/theme.css`;
const OUTPUT_DIR = path.resolve("docs/generated");
const HTML_PATH = path.join(OUTPUT_DIR, "tailwind-v4-comparison.html");
const JSON_PATH = path.join(OUTPUT_DIR, "tailwind-v4-comparison.json");

const STOP_LABELS = [
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
] as const;

const FAMILY_ORDER = [
  "red",
  "orange",
  "amber",
  "yellow",
  "lime",
  "green",
  "emerald",
  "teal",
  "cyan",
  "sky",
  "blue",
  "indigo",
  "violet",
  "purple",
  "fuchsia",
  "pink",
  "rose",
  "slate",
  "gray",
  "zinc",
  "neutral",
  "stone",
  "mauve",
  "olive",
  "mist",
  "taupe",
] as const;

type StopLabel = (typeof STOP_LABELS)[number];
type TailwindFamily = (typeof FAMILY_ORDER)[number];
type WassilyVariantKey = "srgb" | "p3" | "dualFallback";

interface ComparisonSwatch {
  label: StopLabel;
  css: string;
  hex: string;
  oklch: string;
  l: number;
  c: number;
  h: number;
  inSrgb: boolean;
  inP3: boolean;
  occupancy: number | null;
}

interface RampMetrics {
  peakChromaLabel: StopLabel;
  peakChroma: number;
  l50: number;
  l500: number;
  l950: number;
  c50: number;
  c500: number;
  c950: number;
  h50: number;
  h500: number;
  h950: number;
  hueDrift50To950: number;
  maxHueFrom500: number;
  spacingCv: number;
  worstAdjacentRatio: number;
  outOfSrgbStops: number;
  outOfP3Stops: number;
  maxOccupancy: number | null;
}

interface RampComparison {
  swatches: ComparisonSwatch[];
  metrics: RampMetrics;
}

interface WassilyContract {
  targetGamut: TargetGamut;
  fallbackGamut: ColorGamut | null;
  fallbackPolicy: string;
  exactness: RampSeedExactness;
  seedLabel: string;
  sourceSeedDelta: number;
  targetSeedDelta: number;
  fallbackSeedDelta: number | null;
}

interface WassilyVariant {
  key: WassilyVariantKey;
  label: string;
  comparison: RampComparison;
  contract: WassilyContract;
  anchorLabel: StopLabel;
  seedDelta: number;
  notes: string[];
}

interface FamilyComparison {
  family: TailwindFamily;
  group: "Chromatic" | "Neutral";
  seed: ComparisonSwatch;
  tailwind: RampComparison;
  wassily: Record<WassilyVariantKey, WassilyVariant>;
}

interface ComparisonData {
  generatedAt: string;
  tailwindVersion: string;
  tailwindThemeUrl: string;
  summary: {
    familyCount: number;
    chromaticCount: number;
    neutralCount: number;
    tailwindOutOfSrgb500Count: number;
    tailwindOutOfP3500Count: number;
    wassily: Record<WassilyVariantKey, ModeSummary>;
  };
  families: FamilyComparison[];
}

interface ModeSummary {
  non500AnchorCount: number;
  averageSeedDelta: number;
  largestSeedDelta: { family: string; delta: number };
  anchorCounts: Record<string, number>;
  exactnessCounts: Record<string, number>;
}

function normalizeHue(hue: number): number {
  return ((hue % 360) + 360) % 360;
}

function hueDelta(from: number, to: number): number {
  let delta = normalizeHue(to) - normalizeHue(from);
  if (delta > 180) delta -= 360;
  if (delta < -180) delta += 360;
  return delta;
}

function absHueDelta(a: number, b: number): number {
  return Math.abs(hueDelta(a, b));
}

function average(values: readonly number[]): number {
  return values.length === 0
    ? 0
    : values.reduce((sum, value) => sum + value, 0) / values.length;
}

function coefficientOfVariation(values: readonly number[]): number {
  const mean = average(values);
  if (mean <= 1e-9) return 0;
  const variance = average(values.map((value) => (value - mean) ** 2));
  return Math.sqrt(variance) / mean;
}

function labDistance(a: OklchColor, b: OklchColor): number {
  const aLab = toOklab({ mode: "oklch", ...a })!;
  const bLab = toOklab({ mode: "oklch", ...b })!;
  return Math.sqrt(
    (aLab.l - bLab.l) ** 2 +
      (aLab.a - bLab.a) ** 2 +
      (aLab.b - bLab.b) ** 2,
  );
}

function pairwiseDistances(colors: readonly OklchColor[]): number[] {
  return colors.slice(1).map((color, index) => labDistance(colors[index], color));
}

function parseTailwindOklch(value: string): OklchColor {
  const match = value.match(/oklch\(([^)\s]+)\s+([^)\s]+)\s+([^)\s]+)\)/);
  if (!match) throw new Error(`Could not parse Tailwind OKLCH value: ${value}`);
  const l = match[1].endsWith("%")
    ? Number(match[1].slice(0, -1)) / 100
    : Number(match[1]);
  return {
    l,
    c: Number(match[2]),
    h: normalizeHue(Number(match[3])),
  };
}

function parseTailwindTheme(css: string): Record<TailwindFamily, OklchColor[]> {
  const parsed = {} as Record<TailwindFamily, OklchColor[]>;

  for (const family of FAMILY_ORDER) {
    const colors = STOP_LABELS.map((label) => {
      const pattern = new RegExp(
        `--color-${family}-${label}:\\s*(oklch\\([^)]+\\));`,
      );
      const match = css.match(pattern);
      if (!match) {
        throw new Error(`Missing Tailwind color: ${family}-${label}`);
      }
      return parseTailwindOklch(match[1]);
    });
    parsed[family] = colors;
  }

  return parsed;
}

function formatOklch(color: OklchColor): string {
  return `oklch(${color.l.toFixed(3)} ${color.c.toFixed(3)} ${color.h.toFixed(1)})`;
}

function formatCssOklch(color: OklchColor): string {
  return `oklch(${(color.l * 100).toFixed(1)}% ${color.c.toFixed(3)} ${color.h.toFixed(3)})`;
}

function occupancy(color: OklchColor, targetGamut: ColorGamut): number | null {
  const available = maxChroma(color.l, color.h, targetGamut);
  return available > 1e-9 ? color.c / available : null;
}

function swatchFromColor(
  label: StopLabel,
  color: OklchColor,
  occupancyGamut: ColorGamut = "srgb",
): ComparisonSwatch {
  const occ = occupancy(color, occupancyGamut);
  return {
    label,
    css: formatCssOklch(color),
    hex: toHex(color),
    oklch: formatOklch(color),
    l: Number(color.l.toFixed(4)),
    c: Number(color.c.toFixed(4)),
    h: Number(color.h.toFixed(3)),
    inSrgb: isInGamut(color),
    inP3: isInGamut(color, "display-p3"),
    occupancy: occ === null ? null : Number(occ.toFixed(4)),
  };
}

function metricsForColors(
  colors: readonly OklchColor[],
  occupancyGamut: ColorGamut,
): RampMetrics {
  const swatches = colors.map((color, index) =>
    swatchFromColor(STOP_LABELS[index], color, occupancyGamut),
  );
  const peakIndex = colors.reduce(
    (bestIndex, color, index) => (color.c > colors[bestIndex].c ? index : bestIndex),
    0,
  );
  const distances = pairwiseDistances(colors);
  const occupancies = swatches
    .map((swatch) => swatch.occupancy)
    .filter((value): value is number => value !== null && Number.isFinite(value));
  const h500 = colors[5].h;

  return {
    peakChromaLabel: STOP_LABELS[peakIndex],
    peakChroma: Number(colors[peakIndex].c.toFixed(4)),
    l50: Number(colors[0].l.toFixed(4)),
    l500: Number(colors[5].l.toFixed(4)),
    l950: Number(colors[10].l.toFixed(4)),
    c50: Number(colors[0].c.toFixed(4)),
    c500: Number(colors[5].c.toFixed(4)),
    c950: Number(colors[10].c.toFixed(4)),
    h50: Number(colors[0].h.toFixed(3)),
    h500: Number(h500.toFixed(3)),
    h950: Number(colors[10].h.toFixed(3)),
    hueDrift50To950: Number(hueDelta(colors[0].h, colors[10].h).toFixed(3)),
    maxHueFrom500: Number(
      Math.max(...colors.map((color) => absHueDelta(h500, color.h))).toFixed(3),
    ),
    spacingCv: Number(coefficientOfVariation(distances).toFixed(4)),
    worstAdjacentRatio: Number(
      (Math.max(...distances) / Math.max(Math.min(...distances), 1e-9)).toFixed(4),
    ),
    outOfSrgbStops: swatches.filter((swatch) => !swatch.inSrgb).length,
    outOfP3Stops: swatches.filter((swatch) => !swatch.inP3).length,
    maxOccupancy:
      occupancies.length === 0 ? null : Number(Math.max(...occupancies).toFixed(4)),
  };
}

function comparisonForColors(
  colors: readonly OklchColor[],
  occupancyGamut: ColorGamut,
): RampComparison {
  return {
    swatches: colors.map((color, index) =>
      swatchFromColor(STOP_LABELS[index], color, occupancyGamut),
    ),
    metrics: metricsForColors(colors, occupancyGamut),
  };
}

function familyGroup(family: TailwindFamily): "Chromatic" | "Neutral" {
  return family === "slate" ||
    family === "gray" ||
    family === "zinc" ||
    family === "neutral" ||
    family === "stone" ||
    family === "mauve" ||
    family === "olive" ||
    family === "mist" ||
    family === "taupe"
    ? "Neutral"
    : "Chromatic";
}

function buildContract(solved: RampSolveResult): WassilyContract {
  return {
    targetGamut: solved.metadata.targetGamut,
    fallbackGamut: solved.metadata.fallbackGamut ?? null,
    fallbackPolicy: solved.metadata.fallbackPolicy,
    exactness: solved.metadata.exactness,
    seedLabel: solved.metadata.seedLabel,
    sourceSeedDelta: Number(solved.metadata.seedDelta.source.toFixed(5)),
    targetSeedDelta: Number(solved.metadata.seedDelta.target.toFixed(5)),
    fallbackSeedDelta:
      solved.metadata.seedDelta.fallback === undefined
        ? null
        : Number(solved.metadata.seedDelta.fallback.toFixed(5)),
  };
}

function buildWassilyVariant(
  key: WassilyVariantKey,
  label: string,
  solved: RampSolveResult,
  seed: OklchColor,
  colors: readonly OklchColor[],
  occupancyGamut: ColorGamut,
  family: TailwindFamily,
  tailwind: RampComparison,
): WassilyVariant {
  const anchorLabel = solved.metadata.seedLabel as StopLabel;
  const anchorIndex = solved.metadata.seedIndex;
  const seedDelta = labDistance(colors[anchorIndex], seed);
  const comparison = comparisonForColors(colors, occupancyGamut);
  const variant: Omit<WassilyVariant, "notes"> = {
    key,
    label,
    comparison,
    contract: buildContract(solved),
    anchorLabel,
    seedDelta: Number(seedDelta.toFixed(5)),
  };

  return {
    ...variant,
    notes: buildNotes(family, tailwind, variant),
  };
}

function buildNotes(
  family: TailwindFamily,
  tailwind: RampComparison,
  variant: Omit<WassilyVariant, "notes">,
): string[] {
  const notes: string[] = [];
  const { comparison, anchorLabel, seedDelta, contract, key } = variant;
  if (key === "srgb" && tailwind.swatches[5].inSrgb === false) {
    notes.push("Tailwind 500 is outside sRGB; Wassily currently compresses to sRGB.");
  }
  if (key === "p3" && tailwind.swatches[5].inP3 && contract.exactness === "source-exact") {
    notes.push("P3 target preserves the Tailwind 500 source seed exactly.");
  }
  if (key === "dualFallback") {
    notes.push("Dual fallback is sRGB mapped from the P3 target ramp, not separately solved.");
  }
  if (contract.exactness === "target-mapped") {
    notes.push(
      `Contract: source seed maps to sRGB target (source d=${contract.sourceSeedDelta.toFixed(3)}, target d=${contract.targetSeedDelta.toFixed(3)}).`,
    );
  } else if (contract.exactness === "unanchored") {
    notes.push(
      `Contract: nearest target stop is not exact (target d=${contract.targetSeedDelta.toFixed(3)}).`,
    );
  }
  if (anchorLabel !== "500") {
    notes.push(`Wassily's reported seed anchor is ${anchorLabel}, not 500.`);
  }
  if (seedDelta > 0.02) {
    notes.push(
      `Row anchor is visibly away from the Tailwind 500 source seed (d=${seedDelta.toFixed(3)}).`,
    );
  }
  if (tailwind.metrics.peakChromaLabel !== comparison.metrics.peakChromaLabel) {
    notes.push(
      `Peak chroma shifts from Tailwind ${tailwind.metrics.peakChromaLabel} to ${variant.label} ${comparison.metrics.peakChromaLabel}.`,
    );
  }
  if (Math.abs(tailwind.metrics.l50 - comparison.metrics.l50) > 0.03) {
    notes.push(
      `Light endpoint differs by ${Math.abs(tailwind.metrics.l50 - comparison.metrics.l50).toFixed(3)} L.`,
    );
  }
  if (Math.abs(tailwind.metrics.hueDrift50To950 - comparison.metrics.hueDrift50To950) > 12) {
    notes.push("Hue drift behavior is materially different.");
  }
  if ((family === "orange" || family === "amber" || family === "yellow") && key !== "dualFallback") {
    notes.push("Inspect highlight identity: Tailwind trends sunny/yellow; Wassily may trend peach/tan.");
  }
  return notes;
}

function summarizeMode(
  families: readonly FamilyComparison[],
  key: WassilyVariantKey,
): ModeSummary {
  const variants = families.map((family) => ({
    family: family.family,
    variant: family.wassily[key],
  }));
  const anchorCounts = variants.reduce<Record<string, number>>((counts, entry) => {
    counts[entry.variant.anchorLabel] = (counts[entry.variant.anchorLabel] ?? 0) + 1;
    return counts;
  }, {});
  const exactnessCounts = variants.reduce<Record<string, number>>((counts, entry) => {
    counts[entry.variant.contract.exactness] =
      (counts[entry.variant.contract.exactness] ?? 0) + 1;
    return counts;
  }, {});
  const largest = variants.reduce(
    (best, entry) =>
      entry.variant.seedDelta > best.delta
        ? { family: entry.family, delta: entry.variant.seedDelta }
        : best,
    { family: "", delta: -Infinity },
  );

  return {
    non500AnchorCount: variants.filter((entry) => entry.variant.anchorLabel !== "500").length,
    averageSeedDelta: Number(
      average(variants.map((entry) => entry.variant.seedDelta)).toFixed(5),
    ),
    largestSeedDelta: largest,
    anchorCounts,
    exactnessCounts,
  };
}

async function buildComparisonData(): Promise<ComparisonData> {
  const response = await fetch(TAILWIND_THEME_URL);
  if (!response.ok) {
    throw new Error(`Failed to fetch Tailwind theme: ${response.status}`);
  }
  const tailwindTheme = parseTailwindTheme(await response.text());

  const families = FAMILY_ORDER.map((family): FamilyComparison => {
    const tailwindColors = tailwindTheme[family];
    const seed = tailwindColors[5];
    const baseConfig = {
      hue: seed.h,
      seedChroma: seed.c,
      seedLightness: seed.l,
      stopCount: 11,
      mode: "opinionated",
    } as const;
    const tailwind = comparisonForColors(tailwindColors, "display-p3");
    const srgbSolved = solveRamp({ ...baseConfig, targetGamut: "srgb" });
    const p3Solved = solveRamp({ ...baseConfig, targetGamut: "display-p3" });
    const dualSolved = solveRamp({ ...baseConfig, targetGamut: "dual" });
    const dualFallbackColors = dualSolved.fallbackStops?.map((stop) => stop.color);
    if (!dualFallbackColors) {
      throw new Error(`Missing dual fallback stops for ${family}`);
    }

    return {
      family,
      group: familyGroup(family),
      seed: swatchFromColor("500", seed, "display-p3"),
      tailwind,
      wassily: {
        srgb: buildWassilyVariant(
          "srgb",
          "Wassily sRGB",
          srgbSolved,
          seed,
          srgbSolved.stops.map((stop) => stop.color),
          "srgb",
          family,
          tailwind,
        ),
        p3: buildWassilyVariant(
          "p3",
          "Wassily P3 target",
          p3Solved,
          seed,
          p3Solved.stops.map((stop) => stop.color),
          "display-p3",
          family,
          tailwind,
        ),
        dualFallback: buildWassilyVariant(
          "dualFallback",
          "Dual sRGB fallback",
          dualSolved,
          seed,
          dualFallbackColors,
          "srgb",
          family,
          tailwind,
        ),
      },
    };
  });

  return {
    generatedAt: new Date().toISOString(),
    tailwindVersion: TAILWIND_VERSION,
    tailwindThemeUrl: TAILWIND_THEME_URL,
    summary: {
      familyCount: families.length,
      chromaticCount: families.filter((family) => family.group === "Chromatic").length,
      neutralCount: families.filter((family) => family.group === "Neutral").length,
      tailwindOutOfSrgb500Count: families.filter((family) => !family.seed.inSrgb).length,
      tailwindOutOfP3500Count: families.filter((family) => !family.seed.inP3).length,
      wassily: {
        srgb: summarizeMode(families, "srgb"),
        p3: summarizeMode(families, "p3"),
        dualFallback: summarizeMode(families, "dualFallback"),
      },
    },
    families,
  };
}

function textColorForLightness(lightness: number): string {
  return lightness >= 0.72 ? "#111" : "#fff";
}

function metric(value: number | null, digits = 3): string {
  return value === null ? "n/a" : value.toFixed(digits);
}

function renderSwatches(swatches: readonly ComparisonSwatch[], seedLabel?: StopLabel): string {
  return `
    <div class="swatches">
      ${swatches
        .map(
          (swatch) => `
            <div
              class="swatch${swatch.label === seedLabel ? " swatch--seed" : ""}${!swatch.inSrgb ? " swatch--p3" : ""}${!swatch.inP3 ? " swatch--outside-p3" : ""}"
              style="background:${swatch.css}; color:${textColorForLightness(swatch.l)}"
              title="${swatch.label} ${swatch.oklch}"
            >
              <span class="swatch__label">${swatch.label}</span>
              <span class="swatch__hex">${swatch.hex}</span>
            </div>
          `,
        )
        .join("")}
    </div>
  `;
}

function renderMetrics(comparison: RampComparison, anchor?: StopLabel): string {
  const { metrics } = comparison;
  return `
    <div class="metrics">
      ${anchor ? `<div><span>anchor</span><b>${anchor}</b></div>` : ""}
      <div><span>peak C</span><b>${metrics.peakChromaLabel}</b></div>
      <div><span>L 50/500/950</span><b>${metric(metrics.l50)} / ${metric(metrics.l500)} / ${metric(metrics.l950)}</b></div>
      <div><span>hue drift</span><b>${metrics.hueDrift50To950.toFixed(1)}deg</b></div>
      <div><span>spacing CV</span><b>${metrics.spacingCv.toFixed(3)}</b></div>
      <div><span>worst step</span><b>${metrics.worstAdjacentRatio.toFixed(2)}x</b></div>
      <div><span>sRGB misses</span><b>${metrics.outOfSrgbStops}</b></div>
      <div><span>P3 misses</span><b>${metrics.outOfP3Stops}</b></div>
      <div><span>max occ</span><b>${metric(metrics.maxOccupancy)}</b></div>
    </div>
  `;
}

function renderContract(variant: WassilyVariant): string {
  const { contract } = variant;
  return `
    <div class="contract">
      <span>${contract.targetGamut}</span>
      <span>${contract.exactness}</span>
      <span>source d=${contract.sourceSeedDelta.toFixed(3)}</span>
      <span>target d=${contract.targetSeedDelta.toFixed(3)}</span>
      ${
        contract.fallbackSeedDelta === null
          ? ""
          : `<span>fallback d=${contract.fallbackSeedDelta.toFixed(3)}</span>`
      }
      ${
        contract.fallbackGamut === null
          ? ""
          : `<span>${contract.fallbackPolicy} -> ${contract.fallbackGamut}</span>`
      }
    </div>
  `;
}

function renderWassilyRow(variant: WassilyVariant): string {
  return `
    <section class="ramp-row ramp-row--${variant.key}">
      <div class="ramp-row__label">${variant.label}</div>
      <div class="ramp-row__body">
        ${renderSwatches(variant.comparison.swatches, variant.anchorLabel)}
        ${renderMetrics(variant.comparison, variant.anchorLabel)}
        ${renderContract(variant)}
        ${
          variant.notes.length > 0
            ? `<ul class="notes notes--row">${variant.notes.map((note) => `<li>${note}</li>`).join("")}</ul>`
            : ""
        }
      </div>
    </section>
  `;
}

function renderFamilyCard(family: FamilyComparison): string {
  return `
    <article class="family-card" id="${family.family}">
      <header class="family-card__header">
        <div>
          <h2>${family.family}</h2>
          <p class="family-card__meta">
            Tailwind 500: <span class="mono">${family.seed.oklch}</span>
            ${family.seed.inSrgb ? "" : '<span class="pill pill--warn">P3 / outside sRGB</span>'}
          </p>
        </div>
        <div class="seed-delta">
          <span>P3 seed delta</span>
          <b>${family.wassily.p3.seedDelta.toFixed(3)}</b>
        </div>
      </header>

      <section class="ramp-row">
        <div class="ramp-row__label">Tailwind v4</div>
        <div class="ramp-row__body">
          ${renderSwatches(family.tailwind.swatches, "500")}
          ${renderMetrics(family.tailwind)}
        </div>
      </section>

      ${renderWassilyRow(family.wassily.srgb)}
      ${renderWassilyRow(family.wassily.p3)}
      ${renderWassilyRow(family.wassily.dualFallback)}
    </article>
  `;
}

function renderTopDivergences(
  data: ComparisonData,
  key: WassilyVariantKey,
  title: string,
): string {
  const top = [...data.families]
    .sort((a, b) => b.wassily[key].seedDelta - a.wassily[key].seedDelta)
    .slice(0, 8);

  return `
    <section class="summary-panel">
      <h2>${title}</h2>
      <div class="divergence-list">
        ${top
          .map(
            (family) => `
              <a href="#${family.family}">
                <span>${family.family}</span>
                <b>${family.wassily[key].seedDelta.toFixed(3)}</b>
                <small>anchor ${family.wassily[key].anchorLabel}</small>
              </a>
            `,
          )
          .join("")}
      </div>
    </section>
  `;
}

function renderAnchorAudit(
  data: ComparisonData,
  key: WassilyVariantKey,
  title: string,
): string {
  const non500 = data.families
    .filter((family) => family.wassily[key].anchorLabel !== "500")
    .sort((a, b) => Number(a.wassily[key].anchorLabel) - Number(b.wassily[key].anchorLabel));

  return `
    <section class="summary-panel">
      <h2>${title}</h2>
      <div class="divergence-list">
        ${non500
          .map(
            (family) => `
              <a href="#${family.family}">
                <span>${family.family}</span>
                <b>${family.wassily[key].anchorLabel}</b>
                <small>${family.wassily[key].contract.exactness}, d=${family.wassily[key].seedDelta.toFixed(3)}</small>
              </a>
            `,
          )
          .join("")}
      </div>
    </section>
  `;
}

function renderModeSummary(label: string, summary: ModeSummary): string {
  return `
    <div class="summary-stat">
      <span>${label} avg d</span>
      <b>${summary.averageSeedDelta.toFixed(3)}</b>
    </div>
    <div class="summary-stat">
      <span>${label} anchors</span>
      <b>${Object.entries(summary.anchorCounts).map(([stop, count]) => `${stop}:${count}`).join(" ")}</b>
    </div>
  `;
}

function renderHtml(data: ComparisonData): string {
  const chromatic = data.families.filter((family) => family.group === "Chromatic");
  const neutral = data.families.filter((family) => family.group === "Neutral");

  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>Tailwind v4 vs Wassily Ramp Comparison</title>
    <style>
${GENERATED_FONT_FACE_CSS}
      :root {
        color: #151515;
        background: #f7f7f4;
        font-family: ${GENERATED_TEXT_FONT};
        font-weight: 400;
      }
      * { box-sizing: border-box; }
      body {
        margin: 0;
        padding: 40px;
      }
      header.page-header {
        max-width: 1400px;
        margin: 0 auto 28px;
      }
      h1 {
        margin: 0 0 10px;
        font-size: 34px;
        font-weight: 700;
        letter-spacing: 0;
      }
      h2 {
        margin: 0;
        font-size: 19px;
        font-weight: 700;
        letter-spacing: 0;
        text-transform: capitalize;
      }
      p {
        margin: 0;
        line-height: 1.45;
      }
      .lede {
        max-width: 920px;
        color: #444;
      }
      .mono {
        font-variant-numeric: tabular-nums;
        font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
      }
      .summary-grid {
        display: grid;
        grid-template-columns: repeat(4, minmax(150px, 1fr));
        gap: 10px;
        max-width: 1400px;
        margin: 0 auto 18px;
      }
      .summary-stat,
      .summary-panel {
        border: 1px solid rgba(0,0,0,0.12);
        background: rgba(255,255,255,0.52);
        padding: 12px;
      }
      .summary-stat span,
      .seed-delta span,
      .metrics span {
        display: block;
        color: #666;
        font-size: 11px;
        text-transform: uppercase;
        letter-spacing: 0.04em;
      }
      .summary-stat b,
      .seed-delta b {
        display: block;
        margin-top: 4px;
        font-size: 21px;
        font-weight: 700;
      }
      .summary-panel {
        max-width: 1400px;
        margin: 0 auto 20px;
      }
      .summary-panel h2 {
        margin-bottom: 12px;
      }
      .divergence-list {
        display: grid;
        grid-template-columns: repeat(4, minmax(0, 1fr));
        gap: 8px;
      }
      .divergence-list a {
        display: grid;
        grid-template-columns: 1fr auto;
        gap: 3px 8px;
        color: inherit;
        text-decoration: none;
        border: 1px solid rgba(0,0,0,0.1);
        padding: 9px;
        background: rgba(255,255,255,0.46);
      }
      .divergence-list small {
        grid-column: 1 / -1;
        color: #666;
      }
      .section-title {
        max-width: 1400px;
        margin: 30px auto 12px;
        font-size: 16px;
        text-transform: uppercase;
        letter-spacing: 0.06em;
      }
      .family-card {
        max-width: 1400px;
        margin: 0 auto 16px;
        padding: 14px;
        border: 1px solid rgba(0,0,0,0.14);
        background: rgba(255,255,255,0.62);
      }
      .family-card__header {
        display: flex;
        justify-content: space-between;
        gap: 18px;
        margin-bottom: 12px;
      }
      .family-card__meta {
        margin-top: 4px;
        color: #555;
        font-size: 13px;
      }
      .pill {
        display: inline-block;
        margin-left: 8px;
        padding: 2px 6px;
        border: 1px solid rgba(0,0,0,0.16);
        font-size: 11px;
        vertical-align: 1px;
      }
      .pill--warn {
        background: #fff2c9;
      }
      .seed-delta {
        min-width: 100px;
        text-align: right;
      }
      .ramp-row {
        display: grid;
        grid-template-columns: 110px minmax(0, 1fr);
        gap: 14px;
        align-items: start;
        margin-top: 10px;
      }
      .ramp-row__label {
        padding-top: 15px;
        color: #333;
        font-size: 13px;
        text-transform: uppercase;
        letter-spacing: 0.05em;
      }
      .swatches {
        display: grid;
        grid-template-columns: repeat(11, minmax(44px, 1fr));
        min-height: 58px;
        border: 1px solid rgba(0,0,0,0.08);
      }
      .swatch {
        position: relative;
        min-height: 58px;
        padding: 5px;
        overflow: hidden;
      }
      .swatch--seed::after {
        content: "";
        position: absolute;
        inset: 4px;
        border: 2px solid currentColor;
        opacity: 0.65;
        pointer-events: none;
      }
      .swatch--p3::before {
        content: "P3";
        position: absolute;
        right: 4px;
        top: 4px;
        font-size: 9px;
        font-weight: 700;
        opacity: 0.7;
      }
      .swatch--outside-p3::before {
        content: "!P3";
        background: rgba(255,255,255,0.42);
        padding: 1px 3px;
      }
      .swatch__label,
      .swatch__hex {
        display: block;
        position: relative;
        z-index: 1;
        text-shadow: 0 1px 12px rgba(255,255,255,0.24);
        font-size: 11px;
      }
      .swatch__hex {
        margin-top: 22px;
        opacity: 0;
        transition: opacity 0.12s ease;
      }
      .swatch:hover .swatch__hex {
        opacity: 1;
      }
      .metrics {
        display: grid;
        grid-template-columns: repeat(9, minmax(0, 1fr));
        gap: 6px;
        margin-top: 8px;
      }
      .metrics div {
        min-height: 42px;
        padding: 7px;
        border: 1px solid rgba(0,0,0,0.08);
        background: rgba(255,255,255,0.42);
      }
      .metrics b {
        display: block;
        margin-top: 4px;
        font-size: 12px;
        font-weight: 700;
        font-variant-numeric: tabular-nums;
      }
      .contract {
        display: flex;
        flex-wrap: wrap;
        gap: 6px;
        margin-top: 8px;
      }
      .contract span,
      .notes li {
        border: 1px solid rgba(0,0,0,0.12);
        background: rgba(0,0,0,0.035);
        padding: 5px 7px;
        font-size: 12px;
      }
      .contract span:first-child {
        background: rgba(255,255,255,0.52);
        font-weight: 700;
      }
      .notes {
        margin: 8px 0 0;
        padding: 0;
        display: flex;
        flex-wrap: wrap;
        gap: 6px;
        list-style: none;
      }
      footer {
        max-width: 1400px;
        margin: 28px auto 0;
        color: #666;
        font-size: 12px;
      }
      @media (max-width: 900px) {
        body { padding: 18px; }
        .summary-grid,
        .divergence-list { grid-template-columns: repeat(2, minmax(0, 1fr)); }
        .ramp-row { grid-template-columns: 1fr; gap: 6px; }
        .ramp-row__label { padding-top: 0; }
        .metrics { grid-template-columns: repeat(2, minmax(0, 1fr)); }
        .notes { margin-left: 0; }
      }
    </style>
  </head>
  <body>
    <header class="page-header">
      <h1>Tailwind v4 vs Wassily</h1>
      <p class="lede">
        Tailwind rows use the full static Tailwind CSS ${data.tailwindVersion} OKLCH palette.
        Wassily rows are generated from each Tailwind <span class="mono">500</span> seed in three contracts: current sRGB, P3 target, and dual-mode sRGB fallback.
        The outlined stop marks Tailwind <span class="mono">500</span> or Wassily's reported seed anchor for that row's target-gamut contract.
      </p>
    </header>

    <section class="summary-grid">
      <div class="summary-stat"><span>families</span><b>${data.summary.familyCount}</b></div>
      <div class="summary-stat"><span>P3 / non-sRGB 500s</span><b>${data.summary.tailwindOutOfSrgb500Count}</b></div>
      <div class="summary-stat"><span>outside P3 500s</span><b>${data.summary.tailwindOutOfP3500Count}</b></div>
      <div class="summary-stat"><span>P3 exactness</span><b>${Object.entries(data.summary.wassily.p3.exactnessCounts).map(([name, count]) => `${name}:${count}`).join(" ")}</b></div>
      ${renderModeSummary("sRGB", data.summary.wassily.srgb)}
      ${renderModeSummary("P3", data.summary.wassily.p3)}
      ${renderModeSummary("fallback", data.summary.wassily.dualFallback)}
    </section>

    ${renderTopDivergences(data, "srgb", "Largest sRGB Seed Deltas")}
    ${renderAnchorAudit(data, "p3", "P3 Non-500 Seed Anchors")}

    <h2 class="section-title">Chromatic</h2>
    ${chromatic.map(renderFamilyCard).join("")}

    <h2 class="section-title">Neutral / Near-Neutral</h2>
    ${neutral.map(renderFamilyCard).join("")}

    <footer>
      Generated ${data.generatedAt} from ${data.tailwindThemeUrl}.
      Tailwind swatches marked P3 are outside sRGB according to the local sRGB gamut check.
    </footer>
  </body>
</html>`;
}

function stripTrailingWhitespace(text: string): string {
  return `${text.replace(/[ \t]+$/gm, "").trimEnd()}\n`;
}

async function main(): Promise<void> {
  const data = await buildComparisonData();
  await mkdir(OUTPUT_DIR, { recursive: true });
  await copyGeneratedFonts(OUTPUT_DIR);
  await writeFile(JSON_PATH, `${JSON.stringify(data, null, 2)}\n`);
  await writeFile(HTML_PATH, stripTrailingWhitespace(renderHtml(data)));
  console.log(`Wrote ${JSON_PATH}`);
  console.log(`Wrote ${HTML_PATH}`);
}

await main();
