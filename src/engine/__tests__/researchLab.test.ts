import { describe, expect, it } from "vitest";
import { buildResearchLabData } from "../researchLab";

describe("research lab board data", () => {
  it("builds side-by-side v5 and v6 sections for the fixed seed suite", { timeout: 20000 }, () => {
    const data = buildResearchLabData();

    expect(data.seeds).toHaveLength(10);
    for (const section of data.seeds) {
      expect(section.engines.map((engine) => engine.engine)).toEqual(["v5", "v6"]);
      for (const engine of section.engines) {
        expect(engine.swatches).toHaveLength(11);
        expect(engine.run.analysis.labels).toHaveLength(11);
        if (engine.engine === "v6") {
          expect(engine.run.metadata).not.toBeNull();
          expect(Number.isFinite(engine.run.metadata!.breakdown.total)).toBe(true);
          expect(
            Number.isFinite(
              engine.run.metadata!.breakdown.selectedSoftPriorPenalty,
            ),
          ).toBe(true);
          expect(
            Number.isFinite(engine.run.metadata!.softPrior.energyPenalty),
          ).toBe(true);
          expect(
            Number.isFinite(engine.run.metadata!.softPrior.parameterPenalty),
          ).toBe(true);
        }
      }
    }
  });
});
