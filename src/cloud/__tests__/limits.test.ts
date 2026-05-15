import { describe, expect, it } from "vitest";
import type { CloudCanvasObject } from "../types";
import {
  CLOUD_LIMITS,
  deriveCloudUsageDeltaFromNormalizeResult,
  measureCloudBoardUsage,
  shouldCompactActions,
  validateBoardUsage,
} from "../limits";

describe("cloud limit helpers", () => {
  it("measures object and reference image usage", () => {
    const objects: Record<string, CloudCanvasObject> = {
      swatch: {
        id: "swatch",
        type: "swatch",
        color: { l: 0.5, c: 0.1, h: 20 },
        position: { x: 0, y: 0 },
      },
      image: {
        id: "image",
        type: "reference-image",
        assetId: "asset-1",
        imageHandle: { kind: "remote", assetId: "asset-1" },
        position: { x: 0, y: 0 },
        size: { width: 100, height: 100 },
      },
    };

    expect(
      measureCloudBoardUsage(objects, {
        imageStorageBytes: 123,
        retainedActionCount: 7,
      }),
    ).toMatchObject({
      objectCount: 2,
      referenceImageCount: 1,
      imageStorageBytes: 123,
      retainedActionCount: 7,
    });
  });

  it("reports board budget overages with deltas applied", () => {
    const errors = validateBoardUsage(
      {
        objectCount: CLOUD_LIMITS.maxObjectsPerBoard,
        referenceImageCount: CLOUD_LIMITS.maxReferenceImagesPerBoard,
        imageStorageBytes: CLOUD_LIMITS.maxImageStorageBytesPerBoard,
        retainedActionCount: CLOUD_LIMITS.maxRetainedActionsPerBoard,
        objectJsonBytes: CLOUD_LIMITS.snapshotObjectJsonBytes,
      },
      {
        objects: 1,
        referenceImages: 1,
        imageStorageBytes: 1,
        retainedActions: 1,
        objectJsonBytes: 1,
      },
    );

    expect(errors).toContain("board object limit exceeded (151/150)");
    expect(errors).toContain("reference image limit exceeded (11/10)");
    expect(errors).toContain("retained action limit exceeded (501/500)");
  });

  it("flags compaction by action count or object JSON size", () => {
    expect(shouldCompactActions(99, 100)).toBe(false);
    expect(shouldCompactActions(100, 100)).toBe(true);
    expect(shouldCompactActions(1, CLOUD_LIMITS.snapshotObjectJsonBytes)).toBe(true);
  });

  it("derives budget deltas from normalized patches instead of trusting clients", () => {
    const objects: Record<string, CloudCanvasObject> = {
      oldImage: {
        id: "oldImage",
        type: "reference-image",
        assetId: "asset-old",
        imageHandle: { kind: "remote", assetId: "asset-old" },
        position: { x: 0, y: 0 },
        size: { width: 100, height: 100 },
      },
    };

    expect(
      deriveCloudUsageDeltaFromNormalizeResult(
        {
          deletes: ["oldImage"],
          patches: [
            {
              kind: "create",
              objectId: "swatch",
              touchedFields: ["type", "color", "position"],
              object: {
                id: "swatch",
                type: "swatch",
                color: { l: 0.5, c: 0.1, h: 20 },
                position: { x: 0, y: 0 },
              },
            },
          ],
        },
        objects,
      ),
    ).toMatchObject({
      objects: 0,
      referenceImages: -1,
      retainedActions: 1,
    });
  });
});
