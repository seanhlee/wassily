import { describe, it, expect, beforeEach, vi } from "vitest";
import type { CanvasState, BoardMeta } from "../../types";

// ---- localStorage mock ----

const store = new Map<string, string>();
const mockLocalStorage = {
  getItem: (key: string) => store.get(key) ?? null,
  setItem: (key: string, value: string) => store.set(key, value),
  removeItem: (key: string) => store.delete(key),
  clear: () => store.clear(),
};

vi.stubGlobal("localStorage", mockLocalStorage);

// ---- crypto.randomUUID mock ----

let uuidCounter = 0;
vi.stubGlobal("crypto", {
  randomUUID: () => `test-uuid-${++uuidCounter}`,
});

// ---- Import after mocks are in place ----

import {
  loadBoards,
  saveBoards,
  loadActiveBoardId,
  saveActiveBoardId,
  loadBoardState,
  saveBoardState,
  deleteBoardStorage,
  migrateFromLegacy,
  collectAllImageIds,
} from "../boardStore";

// ---- Test data ----

const testState: CanvasState = {
  objects: {
    obj_1: {
      id: "obj_1",
      type: "swatch",
      color: { l: 0.5, c: 0.2, h: 250 },
      position: { x: 0, y: 0 },
    },
  },
  selectedIds: ["obj_1"],
  camera: { x: 10, y: 20, zoom: 1.5 },
  lightMode: true,
  showConnections: true,
};

const stateWithImage: CanvasState = {
  objects: {
    img_1: {
      id: "img_1",
      type: "reference-image",
      dataUrl: "data:image/png;base64,LONGDATA",
      renderUrl: "blob:runtime",
      imageHandle: {
        kind: "local",
        blobId: "img_1",
        renderUrl: "blob:runtime",
      },
      position: { x: 0, y: 0 },
      size: { width: 100, height: 100 },
    },
  },
  selectedIds: [],
  camera: { x: 0, y: 0, zoom: 1 },
  lightMode: true,
  showConnections: true,
};

const makeMeta = (id: string, name = "Board"): BoardMeta => ({
  id,
  name,
  createdAt: 1000,
  updatedAt: 2000,
});

// ---- Tests ----

beforeEach(() => {
  store.clear();
  uuidCounter = 0;
});

// =========================================================================
// loadBoards / saveBoards
// =========================================================================

describe("loadBoards / saveBoards", () => {
  it("returns empty array when no data", () => {
    expect(loadBoards()).toEqual([]);
  });

  it("round-trips a board list correctly", () => {
    const boards: BoardMeta[] = [makeMeta("a", "Alpha"), makeMeta("b", "Beta")];
    saveBoards(boards);
    expect(loadBoards()).toEqual(boards);
  });

  it("handles corrupt JSON gracefully", () => {
    store.set("wassily-boards", "{{not json");
    expect(loadBoards()).toEqual([]);
  });

  it("returns empty array when stored value is not an array", () => {
    store.set("wassily-boards", JSON.stringify({ not: "an array" }));
    expect(loadBoards()).toEqual([]);
  });
});

// =========================================================================
// loadActiveBoardId / saveActiveBoardId
// =========================================================================

describe("loadActiveBoardId / saveActiveBoardId", () => {
  it("returns null when no data", () => {
    expect(loadActiveBoardId()).toBeNull();
  });

  it("round-trips an ID correctly", () => {
    saveActiveBoardId("board-42");
    expect(loadActiveBoardId()).toBe("board-42");
  });
});

// =========================================================================
// loadBoardState / saveBoardState
// =========================================================================

