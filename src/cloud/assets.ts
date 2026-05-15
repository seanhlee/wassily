import type {
  Point,
  ReferenceImage,
  ReferenceImageSource,
  Size,
} from "../types";
import {
  compressReferenceImage,
  type CompressedReferenceImage,
} from "../images/compress";
import { CLOUD_LIMITS } from "./limits";

export type CloudAssetKind = "reference-image" | "thumbnail";
export type CloudAssetUploadStatus = "pending" | "ready" | "deleted";

export type CloudAssetMimeType =
  | "image/webp"
  | "image/avif"
  | "image/jpeg"
  | "image/png";

export interface CloudAssetMetadata {
  schemaVersion: 1;
  boardId: string;
  assetId: string;
  kind: CloudAssetKind;
  status: CloudAssetUploadStatus;
  r2Key: string;
  mimeType: CloudAssetMimeType;
  byteSize: number;
  width: number;
  height: number;
  createdBy?: string;
  createdAt: number;
  contentHash?: string;
  deletedAt?: number;
}

export interface PreparedReferenceImageUpload {
  boardId: string;
  assetId: string;
  kind: "reference-image";
  mimeType: CloudAssetMimeType;
  byteSize: number;
  width: number;
  height: number;
  contentHash?: string;
}

export interface PreparedReferenceImageAsset {
  upload: PreparedReferenceImageUpload;
  blob: Blob;
  dataUrl: string;
  compression: CompressedReferenceImage["compression"];
}

export interface PrepareReferenceImageAssetInput {
  boardId: string;
  blob: Blob;
  assetId?: string;
  compressor?: (blob: Blob) => Promise<CompressedReferenceImage>;
}

export interface CreateCloudAssetMetadataInput {
  workspaceId: string;
  upload: PreparedReferenceImageUpload;
  actorId?: string;
  now?: number;
}

export interface FinalizeCloudAssetUploadInput {
  asset: CloudAssetMetadata;
  byteSize: number;
  contentHash?: string;
  now?: number;
}

export interface ReferenceImageFromAssetInput {
  objectId: string;
  asset: CloudAssetMetadata;
  position: Point;
  size?: Size;
  renderUrl?: string;
  renderUrlExpiresAt?: number;
  source?: ReferenceImageSource;
}

export interface BoardAssetBudget {
  currentReferenceImages: number;
  currentImageBytes: number;
}

export interface SignedUploadRequest {
  boardId: string;
  assetId: string;
  mimeType: CloudAssetMimeType;
  byteSize: number;
  contentHash?: string;
}

export interface SignedUploadTarget {
  uploadUrl: string;
  headers?: Record<string, string>;
  expiresAt: number;
}

export const CLOUD_ASSET_MIME_TYPES: readonly CloudAssetMimeType[] = [
  "image/webp",
  "image/avif",
  "image/jpeg",
  "image/png",
];

export const CLOUD_ASSET_KINDS: readonly CloudAssetKind[] = [
  "reference-image",
  "thumbnail",
];

const ASSET_EXTENSION_BY_MIME: Record<CloudAssetMimeType, string> = {
  "image/webp": "webp",
  "image/avif": "avif",
  "image/jpeg": "jpg",
  "image/png": "png",
};

export async function prepareReferenceImageAsset({
  boardId,
  blob,
  assetId = createAssetId(),
  compressor = compressReferenceImage,
}: PrepareReferenceImageAssetInput): Promise<PreparedReferenceImageAsset> {
  const compressed = await compressor(blob);
  const mimeType = normalizeAssetMimeType(compressed.blob.type);
  if (!mimeType) {
    throw new Error(
      `Unsupported compressed reference image MIME type: ${compressed.blob.type || "unknown"}`,
    );
  }

  const upload: PreparedReferenceImageUpload = {
    boardId,
    assetId,
    kind: "reference-image",
    mimeType,
    byteSize: compressed.blob.size,
    width: compressed.naturalSize.width,
    height: compressed.naturalSize.height,
    contentHash: await hashBlob(compressed.blob),
  };

  const errors = validatePreparedReferenceImageUpload(upload);
  if (errors.length > 0) {
    throw new Error(`Invalid reference image upload: ${errors.join("; ")}`);
  }

  return {
    upload,
    blob: compressed.blob,
    dataUrl: compressed.dataUrl,
    compression: compressed.compression,
  };
}

