import type { ImageHandle, ReferenceImage } from "../types";

export function getReferenceImageRenderUrl(
  image: Pick<ReferenceImage, "dataUrl" | "renderUrl" | "imageHandle">,
  options: { now?: number } = {},
): string | undefined {
  if (
    image.imageHandle?.kind === "remote" &&
    isRemoteImageRenderUrlExpired(image.imageHandle, options.now)
  ) {
    return undefined;
  }
  return image.imageHandle?.renderUrl ?? image.renderUrl ?? image.dataUrl;
}

export function isRemoteImageRenderUrlExpired(
  imageHandle: ImageHandle | undefined,
  now = Date.now(),
): boolean {
  return (
    imageHandle?.kind === "remote" &&
    imageHandle.expiresAt !== undefined &&
    imageHandle.expiresAt <= now
  );
}

export function localImageHandle(
  blobId: string,
  renderUrl?: string,
): ImageHandle {
  return {
    kind: "local",
    blobId,
    ...(renderUrl ? { renderUrl } : {}),
  };
}

export function withReferenceImageRenderUrl(
  image: ReferenceImage,
  renderUrl: string,
  options: { expiresAt?: number } = {},
): ReferenceImage {
  const imageHandle =
    image.imageHandle?.kind === "remote"
      ? { ...image.imageHandle, renderUrl, ...options }
      : localImageHandle(image.imageHandle?.blobId ?? image.id, renderUrl);

  return {
    ...image,
    dataUrl: renderUrl,
    renderUrl,
    imageHandle,
  };
}

export function stripReferenceImageRuntimeUrls(
  image: ReferenceImage,
): ReferenceImage {
  const stripped: ReferenceImage = {
    ...image,
    dataUrl: "",
  };
  delete stripped.renderUrl;

  if (image.imageHandle?.kind === "local") {
    stripped.imageHandle = localImageHandle(image.imageHandle.blobId);
    return stripped;
  }

  const assetId =
    image.imageHandle?.kind === "remote" ? image.imageHandle.assetId : image.assetId;
  if (assetId) {
    stripped.assetId = assetId;
    stripped.imageHandle = { kind: "remote", assetId };
    return stripped;
  }

  delete stripped.imageHandle;
  return stripped;
}
