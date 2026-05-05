import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import type { OklchColor } from "../src/types";
import { maxChroma, toHex } from "../src/engine/gamut";
import {
  RESEARCH_SEEDS,
  evaluateSeedRun,
  type ResearchEngine,
  type ResearchSeed,
} from "../src/engine/research";

const OUTPUT_DIR = path.resolve("docs/generated");
const HTML_PATH = path.join(OUTPUT_DIR, "research-gauntlet.html");
const JSON_PATH = path.join(OUTPUT_DIR, "research-gauntlet.json");

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

const GAUNTLET_ENGINES: ResearchEngine[] = ["v6", "brand-exact-fair"];

interface GauntletGroup {
  label: string;
  note: string;
  seeds: ResearchSeed[];
}

interface GauntletSwatch {
  label: string;
  hex: string;
  textHex: string;
}

interface GauntletMetrics {
  anchor: string | null;
  seedDelta: number | null;
  lightEntrance: number;
  spacingCv: number;
  worstAdjacent: number;
  stop50Lightness: number | null;
  stop50Occupancy: number | null;
  topDistance: number | null;
  topDistanceRatio: number | null;
  bridgeDistance: number | null;
  topBridgeRatio: number | null;
  darkBridgeDistance: number | null;
  darkEdgeDistance: number | null;
  darkTailRatio: number | null;
  endpointDarkLightness: number;
  endpointDarkChroma: number;
  monotone: boolean;
  status: "ok" | "watch" | "fail";
}

interface GauntletRow {
  seed: ResearchSeed;
  engine: ResearchEngine;
  group: string;
  metrics: GauntletMetrics;
  swatches: GauntletSwatch[];
}

interface GauntletData {
  generatedAt: string;
  groups: Array<{
    label: string;
    note: string;
    rows: GauntletRow[];
  }>;
}

function researchSeed(id: string): ResearchSeed {
  const seed = RESEARCH_SEEDS.find((candidate) => candidate.id === id);
  if (!seed) throw new Error(`Missing research seed: ${id}`);
  return seed;
}

function seed(id: string, label: string, note: string, color: OklchColor): ResearchSeed {
  return { id, label, note, color };
}

const GAUNTLET_GROUPS: GauntletGroup[] = [
  {
    label: "Neutrals",
    note: "Neutral and near-neutral seeds should stay quiet, monotone, and free of chroma theatrics.",
    seeds: [
      researchSeed("warm-neutral"),
      researchSeed("cool-neutral"),
      seed("paper-gray", "Paper Gray", "Nearly achromatic warm paper.", {
        l: 0.74,
        c: 0.006,
        h: 72,
      }),
      seed("warm-chroma-edge", "Warm Chroma Edge", "Near-neutral just below chromatic behavior.", {
        l: 0.62,
        c: 0.045,
        h: 72,
      }),
      seed("cool-chroma-edge", "Cool Chroma Edge", "Cool near-neutral just below chromatic behavior.", {
        l: 0.58,
        c: 0.045,
        h: 250,
      }),
    ],
  },
  {
    label: "Warm Hues",
    note: "Yellows, oranges, reds, and roses should avoid muddy shadows and harsh top clips.",
    seeds: [
      researchSeed("cadmium-yellow"),
      seed("amber", "Amber", "High-energy warm yellow-orange.", {
        l: 0.78,
        c: 0.16,
        h: 82,
      }),
      seed("orange", "Orange", "Saturated orange body color.", {
        l: 0.68,
        c: 0.18,
        h: 48,
      }),
      seed("red", "Red", "Vivid red with difficult dark behavior.", {
        l: 0.6,
        c: 0.21,
        h: 28,
      }),
      seed("rose", "Rose", "Cool red-pink crossing into magenta.", {
        l: 0.64,
        c: 0.18,
        h: 355,
      }),
    ],
  },
  {
    label: "Greens",
    note: "Green families reveal cusp flash, leafy body drift, teal transitions, and ink retention.",
    seeds: [
      researchSeed("bright-lime"),
      seed("lime-cool-neighbor", "Lime Cool Neighbor", "Slightly cooler high-lightness lime cusp.", {
        l: 0.9,
        c: 0.18,
        h: 132,
      }),
      seed("leaf-green", "Leaf Green", "Mid-light natural green body.", {
        l: 0.62,
        c: 0.16,
        h: 145,
      }),
      researchSeed("phthalo-green"),
      seed("teal", "Teal", "Bridge between phthalo and cyan behavior.", {
        l: 0.58,
        c: 0.14,
        h: 185,
      }),
    ],
  },
  {
    label: "Cool Hues",
    note: "Cyan through violet should keep fresh tints and avoid dead blue-violet tails.",
    seeds: [
      researchSeed("cyan"),
      seed("sky-blue", "Sky Blue", "Clean blue-cyan highlight family.", {
        l: 0.72,
        c: 0.13,
        h: 230,
      }),
      researchSeed("ultramarine"),
      researchSeed("violet"),
      seed("purple", "Purple", "Blue-violet bridge into magenta.", {
        l: 0.58,
        c: 0.18,
        h: 295,
      }),
    ],
  },
  {
    label: "Perturbations",
    note: "Nearby hue variants around the tuned hard cases catch overfitting and boundary jumps.",
    seeds: [
      seed("lime-h115", "Lime h115", "Warmer neighbor of the bright lime cusp.", {
        l: 0.93,
        c: 0.21,
        h: 115,
      }),
      seed("lime-h130", "Lime h130", "Cooler neighbor of the bright lime cusp.", {
        l: 0.9,
        c: 0.18,
        h: 130,
      }),
      seed("cyan-h195", "Cyan h195", "Green-leaning cyan perturbation.", {
        l: 0.78,
        c: 0.13,
        h: 195,
      }),
      seed("cyan-h220", "Cyan h220", "Blue-leaning cyan perturbation.", {
        l: 0.76,
        c: 0.13,
        h: 220,
      }),
      seed("phthalo-h155", "Phthalo h155", "Greener phthalo perturbation.", {
        l: 0.52,
        c: 0.15,
        h: 155,
      }),
      seed("phthalo-h175", "Phthalo h175", "Tealer phthalo perturbation.", {
        l: 0.52,
        c: 0.15,
        h: 175,
      }),
    ],
  },
];