export function createCloudAssetMetadata({
  workspaceId,
  upload,
  actorId,
  now = Date.now(),
}: CreateCloudAssetMetadataInput): CloudAssetMetadata {
  const asset: CloudAssetMetadata = {
    schemaVersion: 1,
    boardId: upload.boardId,
    assetId: upload.assetId,
    kind: upload.kind,
    status: "pending",
    r2Key: buildR2AssetKey({
      workspaceId,
      boardId: upload.boardId,
      assetId: upload.assetId,
      mimeType: upload.mimeType,
    }),
    mimeType: upload.mimeType,
    byteSize: upload.byteSize,
    width: upload.width,
    height: upload.height,
    createdBy: actorId,
    createdAt: now,
    contentHash: upload.contentHash,
  };

  const errors = validateCloudAssetMetadata(asset);
  if (errors.length > 0) {
    throw new Error(`Invalid cloud asset metadata: ${errors.join("; ")}`);
  }
  return asset;
}

export function finalizeCloudAssetUpload({
  asset,
  byteSize,
  contentHash,
}: FinalizeCloudAssetUploadInput): CloudAssetMetadata {
  if (asset.status !== "pending") {
    throw new Error(`Asset upload cannot be finalized from ${asset.status}`);
  }
  if (byteSize !== asset.byteSize) {
    throw new Error(`Asset upload byte size mismatch (${byteSize}/${asset.byteSize})`);
  }
  if (asset.contentHash && contentHash && asset.contentHash !== contentHash) {
    throw new Error("Asset upload content hash mismatch");
  }

  return {
    ...asset,
    status: "ready",
    ...(contentHash ? { contentHash } : {}),
  };
}

export function createReferenceImageFromAsset({
  objectId,
  asset,
  position,
  size,
  renderUrl,
  renderUrlExpiresAt,
  source,
}: ReferenceImageFromAssetInput): ReferenceImage {
  if (asset.status !== "ready") {
    throw new Error(`Reference image asset is not ready: ${asset.status}`);
  }
  const imageSize = size ?? { width: asset.width, height: asset.height };
  return {
    id: objectId,
    type: "reference-image",
    assetId: asset.assetId,
    imageHandle: {
      kind: "remote",
      assetId: asset.assetId,
      ...(renderUrl ? { renderUrl } : {}),
      ...(renderUrlExpiresAt ? { expiresAt: renderUrlExpiresAt } : {}),
    },
    ...(renderUrl ? { renderUrl } : {}),
    position,
    size: imageSize,
    source,
  };
}

export function buildSignedUploadRequest(
  upload: PreparedReferenceImageUpload,
): SignedUploadRequest {
  return {
    boardId: upload.boardId,
    assetId: upload.assetId,
    mimeType: upload.mimeType,
    byteSize: upload.byteSize,
    contentHash: upload.contentHash,
  };
}

export function validateAssetBudget(
  budget: BoardAssetBudget,
  asset: Pick<CloudAssetMetadata, "byteSize">,
): string[] {
  const errors: string[] = [];
  const nextImageCount = budget.currentReferenceImages + 1;
  const nextBytes = budget.currentImageBytes + asset.byteSize;

  if (nextImageCount > CLOUD_LIMITS.maxReferenceImagesPerBoard) {
    errors.push(
      `reference image limit exceeded (${nextImageCount}/${CLOUD_LIMITS.maxReferenceImagesPerBoard})`,
    );
  }
  if (asset.byteSize > CLOUD_LIMITS.maxCompressedImageBytes) {
    errors.push(
      `image byte limit exceeded (${asset.byteSize}/${CLOUD_LIMITS.maxCompressedImageBytes})`,
    );
  }
  if (nextBytes > CLOUD_LIMITS.maxImageStorageBytesPerBoard) {
    errors.push(
      `board image storage limit exceeded (${nextBytes}/${CLOUD_LIMITS.maxImageStorageBytesPerBoard})`,
    );
  }

  return errors;
}

