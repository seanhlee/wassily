import { describe, expect, it } from "vitest";
import type { CompressedReferenceImage } from "../../images/compress";
import {
  buildR2AssetKey,
  buildSignedUploadRequest,
  createCloudAssetMetadata,
  createReferenceImageFromAsset,
  finalizeCloudAssetUpload,
  normalizeAssetMimeType,
  prepareReferenceImageAsset,
  validateAssetBudget,
  validateCloudAssetMetadata,
} from "../assets";

function compressedStub(blob: Blob): Promise<CompressedReferenceImage> {
  return Promise.resolve({
    blob,
    dataUrl: "data:image/webp;base64,AAAA",
    naturalSize: { width: 800, height: 450 },
    compression: {
      compressed: true,
      originalBytes: 2_000_000,
      compressedBytes: blob.size,
      mimeType: "image/webp",
      width: 800,
      height: 450,
      quality: 0.76,
    },
  });
}

describe("cloud asset helpers", () => {
  it("builds board-scoped R2 keys with matching extensions", () => {
    expect(
      buildR2AssetKey({
        workspaceId: "org/1",
        boardId: "board 1",
        assetId: "asset-1",
        mimeType: "image/webp",
      }),
    ).toBe("workspaces/org_1/boards/board%201/images/asset-1.webp");
  });

  it("prepares compressed reference image upload intent before server signing", async () => {
    const blob = new Blob(["webp"], { type: "image/webp" });
    const prepared = await prepareReferenceImageAsset({
      boardId: "board-1",
      assetId: "asset-1",
      blob,
      compressor: compressedStub,
    });

    expect(prepared.upload).toMatchObject({
      boardId: "board-1",
      assetId: "asset-1",
      kind: "reference-image",
      mimeType: "image/webp",
      byteSize: 4,
      width: 800,
      height: 450,
    });
    expect(prepared.dataUrl).toBe("data:image/webp;base64,AAAA");
  });

  it("derives durable asset metadata and R2 keys on the server side", async () => {
    const prepared = await prepareReferenceImageAsset({
      boardId: "board-1",
      assetId: "asset-1",
      blob: new Blob(["webp"], { type: "image/webp" }),
      compressor: compressedStub,
    });
    const asset = createCloudAssetMetadata({
      workspaceId: "workspace-1",
      upload: prepared.upload,
      actorId: "user-1",
      now: 123,
    });

    expect(asset).toMatchObject({
      schemaVersion: 1,
      boardId: "board-1",
      assetId: "asset-1",
      kind: "reference-image",
      status: "pending",
      r2Key: "workspaces/workspace-1/boards/board-1/images/asset-1.webp",
      createdBy: "user-1",
      createdAt: 123,
    });
    expect(validateCloudAssetMetadata(asset)).toEqual([]);
  });

  it("creates remote reference images from durable asset metadata", async () => {
    const prepared = await prepareReferenceImageAsset({
      boardId: "board-1",
      assetId: "asset-1",
      blob: new Blob(["webp"], { type: "image/webp" }),
      compressor: compressedStub,
    });
    const asset = finalizeCloudAssetUpload({
      asset: createCloudAssetMetadata({
        workspaceId: "workspace-1",
        upload: prepared.upload,
      }),
      byteSize: prepared.upload.byteSize,
      contentHash: prepared.upload.contentHash,
    });

    const image = createReferenceImageFromAsset({
      objectId: "image-1",
      asset,
      position: { x: 10, y: 20 },
      renderUrl: "https://signed.example/image.webp",
      renderUrlExpiresAt: 999,
    });

    expect(image).toMatchObject({
      id: "image-1",
      type: "reference-image",
      assetId: "asset-1",
      imageHandle: {
        kind: "remote",
        assetId: "asset-1",
        renderUrl: "https://signed.example/image.webp",
        expiresAt: 999,
      },
      position: { x: 10, y: 20 },
      size: { width: 800, height: 450 },
    });
  });

  it("builds signed upload requests without embedding credentials", async () => {
    const prepared = await prepareReferenceImageAsset({
      boardId: "board-1",
      assetId: "asset-1",
      blob: new Blob(["webp"], { type: "image/webp" }),
      compressor: compressedStub,
    });

    expect(buildSignedUploadRequest(prepared.upload)).toMatchObject({
      boardId: "board-1",
      assetId: "asset-1",
      mimeType: "image/webp",
      byteSize: 4,
    });
  });

  it("enforces image count and byte budgets before upload", () => {
    expect(
      validateAssetBudget(
        { currentReferenceImages: 9, currentImageBytes: 1_200_000 },
        { byteSize: 900_000 },
      ),
    ).toEqual(["board image storage limit exceeded (2100000/2000000)"]);
    expect(
      validateAssetBudget(
        { currentReferenceImages: 10, currentImageBytes: 0 },
        { byteSize: 100 },
      ),
    ).toEqual(["reference image limit exceeded (11/10)"]);
  });

  it("normalizes unsupported MIME types to the browser compressor default", () => {
    expect(normalizeAssetMimeType("image/gif")).toBeUndefined();
  });

  it("rejects unsupported compressor output instead of mislabeled uploads", async () => {
    await expect(
      prepareReferenceImageAsset({
        boardId: "board-1",
        assetId: "asset-1",
        blob: new Blob(["gif"], { type: "image/gif" }),
        compressor: (blob) =>
          compressedStub(new Blob([blob], { type: "image/gif" })),
      }),
    ).rejects.toThrow(/Unsupported compressed reference image MIME type/);
  });
});
