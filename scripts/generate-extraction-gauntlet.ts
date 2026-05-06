import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import type { OklchColor } from "../src/types";
import { extractFromPixels } from "../src/engine/extract";
import { maxChroma, toHex } from "../src/engine/gamut";
import {
  GENERATED_FONT_FACE_CSS,
  GENERATED_TEXT_FONT,
  copyGeneratedFonts,
} from "./researchTypography";

const OUTPUT_DIR = path.resolve("docs/generated");
const HTML_PATH = path.join(OUTPUT_DIR, "extraction-gauntlet.html");
const JSON_PATH = path.join(OUTPUT_DIR, "extraction-gauntlet.json");

interface SourceColor {
  label: string;
  color: OklchColor;
  count: number;
  jitter?: {
    l?: number;
    c?: number;
    h?: number;
  };
}

interface HueRange {
  label: string;
  min: number;
  max: number;
}

interface FixtureExpectation {
  minColors?: number;
  maxColors?: number;
  maxSourceDistance?: number;
  requireNeutral?: boolean;
  forbidHueRanges?: HueRange[];
  requireHueRanges?: HueRange[];
}

interface Fixture {
  id: string;
  label: string;
  note: string;
  source: SourceColor[];
  expectation: FixtureExpectation;
}

interface ExtractedSwatch {
  hex: string;
  textHex: string;
  oklch: string;
  color: OklchColor;
  role: string;
}

interface GauntletRow {
  id: string;
  label: string;
  note: string;
  source: Array<{
    label: string;
    hex: string;
    oklch: string;
    coverage: number;
  }>;
  extracted: ExtractedSwatch[];
  checks: Array<{
    label: string;
    pass: boolean;
  }>;
  status: "pass" | "watch";
}

interface GauntletData {
  generatedAt: string;
  rows: GauntletRow[];
}

