import type { CloudCanvasObject, CloudNormalizeResult } from "./types";

export const CLOUD_LIMITS = {
  maxActiveWorkspaces: 5,
  maxBoardsPerWorkspace: 20,
  maxObjectsPerBoard: 150,
  maxReferenceImagesPerBoard: 10,
  maxCompressedImageBytes: 1_000_000,
  maxReferenceImageDimension: 1600,
  softTargetCompressedImageBytes: 400_000,
  maxImageStorageBytesPerBoard: 2_000_000,
  maxRetainedActionsPerBoard: 500,
  snapshotActionInterval: 100,
  snapshotObjectJsonBytes: 250_000,
  cursorPresenceUpdatesPerSecond: 1,
  immediatePresenceUpdatesPerSecond: 2,
  presenceTtlMs: 30_000,
} as const;

export interface CloudBoardUsage {
  objectCount: number;
  referenceImageCount: number;
  imageStorageBytes: number;
  retainedActionCount: number;
  objectJsonBytes: number;
}

export interface CloudBoardUsageDelta {
  objects?: number;
  referenceImages?: number;
  imageStorageBytes?: number;
  retainedActions?: number;
  objectJsonBytes?: number;
}

export function measureCloudBoardUsage(
  objects: Record<string, CloudCanvasObject>,
  options: {
    imageStorageBytes?: number;
    retainedActionCount?: number;
  } = {},
): CloudBoardUsage {
  const values = Object.values(objects);
  return {
    objectCount: values.length,
    referenceImageCount: values.filter((object) => object.type === "reference-image")
      .length,
    imageStorageBytes: options.imageStorageBytes ?? 0,
    retainedActionCount: options.retainedActionCount ?? 0,
    objectJsonBytes: measureJsonBytes(values),
  };
}

export function validateBoardUsage(
  usage: CloudBoardUsage,
  delta: CloudBoardUsageDelta = {},
): string[] {
  const next = {
    objectCount: usage.objectCount + (delta.objects ?? 0),
    referenceImageCount:
      usage.referenceImageCount + (delta.referenceImages ?? 0),
    imageStorageBytes:
      usage.imageStorageBytes + (delta.imageStorageBytes ?? 0),
    retainedActionCount:
      usage.retainedActionCount + (delta.retainedActions ?? 0),
    objectJsonBytes: usage.objectJsonBytes + (delta.objectJsonBytes ?? 0),
  };
  const errors: string[] = [];

  if (next.objectCount > CLOUD_LIMITS.maxObjectsPerBoard) {
    errors.push(`board object limit exceeded (${next.objectCount}/${CLOUD_LIMITS.maxObjectsPerBoard})`);
  }
  if (next.referenceImageCount > CLOUD_LIMITS.maxReferenceImagesPerBoard) {
    errors.push(
      `reference image limit exceeded (${next.referenceImageCount}/${CLOUD_LIMITS.maxReferenceImagesPerBoard})`,
    );
  }
  if (next.imageStorageBytes > CLOUD_LIMITS.maxImageStorageBytesPerBoard) {
    errors.push(
      `board image storage limit exceeded (${next.imageStorageBytes}/${CLOUD_LIMITS.maxImageStorageBytesPerBoard})`,
    );
  }
  if (next.retainedActionCount > CLOUD_LIMITS.maxRetainedActionsPerBoard) {
    errors.push(
      `retained action limit exceeded (${next.retainedActionCount}/${CLOUD_LIMITS.maxRetainedActionsPerBoard})`,
    );
  }
  if (next.objectJsonBytes > CLOUD_LIMITS.snapshotObjectJsonBytes) {
    errors.push(
      `board object JSON snapshot threshold exceeded (${next.objectJsonBytes}/${CLOUD_LIMITS.snapshotObjectJsonBytes})`,
    );
  }

  return errors;
}

export function deriveCloudUsageDeltaFromNormalizeResult(
  result: CloudNormalizeResult,
  currentObjects: Record<string, CloudCanvasObject>,
): CloudBoardUsageDelta {
  let objectDelta = 0;
  let referenceImageDelta = 0;
  const deletedIds = new Set(result.deletes);

  for (const id of deletedIds) {
    const object = currentObjects[id];
    if (!object) continue;
    objectDelta -= 1;
    if (object.type === "reference-image") referenceImageDelta -= 1;
  }

  for (const patch of result.patches) {
    if (patch.kind !== "create" || deletedIds.has(patch.objectId)) continue;
    objectDelta += 1;
    if (patch.object.type === "reference-image") referenceImageDelta += 1;
  }

  return {
    objects: objectDelta,
    referenceImages: referenceImageDelta,
    retainedActions: 1,
  };
}

export function shouldCompactActions(
  retainedActionCount: number,
  objectJsonBytes: number,
): boolean {
  return (
    retainedActionCount >= CLOUD_LIMITS.snapshotActionInterval ||
    retainedActionCount >= CLOUD_LIMITS.maxRetainedActionsPerBoard ||
    objectJsonBytes >= CLOUD_LIMITS.snapshotObjectJsonBytes
  );
}

export function measureJsonBytes(value: unknown): number {
  const json = JSON.stringify(value);
  return new TextEncoder().encode(json).byteLength;
}
