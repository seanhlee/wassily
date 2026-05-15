import type { CloudBoardSettings, CloudCanvasObject } from "./types";
import { CLOUD_SCHEMA_VERSION } from "./types";
import {
  measureJsonBytes,
  shouldCompactActions,
  type CloudBoardUsage,
} from "./limits";
import { toCloudPersistedCanvasObject } from "./normalize";

export interface CloudBoardSnapshot {
  schemaVersion: typeof CLOUD_SCHEMA_VERSION;
  snapshotId: string;
  boardId: string;
  objects: ReturnType<typeof toCloudPersistedCanvasObject>[];
  settings: CloudBoardSettings;
  actionCursor?: string;
  createdAt: number;
  createdBy: string;
  objectJsonBytes: number;
}

export interface CloudSnapshotInput {
  boardId: string;
  objects: Record<string, CloudCanvasObject>;
  settings: CloudBoardSettings;
  createdBy: string;
  snapshotId?: string;
  actionCursor?: string;
  now?: number;
}

export function createCloudBoardSnapshot({
  boardId,
  objects,
  settings,
  createdBy,
  snapshotId = createSnapshotId(),
  actionCursor,
  now = Date.now(),
}: CloudSnapshotInput): CloudBoardSnapshot {
  const persisted = Object.values(objects).map((object) =>
    toCloudPersistedCanvasObject(object),
  );
  return {
    schemaVersion: CLOUD_SCHEMA_VERSION,
    snapshotId,
    boardId,
    objects: persisted,
    settings,
    actionCursor,
    createdAt: now,
    createdBy,
    objectJsonBytes: measureJsonBytes(persisted),
  };
}

export function shouldCreateSnapshot(usage: CloudBoardUsage): boolean {
  return shouldCompactActions(usage.retainedActionCount, usage.objectJsonBytes);
}

function createSnapshotId(): string {
  try {
    return `snap_${crypto.randomUUID()}`;
  } catch {
    return `snap_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
  }
}