const FIXTURES: Fixture[] = [
  {
    id: "flat-single-color",
    label: "Flat Color Control",
    note: "A solid crop should get a gentle source-aware lift instead of full purification.",
    source: [
      {
        label: "source",
        color: { l: 0.56, c: 0.09, h: 252 },
        count: 900,
      },
    ],
    expectation: {
      minColors: 1,
      maxColors: 1,
      maxSourceDistance: 0.05,
    },
  },
  {
    id: "two-color-poster",
    label: "Two Color Poster",
    note: "Two clean chromatic regions should remain a compact two-color palette.",
    source: [
      {
        label: "teal field",
        color: { l: 0.55, c: 0.12, h: 190 },
        count: 540,
        jitter: { l: 0.02, c: 0.012, h: 4 },
      },
      {
        label: "coral block",
        color: { l: 0.68, c: 0.15, h: 28 },
        count: 360,
        jitter: { l: 0.018, c: 0.01, h: 3 },
      },
    ],
    expectation: {
      minColors: 2,
      maxColors: 3,
      requireHueRanges: [
        { label: "teal", min: 178, max: 205 },
        { label: "coral", min: 18, max: 38 },
      ],
    },
  },
  {
    id: "product-neutral-accent",
    label: "Product Neutral + Accent",
    note: "A big neutral surface, a muted body color, and a small accent should all survive.",
    source: [
      {
        label: "warm paper",
        color: { l: 0.82, c: 0.012, h: 78 },
        count: 520,
        jitter: { l: 0.025, c: 0.004, h: 10 },
      },
      {
        label: "olive body",
        color: { l: 0.5, c: 0.072, h: 140 },
        count: 330,
        jitter: { l: 0.035, c: 0.012, h: 7 },
      },
      {
        label: "orange detail",
        color: { l: 0.58, c: 0.18, h: 26 },
        count: 88,
        jitter: { l: 0.018, c: 0.016, h: 4 },
      },
      {
        label: "shadow",
        color: { l: 0.26, c: 0.014, h: 245 },
        count: 90,
        jitter: { l: 0.025, c: 0.004, h: 8 },
      },
    ],
    expectation: {
      minColors: 3,
      maxColors: 5,
      requireNeutral: true,
      requireHueRanges: [
        { label: "olive", min: 125, max: 155 },
        { label: "orange", min: 15, max: 38 },
      ],
    },
  },
  {
    id: "tonal-neutrals",
    label: "Tonal Neutrals",
    note: "A gray/beige tonal source should produce a useful neutral palette, not one average gray.",
    source: [
      {
        label: "paper",
        color: { l: 0.86, c: 0.01, h: 75 },
        count: 360,
        jitter: { l: 0.018, c: 0.003, h: 8 },
      },
      {
        label: "stone",
        color: { l: 0.62, c: 0.014, h: 88 },
        count: 320,
        jitter: { l: 0.02, c: 0.003, h: 8 },
      },
      {
        label: "charcoal",
        color: { l: 0.28, c: 0.012, h: 248 },
        count: 260,
        jitter: { l: 0.024, c: 0.003, h: 8 },
      },
    ],
    expectation: {
      minColors: 2,
      maxColors: 4,
      requireNeutral: true,
    },
  },
  {
    id: "tiny-hot-pixel",
    label: "Tiny Hot Pixel",
    note: "A vivid speck below useful coverage should not become an extracted accent.",
    source: [
      {
        label: "blue fabric",
        color: { l: 0.54, c: 0.095, h: 232 },
        count: 900,
        jitter: { l: 0.035, c: 0.012, h: 5 },
      },
      {
        label: "light neutral",
        color: { l: 0.84, c: 0.012, h: 70 },
        count: 180,
        jitter: { l: 0.02, c: 0.003, h: 7 },
      },
      {
        label: "noise speck",
        color: { l: 0.58, c: 0.25, h: 24 },
        count: 4,
      },
    ],
    expectation: {
      minColors: 2,
      maxColors: 4,
      requireNeutral: true,
      forbidHueRanges: [{ label: "noise orange", min: 15, max: 35 }],
    },
  },
  {
    id: "analogous-greens",
    label: "Analogous Greens",
    note: "Neighboring botanical hues should stay distinct enough to be useful.",
    source: [
      {
        label: "lime leaf",
        color: { l: 0.7, c: 0.13, h: 116 },
        count: 260,
        jitter: { l: 0.025, c: 0.014, h: 5 },
      },
      {
        label: "leaf",
        color: { l: 0.55, c: 0.13, h: 145 },
        count: 360,
        jitter: { l: 0.03, c: 0.014, h: 5 },
      },
      {
        label: "teal shade",
        color: { l: 0.43, c: 0.11, h: 176 },
        count: 280,
        jitter: { l: 0.03, c: 0.012, h: 5 },
      },
      {
        label: "soil neutral",
        color: { l: 0.34, c: 0.018, h: 65 },
        count: 160,
        jitter: { l: 0.02, c: 0.004, h: 10 },
      },
    ],
    expectation: {
      minColors: 3,
      maxColors: 6,
      requireHueRanges: [
        { label: "lime", min: 105, max: 130 },
        { label: "leaf", min: 135, max: 158 },
        { label: "teal shade", min: 165, max: 190 },
      ],
    },
  },
  {
    id: "screenshot-ui",
    label: "Screenshot UI",
    note: "Interface imagery should keep neutrals while still catching product accents.",
    source: [
      {
        label: "surface",
        color: { l: 0.92, c: 0.006, h: 250 },
        count: 520,
        jitter: { l: 0.012, c: 0.002, h: 8 },
      },
      {
        label: "ink",
        color: { l: 0.26, c: 0.009, h: 250 },
        count: 210,
        jitter: { l: 0.012, c: 0.002, h: 8 },
      },
      {
        label: "blue action",
        color: { l: 0.57, c: 0.16, h: 255 },
        count: 135,
        jitter: { l: 0.018, c: 0.01, h: 4 },
      },
      {
        label: "red badge",
        color: { l: 0.58, c: 0.18, h: 28 },
        count: 34,
        jitter: { l: 0.012, c: 0.008, h: 3 },
      },
    ],
    expectation: {
      minColors: 3,
      maxColors: 6,
      requireNeutral: true,
      requireHueRanges: [
        { label: "blue action", min: 240, max: 270 },
        { label: "red badge", min: 18, max: 38 },
      ],
    },
  },
  {
    id: "busy-market",
    label: "Busy Market",
    note: "A high-variety scene should expand toward the upper bound without duplicates.",
    source: [
      {
        label: "yellow fruit",
        color: { l: 0.82, c: 0.16, h: 92 },
        count: 190,
        jitter: { l: 0.025, c: 0.018, h: 6 },
      },
      {
        label: "tomato",
        color: { l: 0.56, c: 0.2, h: 30 },
        count: 160,
        jitter: { l: 0.025, c: 0.018, h: 5 },
      },
      {
        label: "herbs",
        color: { l: 0.48, c: 0.13, h: 148 },
        count: 210,
        jitter: { l: 0.028, c: 0.016, h: 6 },
      },
      {
        label: "cyan sign",
        color: { l: 0.66, c: 0.13, h: 205 },
        count: 120,
        jitter: { l: 0.022, c: 0.012, h: 5 },
      },
      {
        label: "indigo cloth",
        color: { l: 0.44, c: 0.16, h: 275 },
        count: 130,
        jitter: { l: 0.025, c: 0.014, h: 5 },
      },
      {
        label: "paper",
        color: { l: 0.86, c: 0.014, h: 78 },
        count: 170,
        jitter: { l: 0.02, c: 0.004, h: 10 },
      },
      {
        label: "shadow",
        color: { l: 0.22, c: 0.014, h: 250 },
        count: 90,
        jitter: { l: 0.02, c: 0.004, h: 8 },
      },
    ],
    expectation: {
      minColors: 5,
      maxColors: 7,
      requireNeutral: true,
      requireHueRanges: [
        { label: "yellow", min: 78, max: 105 },
        { label: "red/orange", min: 18, max: 42 },
        { label: "green", min: 135, max: 162 },
        { label: "cyan", min: 192, max: 218 },
        { label: "indigo", min: 260, max: 290 },
      ],
    },
  },
];

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function wrapHue(hue: number): number {
  return ((hue % 360) + 360) % 360;
}

