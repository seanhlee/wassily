import { describe, expect, it } from "vitest";
import type {
  CloudCanvasObject,
  CloudReferenceImage,
} from "../types";
import {
  applyCloudNormalizeResult,
  normalizeCloudAction,
  toCloudPersistedCanvasObject,
  validateCloudCanvasObject,
} from "../normalize";
import type { Connection, OklchColor, Swatch } from "../../types";
import { purifyColor } from "../../engine/purify";

const SOURCE_COLOR: OklchColor = { l: 0.62, c: 0.04, h: 252 };

function swatch(
  id: string,
  color: OklchColor = SOURCE_COLOR,
): Swatch {
  return {
    id,
    type: "swatch",
    color,
    position: { x: 10, y: 20 },
  };
}

function referenceImage(): CloudReferenceImage {
  return {
    id: "image-1",
    type: "reference-image",
    assetId: "asset-1",
    imageHandle: { kind: "remote", assetId: "asset-1" },
    renderUrl: "blob:runtime-preview",
    dataUrl: "data:image/png;base64,transient",
    position: { x: 100, y: 100 },
    size: { width: 320, height: 240 },
    extraction: {
      createdAt: 100,
      updatedAt: 200,
      markers: [
        {
          id: "marker-1",
          swatchId: "swatch-1",
          position: { x: 0.3, y: 0.4 },
          color: SOURCE_COLOR,
        },
      ],
    },
  };
}

