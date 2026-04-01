/**
 * boardStore.ts — Pure-function persistence layer for boards.
 *
 * Storage layout:
 *   wassily-boards          BoardMeta[]  ordered list of all boards
 *   wassily-active-board    string       ID of the currently open board
 *   wassily-board-{id}      CanvasState  one board's objects, camera, settings
 *   wassily-canvas          (legacy)     migrated on first load, then removed
 *
 * No React imports. All functions degrade gracefully on localStorage failure.
 */

import type { BoardMeta, CanvasState } from "../types";

// ---- Constants ----

const BOARDS_KEY = "wassily-boards";
const ACTIVE_KEY = "wassily-active-board";
const LEGACY_KEY = "wassily-canvas";
const boardKey = (id: string) => `wassily-board-${id}`;

/** Default state for a brand-new board. darkMode: true = light canvas (known tech debt). */
const emptyState: CanvasState = {
  objects: {},
  selectedIds: [],
  camera: { x: 0, y: 0, zoom: 1 },
  darkMode: true,
  showConnections: true,
};

// ---- Board list ----

/** Load the ordered list of board metadata. Returns [] if missing or corrupt. */
export function loadBoards(): BoardMeta[] {
  try {
    const raw = localStorage.getItem(BOARDS_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

/** Persist the ordered list of board metadata. */
export function saveBoards(boards: BoardMeta[]): void {
  try {
    localStorage.setItem(BOARDS_KEY, JSON.stringify(boards));
  } catch {
    // localStorage full or unavailable
  }
}

// ---- Active board ----

/** Load the ID of the currently open board. Returns null if unset. */
export function loadActiveBoardId(): string | null {
  try {
    return localStorage.getItem(ACTIVE_KEY);
  } catch {
    return null;
  }
}

/** Persist the active board ID. */
export function saveActiveBoardId(id: string): void {
  try {
    localStorage.setItem(ACTIVE_KEY, id);
  } catch {
    // localStorage full or unavailable
  }
}

// ---- Board state ----

/** Load a single board's canvas state. Returns null if missing or corrupt. */
export function loadBoardState(id: string): CanvasState | null {
  try {
    const raw = localStorage.getItem(boardKey(id));
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (parsed && parsed.objects && parsed.camera) {
      return {
        objects: parsed.objects,
        selectedIds: [],
        camera: parsed.camera,
        darkMode: parsed.darkMode ?? true,
        showConnections: parsed.showConnections ?? true,
      };
    }
    return null;
  } catch {
    return null;
  }
}

/**
 * Persist a board's canvas state.
 * Strips dataUrl from reference images (blob data lives in IndexedDB)
 * and resets selectedIds to [] (transient UI state).
 */
export function saveBoardState(id: string, state: CanvasState): void {
  try {
    const serializedObjects: Record<string, unknown> = {};
    for (const [objId, obj] of Object.entries(state.objects)) {
      if (obj.type === "reference-image") {
        serializedObjects[objId] = { ...obj, dataUrl: "" };
      } else {
        serializedObjects[objId] = obj;
      }
    }
    const serializable = {
      objects: serializedObjects,
      selectedIds: [],
      camera: state.camera,
      darkMode: state.darkMode,
      showConnections: state.showConnections,
    };
    localStorage.setItem(boardKey(id), JSON.stringify(serializable));
  } catch {
    // localStorage full or unavailable
  }
}

/** Remove a board's state from localStorage. Does not touch the boards list. */
export function deleteBoardStorage(id: string): void {
  try {
    localStorage.removeItem(boardKey(id));
  } catch {
    // localStorage unavailable
  }
}

// ---- Migration ----

/**
 * Migrate from single-document storage to multi-board storage.
 *
 * Three cases:
 *   1. wassily-boards already exists     → no-op, return current data
 *   2. wassily-canvas exists (legacy)    → wrap it in an "Untitled" board, remove legacy key
 *   3. Neither exists (fresh install)    → create a default empty board
 *
 * Always returns { boards, activeBoardId } so the caller can proceed.
 */
export function migrateFromLegacy(): {
  boards: BoardMeta[];
  activeBoardId: string;
} {
  // If boards already exist, just return current state
  const existing = loadBoards();
  if (existing.length > 0) {
    const activeId = loadActiveBoardId() ?? existing[0].id;
    return { boards: existing, activeBoardId: activeId };
  }

  const now = Date.now();
  const id = crypto.randomUUID();

  // Try to load legacy single-document state
  let legacyState: CanvasState | null = null;
  try {
    const raw = localStorage.getItem(LEGACY_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (parsed && parsed.objects && parsed.camera) {
        legacyState = {
          objects: parsed.objects,
          selectedIds: [],
          camera: parsed.camera,
          darkMode: parsed.darkMode ?? true,
          showConnections: parsed.showConnections ?? true,
        };
      }
    }
  } catch {
    // Corrupt legacy data — treat as fresh install
  }

  const board: BoardMeta = {
    id,
    name: "Untitled",
    createdAt: now,
    updatedAt: now,
  };

  const boards = [board];
  saveBoards(boards);
  saveActiveBoardId(id);
  saveBoardState(id, legacyState ?? emptyState);

  // Remove legacy key if it existed (migration complete)
  if (legacyState) {
    try {
      localStorage.removeItem(LEGACY_KEY);
    } catch {
      // Best-effort cleanup
    }
  }

  return { boards, activeBoardId: id };
}

// ---- Cross-board utilities ----

/**
 * Collect all reference-image object IDs across every board.
 * Used for cross-board orphan cleanup of IndexedDB blobs.
 */
export function collectAllImageIds(): Set<string> {
  const imageIds = new Set<string>();
  const boards = loadBoards();

  for (const board of boards) {
    try {
      const raw = localStorage.getItem(boardKey(board.id));
      if (!raw) continue;
      const parsed = JSON.parse(raw);
      if (!parsed?.objects) continue;

      for (const [objId, obj] of Object.entries(parsed.objects)) {
        if ((obj as { type?: string }).type === "reference-image") {
          imageIds.add(objId);
        }
      }
    } catch {
      // Skip corrupt board data
    }
  }

  return imageIds;
}