function jitterUnit(index: number, salt: number): number {
  const value = Math.sin((index + 1) * (12.9898 + salt) + salt * 78.233) * 43758.5453;
  return value - Math.floor(value);
}

function jitterSigned(index: number, salt: number): number {
  return jitterUnit(index, salt) * 2 - 1;
}

function clampToDisplayable(color: OklchColor): OklchColor {
  const h = wrapHue(color.h);
  const l = clamp(color.l, 0.02, 0.98);
  const maxC = maxChroma(l, h);
  return { l, c: clamp(color.c, 0, maxC * 0.98), h };
}

function expandFixture(fixture: Fixture): OklchColor[] {
  const pixels: OklchColor[] = [];
  for (const source of fixture.source) {
    for (let i = 0; i < source.count; i++) {
      pixels.push(
        clampToDisplayable({
          l: source.color.l + jitterSigned(i, 1.1) * (source.jitter?.l ?? 0),
          c: source.color.c + jitterSigned(i, 2.3) * (source.jitter?.c ?? 0),
          h: source.color.h + jitterSigned(i, 3.7) * (source.jitter?.h ?? 0),
        }),
      );
    }
  }
  return pixels;
}

function formatOklch(color: OklchColor): string {
  return `oklch(${color.l.toFixed(3)} ${color.c.toFixed(3)} ${color.h.toFixed(1)})`;
}

function textHex(color: OklchColor): string {
  return color.l >= 0.72 ? "#111111" : "#f8f8f8";
}

function sourceCoverage(source: SourceColor, fixture: Fixture): number {
  const total = fixture.source.reduce((sum, item) => sum + item.count, 0);
  return source.count / total;
}