describe("loadBoardState / saveBoardState", () => {
  it("returns null for missing board", () => {
    expect(loadBoardState("nonexistent")).toBeNull();
  });

  it("round-trips a CanvasState correctly", () => {
    saveBoardState("b1", testState);
    const loaded = loadBoardState("b1");
    expect(loaded).not.toBeNull();
    expect(loaded!.camera).toEqual({ x: 10, y: 20, zoom: 1.5 });
    expect(loaded!.objects.obj_1).toBeDefined();
    expect((loaded!.objects.obj_1 as { color: { h: number } }).color.h).toBe(250);
  });

  it("strips dataUrl from reference images on save", () => {
    saveBoardState("img-board", stateWithImage);
    const raw = JSON.parse(store.get("wassily-board-img-board")!);
    expect(raw.objects.img_1.dataUrl).toBe("");
    expect(raw.objects.img_1.renderUrl).toBeUndefined();
    expect(raw.objects.img_1.imageHandle).toEqual({
      kind: "local",
      blobId: "img_1",
    });
  });

  it("resets selectedIds to [] on save", () => {
    saveBoardState("b1", testState);
    const raw = JSON.parse(store.get("wassily-board-b1")!);
    expect(raw.selectedIds).toEqual([]);
  });

  it("resets selectedIds to [] on load", () => {
    saveBoardState("b1", testState);
    const loaded = loadBoardState("b1");
    expect(loaded!.selectedIds).toEqual([]);
  });

  it("preserves lightMode and showConnections", () => {
    const state: CanvasState = {
      ...testState,
      lightMode: false,
      showConnections: false,
    };
    saveBoardState("b2", state);
    const loaded = loadBoardState("b2");
    expect(loaded!.lightMode).toBe(false);
    expect(loaded!.showConnections).toBe(false);
  });

  it("defaults lightMode and showConnections to true when missing", () => {
    store.set(
      "wassily-board-old",
      JSON.stringify({
        objects: { x: { id: "x", type: "swatch" } },
        camera: { x: 0, y: 0, zoom: 1 },
        // no lightMode, no showConnections
      }),
    );
    const loaded = loadBoardState("old");
    expect(loaded!.lightMode).toBe(true);
    expect(loaded!.showConnections).toBe(true);
  });

  it("returns null for corrupt JSON", () => {
    store.set("wassily-board-bad", "not-json!");
    expect(loadBoardState("bad")).toBeNull();
  });

  it("returns null when stored object lacks required fields", () => {
    store.set("wassily-board-incomplete", JSON.stringify({ foo: "bar" }));
    expect(loadBoardState("incomplete")).toBeNull();
  });
});

// =========================================================================
// deleteBoardStorage
// =========================================================================

describe("deleteBoardStorage", () => {
  it("removes the board's localStorage key", () => {
    saveBoardState("doomed", testState);
    expect(store.has("wassily-board-doomed")).toBe(true);
    deleteBoardStorage("doomed");
    expect(store.has("wassily-board-doomed")).toBe(false);
  });

  it("does not affect other boards", () => {
    saveBoardState("keep", testState);
    saveBoardState("remove", testState);
    deleteBoardStorage("remove");
    expect(store.has("wassily-board-keep")).toBe(true);
    expect(store.has("wassily-board-remove")).toBe(false);
  });
});

// =========================================================================
// migrateFromLegacy
// =========================================================================