function textHex(lightness: number): string {
  return lightness >= 0.72 ? "#111111" : "#f8f8f8";
}

function formatOklch(color: OklchColor): string {
  return `oklch(${color.l.toFixed(3)} ${color.c.toFixed(3)} ${color.h.toFixed(1)})`;
}

function formatMetric(value: number | null, digits = 2): string {
  return value === null ? "n/a" : value.toFixed(digits);
}

function formatPercent(value: number | null): string {
  return value === null ? "n/a" : `${Math.round(value * 100)}%`;
}

function distanceBetween(
  values: readonly number[],
  labels: readonly string[],
  fromLabel: string,
  toLabel: string,
): number | null {
  const fromIndex = labels.indexOf(fromLabel);
  const toIndex = labels.indexOf(toLabel);
  if (fromIndex < 0 || toIndex !== fromIndex + 1) return null;
  return values[fromIndex] ?? null;
}

function occupancy(color: OklchColor): number | null {
  const available = maxChroma(color.l, color.h);
  return available > 0 ? color.c / available : null;
}

function average(values: readonly number[]): number {
  return values.length === 0
    ? 0
    : values.reduce((sum, value) => sum + value, 0) / values.length;
}

function distanceRatio(
  values: readonly number[],
  value: number | null,
): number | null {
  if (value === null) return null;
  const mean = average(values);
  return mean > 0 ? value / mean : null;
}

function darkTailRatio(values: readonly number[]): number | null {
  if (values.length < 2) return null;
  const mean = average(values);
  if (mean <= 0) return null;
  return average(values.slice(-2)) / mean;
}

function ratioBetween(
  numerator: number | null,
  denominator: number | null,
): number | null {
  if (numerator === null || denominator === null || denominator <= 0) return null;
  return numerator / denominator;
}

