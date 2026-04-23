import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { buildResearchLabData } from "../src/engine/researchLab";

const OUTPUT_DIR = path.resolve("docs/generated");
const HTML_PATH = path.join(OUTPUT_DIR, "research-lab.html");
const JSON_PATH = path.join(OUTPUT_DIR, "research-lab.json");

type MetricTone = "ok" | "warn" | "bad" | "neutral";

function renderSwatches(
  swatches: Array<{ label: string; hex: string; textHex: string; oklch: string }>,
  seedLabel: string | null,
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

function engineLabel(engine: string): string {
  switch (engine) {
    case "v6-archetype":
      return "V6 Archetype";
    case "v6":
      return "V6 Solver";
    default:
      return engine.toUpperCase();
  }
}

function gateLabel(gate: "pass" | "tighten" | "fail"): string {
  switch (gate) {
    case "pass":
      return "Pass";
    case "tighten":
      return "Tighten";
    default:
      return "Fail";
  }
}

function metric(label: string, value: string, tone: MetricTone = "neutral"): string {
  return `
    <div class="metric metric--${tone}">
      <span>${label}</span>
      <strong>${value}</strong>
    </div>
  `;
}

function classify(
  value: number | null,
  passThreshold: number,
  failThreshold: number,
): MetricTone {
  if (value === null || Number.isNaN(value)) return "bad";
  if (value > failThreshold) return "bad";
  if (value > passThreshold) return "warn";
  return "ok";
}

function monotoneTone(value: boolean): MetricTone {
  return value ? "ok" : "bad";
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
        --bg: #f4efe8;
        --surface: rgba(255,255,255,0.9);
        --surface-strong: rgba(255,255,255,0.96);
        --line: rgba(31, 25, 20, 0.08);
        --text: #1d1916;
        --muted: #685d54;
        --accent: #8a5d2d;
        --ok-bg: rgba(43, 122, 68, 0.09);
        --ok-line: rgba(43, 122, 68, 0.22);
        --ok-text: #245236;
        --warn-bg: rgba(191, 125, 32, 0.11);
        --warn-line: rgba(191, 125, 32, 0.22);
        --warn-text: #81520f;
        --bad-bg: rgba(162, 54, 42, 0.11);
        --bad-line: rgba(162, 54, 42, 0.22);
        --bad-text: #7e261d;
      }

      * { box-sizing: border-box; }

      body {
        margin: 0;
        color: var(--text);
        font-family: "IBM Plex Sans", "Avenir Next", "Segoe UI", sans-serif;
        background:
          radial-gradient(circle at top left, rgba(255,255,255,0.9), transparent 38%),
          linear-gradient(180deg, #fbf8f4 0%, var(--bg) 100%);
      }

      main {
        max-width: 1500px;
        margin: 0 auto;
        padding: 40px 24px 72px;
      }

      h1, h2, h3 {
        margin: 0;
        font-family: "Iowan Old Style", "Palatino Linotype", "Book Antiqua", Georgia, serif;
        letter-spacing: -0.02em;
      }

      h1 {
        font-size: clamp(2.5rem, 5vw, 4rem);
        line-height: 0.95;
      }

      p {
        margin: 0;
        line-height: 1.6;
        color: var(--muted);
      }

      code,
      .mono {
        font-family: "IBM Plex Mono", ui-monospace, monospace;
      }

      .hero {
        display: grid;
        gap: 12px;
        margin-bottom: 28px;
      }

      .hero__pillars {
        display: flex;
        flex-wrap: wrap;
        gap: 10px;
        margin-top: 6px;
      }

      .pillar {
        padding: 9px 12px;
        border-radius: 999px;
        border: 1px solid var(--line);
        background: rgba(255,255,255,0.74);
        font-size: 0.84rem;
        color: var(--accent);
      }

      .seed {
        margin-top: 24px;
        padding: 22px;
        border-radius: 24px;
        border: 1px solid var(--line);
        background: var(--surface);
        box-shadow: 0 24px 64px rgba(28, 20, 14, 0.08);
        display: grid;
        gap: 18px;
      }

      .seed__header {
        display: grid;
        gap: 8px;
      }

      .seed__meta {
        display: flex;
        flex-wrap: wrap;
        gap: 10px;
        font-size: 0.8rem;
      }

      .chip {
        padding: 8px 11px;
        border-radius: 999px;
        border: 1px solid var(--line);
        background: rgba(255,255,255,0.72);
        color: var(--accent);
      }

      .engine-grid {
        display: grid;
        grid-template-columns: repeat(auto-fit, minmax(420px, 1fr));
        gap: 18px;
      }

      .engine {
        display: grid;
        gap: 16px;
        padding: 18px;
        border-radius: 20px;
        border: 1px solid var(--line);
        background: var(--surface-strong);
      }

      .engine__header {
        display: flex;
        align-items: flex-start;
        justify-content: space-between;
        gap: 16px;
      }

      .engine__header p {
        font-size: 0.9rem;
      }

      .gate {
        padding: 7px 11px;
        border-radius: 999px;
        border: 1px solid var(--line);
        font-size: 0.76rem;
        letter-spacing: 0.08em;
        text-transform: uppercase;
        font-weight: 700;
        white-space: nowrap;
      }

      .gate--pass {
        background: var(--ok-bg);
        border-color: var(--ok-line);
        color: var(--ok-text);
      }

      .gate--tighten {
        background: var(--warn-bg);
        border-color: var(--warn-line);
        color: var(--warn-text);
      }

      .gate--fail {
        background: var(--bad-bg);
        border-color: var(--bad-line);
        color: var(--bad-text);
      }

      .metric-grid {
        display: grid;
        grid-template-columns: repeat(auto-fit, minmax(132px, 1fr));
        gap: 10px;
      }

      .metric {
        display: grid;
        gap: 4px;
        padding: 11px 12px;
        border-radius: 14px;
        border: 1px solid rgba(31, 25, 20, 0.06);
        background: rgba(248, 245, 240, 0.92);
      }

      .metric span {
        font-size: 0.72rem;
        text-transform: uppercase;
        letter-spacing: 0.08em;
        color: var(--muted);
      }

      .metric strong {
        font-size: 0.96rem;
      }

      .metric--ok {
        background: var(--ok-bg);
        border-color: var(--ok-line);
      }

      .metric--ok strong {
        color: var(--ok-text);
      }

      .metric--warn {
        background: var(--warn-bg);
        border-color: var(--warn-line);
      }

      .metric--warn strong {
        color: var(--warn-text);
      }

      .metric--bad {
        background: var(--bad-bg);
        border-color: var(--bad-line);
      }

      .metric--bad strong {
        color: var(--bad-text);
      }

      .reasons {
        display: flex;
        flex-wrap: wrap;
        gap: 8px;
      }

      .reason {
        padding: 6px 9px;
        border-radius: 999px;
        border: 1px solid var(--line);
        background: rgba(247, 243, 237, 0.95);
        font-size: 0.72rem;
        color: var(--muted);
      }

      .reason--pass {
        color: var(--ok-text);
        border-color: var(--ok-line);
        background: var(--ok-bg);
      }

      .swatches {
        display: grid;
        grid-template-columns: repeat(auto-fit, minmax(92px, 1fr));
        gap: 10px;
      }

      .swatch {
        min-height: 112px;
        padding: 12px;
        border-radius: 14px;
        border: 1px solid rgba(31, 25, 20, 0.08);
        display: grid;
        align-content: space-between;
      }

      .swatch--seed {
        outline: 2px solid rgba(138, 93, 45, 0.52);
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
        font-size: 0.69rem;
        line-height: 1.45;
      }
    </style>
  </head>
  <body>
    <main>
      <section class="hero">
        <h1>Wassily Research Lab</h1>
        <p>Strict evaluation board for the real bar: exact anchor truth, correct seed placement, and perceptually even travel from <code>50</code> through <code>950</code> with no visible jumps.</p>
        <div class="hero__pillars">
          <div class="pillar mono">Exact seed lock</div>
          <div class="pillar mono">Proper stop placement</div>
          <div class="pillar mono">No local step spikes</div>
          <div class="pillar mono">Monotone 50 → 950</div>
        </div>
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
                  <div class="chip mono">${`oklch(${section.seed.color.l.toFixed(3)} ${section.seed.color.c.toFixed(3)} ${section.seed.color.h.toFixed(1)})`}</div>
                </div>
              </div>
              <div class="engine-grid">
                ${section.engines
                  .map(
                    (engine) => `
                      <article class="engine">
                        <div class="engine__header">
                          <div>
                            <h3>${engineLabel(engine.engine)}</h3>
                            <p>Judge only seed truth, placement, and cadence.</p>
                          </div>
                          <div class="gate gate--${engine.focus.gate}">${gateLabel(engine.focus.gate)}</div>
                        </div>
                        <div class="metric-grid">
                          ${metric("Seed Stop", engine.focus.seedStopLabel ?? "n/a")}
                          ${metric(
                            "Seed Delta",
                            engine.focus.seedDelta === null
                              ? "n/a"
                              : engine.focus.seedDelta.toFixed(4),
                            classify(engine.focus.seedDelta, 1e-6, 1e-4),
                          )}
                          ${metric(
                            "Split Balance",
                            engine.focus.seedPlacementImbalance === null
                              ? "n/a"
                              : engine.focus.seedPlacementImbalance.toFixed(3),
                            classify(engine.focus.seedPlacementImbalance, 0.04, 0.08),
                          )}
                          ${metric(
                            "Worst Adj",
                            `${engine.focus.worstAdjacentRatio.toFixed(3)}x`,
                            classify(engine.focus.worstAdjacentRatio, 1.04, 1.08),
                          )}
                          ${metric(
                            "Worst 3-Step",
                            `${engine.focus.worstThreeStepRatio.toFixed(3)}x`,
                            classify(engine.focus.worstThreeStepRatio, 1.05, 1.1),
                          )}
                          ${metric(
                            "Light Edge",
                            `${engine.focus.lightEntranceRatio.toFixed(3)}x`,
                            classify(engine.focus.lightEntranceRatio, 1.04, 1.08),
                          )}
                          ${metric(
                            "Distance CV",
                            engine.focus.spacingCv.toFixed(3),
                            classify(engine.focus.spacingCv, 0.02, 0.05),
                          )}
                          ${metric(
                            "Monotone",
                            engine.focus.monotone ? "yes" : "no",
                            monotoneTone(engine.focus.monotone),
                          )}
                          ${metric("Solved Split", engine.focus.seedSplitLabel ?? "n/a")}
                        </div>
                        <div class="reasons">
                          ${
                            engine.focus.reasons.length === 0
                              ? `<span class="reason reason--pass">meets the current high bar</span>`
                              : engine.focus.reasons
                                  .map((reason) => `<span class="reason">${reason}</span>`)
                                  .join("")
                          }
                        </div>
                        ${renderSwatches(engine.swatches, engine.focus.seedStopLabel)}
                      </article>
                    `,
                  )
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
