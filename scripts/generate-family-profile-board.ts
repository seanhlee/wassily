import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { buildFamilyProfileBoardData } from "../src/engine/familyBoard";
import { toHex } from "../src/engine/gamut";

const OUTPUT_DIR = path.resolve("docs/generated");
const HTML_PATH = path.join(OUTPUT_DIR, "family-profile-board.html");
const JSON_PATH = path.join(OUTPUT_DIR, "family-profile-board.json");

function renderSwatchStrip(
  swatches: Array<{
    label: string;
    hex: string;
    textHex: string;
    oklch: string;
  }>,
  emphasizedLabel?: string,
): string {
  return `
    <div class="swatch-strip">
      ${swatches
        .map(
          (swatch) => `
            <div class="swatch${swatch.label === emphasizedLabel ? " swatch--anchor" : ""}" style="background:${swatch.hex}; color:${swatch.textHex}">
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

function renderMetric(label: string, value: string): string {
  return `<div class="metric"><span class="metric__label">${label}</span><span class="metric__value">${value}</span></div>`;
}

function formatSigned(value: number): string {
  return `${value >= 0 ? "+" : ""}${value.toFixed(3)}`;
}

function renderHtml(data: ReturnType<typeof buildFamilyProfileBoardData>): string {
  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>Wassily Family Profile Board</title>
    <style>
      :root {
        color-scheme: light;
        --bg: #f5f2eb;
        --surface: rgba(255, 255, 255, 0.74);
        --surface-border: rgba(17, 17, 17, 0.12);
        --text: #171411;
        --muted: #5d5650;
        --accent: #6d645b;
        --code: "IBM Plex Mono", ui-monospace, SFMono-Regular, Menlo, monospace;
        --display: "Iowan Old Style", "Palatino Linotype", "Book Antiqua", Palatino, Georgia, serif;
      }

      * { box-sizing: border-box; }
      body {
        margin: 0;
        font-family: Inter, ui-sans-serif, system-ui, sans-serif;
        color: var(--text);
        background:
          radial-gradient(circle at top left, rgba(255, 255, 255, 0.92), transparent 42%),
          linear-gradient(180deg, #f9f6f0 0%, var(--bg) 100%);
      }

      main {
        max-width: 1440px;
        margin: 0 auto;
        padding: 48px 28px 72px;
      }

      h1, h2, h3 {
        margin: 0;
        font-family: var(--display);
        font-weight: 700;
        letter-spacing: -0.02em;
      }

      h1 {
        font-size: clamp(2.6rem, 5vw, 4.4rem);
        line-height: 0.96;
      }

      p {
        margin: 0;
        color: var(--muted);
        line-height: 1.6;
      }

      code {
        font-family: var(--code);
        font-size: 0.95em;
      }

      .hero {
        display: grid;
        gap: 16px;
        margin-bottom: 36px;
      }

      .hero__meta {
        font-family: var(--code);
        font-size: 0.9rem;
        color: var(--accent);
      }

      .family {
        margin-top: 36px;
        border: 1px solid var(--surface-border);
        border-radius: 24px;
        background: var(--surface);
        box-shadow: 0 30px 80px rgba(44, 33, 24, 0.08);
        overflow: hidden;
      }

      .family__header {
        padding: 28px 28px 18px;
        border-bottom: 1px solid var(--surface-border);
        display: grid;
        gap: 12px;
      }

      .family__title-row {
        display: flex;
        flex-wrap: wrap;
        align-items: center;
        gap: 12px;
      }

      .chip {
        display: inline-flex;
        align-items: center;
        gap: 8px;
        padding: 8px 12px;
        border-radius: 999px;
        border: 1px solid var(--surface-border);
        background: rgba(255, 255, 255, 0.72);
        font-family: var(--code);
        font-size: 0.82rem;
        color: var(--accent);
      }

      .chip__dot {
        width: 12px;
        height: 12px;
        border-radius: 999px;
        box-shadow: inset 0 0 0 1px rgba(17, 17, 17, 0.12);
      }

      .family__body {
        display: grid;
        gap: 22px;
        padding: 24px 28px 30px;
      }

      .grid {
        display: grid;
        gap: 18px;
      }

      .grid--summary {
        grid-template-columns: repeat(auto-fit, minmax(280px, 1fr));
      }

      .card {
        display: grid;
        gap: 14px;
        padding: 18px;
        border-radius: 18px;
        background: rgba(255, 255, 255, 0.82);
        border: 1px solid rgba(17, 17, 17, 0.1);
      }

      .card h3 {
        font-size: 1.35rem;
      }

      .swatch-strip {
        display: grid;
        grid-template-columns: repeat(auto-fit, minmax(98px, 1fr));
        gap: 10px;
      }

      .swatch {
        min-height: 112px;
        padding: 12px;
        border-radius: 14px;
        display: grid;
        align-content: space-between;
        border: 1px solid rgba(17, 17, 17, 0.08);
        box-shadow: inset 0 0 0 1px rgba(255, 255, 255, 0.06);
      }

      .swatch--anchor {
        outline: 2px solid rgba(146, 92, 255, 0.45);
        outline-offset: 2px;
      }

      .swatch__label {
        font-family: var(--code);
        font-size: 0.78rem;
        text-transform: uppercase;
        letter-spacing: 0.08em;
      }

      .swatch__oklch,
      .swatch__hex {
        font-family: var(--code);
        font-size: 0.72rem;
        line-height: 1.45;
      }

      .reference-list {
        display: grid;
        gap: 16px;
      }

      .reference {
        display: grid;
        gap: 12px;
        padding: 14px;
        border-radius: 16px;
        border: 1px solid rgba(17, 17, 17, 0.08);
        background: rgba(252, 251, 249, 0.95);
      }

      .reference__header {
        display: flex;
        flex-wrap: wrap;
        align-items: center;
        justify-content: space-between;
        gap: 10px;
      }

      .reference__meta {
        display: flex;
        flex-wrap: wrap;
        gap: 8px;
      }

      .metric-grid {
        display: grid;
        grid-template-columns: repeat(auto-fit, minmax(160px, 1fr));
        gap: 10px;
      }

      .metric {
        display: grid;
        gap: 4px;
        padding: 12px;
        border-radius: 14px;
        background: rgba(249, 247, 242, 0.95);
        border: 1px solid rgba(17, 17, 17, 0.06);
      }

      .metric__label {
        font-size: 0.78rem;
        text-transform: uppercase;
        letter-spacing: 0.08em;
        color: var(--accent);
        font-family: var(--code);
      }

      .metric__value {
        font-family: var(--code);
        font-size: 0.95rem;
        color: var(--text);
      }

      .profile-grid {
        display: grid;
        grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
        gap: 10px;
      }

      .profile-grid .metric__value {
        font-size: 0.82rem;
      }

      @media (max-width: 840px) {
        main { padding-inline: 18px; }
        .family__header,
        .family__body { padding-inline: 18px; }
        .swatch-strip { grid-template-columns: repeat(auto-fit, minmax(84px, 1fr)); }
      }
    </style>
  </head>
  <body>
    <main>
      <section class="hero">
        <div class="hero__meta">Generated ${data.generatedAt}</div>
        <h1>Corpus-Fit Family Profile Board</h1>
        <p>
          Reference ramps, the derived archetype control points, and the current Wassily exemplar ramps shown side by side.
          This board is meant to answer one question: is the fitter learning a believable family shape, or only a set of numbers?
        </p>
      </section>
      ${data.families
        .map(
          (section) => `
            <section class="family">
              <header class="family__header">
                <div class="family__title-row">
                  <h2>${section.family}</h2>
                  <div class="chip">
                    <span class="chip__dot" style="background:${toHex(section.exemplarSeed.color)}"></span>
                    exemplar seed · ${section.exemplarSeed.label}
                  </div>
                  <div class="chip">
                    seed stop · ${section.analysis.labels[section.analysis.seedStopIndex ?? 0] ?? "n/a"}
                  </div>
                </div>
                <p>${section.exemplarSeed.note}</p>
              </header>
              <div class="family__body">
                <div class="grid grid--summary">
                  <article class="card">
                    <h3>Derived Archetype</h3>
                    <p>Control points averaged in Oklab from the weighted curated corpus.</p>
                    ${renderSwatchStrip(section.archetypeControlPoints, "seed")}
                  </article>
                  <article class="card">
                    <h3>Wassily Exemplar Ramp</h3>
                    <p>The current arc-length ramp generated for the canonical family seed.</p>
                    ${renderSwatchStrip(
                      section.generatedRamp,
                      section.analysis.labels[section.analysis.seedStopIndex ?? 0],
                    )}
                  </article>
                </div>

                <article class="card">
                  <h3>Reference Corpus</h3>
                  <div class="reference-list">
                    ${section.references
                      .map(
                        (reference) => `
                          <div class="reference">
                            <div class="reference__header">
                              <div>
                                <strong>${reference.id}</strong>
                                <p>${reference.source}</p>
                              </div>
                              <div class="reference__meta">
                                <div class="chip">weight · ${reference.weight.toFixed(2)}</div>
                                <div class="chip">anchor · ${reference.anchorLabel}</div>
                                <div class="chip">
                                  progress · ${reference.shoulderFit.lightProgress.toFixed(3)} / ${reference.shoulderFit.darkProgress.toFixed(3)}
                                </div>
                              </div>
                            </div>
                            <p>${reference.notes}</p>
                            <div class="metric-grid">
                              ${renderMetric(
                                "light shape",
                                `P ${reference.shoulderFit.lightProgress.toFixed(3)} · R ${formatSigned(reference.shoulderFit.lightRadial)} · N ${formatSigned(reference.shoulderFit.lightNormal)}`,
                              )}
                              ${renderMetric(
                                "dark shape",
                                `P ${reference.shoulderFit.darkProgress.toFixed(3)} · R ${formatSigned(reference.shoulderFit.darkRadial)} · N ${formatSigned(reference.shoulderFit.darkNormal)}`,
                              )}
                              ${renderMetric(
                                "light residual",
                                reference.shoulderFit.lightResidual.toFixed(3),
                              )}
                              ${renderMetric(
                                "dark residual",
                                reference.shoulderFit.darkResidual.toFixed(3),
                              )}
                            </div>
                            ${renderSwatchStrip(reference.swatches, reference.anchorLabel)}
                          </div>
                        `,
                      )
                      .join("")}
                  </div>
                </article>

                <div class="grid grid--summary">
                  <article class="card">
                    <h3>Ramp Diagnostics</h3>
                    <div class="metric-grid">
                      ${renderMetric(
                        "seed stop",
                        section.analysis.labels[section.analysis.seedStopIndex ?? 0] ?? "n/a",
                      )}
                      ${renderMetric(
                        "endpoint light",
                        `L ${section.analysis.endpointLight.lightness.toFixed(3)} · C ${section.analysis.endpointLight.chroma.toFixed(3)}`,
                      )}
                      ${renderMetric(
                        "endpoint dark",
                        `L ${section.analysis.endpointDark.lightness.toFixed(3)} · C ${section.analysis.endpointDark.chroma.toFixed(3)}`,
                      )}
                      ${renderMetric(
                        "max hue drift",
                        `${section.analysis.lightRamp.maxHueDriftFromSeed.toFixed(1)}°`,
                      )}
                      ${renderMetric(
                        "distance cv",
                        section.analysis.lightRamp.adjacentDistance.coefficientOfVariation.toFixed(3),
                      )}
                      ${renderMetric(
                        "monotone",
                        section.analysis.lightRamp.lightness.nonIncreasing ? "yes" : "no",
                      )}
                    </div>
                  </article>
                  <article class="card">
                    <h3>Fit Metadata</h3>
                    <div class="metric-grid">
                      ${renderMetric(
                        "light shoulder progress",
                        section.fit.shoulderGeometry.lightProgress.toFixed(3),
                      )}
                      ${renderMetric(
                        "dark shoulder progress",
                        section.fit.shoulderGeometry.darkProgress.toFixed(3),
                      )}
                      ${renderMetric(
                        "light residual",
                        section.fit.shoulderGeometry.lightResidualMean.toFixed(3),
                      )}
                      ${renderMetric(
                        "dark residual",
                        section.fit.shoulderGeometry.darkResidualMean.toFixed(3),
                      )}
                      ${renderMetric(
                        "light shoulder offset",
                        `R ${formatSigned(section.fit.shoulderGeometry.lightRadial)} · N ${formatSigned(section.fit.shoulderGeometry.lightNormal)}`,
                      )}
                      ${renderMetric(
                        "dark shoulder offset",
                        `R ${formatSigned(section.fit.shoulderGeometry.darkRadial)} · N ${formatSigned(section.fit.shoulderGeometry.darkNormal)}`,
                      )}
                    </div>
                    <div class="profile-grid">
                      ${Object.entries(section.fit.profile)
                        .map(([key, value]) => renderMetric(key, Number(value).toFixed(3)))
                        .join("")}
                    </div>
                  </article>
                </div>
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
  const data = buildFamilyProfileBoardData();
  await mkdir(OUTPUT_DIR, { recursive: true });
  await writeFile(JSON_PATH, `${JSON.stringify(data, null, 2)}\n`, "utf8");
  await writeFile(HTML_PATH, renderHtml(data), "utf8");
  console.log(`Wrote ${HTML_PATH}`);
  console.log(`Wrote ${JSON_PATH}`);
}

await main();