function statusForMetrics(metrics: Omit<GauntletMetrics, "status">): GauntletMetrics["status"] {
  if (
    !metrics.monotone ||
    (metrics.seedDelta !== null && metrics.seedDelta > 1e-4) ||
    metrics.worstAdjacent > 3 ||
    metrics.lightEntrance > 3 ||
    (metrics.topBridgeRatio !== null && metrics.topBridgeRatio > 1.45) ||
    (metrics.topDistanceRatio !== null && metrics.topDistanceRatio > 1.65) ||
    (metrics.darkTailRatio !== null && metrics.darkTailRatio < 0.42)
  ) {
    return "fail";
  }

  if (
    metrics.lightEntrance > 1.65 ||
    metrics.worstAdjacent > 2.35 ||
    metrics.spacingCv > 0.55 ||
    (metrics.topBridgeRatio !== null && metrics.topBridgeRatio > 1.2) ||
    (metrics.topDistanceRatio !== null && metrics.topDistanceRatio > 1.35) ||
    (metrics.darkTailRatio !== null && metrics.darkTailRatio < 0.62)
  ) {
    return "watch";
  }

  return "ok";
}

function buildRow(group: string, seed: ResearchSeed, engine: ResearchEngine): GauntletRow {
  const run = evaluateSeedRun(seed, { engine });
  const labels = run.analysis.labels;
  const distances = run.analysis.lightRamp.adjacentDistance.values;
  const stop50 = run.stops.find((stop) => stop.label === "50");
  const topDistance = distanceBetween(distances, labels, "50", "100");
  const bridgeDistance = distanceBetween(distances, labels, "100", "200");
  const darkBridgeDistance = distanceBetween(distances, labels, "800", "900");
  const darkEdgeDistance = distanceBetween(distances, labels, "900", "950");
  const metricsBase: Omit<GauntletMetrics, "status"> = {
    anchor:
      run.analysis.seedStopIndex === null
        ? null
        : run.analysis.labels[run.analysis.seedStopIndex],
    seedDelta: run.analysis.seedDelta,
    lightEntrance: run.analysis.lightRamp.adjacentDistance.lightEntranceRatio,
    spacingCv: run.analysis.lightRamp.adjacentDistance.coefficientOfVariation,
    worstAdjacent: run.analysis.lightRamp.adjacentDistance.worstAdjacentRatio,
    stop50Lightness: stop50?.color.l ?? null,
    stop50Occupancy: stop50 ? occupancy(stop50.color) : null,
    topDistance,
    topDistanceRatio: distanceRatio(distances, topDistance),
    bridgeDistance,
    topBridgeRatio: ratioBetween(topDistance, bridgeDistance),
    darkBridgeDistance,
    darkEdgeDistance,
    darkTailRatio: darkTailRatio(distances),
    endpointDarkLightness: run.analysis.endpointDark.lightness,
    endpointDarkChroma: run.analysis.endpointDark.chroma,
    monotone: run.analysis.lightRamp.lightness.nonIncreasing,
  };

  return {
    seed,
    engine,
    group,
    metrics: {
      ...metricsBase,
      status: statusForMetrics(metricsBase),
    },
    swatches: run.stops.map((stop) => ({
      label: stop.label,
      hex: toHex(stop.color),
      textHex: textHex(stop.color.l),
    })),
  };
}

function buildGauntletData(): GauntletData {
  return {
    generatedAt: new Date().toISOString(),
    groups: GAUNTLET_GROUPS.map((group) => ({
      label: group.label,
      note: group.note,
      rows: group.seeds.flatMap((candidate) =>
        GAUNTLET_ENGINES.map((engine) => buildRow(group.label, candidate, engine)),
      ),
    })),
  };
}

function renderStatus(status: GauntletMetrics["status"]): string {
  return `<span class="status status--${status}">${status}</span>`;
}

function renderSwatches(row: GauntletRow): string {
  return `
    <div class="swatches">
      ${row.swatches
        .map(
          (swatch) => `
            <div class="swatch${swatch.label === row.metrics.anchor ? " swatch--seed" : ""}" style="background:${swatch.hex}; color:${swatch.textHex}" title="${swatch.label} ${swatch.hex}">
              <span>${swatch.label}</span>
            </div>
          `,
        )
        .join("")}
    </div>
  `;
}

function renderMetricPill(label: string, value: string): string {
  return `
    <div class="metric">
      <span>${label}</span>
      <strong class="mono">${value}</strong>
    </div>
  `;
}

function engineLabel(engine: ResearchEngine): string {
  switch (engine) {
    case "brand-exact-fair":
      return "fair";
    case "v6-archetype":
      return "archetype";
    default:
      return engine;
  }
}

