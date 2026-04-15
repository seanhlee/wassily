import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { buildResearchLabData } from "../src/engine/researchLab";

const OUTPUT_DIR = path.resolve("docs/generated");
const HTML_PATH = path.join(OUTPUT_DIR, "research-lab.html");
const JSON_PATH = path.join(OUTPUT_DIR, "research-lab.json");

function renderSwatches(
  swatches: Array<{ label: string; hex: string; textHex: string; oklch: string }>,
  seedLabel: string | undefined,
): string {
  return `
    <div class="swatches">
      ${swatches
        .map(
          (swatch) => `
            <div class="swatch${swatch.label === seedLabel ? " swatch--seed" : ""}" style="background:${swatch.hex}; color:${swatch.textHex}">
              <div class="swatch__label">${swatch.label}</div>
              <div class="swatch__oklch">${swatch.oklch}</div>
              <div class="swatch__hex">${swatch.hex}</div>
            </div>
          `,
        )
        .join("")}
    </div>
  `;
}

function metric(label: string, value: string): string {
  return `<div class="metric"><span>${label}</span><strong>${value}</strong></div>`;
}

function renderHtml(data: ReturnType<typeof buildResearchLabData>): string {
  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>Wassily Research Lab</title>
    <style>
      :root {
        --bg: #f3eee6;
        --surface: rgba(255,255,255,0.82);
        --line: rgba(17,17,17,0.1);
        --text: #1d1916;
        --muted: #695f56;
        --accent: #9b6f41;
      }

      * { box-sizing: border-box; }
      body {
        margin: 0;
        font-family: Inter, ui-sans-serif, system-ui, sans-serif;
        background:
          radial-gradient(circle at top left, rgba(255,255,255,0.9), transparent 40%),
          linear-gradient(180deg, #faf7f2 0%, var(--bg) 100%);
        color: var(--text);
      }

      main {
        max-width: 1480px;
        margin: 0 auto;
        padding: 40px 24px 72px;
      }

      h1, h2, h3 {
        margin: 0;
        font-family: "Iowan Old Style", "Palatino Linotype", "Book Antiqua", Palatino, Georgia, serif;
        letter-spacing: -0.02em;
      }

      h1 {
        font-size: clamp(2.4rem, 5vw, 4rem);
        line-height: 0.95;
        margin-bottom: 12px;
      }

      p {
        margin: 0;
        color: var(--muted);
        line-height: 1.55;
      }

      .hero {
        display: grid;
        gap: 12px;
        margin-bottom: 28px;
      }

      .seed {
        border: 1px solid var(--line);
        border-radius: 24px;
        background: var(--surface);
        box-shadow: 0 24px 64px rgba(28, 20, 14, 0.08);
        padding: 22px;
        display: grid;
        gap: 18px;
        margin-top: 24px;
      }

      .seed__header {
        display: grid;
        gap: 8px;
      }

      .seed__meta {
        display: flex;
        flex-wrap: wrap;
        gap: 10px;
        font-family: "IBM Plex Mono", ui-monospace, monospace;
        font-size: 0.82rem;
        color: var(--accent);
      }

      .chip {
        padding: 7px 10px;
        border: 1px solid var(--line);
        border-radius: 999px;
        background: rgba(255,255,255,0.68);
      }

      .engine-grid {
        display: grid;
        grid-template-columns: repeat(auto-fit, minmax(420px, 1fr));
        gap: 18px;
      }

      .engine {
        border: 1px solid var(--line);
        border-radius: 20px;
        padding: 18px;
        background: rgba(255,255,255,0.88);
        display: grid;
        gap: 16px;
      }

      .metric-grid {
        display: grid;
        grid-template-columns: repeat(auto-fit, minmax(148px, 1fr));
        gap: 10px;
      }

      .metric {
        display: grid;
        gap: 4px;
        padding: 10px 12px;
        border-radius: 14px;
        background: rgba(248, 245, 240, 0.95);
        border: 1px solid rgba(17,17,17,0.06);
        font-size: 0.9rem;
      }

      .metric span {
        color: var(--muted);
        font-size: 0.78rem;
        text-transform: uppercase;
        letter-spacing: 0.06em;
      }

      .swatches {
        display: grid;
        grid-template-columns: repeat(auto-fit, minmax(92px, 1fr));
        gap: 10px;
      }

      .swatch {
        min-height: 110px;
        border-radius: 14px;
        padding: 12px;
        display: grid;
        align-content: space-between;
        border: 1px solid rgba(17,17,17,0.08);
      }

      .swatch--seed {
        outline: 2px solid rgba(155, 111, 65, 0.5);
        outline-offset: 2px;
      }

      .swatch__label,
      .swatch__oklch,
      .swatch__hex {
        font-family: "IBM Plex Mono", ui-monospace, monospace;
      }

      .swatch__label {
        font-size: 0.76rem;
        text-transform: uppercase;
        letter-spacing: 0.08em;
      }

      .swatch__oklch,
      .swatch__hex {
        font-size: 0.7rem;
        line-height: 1.45;
      }
    </style>
  </head>
  <body>
    <main>
      <section class="hero">
        <h1>Wassily Research Lab</h1>
        <p>Side-by-side evaluation board for the current <code>v5</code> family-profile engine and the experimental <code>v6</code> seed-constrained perceptual path solver.</p>
        <p>Generated ${new Date(data.generatedAt).toLocaleString()}</p>
      </section>
      ${data.seeds
        .map(
          (section) => `
            <section class="seed">
              <div class="seed__header">
                <h2>${section.seed.label}</h2>
                <p>${section.seed.note}</p>
                <div class="seed__meta">
                  <div class="chip">${`oklch(${section.seed.color.l.toFixed(3)} ${section.seed.color.c.toFixed(3)} ${section.seed.color.h.toFixed(1)})`}</div>
                </div>
              </div>
              <div class="engine-grid">
                ${section.engines
                  .map((engine) => {
                    const seedLabel =
                      engine.run.analysis.seedStopIndex === null
                        ? undefined
                        : engine.run.analysis.labels[engine.run.analysis.seedStopIndex];
                    return `
                      <article class="engine">
                        <div>
                          <h3>${engine.engine.toUpperCase()}</h3>
                        </div>
                        <div class="metric-grid">
                          ${metric(
                            "Seed Stop",
                            seedLabel ?? "n/a",
                          )}
                          ${metric(
                            "Seed Delta",
                            engine.run.analysis.seedDelta?.toFixed(4) ?? "n/a",
                          )}
                          ${metric(
                            "Distance CV",
                            engine.run.analysis.lightRamp.adjacentDistance.coefficientOfVariation.toFixed(3),
                          )}
                          ${metric(
                            "Hue Drift",
                            `${engine.run.analysis.lightRamp.maxHueDriftFromSeed.toFixed(1)}°`,
                          )}
                          ${metric(
                            "Endpoint Light",
                            `${engine.run.analysis.endpointLight.lightness.toFixed(3)} / ${engine.run.analysis.endpointLight.chroma.toFixed(3)}`,
                          )}
                          ${metric(
                            "Endpoint Dark",
                            `${engine.run.analysis.endpointDark.lightness.toFixed(3)} / ${engine.run.analysis.endpointDark.chroma.toFixed(3)}`,
                          )}
                          ${metric(
                            "Monotone",
                            engine.run.analysis.lightRamp.lightness.nonIncreasing ? "yes" : "no",
                          )}
                          ${engine.run.metadata
                            ? metric(
                                "Solved Seed Split",
                                `${engine.run.metadata.seedIndex} @ ${(engine.run.metadata.seedFraction * 100).toFixed(1)}%`,
                              )
                            : ""}
                          ${engine.run.metadata
                            ? metric(
                                "Solver Score",
                                engine.run.metadata.score.toFixed(2),
                              )
                            : ""}
                          ${engine.run.metadata
                            ? metric(
                                "Path Density",
                                engine.run.metadata.breakdown.continuousSpacingDistortion.toFixed(3),
                              )
                            : ""}
                          ${engine.run.metadata
                            ? metric(
                                "Discrete Spacing",
                                engine.run.metadata.breakdown.spacingDistortion.toFixed(3),
                              )
                            : ""}
                          ${engine.run.metadata
                            ? metric(
                                "Light Entrance",
                                engine.run.metadata.breakdown.lightEntrancePenalty.toFixed(3),
                              )
                            : ""}
                          ${engine.run.metadata
                            ? metric(
                                "Hue Wobble",
                                engine.run.metadata.breakdown.hueWobble.toFixed(3),
                              )
                            : ""}
                          ${engine.run.metadata
                            ? metric(
                                "Curvature",
                                engine.run.metadata.breakdown.curvature.toFixed(3),
                              )
                            : ""}
                          ${engine.run.metadata
                            ? metric(
                                "Soft Prior Obj",
                                engine.run.metadata.breakdown.selectedSoftPriorPenalty.toFixed(2),
                              )
                            : ""}
                          ${engine.run.metadata
                            ? metric(
                                "Prior Energy Δ",
                                engine.run.metadata.softPrior.energyPenalty.toFixed(2),
                              )
                            : ""}
                          ${engine.run.metadata
                            ? metric(
                                "Prior Param Δ",
                                engine.run.metadata.softPrior.parameterPenalty.toFixed(2),
                              )
                            : ""}
                          ${engine.run.metadata
                            ? metric(
                                "Top Prior",
                                engine.run.metadata.softPrior.contributors[0]?.referenceId ??
                                  "n/a",
                              )
                            : ""}
                        </div>
                        ${renderSwatches(engine.swatches, seedLabel)}
                      </article>
                    `;
                  })
                  .join("")}
              </div>
            </section>
          `,
        )
        .join("")}
    </main>
  </body>
</html>`;
}

async function main(): Promise<void> {
  const data = buildResearchLabData();
  await mkdir(OUTPUT_DIR, { recursive: true });
  await Promise.all([
    writeFile(JSON_PATH, JSON.stringify(data, null, 2), "utf8"),
    writeFile(HTML_PATH, renderHtml(data), "utf8"),
  ]);
  console.log(`Wrote ${HTML_PATH}`);
  console.log(`Wrote ${JSON_PATH}`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
