import { describe, expect, it } from "vitest";
import { buildResearchLabData } from "../researchLab";

describe("research lab board data", () => {
  it("builds side-by-side brand-exact fairing, continuous curve, and compressed curve sections for the fixed seed suite", { timeout: 90000 }, () => {
    const data = buildResearchLabData();

    expect(data.seeds).toHaveLength(10);
    for (const section of data.seeds) {
      expect(section.engines.map((engine) => engine.engine)).toEqual([
        "brand-exact-fair",
        "continuous-curve",
        "continuous-compressed",
      ]);
      for (const engine of section.engines) {
        expect(engine.swatches).toHaveLength(11);
        expect(engine.run.analysis.labels).toHaveLength(11);
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
        expect(
          Number.isFinite(engine.run.metadata!.breakdown.fullPathPriorPenalty),
        ).toBe(true);
        expect(
          Number.isFinite(engine.run.metadata!.breakdown.localStepSpreadPenalty),
        ).toBe(true);
        expect(
          Number.isFinite(engine.run.metadata!.breakdown.seedStopTargetPenalty),
        ).toBe(true);
        expect(
          Number.isFinite(engine.run.metadata!.breakdown.lightEdgeParityPenalty),
        ).toBe(true);
        expect(
          Number.isFinite(engine.run.metadata!.breakdown.darkEdgeParityPenalty),
        ).toBe(true);
        expect(
          Number.isFinite(engine.run.metadata!.breakdown.worstAdjacentStepPenalty),
        ).toBe(true);
        expect(
          Number.isFinite(
            engine.run.metadata!.breakdown.worstThreeStepWindowPenalty,
          ),
        ).toBe(true);
        expect(
          Number.isFinite(engine.run.metadata!.breakdown.seedPlacementPenalty),
        ).toBe(true);
        expect(
          Number.isFinite(
            engine.run.metadata!.breakdown.chromaDistributionPriorPenalty,
          ),
        ).toBe(true);
        expect(
          engine.run.metadata!.softPrior.contributors[0]?.anchorLabel,
        ).toBeTruthy();
        expect(engine.focus.seedStopLabel).toBeTruthy();
        expect(Number.isFinite(engine.focus.worstAdjacentRatio)).toBe(true);
        expect(Number.isFinite(engine.focus.worstThreeStepRatio)).toBe(true);
        expect(Number.isFinite(engine.focus.lightEntranceRatio)).toBe(true);
        expect(
          engine.focus.topCliffDistance === null ||
            Number.isFinite(engine.focus.topCliffDistance),
        ).toBe(true);
        expect(
          engine.focus.darkEdgeDistance === null ||
            Number.isFinite(engine.focus.darkEdgeDistance),
        ).toBe(true);
        expect(
          engine.focus.darkExitRatio === null ||
            Number.isFinite(engine.focus.darkExitRatio),
        ).toBe(true);
        expect(Number.isFinite(engine.focus.spacingCv)).toBe(true);
        expect(Number.isFinite(engine.focus.maxGamutPressure)).toBe(true);
        expect(Number.isFinite(engine.focus.nearBoundaryStops)).toBe(true);
        expect(["pass", "tighten", "fail"]).toContain(engine.focus.gate);
      }
    }
  });

  it("keeps raw v6 retired from the default research board", { timeout: 20000 }, () => {
    const data = buildResearchLabData();
    const engines = new Set(
      data.seeds.flatMap((section) => section.engines.map((engine) => engine.engine)),
    );

    expect(engines.has("v6")).toBe(false);
    expect(engines.has("v6-archetype")).toBe(false);
  });
});
