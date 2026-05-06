import { describe, expect, it } from "vitest";
import { buildFamilyProfileBoardData } from "../familyBoard";

describe("family profile board data", () => {
  it(
    "builds visual inspection data for the expanded derived family set",
    () => {
      const data = buildFamilyProfileBoardData();

      expect(data.families.map((section) => section.family)).toEqual([
        "lime",
        "phthalo-green",
        "cyan",
        "ultramarine",
        "violet",
        "neutral",
      ]);

      for (const section of data.families) {
        expect(section.references.length).toBeGreaterThan(0);
        expect(section.archetypeControlPoints).toHaveLength(5);
        expect(section.generatedRamp).toHaveLength(11);
        expect(section.analysis.labels).toHaveLength(11);
        expect(section.fit.referenceIds).toHaveLength(section.references.length);
        expect(section.fit.anchorLabels).toHaveLength(section.references.length);
        expect(section.fit.shoulderGeometry.references).toHaveLength(
          section.references.length,
        );
        for (const reference of section.references) {
          expect(reference.shoulderFit.referenceId).toBe(reference.id);
          expect(reference.shoulderFit.lightProgress).toBeGreaterThan(0);
          expect(reference.shoulderFit.lightProgress).toBeLessThan(1.5);
          expect(reference.shoulderFit.darkProgress).toBeGreaterThan(0);
          expect(reference.shoulderFit.darkProgress).toBeLessThan(1.5);
        }
      }
    },
    20000,
  );
});