function hueInRange(hue: number, range: HueRange): boolean {
  const normalized = wrapHue(hue);
  if (range.min <= range.max) {
    return normalized >= range.min && normalized <= range.max;
  }
  return normalized >= range.min || normalized <= range.max;
}

function colorDistance(a: OklchColor, b: OklchColor): number {
  const dl = a.l - b.l;
  const dc = a.c - b.c;
  let dh = Math.abs(a.h - b.h);
  if (dh > 180) dh = 360 - dh;
  const avgC = (a.c + b.c) / 2;
  const hueWeight = avgC * 0.025;
  return Math.sqrt(dl * dl + dc * dc + dh * dh * hueWeight * hueWeight);
}

function inferRole(color: OklchColor): string {
  if (color.c < 0.045) return color.l < 0.38 ? "shadow neutral" : "neutral";
  const intensity = color.c / Math.max(0.01, maxChroma(color.l, color.h));
  return intensity >= 0.72 ? "accent" : "body";
}

function checkFixture(
  fixture: Fixture,
  extracted: ExtractedSwatch[],
): Array<{ label: string; pass: boolean }> {
  const colors = extracted.map((swatch) => swatch.color);
  const checks: Array<{ label: string; pass: boolean }> = [];
  const { expectation } = fixture;

  if (expectation.minColors !== undefined) {
    checks.push({
      label: `>= ${expectation.minColors} colors`,
      pass: colors.length >= expectation.minColors,
    });
  }
  if (expectation.maxColors !== undefined) {
    checks.push({
      label: `<= ${expectation.maxColors} colors`,
      pass: colors.length <= expectation.maxColors,
    });
  }
  if (expectation.maxSourceDistance !== undefined) {
    const source = clampToDisplayable(fixture.source[0].color);
    const extractedColor = colors[0];
    checks.push({
      label: `source delta <= ${expectation.maxSourceDistance.toFixed(2)}`,
      pass:
        extractedColor !== undefined &&
        colorDistance(source, extractedColor) <= expectation.maxSourceDistance,
    });
  }
  if (expectation.requireNeutral) {
    checks.push({
      label: "keeps neutral",
      pass: colors.some((color) => color.c < 0.05),
    });
  }
  for (const range of expectation.requireHueRanges ?? []) {
    checks.push({
      label: `has ${range.label}`,
      pass: colors.some((color) => hueInRange(color.h, range)),
    });
  }
  for (const range of expectation.forbidHueRanges ?? []) {
    checks.push({
      label: `omits ${range.label}`,
      pass: !colors.some((color) => hueInRange(color.h, range)),
    });
  }

  return checks;
}

function buildRow(fixture: Fixture): GauntletRow {
  const result = extractFromPixels(expandFixture(fixture));
  const extracted = result.colors.map((color) => ({
    hex: toHex(color),
    textHex: textHex(color),
    oklch: formatOklch(color),
    color,
    role: inferRole(color),
  }));
  const checks = checkFixture(fixture, extracted);

  return {
    id: fixture.id,
    label: fixture.label,
    note: fixture.note,
    source: fixture.source.map((source) => ({
      label: source.label,
      hex: toHex(clampToDisplayable(source.color)),
      oklch: formatOklch(clampToDisplayable(source.color)),
      coverage: sourceCoverage(source, fixture),
    })),
    extracted,
    checks,
    status: checks.every((check) => check.pass) ? "pass" : "watch",
  };
}

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function pct(value: number): string {
  return `${Math.round(value * 100)}%`;
}

function renderSourcePreview(row: GauntletRow): string {
  let cursor = 0;
  const stops: string[] = [];
  for (const source of row.source) {
    const start = cursor;
    const end = cursor + source.coverage * 100;
    stops.push(`${source.hex} ${start.toFixed(2)}% ${end.toFixed(2)}%`);
    cursor = end;
  }
  return `<div class="source-preview" style="background: linear-gradient(90deg, ${stops.join(", ")});"></div>`;
}

