import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import {
  buildResearchLabData,
  type ResearchLabData,
} from "../src/engine/researchLab";
import {
  RESEARCH_SEEDS,
  type ResearchSeed,
} from "../src/engine/research";
import { maxChroma } from "../src/engine/gamut";
import type { OklchColor } from "../src/types";
import {
  GENERATED_FONT_FACE_CSS,
  GENERATED_TEXT_FONT,
  copyGeneratedFonts,
} from "./researchTypography";

const OUTPUT_DIR = path.resolve("docs/generated");
const HTML_PATH = path.join(OUTPUT_DIR, "research-lab.html");
const JSON_PATH = path.join(OUTPUT_DIR, "research-lab.json");

const FOCUS_STOP_LABELS = [
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
const FOCUS_ENGINES = [
  "brand-exact-fair",
  "continuous-curve",
  "continuous-compressed",
] as const;

type FocusedEngine = ResearchLabData["seeds"][number]["engines"][number];

function researchSeed(id: string): ResearchSeed {
  const seed = RESEARCH_SEEDS.find((candidate) => candidate.id === id);
  if (!seed) throw new Error(`Missing research seed: ${id}`);
  return seed;
}

function seed(id: string, label: string, note: string, color: OklchColor): ResearchSeed {
  return { id, label, note, color };
}

const FOCUS_SEEDS: readonly ResearchSeed[] = [
  researchSeed("bright-lime"),
  researchSeed("cadmium-yellow"),
  seed("orange", "Orange", "Saturated orange body color; checks tan highlights and muddy shadows.", {
    l: 0.68,
    c: 0.18,
    h: 48,
  }),
  seed("coral", "Coral", "Red-orange brand color where highlights can become peach paper.", {
    l: 0.7,
    c: 0.16,
    h: 32,
  }),
  seed("red", "Red", "Vivid red with difficult pink highlights and dark heat retention.", {
    l: 0.6,
    c: 0.21,
    h: 28,
  }),
  seed("hot-pink", "Hot Pink", "Magenta-pink that can become candy in highlights and purple sludge in darks.", {
    l: 0.66,
    c: 0.23,
    h: 345,
  }),
  seed("ochre", "Ochre", "Earth yellow that can lose heat and turn beige through the highlights.", {
    l: 0.7,
    c: 0.115,
    h: 82,
  }),
  seed("mustard", "Mustard", "Muted yellow-green earth color where mids can flatten into khaki.", {
    l: 0.64,
    c: 0.105,
    h: 92,
  }),
  seed("terracotta", "Terracotta", "Muted clay-orange that tests peach highlights and brown shadows.", {
    l: 0.58,
    c: 0.125,
    h: 42,
  }),
  seed("rust", "Rust", "Deep earthy orange-red that can collapse into brown-black.", {
    l: 0.5,
    c: 0.12,
    h: 36,
  }),
  seed("olive", "Olive", "Muted yellow-green that can become khaki paper and dead mud.", {
    l: 0.52,
    c: 0.085,
    h: 118,
  }),
  seed("moss", "Moss", "Earthy green that tests muted color retention across body and tail.", {
    l: 0.48,
    c: 0.075,
    h: 135,
  }),
  seed("burgundy", "Burgundy", "Dark muted red where the tail can become black-purple or dried brown.", {
    l: 0.42,
    c: 0.125,
    h: 18,
  }),
  seed("dusty-rose", "Dusty Rose", "Low-chroma pink that can become gray paper at the top.", {
    l: 0.68,
    c: 0.075,
    h: 12,
  }),
  seed("clay-taupe", "Clay Taupe", "Warm muted color on the boundary between neutral and chromatic.", {
    l: 0.6,
    c: 0.045,
    h: 55,
  }),
  seed("pine", "Pine", "Deep muted forest green that can lose color in the highlights or tail.", {
    l: 0.38,
    c: 0.095,
    h: 155,
  }),
  researchSeed("cyan"),
  seed("aqua", "Aqua", "Electric blue-green highlight family between cyan and teal.", {
    l: 0.8,
    c: 0.13,
    h: 195,
  }),
  seed("teal", "Teal", "Bridge between phthalo and cyan behavior.", {
    l: 0.58,
    c: 0.14,
    h: 185,
  }),
  researchSeed("phthalo-green"),
  researchSeed("ultramarine"),
  researchSeed("violet"),
  researchSeed("very-light-seed"),
  researchSeed("very-dark-seed"),
  researchSeed("warm-neutral"),
  researchSeed("cool-neutral"),
];

function buildFocusedVisualData(): ResearchLabData {
  const stopLabels = new Set<string>(FOCUS_STOP_LABELS);
  const engines = new Set<string>(FOCUS_ENGINES);
  const data = buildResearchLabData(FOCUS_SEEDS);

  return {
    ...data,
    seeds: data.seeds.map((section) => ({
      ...section,
      engines: section.engines
        .filter((engine) => engines.has(engine.engine))
        .map((engine) => ({
          ...engine,
          swatches: engine.swatches.filter((swatch) => stopLabels.has(swatch.label)),
        })),
    })),
  };
}

function renderSwatches(
  swatches: Array<{ label: string; hex: string; textHex: string; oklch: string }>,
  seedLabel: string | null,
): string {
  return `
    <div class="swatches" aria-label="Focused highlight stops">
      ${swatches
        .map(
          (swatch) => `
            <div class="swatch${swatch.label === seedLabel ? " swatch--seed" : ""}" style="background:${swatch.hex}; color:${swatch.textHex}">
              <div class="swatch__label">${swatch.label}</div>
              <div class="swatch__details">
                <div>${swatch.hex}</div>
              </div>
            </div>
          `,
        )
        .join("")}
    </div>
  `;
}

function formatDistance(value: number | null): string {
  return value === null ? "n/a" : value.toFixed(3);
}

function formatRatio(value: number): string {
  return `${value.toFixed(2)}x`;
}

function formatPercent(value: number | null): string {
  return value === null ? "n/a" : `${Math.round(value * 100)}%`;
}

function distanceBetweenStops(
  engine: FocusedEngine,
  fromLabel: string,
  toLabel: string,
): number | null {
  const labels = engine.run.analysis.labels;
  const fromIndex = labels.indexOf(fromLabel);
  const toIndex = labels.indexOf(toLabel);
  if (fromIndex < 0 || toIndex !== fromIndex + 1) return null;
  return engine.run.analysis.lightRamp.adjacentDistance.values[fromIndex] ?? null;
}

function occupancyForStop(engine: FocusedEngine, label: string): number | null {
  const stop = engine.run.stops.find((candidate) => candidate.label === label);
  if (!stop) return null;
  const available = maxChroma(stop.color.l, stop.color.h);
  return available > 0 ? stop.color.c / available : null;
}

function renderDiagnostics(engine: FocusedEngine): string {
  const stop50Occupancy = occupancyForStop(engine, "50");
  const topDistance = engine.focus.topCliffDistance ?? distanceBetweenStops(engine, "50", "100");
  const bridgeDistance =
    engine.focus.topBridgeDistance ?? distanceBetweenStops(engine, "100", "200");
  const darkBridgeDistance =
    engine.focus.darkBridgeDistance ?? distanceBetweenStops(engine, "800", "900");
  const darkEdgeDistance =
    engine.focus.darkEdgeDistance ?? distanceBetweenStops(engine, "900", "950");

  return `
    <div class="diagnostics" aria-label="Ramp diagnostics">
      <div class="diagnostic">
        <span class="diagnostic__label">50 occ</span>
        <span class="diagnostic__value mono">${formatPercent(stop50Occupancy)}</span>
      </div>
      <div class="diagnostic">
        <span class="diagnostic__label">50->100</span>
        <span class="diagnostic__value mono">${formatDistance(topDistance)}</span>
      </div>
      <div class="diagnostic">
        <span class="diagnostic__label">100->200</span>
        <span class="diagnostic__value mono">${formatDistance(bridgeDistance)}</span>
      </div>
      <div class="diagnostic">
        <span class="diagnostic__label">800->900</span>
        <span class="diagnostic__value mono">${formatDistance(darkBridgeDistance)}</span>
      </div>
      <div class="diagnostic">
        <span class="diagnostic__label">900->950</span>
        <span class="diagnostic__value mono">${formatDistance(darkEdgeDistance)}</span>
      </div>
      <div class="diagnostic">
        <span class="diagnostic__label">dark edge</span>
        <span class="diagnostic__value mono">${engine.focus.darkExitRatio === null ? "n/a" : formatRatio(engine.focus.darkExitRatio)}</span>
      </div>
      <div class="diagnostic">
        <span class="diagnostic__label">edge</span>
        <span class="diagnostic__value mono">${formatRatio(engine.focus.lightEntranceRatio)}</span>
      </div>
      <div class="diagnostic">
        <span class="diagnostic__label">cv</span>
        <span class="diagnostic__value mono">${engine.focus.spacingCv.toFixed(2)}</span>
      </div>
      <div class="diagnostic">
        <span class="diagnostic__label">max gp</span>
        <span class="diagnostic__value mono">${formatPercent(engine.focus.maxGamutPressure)}</span>
      </div>
      <div class="diagnostic">
        <span class="diagnostic__label">wall stops</span>
        <span class="diagnostic__value mono">${engine.focus.nearBoundaryStops}</span>
      </div>
    </div>
  `;
}

function engineLabel(engine: string): string {
  switch (engine) {
    case "v6":
      return "V6 Solver";
    case "brand-exact-fair":
      return "Brand-Exact Fair";
    case "continuous-curve":
      return "Continuous Curve";
    case "continuous-compressed":
      return "Continuous Compressed";
    default:
      return engine.toUpperCase();
  }
}

function renderHtml(data: ResearchLabData): string {
  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <link rel="icon" href="data:," />
    <title>Wassily Highlight Ramp Lab</title>
    <style>
${GENERATED_FONT_FACE_CSS}
      :root {
        --bg: #f7f8f5;
        --ink: #111816;
        --muted: #68736d;
        --line: rgba(17, 24, 22, 0.12);
        --panel: rgba(255, 255, 255, 0.72);
        --accent: #0b6b61;
        --accent-2: #3656a3;
      }

      * { box-sizing: border-box; }

      body {
        margin: 0;
        color: var(--ink);
        font-family: ${GENERATED_TEXT_FONT};
        font-variant-numeric: tabular-nums;
        background:
          linear-gradient(90deg, rgba(11, 107, 97, 0.08), rgba(54, 86, 163, 0.08)),
          var(--bg);
      }

      main {
        width: min(1420px, calc(100vw - 48px));
        margin: 0 auto;
        padding: 36px 0 64px;
      }

      h1,
      h2,
      h3,
      p {
        margin: 0;
      }

      h1 {
        max-width: 860px;
        font-size: clamp(2rem, 4.5vw, 4.2rem);
        line-height: 0.96;
        letter-spacing: 0;
      }

      h2 {
        font-size: clamp(1.3rem, 2vw, 2rem);
        letter-spacing: 0;
      }

      h3 {
        font-size: 0.88rem;
        letter-spacing: 0.08em;
        text-transform: uppercase;
      }

      p {
        max-width: 760px;
        color: var(--muted);
        line-height: 1.55;
      }

      code,
      .mono {
        font-family: ${GENERATED_TEXT_FONT};
        font-variant-numeric: tabular-nums;
      }

      .hero {
        display: grid;
        gap: 12px;
        padding-bottom: 28px;
        border-bottom: 1px solid var(--line);
      }

      .hero__meta {
        display: flex;
        flex-wrap: wrap;
        gap: 10px;
        margin-top: 8px;
      }

      .pill {
        border: 1px solid var(--line);
        border-radius: 999px;
        background: var(--panel);
        color: var(--accent);
        padding: 8px 11px;
        font-size: 0.8rem;
      }

      .seed {
        display: grid;
        gap: 16px;
        padding: 28px 0;
        border-bottom: 1px solid var(--line);
      }

      .seed__header {
        display: grid;
        grid-template-columns: 180px minmax(260px, 1fr) auto;
        align-items: start;
        gap: 24px;
      }

      .seed__meta {
        display: flex;
        flex-wrap: wrap;
        gap: 8px;
        margin-top: 4px;
      }

      .chip {
        border: 1px solid var(--line);
        border-radius: 999px;
        background: rgba(255, 255, 255, 0.66);
        color: var(--accent-2);
        padding: 7px 10px;
        font-size: 0.76rem;
      }

      .engine {
        display: grid;
        gap: 10px;
        min-width: 0;
      }

      .engine__bar {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 12px;
      }

      .anchor {
        color: var(--muted);
        font-size: 0.82rem;
      }

      .diagnostics {
        display: flex;
        flex-wrap: wrap;
        gap: 6px;
      }

      .diagnostic {
        display: grid;
        grid-template-columns: auto auto;
        align-items: baseline;
        gap: 7px;
        min-height: 30px;
        border: 1px solid var(--line);
        border-radius: 999px;
        background: rgba(255, 255, 255, 0.5);
        padding: 6px 9px;
      }

      .diagnostic__label {
        color: var(--muted);
        font-size: 0.68rem;
      }

      .diagnostic__value {
        color: var(--ink);
        font-size: 0.76rem;
      }

      .swatches {
        display: grid;
        grid-template-columns: repeat(11, minmax(0, 1fr));
        gap: 6px;
      }

      .swatch {
        min-height: 156px;
        border: 1px solid rgba(17, 24, 22, 0.16);
        border-radius: 8px;
        display: grid;
        align-content: space-between;
        padding: 10px;
        overflow: hidden;
        box-shadow: inset 0 0 0 1px rgba(255, 255, 255, 0.22);
      }

      .swatch--seed {
        outline: 3px solid rgba(17, 24, 22, 0.42);
        outline-offset: -7px;
      }

      .swatch__label,
      .swatch__details {
        font-family: ${GENERATED_TEXT_FONT};
        font-variant-numeric: tabular-nums;
      }

      .swatch__label {
        font-size: clamp(1.25rem, 2.15vw, 2.35rem);
        line-height: 0.9;
      }

      .swatch__details {
        display: grid;
        gap: 4px;
        font-size: 0.72rem;
        line-height: 1.35;
        overflow-wrap: anywhere;
      }

      @media (max-width: 820px) {
        main {
          width: min(100vw - 28px, 680px);
          padding-top: 24px;
        }

        .seed {
          grid-template-columns: 1fr;
          gap: 16px;
        }

        .seed__header {
          display: grid;
          gap: 10px;
        }

        .swatches {
          grid-template-columns: repeat(2, minmax(0, 1fr));
        }

        .swatch {
          min-height: 132px;
        }
      }
    </style>
  </head>
  <body>
    <main>
      <section class="hero">
        <h1>Highlight Ramp Lab</h1>
        <p>Visual-only pass for exact-seed ramp quality. This board compares the locked brand-exact fairing algorithm against the experimental continuous curve across known pressure colors, with top-bridge and dark-tail diagnostics visible beside the full ramp.</p>
        <div class="hero__meta">
          <div class="pill mono">Stops: ${FOCUS_STOP_LABELS.join(" / ")}</div>
          <div class="pill mono">Engines: ${FOCUS_ENGINES.map(engineLabel).join(" / ")}</div>
          <div class="pill mono">Generated ${new Date(data.generatedAt).toLocaleString()}</div>
        </div>
      </section>
      ${data.seeds
        .map(
          (section) => `
            <section class="seed">
              <div class="seed__header">
                <h2>${section.seed.label}</h2>
                <p>${section.seed.note}</p>
                <div class="seed__meta">
                  <div class="chip mono">seed oklch(${section.seed.color.l.toFixed(3)} ${section.seed.color.c.toFixed(3)} ${section.seed.color.h.toFixed(1)})</div>
                </div>
              </div>
              ${section.engines
                .map(
                  (engine) => `
                    <article class="engine">
                      <div class="engine__bar">
                        <h3>${engineLabel(engine.engine)}</h3>
                        <div class="anchor mono">anchor stop ${engine.focus.seedStopLabel ?? "n/a"}</div>
                      </div>
                      ${renderDiagnostics(engine)}
                      ${renderSwatches(engine.swatches, engine.focus.seedStopLabel)}
                    </article>
                  `,
                )
                .join("")}
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
  const data = buildFocusedVisualData();
  await mkdir(OUTPUT_DIR, { recursive: true });
  await copyGeneratedFonts(OUTPUT_DIR);
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