describe("migrateFromLegacy", () => {
  it("when boards already exist: returns them without modifying storage", () => {
    const boards = [makeMeta("existing", "My Board")];
    saveBoards(boards);
    saveActiveBoardId("existing");

    const result = migrateFromLegacy();
    expect(result.boards).toEqual(boards);
    expect(result.activeBoardId).toBe("existing");
  });

  it("when boards exist but no active ID: defaults to first board", () => {
    const boards = [makeMeta("first"), makeMeta("second")];
    saveBoards(boards);
    // no active board ID saved

    const result = migrateFromLegacy();
    expect(result.activeBoardId).toBe("first");
  });

  it("when legacy wassily-canvas exists: creates Untitled board and migrates state", () => {
    // Legacy data uses the old "darkMode" key — migration should handle it
    const legacyState = {
      objects: {
        s1: { id: "s1", type: "swatch", color: { l: 0.5, c: 0.1, h: 100 }, position: { x: 5, y: 5 } },
      },
      selectedIds: ["s1"],
      camera: { x: 50, y: 50, zoom: 2 },
      darkMode: false,
      showConnections: false,
    };
    store.set("wassily-canvas", JSON.stringify(legacyState));

    const result = migrateFromLegacy();

    expect(result.boards).toHaveLength(1);
    expect(result.boards[0].name).toBe("Untitled");
    expect(result.activeBoardId).toBe(result.boards[0].id);

    // Legacy key should be removed
    expect(store.has("wassily-canvas")).toBe(false);

    // The migrated board state should be loadable
    const loaded = loadBoardState(result.activeBoardId);
    expect(loaded).not.toBeNull();
    expect(loaded!.camera).toEqual({ x: 50, y: 50, zoom: 2 });
    expect(loaded!.lightMode).toBe(false);
    expect(loaded!.showConnections).toBe(false);
  });

  it("when legacy data is corrupt: treats as fresh install", () => {
    store.set("wassily-canvas", "{{corrupt}}");

    const result = migrateFromLegacy();

    expect(result.boards).toHaveLength(1);
    expect(result.boards[0].name).toBe("Untitled");
    // Legacy key should remain (not removed because legacyState was null)
    expect(store.has("wassily-canvas")).toBe(true);
  });

  it("when neither exists (fresh install): creates a default empty board", () => {
    const result = migrateFromLegacy();

    expect(result.boards).toHaveLength(1);
    expect(result.boards[0].name).toBe("Untitled");
    expect(result.activeBoardId).toBe(result.boards[0].id);

    // Default board state should be the empty state
    const loaded = loadBoardState(result.activeBoardId);
    expect(loaded).not.toBeNull();
    expect(loaded!.camera).toEqual({ x: 0, y: 0, zoom: 1 });
    expect(loaded!.lightMode).toBe(true);
    expect(loaded!.showConnections).toBe(true);
    expect(Object.keys(loaded!.objects)).toHaveLength(0);
  });

  it("always returns valid boards and activeBoardId", () => {
    const result = migrateFromLegacy();
    expect(result.boards.length).toBeGreaterThan(0);
    expect(typeof result.activeBoardId).toBe("string");
    expect(result.activeBoardId.length).toBeGreaterThan(0);
  });

  it("persists the new board list and active ID after migration", () => {
    migrateFromLegacy();

    // Independently verify storage was written
    const boards = loadBoards();
    const activeId = loadActiveBoardId();
    expect(boards).toHaveLength(1);
    expect(activeId).toBe(boards[0].id);
  });
});

// =========================================================================
// collectAllImageIds
// =========================================================================

describe("collectAllImageIds", () => {
  it("returns empty set when no boards have reference images", () => {
    saveBoards([makeMeta("b1")]);
    saveBoardState("b1", testState);

    const ids = collectAllImageIds();
    expect(ids.size).toBe(0);
  });

  it("collects image IDs across multiple boards", () => {
    const boardA = makeMeta("a");
    const boardB = makeMeta("b");
    saveBoards([boardA, boardB]);

    saveBoardState("a", stateWithImage);

    const stateB: CanvasState = {
      objects: {
        img_2: {
          id: "img_2",
          type: "reference-image",
          dataUrl: "",
          position: { x: 0, y: 0 },
          size: { width: 50, height: 50 },
        },
        swatch_1: {
          id: "swatch_1",
          type: "swatch",
          color: { l: 0.5, c: 0.1, h: 30 },
          position: { x: 10, y: 10 },
        },
      },
      selectedIds: [],
      camera: { x: 0, y: 0, zoom: 1 },
      lightMode: true,
      showConnections: true,
    };
    saveBoardState("b", stateB);

    const ids = collectAllImageIds();
    expect(ids.size).toBe(2);
    expect(ids.has("img_1")).toBe(true);
    expect(ids.has("img_2")).toBe(true);
    expect(ids.has("swatch_1")).toBe(false);
  });

  it("handles corrupt board data gracefully", () => {
    saveBoards([makeMeta("ok"), makeMeta("bad")]);
    saveBoardState("ok", stateWithImage);
    store.set("wassily-board-bad", "{{corrupt}}");

    const ids = collectAllImageIds();
    expect(ids.size).toBe(1);
    expect(ids.has("img_1")).toBe(true);
  });

  it("returns empty set when board state is missing", () => {
    saveBoards([makeMeta("missing")]);
    // no saveBoardState call — key doesn't exist

    const ids = collectAllImageIds();
    expect(ids.size).toBe(0);
  });
});