function renderSourceList(row: GauntletRow): string {
  return `
    <div class="source-list">
      ${row.source
        .map(
          (source) => `
            <div class="source-item">
              <span class="source-chip" style="background:${source.hex}"></span>
              <span>${escapeHtml(source.label)}</span>
              <span class="mono">${pct(source.coverage)}</span>
            </div>
          `,
        )
        .join("")}
    </div>
  `;
}

function renderExtracted(row: GauntletRow): string {
  return `
    <div class="swatches">
      ${row.extracted
        .map(
          (swatch, index) => `
            <div class="swatch" style="background:${swatch.hex}; color:${swatch.textHex}">
              <div class="swatch-label mono">${index + 1}</div>
              <div class="swatch-meta">
                <strong>${swatch.hex}</strong>
                <span>${escapeHtml(swatch.role)}</span>
              </div>
            </div>
          `,
        )
        .join("")}
    </div>
  `;
}

function renderChecks(row: GauntletRow): string {
  return `
    <div class="checks">
      ${row.checks
        .map(
          (check) => `
            <span class="check ${check.pass ? "check-pass" : "check-watch"}">
              ${check.pass ? "pass" : "watch"} ${escapeHtml(check.label)}
            </span>
          `,
        )
        .join("")}
    </div>
  `;
}