function renderRow(row: GauntletRow): string {
  return `
    <article class="row row--${row.metrics.status}">
      <div class="row__meta">
        <div class="row__title">
          <h3>${row.seed.label}</h3>
          <span class="engine mono">${engineLabel(row.engine)}</span>
          ${renderStatus(row.metrics.status)}
        </div>
        <div class="mono seed-value">${formatOklch(row.seed.color)}</div>
      </div>
      ${renderSwatches(row)}
      <div class="metrics">
        ${renderMetricPill("anchor", row.metrics.anchor ?? "n/a")}
        ${renderMetricPill("50 L", formatMetric(row.metrics.stop50Lightness, 3))}
        ${renderMetricPill("50 occ", formatPercent(row.metrics.stop50Occupancy))}
        ${renderMetricPill("50->100", formatMetric(row.metrics.topDistance, 3))}
        ${renderMetricPill("50 ratio", formatMetric(row.metrics.topDistanceRatio, 2))}
        ${renderMetricPill("100->200", formatMetric(row.metrics.bridgeDistance, 3))}
        ${renderMetricPill("top bridge", formatMetric(row.metrics.topBridgeRatio, 2))}
        ${renderMetricPill("900->950", formatMetric(row.metrics.darkEdgeDistance, 3))}
        ${renderMetricPill("tail ratio", formatMetric(row.metrics.darkTailRatio, 2))}
        ${renderMetricPill("edge", `${formatMetric(row.metrics.lightEntrance)}x`)}
        ${renderMetricPill("cv", formatMetric(row.metrics.spacingCv))}
        ${renderMetricPill("950 L", formatMetric(row.metrics.endpointDarkLightness, 3))}
        ${renderMetricPill("950 c", formatMetric(row.metrics.endpointDarkChroma, 3))}
      </div>
    </article>
  `;
}