export function validateCloudAssetMetadata(asset: CloudAssetMetadata): string[] {
  const errors: string[] = [];

  if (asset.schemaVersion !== 1) errors.push("asset.schemaVersion must be 1");
  if (!asset.boardId) errors.push("asset.boardId is required");
  if (!asset.assetId) errors.push("asset.assetId is required");
  if (!CLOUD_ASSET_KINDS.includes(asset.kind)) {
    errors.push("asset.kind is unsupported");
  }
  if (!["pending", "ready", "deleted"].includes(asset.status)) {
    errors.push("asset.status is unsupported");
  }
  if (!asset.r2Key) errors.push("asset.r2Key is required");
  if (!CLOUD_ASSET_MIME_TYPES.includes(asset.mimeType)) {
    errors.push("asset.mimeType is unsupported");
  }
  if (asset.byteSize <= 0 || !Number.isFinite(asset.byteSize)) {
    errors.push("asset.byteSize must be positive");
  }
  if (asset.byteSize > CLOUD_LIMITS.maxCompressedImageBytes) {
    errors.push(
      `asset.byteSize exceeds ${CLOUD_LIMITS.maxCompressedImageBytes}`,
    );
  }
  if (
    asset.width <= 0 ||
    asset.height <= 0 ||
    !Number.isFinite(asset.width) ||
    !Number.isFinite(asset.height)
  ) {
    errors.push("asset dimensions must be positive");
  }
  if (asset.width > CLOUD_LIMITS.maxReferenceImageDimension || asset.height > CLOUD_LIMITS.maxReferenceImageDimension) {
    errors.push(
      `asset dimensions exceed ${CLOUD_LIMITS.maxReferenceImageDimension}`,
    );
  }
  if (asset.createdAt < 0 || !Number.isFinite(asset.createdAt)) {
    errors.push("asset.createdAt is invalid");
  }
  if (
    asset.deletedAt !== undefined &&
    (asset.deletedAt < asset.createdAt || !Number.isFinite(asset.deletedAt))
  ) {
    errors.push("asset.deletedAt is invalid");
  }
  if (!asset.r2Key.endsWith(`.${mimeToAssetExtension(asset.mimeType)}`)) {
    errors.push("asset.r2Key extension does not match mimeType");
  }
  if (
    !asset.r2Key.includes(
      `/boards/${encodePathPart(asset.boardId)}/images/${encodePathPart(asset.assetId)}.`,
    )
  ) {
    errors.push("asset.r2Key must be scoped to boardId and assetId");
  }

  return errors;
}

export function validatePreparedReferenceImageUpload(
  upload: PreparedReferenceImageUpload,
): string[] {
  const errors: string[] = [];

  if (!upload.boardId) errors.push("upload.boardId is required");
  if (!upload.assetId) errors.push("upload.assetId is required");
  if (upload.kind !== "reference-image") {
    errors.push("upload.kind must be reference-image");
  }
  if (!CLOUD_ASSET_MIME_TYPES.includes(upload.mimeType)) {
    errors.push("upload.mimeType is unsupported");
  }
  if (upload.byteSize <= 0 || !Number.isFinite(upload.byteSize)) {
    errors.push("upload.byteSize must be positive");
  }
  if (upload.byteSize > CLOUD_LIMITS.maxCompressedImageBytes) {
    errors.push(
      `upload.byteSize exceeds ${CLOUD_LIMITS.maxCompressedImageBytes}`,
    );
  }
  if (
    upload.width <= 0 ||
    upload.height <= 0 ||
    !Number.isFinite(upload.width) ||
    !Number.isFinite(upload.height)
  ) {
    errors.push("upload dimensions must be positive");
  }
  if (
    upload.width > CLOUD_LIMITS.maxReferenceImageDimension ||
    upload.height > CLOUD_LIMITS.maxReferenceImageDimension
  ) {
    errors.push(
      `upload dimensions exceed ${CLOUD_LIMITS.maxReferenceImageDimension}`,
    );
  }

  return errors;
}

export function buildR2AssetKey({
  workspaceId,
  boardId,
  assetId,
  mimeType,
}: {
  workspaceId: string;
  boardId: string;
  assetId: string;
  mimeType: CloudAssetMimeType;
}): string {
  const workspace = encodePathPart(workspaceId);
  const board = encodePathPart(boardId);
  const asset = encodePathPart(assetId);
  return `workspaces/${workspace}/boards/${board}/images/${asset}.${mimeToAssetExtension(mimeType)}`;
}

export function mimeToAssetExtension(mimeType: CloudAssetMimeType): string {
  return ASSET_EXTENSION_BY_MIME[mimeType];
}

export function normalizeAssetMimeType(
  mimeType: string,
): CloudAssetMimeType | undefined {
  if (CLOUD_ASSET_MIME_TYPES.includes(mimeType as CloudAssetMimeType)) {
    return mimeType as CloudAssetMimeType;
  }
  return undefined;
}

export async function hashBlob(blob: Blob): Promise<string | undefined> {
  if (!globalThis.crypto?.subtle) return undefined;
  try {
    const digest = await crypto.subtle.digest("SHA-256", await blob.arrayBuffer());
    return [...new Uint8Array(digest)]
      .map((byte) => byte.toString(16).padStart(2, "0"))
      .join("");
  } catch {
    return undefined;
  }
}

function createAssetId(): string {
  try {
    return `asset_${crypto.randomUUID()}`;
  } catch {
    return `asset_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
  }
}

function encodePathPart(value: string): string {
  return encodeURIComponent(value).replaceAll("%2F", "_");
}