function renderHtml(data: GauntletData): string {
  const passCount = data.rows.filter((row) => row.status === "pass").length;
  const watchCount = data.rows.length - passCount;

  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <link rel="icon" href="data:," />
    <title>Wassily Extraction Gauntlet</title>
    <style>
${GENERATED_FONT_FACE_CSS}
      :root {
        --bg: #f6f7f4;
        --ink: #111816;
        --muted: #647069;
        --line: rgba(17, 24, 22, 0.13);
        --panel: rgba(255, 255, 255, 0.76);
        --pass: #0b6b61;
        --watch: #9a6500;
        --cool: #3459a6;
      }

      * { box-sizing: border-box; }

      body {
        margin: 0;
        background:
          linear-gradient(90deg, rgba(11, 107, 97, 0.08), rgba(154, 101, 0, 0.08)),
          var(--bg);
        color: var(--ink);
        font-family: ${GENERATED_TEXT_FONT};
        font-variant-numeric: tabular-nums;
      }

      main {
        width: min(1500px, calc(100vw - 40px));
        margin: 0 auto;
        padding: 30px 0 64px;
      }

      h1, h2, p { margin: 0; }

      h1 {
        font-size: clamp(2rem, 4vw, 4rem);
        line-height: 0.98;
        letter-spacing: 0;
      }

      h2 {
        font-size: 1rem;
        letter-spacing: 0;
      }

      p {
        color: var(--muted);
        line-height: 1.5;
      }

      .mono {
        font-family: ${GENERATED_TEXT_FONT};
        font-variant-numeric: tabular-nums;
      }

      .hero {
        display: grid;
        gap: 10px;
        padding-bottom: 24px;
        border-bottom: 1px solid var(--line);
      }

      .summary {
        display: flex;
        flex-wrap: wrap;
        gap: 8px;
      }

      .pill {
        padding: 7px 10px;
        border: 1px solid var(--line);
        border-radius: 999px;
        background: var(--panel);
        color: var(--muted);
        font-size: 0.8rem;
      }

      .rows {
        display: grid;
        gap: 18px;
        margin-top: 22px;
      }

      .row {
        display: grid;
        grid-template-columns: minmax(280px, 0.72fr) minmax(360px, 1fr);
        gap: 18px;
        padding: 18px;
        border: 1px solid var(--line);
        background: var(--panel);
      }

      .row-head {
        display: grid;
        gap: 8px;
        align-content: start;
      }

      .row-title {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 12px;
      }

      .status {
        padding: 4px 8px;
        border-radius: 999px;
        color: #fff;
        background: var(--pass);
        font-size: 0.72rem;
        text-transform: uppercase;
        letter-spacing: 0.06em;
      }

      .status-watch {
        background: var(--watch);
      }

      .source-preview {
        width: 100%;
        height: 76px;
        border: 1px solid var(--line);
      }

      .source-list,
      .checks {
        display: flex;
        flex-wrap: wrap;
        gap: 6px;
      }

      .source-item,
      .check {
        display: inline-flex;
        align-items: center;
        gap: 6px;
        padding: 5px 7px;
        border: 1px solid var(--line);
        background: rgba(255, 255, 255, 0.52);
        font-size: 0.78rem;
      }

      .source-chip {
        width: 12px;
        height: 12px;
        border: 1px solid rgba(0, 0, 0, 0.16);
      }

      .check {
        color: var(--pass);
      }

      .check-watch {
        color: var(--watch);
      }

      .swatches {
        display: grid;
        grid-template-columns: repeat(auto-fit, minmax(96px, 1fr));
        min-height: 148px;
        border: 1px solid var(--line);
      }

      .swatch {
        min-height: 148px;
        display: flex;
        flex-direction: column;
        justify-content: space-between;
        padding: 9px;
      }

      .swatch-label {
        font-size: 0.78rem;
      }

      .swatch-meta {
        display: grid;
        gap: 2px;
        font-size: 0.76rem;
        line-height: 1.25;
      }

      .swatch-meta span {
        opacity: 0.76;
      }

      .result {
        display: grid;
        gap: 10px;
      }

      @media (max-width: 880px) {
        main {
          width: min(100vw - 24px, 720px);
        }

        .row {
          grid-template-columns: 1fr;
          padding: 14px;
        }
      }
    </style>
  </head>
  <body>
    <main>
      <section class="hero">
        <h1>Wassily Extraction Gauntlet</h1>
        <p>
          Synthetic visual fixtures for checking whether image extraction returns coherent 2-7 color palettes with meaningful neutrals, durable accents, and resistance to tiny vivid noise.
        </p>
        <div class="summary">
          <span class="pill mono">${data.rows.length} fixtures</span>
          <span class="pill mono">${passCount} pass</span>
          <span class="pill mono">${watchCount} watch</span>
          <span class="pill mono">${escapeHtml(data.generatedAt)}</span>
        </div>
      </section>

      <section class="rows">
        ${data.rows
          .map(
            (row) => `
              <article class="row">
                <div class="row-head">
                  <div class="row-title">
                    <h2>${escapeHtml(row.label)}</h2>
                    <span class="status ${row.status === "watch" ? "status-watch" : ""}">${row.status}</span>
                  </div>
                  <p>${escapeHtml(row.note)}</p>
                  ${renderSourcePreview(row)}
                  ${renderSourceList(row)}
                </div>
                <div class="result">
                  ${renderExtracted(row)}
                  ${renderChecks(row)}
                </div>
              </article>
            `,
          )
          .join("")}
      </section>
    </main>
  </body>
</html>
`;
}

async function main() {
  await mkdir(OUTPUT_DIR, { recursive: true });
  await copyGeneratedFonts(OUTPUT_DIR);
  const data: GauntletData = {
    generatedAt: new Date().toISOString(),
    rows: FIXTURES.map(buildRow),
  };

  await writeFile(JSON_PATH, `${JSON.stringify(data, null, 2)}\n`);
  await writeFile(HTML_PATH, renderHtml(data).replace(/[ \t]+$/gm, ""));

  const passCount = data.rows.filter((row) => row.status === "pass").length;
  const watchRows = data.rows.filter((row) => row.status === "watch");
  console.log(`Wrote ${path.relative(process.cwd(), HTML_PATH)}`);
  console.log(`Wrote ${path.relative(process.cwd(), JSON_PATH)}`);
  console.log(`${passCount}/${data.rows.length} fixtures passed`);
  if (watchRows.length > 0) {
    console.log(`Watch: ${watchRows.map((row) => row.id).join(", ")}`);
  }
}

main().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});
