import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import type { Ramp } from "../../types";
import { solveRamp } from "../../engine/ramp";
import { RampInspector } from "../RampInspector";

function makeRamp(): Ramp {
  const config = {
    hue: 47.604,
    seedChroma: 0.213,
    seedLightness: 0.705,
    stopCount: 11,
    mode: "opinionated",
  } as const;
  const solved = solveRamp(config);

  return {
    id: "ramp-1",
    type: "ramp",
    name: "tw-orange-500",
    seedHue: config.hue,
    seedChroma: config.seedChroma,
    seedLightness: config.seedLightness,
    stopCount: config.stopCount,
    mode: config.mode,
    position: { x: 0, y: 0 },
    stops: solved.stops,
    fallbackStops: solved.fallbackStops,
    solveMetadata: solved.metadata,
    targetGamut: solved.metadata.targetGamut,
  };
}

describe("RampInspector", () => {
  it("renders selected ramp copy actions and values first", () => {
    const html = renderToStaticMarkup(
      <RampInspector ramp={makeRamp()} lightMode />,
    );

    expect(html).toContain('aria-label="Ramp inspector"');
    expect(html).toContain("tw-orange-500");
    expect(html).toContain("HEX");
    expect(html).toContain("TOKENS");
    expect(html).not.toContain("COPY");
    expect(html).not.toContain("VALUES");
    expect(html).not.toContain("SOURCE DELTA");
    expect(html).toContain("oklch(");
    expect(html).toMatch(/#[0-9A-F]{6}/);
    expect(html).toContain("backdrop-filter:blur");
    expect(html).not.toContain("box-shadow");
  });

  it("renders nothing without a selected ramp", () => {
    const html = renderToStaticMarkup(
      <RampInspector ramp={null} lightMode />,
    );

    expect(html).toBe("");
  });
});
