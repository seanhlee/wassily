import type { Point } from "../types";
import { CLOUD_LIMITS } from "./limits";
import { CLOUD_SCHEMA_VERSION } from "./types";

export type CloudPresenceUpdateKind =
  | "cursor"
  | "selection"
  | "tool"
  | "heartbeat";

export interface CloudPresenceState {
  schemaVersion: typeof CLOUD_SCHEMA_VERSION;
  boardId: string;
  userId: string;
  cursor?: Point;
  selectedObjectIds?: string[];
  activeTool?: string;
  updatedAt: number;
}

export interface CreateCloudPresenceInput {
  boardId: string;
  userId: string;
  cursor?: Point;
  selectedObjectIds?: string[];
  activeTool?: string;
  now?: number;
}

export interface PresenceSendWindow {
  lastSentAt?: number;
  lastImmediateSentAt?: number;
}

export const PRESENCE_CURSOR_UPDATE_INTERVAL_MS = Math.ceil(
  1000 / CLOUD_LIMITS.cursorPresenceUpdatesPerSecond,
);

export const PRESENCE_IMMEDIATE_UPDATE_INTERVAL_MS = Math.ceil(
  1000 / CLOUD_LIMITS.immediatePresenceUpdatesPerSecond,
);

export const PRESENCE_UPDATE_INTERVAL_MS = PRESENCE_CURSOR_UPDATE_INTERVAL_MS;

const IMMEDIATE_UPDATE_KINDS: readonly CloudPresenceUpdateKind[] = [
  "selection",
  "tool",
];

export function createCloudPresenceState({
  boardId,
  userId,
  cursor,
  selectedObjectIds,
  activeTool,
  now = Date.now(),
}: CreateCloudPresenceInput): CloudPresenceState {
  if (!boardId) throw new Error("presence.boardId is required");
  if (!userId) throw new Error("presence.userId is required");

  return {
    schemaVersion: CLOUD_SCHEMA_VERSION,
    boardId,
    userId,
    ...(normalizeCursor(cursor) ? { cursor: normalizeCursor(cursor) } : {}),
    ...(selectedObjectIds
      ? { selectedObjectIds: normalizeSelectedObjectIds(selectedObjectIds) }
      : {}),
    ...(activeTool ? { activeTool: activeTool.slice(0, 64) } : {}),
    updatedAt: now,
  };
}

export function shouldSendPresenceUpdate({
  window,
  kind,
  now = Date.now(),
}: {
  window: PresenceSendWindow;
  kind: CloudPresenceUpdateKind;
  now?: number;
}): boolean {
  if (isImmediatePresenceKind(kind)) {
    return (
      window.lastImmediateSentAt === undefined ||
      now - window.lastImmediateSentAt >= PRESENCE_IMMEDIATE_UPDATE_INTERVAL_MS
    );
  }

  return (
    window.lastSentAt === undefined ||
    now - window.lastSentAt >= PRESENCE_CURSOR_UPDATE_INTERVAL_MS
  );
}

export function markPresenceUpdateSent({
  window,
  kind,
  now = Date.now(),
}: {
  window: PresenceSendWindow;
  kind: CloudPresenceUpdateKind;
  now?: number;
}): PresenceSendWindow {
  return {
    lastSentAt: now,
    lastImmediateSentAt: isImmediatePresenceKind(kind)
      ? now
      : window.lastImmediateSentAt,
  };
}

export function isPresenceFresh(
  presence: Pick<CloudPresenceState, "updatedAt">,
  now = Date.now(),
): boolean {
  return (
    presence.updatedAt <= now &&
    now - presence.updatedAt <= CLOUD_LIMITS.presenceTtlMs
  );
}

export function filterFreshPresence<T extends Pick<CloudPresenceState, "updatedAt">>(
  records: T[],
  now = Date.now(),
): T[] {
  return records.filter((record) => isPresenceFresh(record, now));
}

function isImmediatePresenceKind(kind: CloudPresenceUpdateKind): boolean {
  return IMMEDIATE_UPDATE_KINDS.includes(kind);
}

function normalizeCursor(cursor: Point | undefined): Point | undefined {
  if (!cursor) return undefined;
  if (!Number.isFinite(cursor.x) || !Number.isFinite(cursor.y)) {
    return undefined;
  }
  return cursor;
}

function normalizeSelectedObjectIds(ids: string[]): string[] {
  return [...new Set(ids.filter(Boolean))].slice(0, CLOUD_LIMITS.maxObjectsPerBoard);
}