function renderHtml(data: GauntletData): string {
  const totalRows = data.groups.reduce((sum, group) => sum + group.rows.length, 0);
  const statusCounts = data.groups
    .flatMap((group) => group.rows)
    .reduce(
      (counts, row) => ({
        ...counts,
        [row.metrics.status]: counts[row.metrics.status] + 1,
      }),
      { ok: 0, watch: 0, fail: 0 },
    );

  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <link rel="icon" href="data:," />
    <title>Wassily Ramp Gauntlet</title>
    <style>
      :root {
        --bg: #f6f7f4;
        --ink: #111816;
        --muted: #68736d;
        --line: rgba(17, 24, 22, 0.12);
        --panel: rgba(255, 255, 255, 0.62);
        --ok: #0b6b61;
        --watch: #9a6500;
        --fail: #a32929;
      }

      * { box-sizing: border-box; }

      body {
        margin: 0;
        background: var(--bg);
        color: var(--ink);
        font-family: "IBM Plex Sans", "Avenir Next", "Segoe UI", sans-serif;
      }

      main {
        width: min(1500px, calc(100vw - 40px));
        margin: 0 auto;
        padding: 28px 0 56px;
      }

      h1,
      h2,
      h3,
      p {
        margin: 0;
      }

      h1 {
        font-size: clamp(2rem, 4vw, 3.8rem);
        line-height: 0.98;
        letter-spacing: 0;
      }

      h2 {
        font-size: 1.1rem;
      }

      h3 {
        font-size: 0.92rem;
        letter-spacing: 0;
      }

      p {
        color: var(--muted);
        line-height: 1.48;
      }

      .mono {
        font-family: "IBM Plex Mono", ui-monospace, monospace;
      }

      .hero {
        display: grid;
        gap: 10px;
        padding-bottom: 22px;
        border-bottom: 1px solid var(--line);
      }

      .summary {
        display: flex;
        flex-wrap: wrap;
        gap: 8px;
      }

      .pill,
      .status,
      .engine,
      .metric {
        border: 1px solid var(--line);
        border-radius: 999px;
        background: var(--panel);
      }

      .pill {
        padding: 7px 10px;
        color: var(--muted);
        font-size: 0.78rem;
      }

      .group {
        display: grid;
        gap: 10px;
        padding: 22px 0;
        border-bottom: 1px solid var(--line);
      }

      .group__header {
        display: grid;
        grid-template-columns: 180px minmax(0, 1fr);
        gap: 18px;
        align-items: baseline;
      }

      .rows {
        display: grid;
        gap: 6px;
      }

      .row {
        display: grid;
        grid-template-columns: minmax(170px, 0.9fr) minmax(390px, 2.2fr) minmax(360px, 1.7fr);
        gap: 10px;
        align-items: center;
        min-height: 58px;
        padding: 7px 0;
      }

      .row__meta {
        display: grid;
        gap: 4px;
        min-width: 0;
      }

      .row__title {
        display: flex;
        align-items: center;
        gap: 8px;
        min-width: 0;
      }

      .seed-value {
        color: var(--muted);
        font-size: 0.68rem;
        overflow-wrap: anywhere;
      }

      .status {
        padding: 3px 7px;
        font-size: 0.66rem;
        text-transform: uppercase;
      }

      .engine {
        padding: 3px 7px;
        color: var(--muted);
        font-size: 0.66rem;
        text-transform: uppercase;
      }

      .status--ok {
        color: var(--ok);
      }

      .status--watch {
        color: var(--watch);
      }

      .status--fail {
        color: var(--fail);
      }

      .swatches {
        display: grid;
        grid-template-columns: repeat(11, minmax(0, 1fr));
        gap: 3px;
      }

      .swatch {
        position: relative;
        min-height: 42px;
        border: 1px solid rgba(17, 24, 22, 0.15);
        border-radius: 5px;
        overflow: hidden;
      }

      .swatch span {
        position: absolute;
        left: 5px;
        top: 4px;
        font-family: "IBM Plex Mono", ui-monospace, monospace;
        font-size: 0.62rem;
      }

      .swatch--seed {
        outline: 2px solid rgba(17, 24, 22, 0.52);
        outline-offset: -4px;
      }

      .metrics {
        display: flex;
        flex-wrap: wrap;
        gap: 5px;
      }

      .metric {
        display: grid;
        grid-template-columns: auto auto;
        gap: 6px;
        align-items: baseline;
        min-height: 26px;
        padding: 5px 7px;
      }

      .metric span {
        color: var(--muted);
        font-size: 0.64rem;
      }

      .metric strong {
        font-size: 0.69rem;
      }

      @media (max-width: 980px) {
        main {
          width: min(100vw - 24px, 760px);
        }

        .group__header,
        .row {
          grid-template-columns: 1fr;
        }

        .swatch {
          min-height: 36px;
        }
      }
    </style>
  </head>
  <body>
    <main>
      <section class="hero">
        <h1>Ramp Gauntlet</h1>
        <p>Compact stress matrix for anchor-seeded solver comparisons. The focused lab is for beauty; this board is for catching cliffs, dead tails, neutral chroma leaks, and hue-family overfitting.</p>
        <div class="summary">
          <div class="pill mono">${totalRows} rows</div>
          <div class="pill mono">engines ${GAUNTLET_ENGINES.map(engineLabel).join("/")}</div>
          <div class="pill mono">ok ${statusCounts.ok}</div>
          <div class="pill mono">watch ${statusCounts.watch}</div>
          <div class="pill mono">fail ${statusCounts.fail}</div>
          <div class="pill mono">stops ${STOP_LABELS.join("/")}</div>
          <div class="pill mono">Generated ${new Date(data.generatedAt).toLocaleString()}</div>
        </div>
      </section>
      ${data.groups
        .map(
          (group) => `
            <section class="group">
              <div class="group__header">
                <h2>${group.label}</h2>
                <p>${group.note}</p>
              </div>
              <div class="rows">
                ${group.rows.map(renderRow).join("")}
              </div>
            </section>
          `,
        )
        .join("")}
    </main>
  </body>
</html>`;
}

function stripTrailingWhitespace(value: string): string {
  return value.replace(/[ \t]+$/gm, "");
}

async function main(): Promise<void> {
  const data = buildGauntletData();
  await mkdir(OUTPUT_DIR, { recursive: true });
  await Promise.all([
    writeFile(JSON_PATH, JSON.stringify(data, null, 2), "utf8"),
    writeFile(HTML_PATH, stripTrailingWhitespace(renderHtml(data)), "utf8"),
  ]);
  console.log(`Wrote ${HTML_PATH}`);
  console.log(`Wrote ${JSON_PATH}`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
