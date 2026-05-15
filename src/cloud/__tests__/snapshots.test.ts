import { describe, expect, it } from "vitest";
import type { CloudCanvasObject } from "../types";
import { createCloudBoardSnapshot, shouldCreateSnapshot } from "../snapshots";

describe("cloud snapshots", () => {
  it("creates persisted snapshots without transient image URLs", () => {
    const objects: Record<string, CloudCanvasObject> = {
      image: {
        id: "image",
        type: "reference-image",
        assetId: "asset-1",
        imageHandle: {
          kind: "remote",
          assetId: "asset-1",
          renderUrl: "https://signed.example/image.webp",
          expiresAt: 500,
        },
        renderUrl: "https://signed.example/image.webp",
        dataUrl: "data:image/webp;base64,AAAA",
        position: { x: 0, y: 0 },
        size: { width: 800, height: 450 },
      },
    };

    const snapshot = createCloudBoardSnapshot({
      boardId: "board-1",
      objects,
      settings: { lightMode: true, showConnections: true },
      createdBy: "user-1",
      snapshotId: "snapshot-1",
      actionCursor: "action-99",
      now: 123,
    });

    expect(snapshot).toMatchObject({
      schemaVersion: 1,
      snapshotId: "snapshot-1",
      boardId: "board-1",
      createdBy: "user-1",
      createdAt: 123,
      actionCursor: "action-99",
    });
    expect(snapshot.objects[0].data.type).toBe("reference-image");
    if (snapshot.objects[0].data.type !== "reference-image") return;
    expect(snapshot.objects[0].data.renderUrl).toBeUndefined();
    expect(snapshot.objects[0].data.dataUrl).toBeUndefined();
    expect(snapshot.objects[0].data.imageHandle).toEqual({
      kind: "remote",
      assetId: "asset-1",
    });
  });

  it("delegates compaction decisions to cloud budget thresholds", () => {
    expect(
      shouldCreateSnapshot({
        objectCount: 1,
        referenceImageCount: 0,
        imageStorageBytes: 0,
        retainedActionCount: 100,
        objectJsonBytes: 1,
      }),
    ).toBe(true);
  });
});
