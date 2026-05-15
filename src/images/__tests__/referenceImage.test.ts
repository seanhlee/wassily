import { describe, expect, it } from "vitest";
import type { ReferenceImage } from "../../types";
import {
  getReferenceImageRenderUrl,
  isRemoteImageRenderUrlExpired,
  localImageHandle,
  stripReferenceImageRuntimeUrls,
  withReferenceImageRenderUrl,
} from "../referenceImage";

function referenceImage(): ReferenceImage {
  return {
    id: "img-1",
    type: "reference-image",
    dataUrl: "data:image/png;base64,legacy",
    renderUrl: "blob:top-level",
    imageHandle: {
      kind: "local",
      blobId: "img-1",
      renderUrl: "blob:handle",
    },
    position: { x: 0, y: 0 },
    size: { width: 100, height: 80 },
  };
}

describe("reference image helpers", () => {
  it("resolves the most current runtime URL", () => {
    expect(getReferenceImageRenderUrl(referenceImage())).toBe("blob:handle");
    expect(
      getReferenceImageRenderUrl({
        renderUrl: "blob:top-level",
        dataUrl: "data:image/png;base64,legacy",
      }),
    ).toBe("blob:top-level");
    expect(
      getReferenceImageRenderUrl({
        dataUrl: "data:image/png;base64,legacy",
      }),
    ).toBe("data:image/png;base64,legacy");
  });

  it("attaches local render URLs through the handle abstraction", () => {
    const image = withReferenceImageRenderUrl(
      {
        id: "img-1",
        type: "reference-image",
        position: { x: 0, y: 0 },
        size: { width: 100, height: 80 },
      },
      "blob:hydrated",
    );

    expect(image.dataUrl).toBe("blob:hydrated");
    expect(image.renderUrl).toBe("blob:hydrated");
    expect(image.imageHandle).toEqual(localImageHandle("img-1", "blob:hydrated"));
  });

  it("preserves remote identity when refreshing a signed render URL", () => {
    const image = withReferenceImageRenderUrl(
      {
        id: "img-1",
        type: "reference-image",
        assetId: "asset-1",
        imageHandle: { kind: "remote", assetId: "asset-1" },
        position: { x: 0, y: 0 },
        size: { width: 100, height: 80 },
      },
      "https://signed.example/image.png",
      { expiresAt: 1234 },
    );

    expect(image.imageHandle).toEqual({
      kind: "remote",
      assetId: "asset-1",
      renderUrl: "https://signed.example/image.png",
      expiresAt: 1234,
    });
  });

  it("does not return expired signed render URLs", () => {
    const image = {
      id: "img-1",
      type: "reference-image" as const,
      assetId: "asset-1",
      imageHandle: {
        kind: "remote" as const,
        assetId: "asset-1",
        renderUrl: "https://signed.example/image.png",
        expiresAt: 100,
      },
      renderUrl: "https://signed.example/image.png",
      position: { x: 0, y: 0 },
      size: { width: 100, height: 80 },
    };

    expect(isRemoteImageRenderUrlExpired(image.imageHandle, 101)).toBe(true);
    expect(getReferenceImageRenderUrl(image, { now: 101 })).toBeUndefined();
  });

  it("strips runtime URLs while keeping local blob identity", () => {
    const stripped = stripReferenceImageRuntimeUrls(referenceImage());

    expect(stripped.dataUrl).toBe("");
    expect(stripped.renderUrl).toBeUndefined();
    expect(stripped.imageHandle).toEqual({ kind: "local", blobId: "img-1" });
  });

  it("strips signed URLs while keeping durable remote asset identity", () => {
    const stripped = stripReferenceImageRuntimeUrls({
      id: "img-1",
      type: "reference-image",
      assetId: "asset-1",
      dataUrl: "data:image/png;base64,legacy",
      renderUrl: "https://signed.example/top.png",
      imageHandle: {
        kind: "remote",
        assetId: "asset-1",
        renderUrl: "https://signed.example/handle.png",
        expiresAt: 500,
      },
      position: { x: 0, y: 0 },
      size: { width: 100, height: 80 },
    });

    expect(stripped.dataUrl).toBe("");
    expect(stripped.renderUrl).toBeUndefined();
    expect(stripped.imageHandle).toEqual({ kind: "remote", assetId: "asset-1" });
  });
});