describe("normalizeCloudAction", () => {
  it("purifies created swatches while preserving intentionally neutral colors", () => {
    const chromatic: OklchColor = { l: 0.54, c: 0.08, h: 260 };
    const neutral: OklchColor = { l: 0.54, c: 0.001, h: 42 };

    const chromaticResult = normalizeCloudAction({
      objects: {},
      action: {
        type: "createSwatch",
        objectId: "swatch-1",
        position: { x: 0, y: 0 },
        color: chromatic,
      },
    });
    const neutralResult = normalizeCloudAction({
      objects: {},
      action: {
        type: "createSwatch",
        objectId: "swatch-2",
        position: { x: 0, y: 0 },
        color: neutral,
      },
    });

    const chromaticPatch = chromaticResult.patches[0];
    const neutralPatch = neutralResult.patches[0];

    expect(chromaticPatch.kind).toBe("create");
    expect(neutralPatch.kind).toBe("create");
    if (chromaticPatch.kind !== "create" || neutralPatch.kind !== "create") {
      return;
    }
    expect((chromaticPatch.object as Swatch).color).toEqual(purifyColor(chromatic));
    expect((neutralPatch.object as Swatch).color).toEqual(neutral);
  });

  it("moves objects with a narrow position patch", () => {
    const objects: Record<string, CloudCanvasObject> = {
      "swatch-1": swatch("swatch-1"),
    };

    const result = normalizeCloudAction({
      objects,
      action: {
        type: "moveObject",
        objectId: "swatch-1",
        position: { x: 48, y: 96 },
      },
    });

    expect(result.patches).toHaveLength(1);
    expect(result.patches[0].kind).toBe("update");
    expect(result.patches[0].touchedFields).toEqual(["position"]);
    if (result.patches[0].kind !== "update") return;
    expect((result.patches[0].patch as Partial<Swatch>).color).toBeUndefined();
    expect((result.patches[0].patch as Partial<Swatch>).position).toEqual({
      x: 48,
      y: 96,
    });
  });

  it("applies field-scoped movement without overwriting newer color", () => {
    const olderColor: OklchColor = { l: 0.5, c: 0.08, h: 20 };
    const newerColor: OklchColor = { l: 0.7, c: 0.18, h: 200 };
    const objects: Record<string, CloudCanvasObject> = {
      "swatch-1": swatch("swatch-1", olderColor),
    };
    const result = normalizeCloudAction({
      objects,
      action: {
        type: "moveObject",
        objectId: "swatch-1",
        position: { x: 48, y: 96 },
      },
    });

    const next = applyCloudNormalizeResult(
      { "swatch-1": swatch("swatch-1", newerColor) },
      result,
    );

    expect((next["swatch-1"] as Swatch).color).toEqual(newerColor);
    expect((next["swatch-1"] as Swatch).position).toEqual({ x: 48, y: 96 });
  });

  it("promotes swatches into fully solved ramps and clears image markers", () => {
    const image = referenceImage();
    const objects: Record<string, CloudCanvasObject> = {
      "swatch-1": swatch("swatch-1", { l: 0.55, c: 0.16, h: 260 }),
      "image-1": image,
    };

    const result = normalizeCloudAction({
      objects,
      action: {
        type: "promoteToRamp",
        objectId: "swatch-1",
        stopCount: 11,
      },
      now: 300,
    });
    const next = applyCloudNormalizeResult(objects, result);
    const ramp = next["swatch-1"];
    const updatedImage = next["image-1"] as CloudReferenceImage;

    expect(ramp.type).toBe("ramp");
    if (ramp.type !== "ramp") return;
    expect(ramp.stops).toHaveLength(11);
    expect(ramp.solveMetadata).toBeDefined();
    expect(ramp.targetGamut).toBe("dual");
    expect(ramp.fallbackStops).toHaveLength(11);
    expect(validateCloudCanvasObject(ramp)).toEqual([]);
    expect(updatedImage.extraction).toBeUndefined();
  });

  it("deletes orphaned connections and image markers with removed swatches", () => {
    const connection: Connection = {
      id: "connection-1",
      type: "connection",
      fromId: "swatch-1",
      toId: "swatch-2",
    };
    const objects: Record<string, CloudCanvasObject> = {
      "swatch-1": swatch("swatch-1"),
      "swatch-2": swatch("swatch-2"),
      "connection-1": connection,
      "image-1": referenceImage(),
    };

    const result = normalizeCloudAction({
      objects,
      action: { type: "deleteObjects", objectIds: ["swatch-1"] },
      now: 300,
    });
    const next = applyCloudNormalizeResult(objects, result);

    expect(next["swatch-1"]).toBeUndefined();
    expect(next["connection-1"]).toBeUndefined();
    expect((next["image-1"] as CloudReferenceImage).extraction).toBeUndefined();
    expect(next["swatch-2"]).toBeDefined();
  });

  it("does not resurrect a deleted image while cleaning deleted swatch markers", () => {
    const objects: Record<string, CloudCanvasObject> = {
      "swatch-1": swatch("swatch-1"),
      "image-1": referenceImage(),
    };

    const result = normalizeCloudAction({
      objects,
      action: {
        type: "deleteObjects",
        objectIds: ["swatch-1", "image-1"],
      },
      now: 300,
    });
    const next = applyCloudNormalizeResult(objects, result);

    expect(next["swatch-1"]).toBeUndefined();
    expect(next["image-1"]).toBeUndefined();
  });

  it("creates source-exact extraction swatches and linked markers", () => {
    const image = { ...referenceImage() };
    delete image.extraction;
    const objects: Record<string, CloudCanvasObject> = {
      "image-1": image,
    };
    const sampled: OklchColor = { l: 0.42, c: 0.03, h: 120 };

    const result = normalizeCloudAction({
      objects,
      action: {
        type: "createExtraction",
        imageId: "image-1",
        timestamp: 500,
        samples: [
          {
            swatchId: "swatch-1",
            markerId: "marker-1",
            color: sampled,
            source: { x: 0.25, y: 0.75 },
            position: { x: 40, y: 80 },
          },
        ],
      },
    });
    const next = applyCloudNormalizeResult(objects, result);
    const createdSwatch = next["swatch-1"] as Swatch;
    const updatedImage = next["image-1"] as CloudReferenceImage;

    expect(createdSwatch.color).toEqual(sampled);
    expect(updatedImage.extraction?.createdAt).toBe(500);
    expect(updatedImage.extraction?.updatedAt).toBe(500);
    expect(updatedImage.extraction?.markers).toEqual([
      {
        id: "marker-1",
        swatchId: "swatch-1",
        position: { x: 0.25, y: 0.75 },
        color: sampled,
      },
    ]);
  });

  it("moves extraction markers and updates their linked source swatch", () => {
    const objects: Record<string, CloudCanvasObject> = {
      "swatch-1": swatch("swatch-1"),
      "image-1": referenceImage(),
    };
    const sampled: OklchColor = { l: 0.5, c: 0.05, h: 80 };

    const result = normalizeCloudAction({
      objects,
      action: {
        type: "moveExtractionMarker",
        imageId: "image-1",
        markerId: "marker-1",
        position: { x: 0.6, y: 0.7 },
        color: sampled,
      },
      now: 900,
    });
    const next = applyCloudNormalizeResult(objects, result);
    const updatedImage = next["image-1"] as CloudReferenceImage;
    const updatedSwatch = next["swatch-1"] as Swatch;

    expect(updatedImage.extraction?.markers[0]).toMatchObject({
      id: "marker-1",
      position: { x: 0.6, y: 0.7 },
      color: sampled,
    });
    expect(updatedImage.extraction?.updatedAt).toBe(900);
    expect(updatedSwatch.color).toEqual(sampled);
  });

  it("strips transient image URLs from persisted image records", () => {
    const image = referenceImage();
    image.imageHandle = {
      kind: "remote",
      assetId: "asset-1",
      renderUrl: "https://signed.example/image.png",
      expiresAt: 900,
    };

    const persisted = toCloudPersistedCanvasObject(image, 7);

    expect(persisted.revision).toBe(7);
    expect(persisted.data.type).toBe("reference-image");
    if (persisted.data.type !== "reference-image") return;
    expect(persisted.data.assetId).toBe("asset-1");
    expect(persisted.data.imageHandle).toEqual({
      kind: "remote",
      assetId: "asset-1",
    });
    expect(persisted.data.dataUrl).toBeUndefined();
    expect(persisted.data.renderUrl).toBeUndefined();
  });

  it("rejects data-url-only reference images for cloud persistence", () => {
    const image: CloudReferenceImage = {
      id: "image-1",
      type: "reference-image",
      dataUrl: "data:image/png;base64,transient",
      position: { x: 0, y: 0 },
      size: { width: 320, height: 240 },
    };

    expect(() => toCloudPersistedCanvasObject(image)).toThrow(
      /reference-image.assetId is required/,
    );
  });

  it("ignores create and extraction actions that would collide with existing IDs", () => {
    const objects: Record<string, CloudCanvasObject> = {
      "swatch-1": swatch("swatch-1"),
      "image-1": referenceImage(),
    };

    const createResult = normalizeCloudAction({
      objects,
      action: {
        type: "createSwatch",
        objectId: "swatch-1",
        position: { x: 0, y: 0 },
        color: SOURCE_COLOR,
      },
    });
    const extractionResult = normalizeCloudAction({
      objects,
      action: {
        type: "createExtraction",
        imageId: "image-1",
        timestamp: 500,
        samples: [
          {
            swatchId: "swatch-1",
            markerId: "marker-1",
            color: SOURCE_COLOR,
            source: { x: 0.25, y: 0.75 },
            position: { x: 40, y: 80 },
          },
        ],
      },
    });

    expect(createResult).toEqual({ patches: [], deletes: [] });
    expect(extractionResult).toEqual({ patches: [], deletes: [] });
  });

  it("ignores invalid bounded payloads before they reach the solver or markers", () => {
    const objects: Record<string, CloudCanvasObject> = {
      "swatch-1": swatch("swatch-1"),
      "image-1": referenceImage(),
    };
    const stopCountResult = normalizeCloudAction({
      objects,
      action: {
        type: "promoteToRamp",
        objectId: "swatch-1",
        stopCount: 999,
      },
    });
    const markerResult = normalizeCloudAction({
      objects,
      action: {
        type: "moveExtractionMarker",
        imageId: "image-1",
        markerId: "marker-1",
        position: { x: 1.25, y: 0.7 },
        color: SOURCE_COLOR,
      },
    });

    expect(stopCountResult).toEqual({ patches: [], deletes: [] });
    expect(markerResult).toEqual({ patches: [], deletes: [] });
  });

  it("treats unknown runtime actions and unbounded extraction samples as no-ops", () => {
    const objects: Record<string, CloudCanvasObject> = {
      "image-1": { ...referenceImage(), extraction: undefined },
    };

    expect(
      normalizeCloudAction({
        objects,
        action: { type: "unknownAction" } as never,
      }),
    ).toEqual({ patches: [], deletes: [] });

    expect(
      normalizeCloudAction({
        objects,
        action: {
          type: "createExtraction",
          imageId: "image-1",
          timestamp: 500,
          samples: Array.from({ length: 25 }, (_, index) => ({
            swatchId: `swatch-${index}`,
            markerId: `marker-${index}`,
            color: SOURCE_COLOR,
            source: { x: 0.25, y: 0.75 },
            position: { x: 40, y: 80 },
          })),
        },
      }),
    ).toEqual({ patches: [], deletes: [] });
  });

  it("rejects unknown object types during persistence validation", () => {
    expect(
      validateCloudCanvasObject({
        id: "mystery-1",
        type: "mystery",
      } as unknown as CloudCanvasObject),
    ).toEqual(["object.type is unsupported"]);
  });

  it("passes board settings through as a separate patch", () => {
    const result = normalizeCloudAction({
      objects: {},
      action: {
        type: "setBoardSettings",
        settings: { lightMode: false, showConnections: true },
      },
    });

    expect(result.patches).toEqual([]);
    expect(result.deletes).toEqual([]);
    expect(result.settings).toEqual({
      lightMode: false,
      showConnections: true,
    });
  });
});
