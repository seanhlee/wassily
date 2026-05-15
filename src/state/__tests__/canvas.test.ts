/**
 * Tests for canvas.ts reducer, historyReducer, and applyExternalActionsImpl.
 *
 * Uses the __test__ export to access module-private functions.
 */

import { describe, it, expect, beforeEach } from "vitest";
import { initialState, __test__ } from "../canvas";
import type {
  Action,
  CanvasState,
  Swatch,
  Connection,
  ReferenceImage,
  Ramp,
} from "../../types";

const { reducer, historyReducer, applyExternalActionsImpl, setNextId, getNextId } = __test__;

// ---- Test Data ----

function makeBaseState(): CanvasState {
  return {
    objects: {
      obj_1: {
        id: "obj_1",
        type: "swatch",
        color: { l: 0.5, c: 0.2, h: 250 },
        position: { x: 0, y: 0 },
      } as Swatch,
      obj_2: {
        id: "obj_2",
        type: "swatch",
        color: { l: 0.7, c: 0.15, h: 120 },
        position: { x: 100, y: 0 },
      } as Swatch,
      obj_3: {
        id: "obj_3",
        type: "swatch",
        color: { l: 0.6, c: 0.1, h: 30 },
        position: { x: 200, y: 0 },
      } as Swatch,
    },
    selectedIds: ["obj_1"],
    camera: { x: 0, y: 0, zoom: 1 },
    lightMode: true,
    showConnections: true,
  };
}

function makeStateWithConnection(): CanvasState {
  const base = makeBaseState();
  return {
    ...base,
    objects: {
      ...base.objects,
      conn_1: {
        id: "conn_1",
        type: "connection",
        fromId: "obj_1",
        toId: "obj_2",
      } as Connection,
    },
  };
}

// ---- Tests ----

describe("initialState", () => {
  it("has expected shape", () => {
    expect(initialState.objects).toEqual({});
    expect(initialState.selectedIds).toEqual([]);
    expect(initialState.camera).toEqual({ x: 0, y: 0, zoom: 1 });
    expect(initialState.lightMode).toBe(true);
    expect(initialState.showConnections).toBe(true);
  });
});

describe("DELETE_OBJECTS", () => {
  it("deletes specified objects by ID", () => {
    const state = makeBaseState();
    const result = reducer(state, { type: "DELETE_OBJECTS", ids: ["obj_2"] });
    expect(result.objects["obj_2"]).toBeUndefined();
    expect(result.objects["obj_1"]).toBeDefined();
    expect(result.objects["obj_3"]).toBeDefined();
  });

  it("cleans up orphaned connections referencing deleted objects", () => {
    const state = makeStateWithConnection();
    const result = reducer(state, { type: "DELETE_OBJECTS", ids: ["obj_1"] });
    expect(result.objects["obj_1"]).toBeUndefined();
    // Connection from obj_1 -> obj_2 should also be removed
    expect(result.objects["conn_1"]).toBeUndefined();
    // obj_2 should still exist
    expect(result.objects["obj_2"]).toBeDefined();
  });

  it("removes deleted IDs from selectedIds", () => {
    const state = { ...makeBaseState(), selectedIds: ["obj_1", "obj_2"] };
    const result = reducer(state, { type: "DELETE_OBJECTS", ids: ["obj_1"] });
    expect(result.selectedIds).toEqual(["obj_2"]);
  });

  it("does not affect unrelated objects", () => {
    const state = makeStateWithConnection();
    const result = reducer(state, { type: "DELETE_OBJECTS", ids: ["obj_3"] });
    expect(Object.keys(result.objects)).toContain("obj_1");
    expect(Object.keys(result.objects)).toContain("obj_2");
    expect(Object.keys(result.objects)).toContain("conn_1");
    expect(Object.keys(result.objects)).not.toContain("obj_3");
  });

  it("handles deleting non-existent IDs gracefully", () => {
    const state = makeBaseState();
    const result = reducer(state, {
      type: "DELETE_OBJECTS",
      ids: ["nonexistent"],
    });
    expect(Object.keys(result.objects).length).toBe(3);
  });
});

describe("CONNECT_OBJECTS", () => {
  beforeEach(() => {
    setNextId(100);
  });

  it("creates connections between adjacent pairs", () => {
    const state = makeBaseState();
    const result = reducer(state, {
      type: "CONNECT_OBJECTS",
      ids: ["obj_1", "obj_2", "obj_3"],
    });
    const connections = Object.values(result.objects).filter(
      (o) => o.type === "connection",
    ) as Connection[];
    expect(connections.length).toBe(2);

    const from1to2 = connections.find(
      (c) => c.fromId === "obj_1" && c.toId === "obj_2",
    );
    const from2to3 = connections.find(
      (c) => c.fromId === "obj_2" && c.toId === "obj_3",
    );
    expect(from1to2).toBeDefined();
    expect(from2to3).toBeDefined();
  });

  it("skips existing connections (no duplicates)", () => {
    const state = makeStateWithConnection(); // already has obj_1 -> obj_2
    const result = reducer(state, {
      type: "CONNECT_OBJECTS",
      ids: ["obj_1", "obj_2"],
    });
    // Should return original state since no new connections were added
    expect(result).toBe(state);
  });

  it("requires at least 2 valid swatch/ramp endpoints", () => {
    const state = makeBaseState();
    const result = reducer(state, {
      type: "CONNECT_OBJECTS",
      ids: ["obj_1"],
    });
    expect(result).toBe(state); // unchanged
  });

  it("filters out non-swatch/ramp IDs from endpoints", () => {
    const state = makeStateWithConnection();
    // conn_1 is a connection, should be filtered out
    const result = reducer(state, {
      type: "CONNECT_OBJECTS",
      ids: ["conn_1", "obj_3"],
    });
    // conn_1 is not a swatch/ramp, so only obj_3 is valid -> < 2 endpoints
    expect(result).toBe(state);
  });

  it("sets showConnections to true", () => {
    const state = { ...makeBaseState(), showConnections: false };
    const result = reducer(state, {
      type: "CONNECT_OBJECTS",
      ids: ["obj_1", "obj_2"],
    });
    expect(result.showConnections).toBe(true);
  });
});

describe("SET_LOCK", () => {
  it("locks specified swatches", () => {
    const state = makeBaseState();
    const result = reducer(state, {
      type: "SET_LOCK",
      ids: ["obj_1", "obj_2"],
      locked: true,
    });
    expect((result.objects["obj_1"] as Swatch).locked).toBe(true);
    expect((result.objects["obj_2"] as Swatch).locked).toBe(true);
  });

  it("unlocks specified swatches", () => {
    const state = makeBaseState();
    // First lock
    const locked = reducer(state, {
      type: "SET_LOCK",
      ids: ["obj_1"],
      locked: true,
    });
    // Then unlock
    const result = reducer(locked, {
      type: "SET_LOCK",
      ids: ["obj_1"],
      locked: false,
    });
    expect((result.objects["obj_1"] as Swatch).locked).toBe(false);
  });

  it("ignores non-swatch/ramp objects (connections)", () => {
    const state = makeStateWithConnection();
    const result = reducer(state, {
      type: "SET_LOCK",
      ids: ["conn_1"],
      locked: true,
    });
    // Connection should not have a locked property set
    const conn = result.objects["conn_1"] as Connection;
    expect("locked" in conn).toBe(false);
  });

  it("does not affect objects not in the ids list", () => {
    const state = makeBaseState();
    const result = reducer(state, {
      type: "SET_LOCK",
      ids: ["obj_1"],
      locked: true,
    });
    expect((result.objects["obj_2"] as Swatch).locked).toBeUndefined();
    expect((result.objects["obj_3"] as Swatch).locked).toBeUndefined();
  });
});

describe("LOAD_BOARD", () => {
  it("replaces state entirely with the provided state", () => {
    const state = makeBaseState();
    const newState: CanvasState = {
      objects: {
        new_1: {
          id: "new_1",
          type: "swatch",
          color: { l: 0.9, c: 0.1, h: 0 },
          position: { x: 50, y: 50 },
        } as Swatch,
      },
      selectedIds: [],
      camera: { x: 10, y: 20, zoom: 2 },
      lightMode: false,
      showConnections: false,
    };
    const result = reducer(state, { type: "LOAD_BOARD", state: newState });
    expect(result).toEqual(newState);
    expect(result.objects["obj_1"]).toBeUndefined();
  });
});

describe("CREATE_SWATCH with external IDs", () => {
  beforeEach(() => {
    setNextId(100);
  });

  it("uses provided id when given", () => {
    const state = makeBaseState();
    const result = reducer(state, {
      type: "CREATE_SWATCH",
      position: { x: 50, y: 50 },
      color: { l: 0.5, c: 0.2, h: 180 },
      id: "ext_swatch_1",
    });
    expect(result.objects["ext_swatch_1"]).toBeDefined();
    expect(result.objects["ext_swatch_1"].type).toBe("swatch");
  });

  it("falls back to genId() when id is omitted", () => {
    const state = makeBaseState();
    const result = reducer(state, {
      type: "CREATE_SWATCH",
      position: { x: 50, y: 50 },
      color: { l: 0.5, c: 0.2, h: 180 },
    });
    expect(result.objects["obj_100"]).toBeDefined();
  });
});

describe("CREATE_SWATCHES with external IDs", () => {
  beforeEach(() => {
    setNextId(200);
  });

  it("uses provided id per swatch when given", () => {
    const state = makeBaseState();
    const result = reducer(state, {
      type: "CREATE_SWATCHES",
      swatches: [
        {
          position: { x: 0, y: 0 },
          color: { l: 0.5, c: 0.2, h: 180 },
          id: "ext_1",
        },
        {
          position: { x: 100, y: 0 },
          color: { l: 0.6, c: 0.15, h: 90 },
          id: "ext_2",
        },
      ],
    });
    expect(result.objects["ext_1"]).toBeDefined();
    expect(result.objects["ext_2"]).toBeDefined();
  });

  it("handles mixed: some swatches have ids, some do not", () => {
    const state = makeBaseState();
    const result = reducer(state, {
      type: "CREATE_SWATCHES",
      swatches: [
        {
          position: { x: 0, y: 0 },
          color: { l: 0.5, c: 0.2, h: 180 },
          id: "ext_mixed",
        },
        {
          position: { x: 100, y: 0 },
          color: { l: 0.6, c: 0.15, h: 90 },
          // no id — should use genId
        },
      ],
    });
    expect(result.objects["ext_mixed"]).toBeDefined();
    expect(result.objects["obj_200"]).toBeDefined();
  });
});

describe("CREATE_SWATCHES purification", () => {
  it("purifies non-neutral colors (c >= NEUTRAL_CHROMA)", () => {
    const state = makeBaseState();
    const result = reducer(state, {
      type: "CREATE_SWATCHES",
      swatches: [
        {
          position: { x: 0, y: 0 },
          color: { l: 0.5, c: 0.1, h: 250 },
          id: "purified_test",
        },
      ],
    });
    const sw = result.objects["purified_test"] as Swatch;
    // Purification maximizes chroma, so c should be >= 0.1
    expect(sw.color.c).toBeGreaterThanOrEqual(0.1);
    expect(sw.color.h).toBeCloseTo(250, 0);
  });

  it("preserves neutral colors (c < NEUTRAL_CHROMA) without purification", () => {
    const state = makeBaseState();
    const neutralColor = { l: 0.5, c: 0.02, h: 250 };
    const result = reducer(state, {
      type: "CREATE_SWATCHES",
      swatches: [
        {
          position: { x: 0, y: 0 },
          color: neutralColor,
          id: "neutral_test",
        },
      ],
    });
    const sw = result.objects["neutral_test"] as Swatch;
    // Neutral colors should pass through unchanged
    expect(sw.color.c).toBe(0.02);
    expect(sw.color.l).toBe(0.5);
    expect(sw.color.h).toBe(250);
  });

  it("can preserve source chroma for extracted palettes", () => {
    const state = makeBaseState();
    const extractedColor = { l: 0.5, c: 0.08, h: 250 };
    const result = reducer(state, {
      type: "CREATE_SWATCHES",
      preserveColors: true,
      swatches: [
        {
          position: { x: 0, y: 0 },
          color: extractedColor,
          id: "extracted_test",
        },
      ],
    });
    const sw = result.objects["extracted_test"] as Swatch;
    expect(sw.color).toEqual(extractedColor);
  });
});

describe("HARMONIZE_SELECTED with external IDs", () => {
  beforeEach(() => {
    setNextId(300);
  });

  it("uses provided newId when given", () => {
    const state = makeBaseState();
    const result = reducer(state, {
      type: "HARMONIZE_SELECTED",
      adjustments: [
        { id: "obj_1", newHue: 90, newId: "harm_ext_1" },
        { id: "obj_2", newHue: 210, newId: "harm_ext_2" },
      ],
      placement: { x: 300, y: 0 },
    });
    expect(result.objects["harm_ext_1"]).toBeDefined();
    expect(result.objects["harm_ext_2"]).toBeDefined();
    expect(result.selectedIds).toEqual(["harm_ext_1", "harm_ext_2"]);
  });

  it("falls back to genId() when newId is omitted", () => {
    const state = makeBaseState();
    const result = reducer(state, {
      type: "HARMONIZE_SELECTED",
      adjustments: [
        { id: "obj_1", newHue: 90 },
        { id: "obj_2", newHue: 210 },
      ],
      placement: { x: 300, y: 0 },
    });
    expect(result.objects["obj_300"]).toBeDefined();
    expect(result.objects["obj_301"]).toBeDefined();
  });
});

describe("SNAPSHOT in historyReducer", () => {
  it("pushes current state to past", () => {
    const state = makeBaseState();
    const history = { current: state, past: [], future: [] };
    const result = historyReducer(history, { type: "SNAPSHOT" });
    expect(result.past.length).toBe(1);
    expect(result.past[0]).toBe(state);
  });

  it("clears future", () => {
    const state = makeBaseState();
    const altState = { ...state, lightMode: false };
    const history = { current: state, past: [], future: [altState] };
    const result = historyReducer(history, { type: "SNAPSHOT" });
    expect(result.future).toEqual([]);
  });

  it("does not change current state", () => {
    const state = makeBaseState();
    const history = { current: state, past: [], future: [] };
    const result = historyReducer(history, { type: "SNAPSHOT" });
    expect(result.current).toBe(state);
  });

  it("limits past to 50 entries", () => {
    const state = makeBaseState();
    const pastStates = Array.from({ length: 50 }, (_, i) => ({
      ...state,
      selectedIds: [String(i)],
    }));
    const history = { current: state, past: pastStates, future: [] };
    const result = historyReducer(history, { type: "SNAPSHOT" });
    expect(result.past.length).toBe(50);
    // Oldest entry should be dropped, newest is the current state
    expect(result.past[result.past.length - 1]).toBe(state);
  });
});

describe("historyReducer LOAD_BOARD", () => {
  it("resets past and future", () => {
    const state = makeBaseState();
    const newState: CanvasState = {
      ...initialState,
      objects: {
        obj_5: {
          id: "obj_5",
          type: "swatch",
          color: { l: 0.5, c: 0.2, h: 100 },
          position: { x: 0, y: 0 },
        } as Swatch,
      },
    };
    const history = {
      current: state,
      past: [state],
      future: [state],
    };
    const result = historyReducer(history, {
      type: "LOAD_BOARD",
      state: newState,
    });
    expect(result.current).toEqual(newState);
    expect(result.past).toEqual([]);
    expect(result.future).toEqual([]);
  });

  it("seeds nextId from loaded state objects", () => {
    setNextId(1);
    const newState: CanvasState = {
      ...initialState,
      objects: {
        obj_42: {
          id: "obj_42",
          type: "swatch",
          color: { l: 0.5, c: 0.2, h: 100 },
          position: { x: 0, y: 0 },
        } as Swatch,
      },
    };
    const history = { current: initialState, past: [], future: [] };
    historyReducer(history, { type: "LOAD_BOARD", state: newState });
    expect(getNextId()).toBe(43);
  });
});

describe("historyReducer UNDO/REDO", () => {
  it("UNDO restores previous state from past", () => {
    const prev = makeBaseState();
    const current = { ...prev, lightMode: false };
    const history = { current, past: [prev], future: [] };
    const result = historyReducer(history, { type: "UNDO" });
    // Should restore objects from past but keep selection/camera from current
    expect(result.current.lightMode).toBe(true);
    expect(result.current.selectedIds).toEqual(current.selectedIds);
    expect(result.past.length).toBe(0);
    expect(result.future.length).toBe(1);
  });

  it("UNDO is a no-op when past is empty", () => {
    const state = makeBaseState();
    const history = { current: state, past: [], future: [] };
    const result = historyReducer(history, { type: "UNDO" });
    expect(result).toBe(history);
  });

  it("REDO restores next state from future", () => {
    const current = makeBaseState();
    const next = { ...current, lightMode: false };
    const history = { current, past: [], future: [next] };
    const result = historyReducer(history, { type: "REDO" });
    expect(result.current.lightMode).toBe(false);
    expect(result.past.length).toBe(1);
    expect(result.future.length).toBe(0);
  });

  it("REDO is a no-op when future is empty", () => {
    const state = makeBaseState();
    const history = { current: state, past: [], future: [] };
    const result = historyReducer(history, { type: "REDO" });
    expect(result).toBe(history);
  });
});

describe("applyExternalActionsImpl", () => {
  beforeEach(() => {
    setNextId(500);
  });

  it("returns correct created IDs for a CREATE_SWATCH action with external id", () => {
    const state = makeBaseState();
    const dispatched: Action[] = [];
    const dispatch = (a: Action) => dispatched.push(a);

    const result = applyExternalActionsImpl(
      [
        {
          type: "CREATE_SWATCH",
          position: { x: 0, y: 0 },
          color: { l: 0.5, c: 0.2, h: 180 },
          id: "mcp_swatch_1",
        },
      ],
      state,
      dispatch,
    );

    expect(result.created).toEqual(["mcp_swatch_1"]);
    expect(result.deleted).toEqual([]);
  });

  it("returns correct deleted IDs for a DELETE_OBJECTS action", () => {
    const state = makeBaseState();
    const dispatched: Action[] = [];
    const dispatch = (a: Action) => dispatched.push(a);

    const result = applyExternalActionsImpl(
      [{ type: "DELETE_OBJECTS", ids: ["obj_1", "obj_2"] }],
      state,
      dispatch,
    );

    expect(result.deleted).toContain("obj_1");
    expect(result.deleted).toContain("obj_2");
    expect(result.created).toEqual([]);
  });

  it("dispatches SNAPSHOT before the actions", () => {
    const state = makeBaseState();
    const dispatched: Action[] = [];
    const dispatch = (a: Action) => dispatched.push(a);

    applyExternalActionsImpl(
      [
        {
          type: "CREATE_SWATCH",
          position: { x: 0, y: 0 },
          color: { l: 0.5, c: 0.2, h: 180 },
          id: "snap_test",
        },
      ],
      state,
      dispatch,
    );

    expect(dispatched[0].type).toBe("SNAPSHOT");
    expect(dispatched[1].type).toBe("CREATE_SWATCH");
  });

  it("saves and restores nextId around simulation", () => {
    setNextId(500);
    const state = makeBaseState();
    const dispatched: Action[] = [];
    const dispatch = (a: Action) => dispatched.push(a);

    // Action without external id will use genId during simulation
    applyExternalActionsImpl(
      [
        {
          type: "CREATE_SWATCH",
          position: { x: 0, y: 0 },
          color: { l: 0.5, c: 0.2, h: 180 },
          // no id -> genId produces obj_500 during simulation
        },
      ],
      state,
      dispatch,
    );

    // nextId should have been restored to 500 after simulation,
    // then the real dispatch would advance it again,
    // but since our mock dispatch doesn't call reducer, nextId stays at 500
    expect(getNextId()).toBe(500);
  });
});

describe("SNAPSHOT in reducer (no-op)", () => {
  it("returns state unchanged", () => {
    const state = makeBaseState();
    const result = reducer(state, { type: "SNAPSHOT" });
    expect(result).toBe(state);
  });
});

describe("DELETE_SELECTED", () => {
  it("deletes all selected objects and clears selection", () => {
    const state = {
      ...makeBaseState(),
      selectedIds: ["obj_1", "obj_2"],
    };
    const result = reducer(state, { type: "DELETE_SELECTED" });
    expect(result.objects["obj_1"]).toBeUndefined();
    expect(result.objects["obj_2"]).toBeUndefined();
    expect(result.objects["obj_3"]).toBeDefined();
    expect(result.selectedIds).toEqual([]);
  });

  it("cleans up connections referencing deleted objects", () => {
    const state = {
      ...makeStateWithConnection(),
      selectedIds: ["obj_1"],
    };
    const result = reducer(state, { type: "DELETE_SELECTED" });
    expect(result.objects["obj_1"]).toBeUndefined();
    expect(result.objects["conn_1"]).toBeUndefined();
  });
});

describe("CREATE_SWATCH purification", () => {
  it("purifies non-neutral colors", () => {
    const state = makeBaseState();
    const result = reducer(state, {
      type: "CREATE_SWATCH",
      position: { x: 0, y: 0 },
      color: { l: 0.5, c: 0.1, h: 250 },
      id: "purify_test",
    });
    const sw = result.objects["purify_test"] as Swatch;
    // Purification should maximize chroma
    expect(sw.color.c).toBeGreaterThanOrEqual(0.1);
  });

  it("preserves neutral colors without purification", () => {
    const state = makeBaseState();
    const result = reducer(state, {
      type: "CREATE_SWATCH",
      position: { x: 0, y: 0 },
      color: { l: 0.5, c: 0.02, h: 0 },
      id: "neutral_swatch",
    });
    const sw = result.objects["neutral_swatch"] as Swatch;
    expect(sw.color.c).toBe(0.02);
    expect(sw.color.l).toBe(0.5);
  });
});

// ---- Extraction markers ----

function makeStateWithImage(imageId = "img_1"): CanvasState {
  return {
    objects: {
      [imageId]: {
        id: imageId,
        type: "reference-image",
        dataUrl: "data:image/png;base64,",
        position: { x: 0, y: 0 },
        size: { width: 200, height: 200 },
      } as ReferenceImage,
    },
    selectedIds: [],
    camera: { x: 0, y: 0, zoom: 1 },
    lightMode: true,
    showConnections: true,
  };
}

describe("CREATE_EXTRACTION", () => {
  beforeEach(() => setNextId(500));

  it("creates swatches and links markers on the image", () => {
    const state = makeStateWithImage();
    const result = reducer(state, {
      type: "CREATE_EXTRACTION",
      imageId: "img_1",
      samples: [
        {
          color: { l: 0.5, c: 0.2, h: 30 },
          source: { x: 0.25, y: 0.25 },
          position: { x: 220, y: 0 },
        },
        {
          color: { l: 0.4, c: 0.18, h: 250 },
          source: { x: 0.75, y: 0.75 },
          position: { x: 220, y: 56 },
        },
      ],
    });

    const img = result.objects["img_1"] as ReferenceImage;
    expect(img.extraction).toBeDefined();
    expect(img.extraction!.markers).toHaveLength(2);

    for (const m of img.extraction!.markers) {
      const sw = result.objects[m.swatchId] as Swatch;
      expect(sw).toBeDefined();
      expect(sw.type).toBe("swatch");
      expect(sw.color).toEqual(m.color);
    }
  });

  it("honors external sample ids", () => {
    const state = makeStateWithImage();
    const result = reducer(state, {
      type: "CREATE_EXTRACTION",
      imageId: "img_1",
      samples: [
        {
          id: "ext_swatch_a",
          color: { l: 0.5, c: 0.2, h: 30 },
          source: { x: 0.3, y: 0.3 },
          position: { x: 220, y: 0 },
        },
      ],
    });

    expect(result.objects["ext_swatch_a"]).toBeDefined();
    const img = result.objects["img_1"] as ReferenceImage;
    expect(img.extraction!.markers[0].swatchId).toBe("ext_swatch_a");
  });

  it("writes source-exact color without purification", () => {
    const state = makeStateWithImage();
    // Use a vivid chromatic color that would be affected by purification.
    const rawColor = { l: 0.5, c: 0.08, h: 250 };
    const result = reducer(state, {
      type: "CREATE_EXTRACTION",
      imageId: "img_1",
      samples: [
        {
          color: rawColor,
          source: { x: 0.5, y: 0.5 },
          position: { x: 220, y: 0 },
        },
      ],
    });
    const img = result.objects["img_1"] as ReferenceImage;
    const sw = result.objects[img.extraction!.markers[0].swatchId] as Swatch;
    expect(sw.color).toEqual(rawColor);
  });

  it("no-ops if imageId is missing", () => {
    const state = makeBaseState();
    const result = reducer(state, {
      type: "CREATE_EXTRACTION",
      imageId: "does_not_exist",
      samples: [
        {
          color: { l: 0.5, c: 0.2, h: 30 },
          source: { x: 0.5, y: 0.5 },
          position: { x: 0, y: 0 },
        },
      ],
    });
    expect(result).toBe(state);
  });
});

describe("MOVE_EXTRACTION_MARKER", () => {
  beforeEach(() => setNextId(500));

  function seed(): CanvasState {
    const base = makeStateWithImage();
    return reducer(base, {
      type: "CREATE_EXTRACTION",
      imageId: "img_1",
      samples: [
        {
          id: "ext_1",
          color: { l: 0.5, c: 0.2, h: 30 },
          source: { x: 0.25, y: 0.25 },
          position: { x: 220, y: 0 },
        },
      ],
    });
  }

  it("updates marker and linked swatch atomically", () => {
    const state = seed();
    const img = state.objects["img_1"] as ReferenceImage;
    const markerIdBefore = img.extraction!.markers[0].id;
    const newColor = { l: 0.3, c: 0.18, h: 200 };

    const result = reducer(state, {
      type: "MOVE_EXTRACTION_MARKER",
      imageId: "img_1",
      markerId: markerIdBefore,
      position: { x: 0.8, y: 0.8 },
      color: newColor,
    });

    const nextImg = result.objects["img_1"] as ReferenceImage;
    const nextMarker = nextImg.extraction!.markers[0];
    expect(nextMarker.position).toEqual({ x: 0.8, y: 0.8 });
    expect(nextMarker.color).toEqual(newColor);

    const sw = result.objects["ext_1"] as Swatch;
    expect(sw.color).toEqual(newColor);
  });

  it("no-ops if markerId is unknown", () => {
    const state = seed();
    const result = reducer(state, {
      type: "MOVE_EXTRACTION_MARKER",
      imageId: "img_1",
      markerId: "missing_marker",
      position: { x: 0, y: 0 },
      color: { l: 0.5, c: 0, h: 0 },
    });
    expect(result).toBe(state);
  });
});

describe("CLEAR_IMAGE_EXTRACTION", () => {
  beforeEach(() => setNextId(500));

  it("drops the extraction field; swatches remain", () => {
    const base = makeStateWithImage();
    const seeded = reducer(base, {
      type: "CREATE_EXTRACTION",
      imageId: "img_1",
      samples: [
        {
          id: "ext_1",
          color: { l: 0.5, c: 0.2, h: 30 },
          source: { x: 0.25, y: 0.25 },
          position: { x: 220, y: 0 },
        },
      ],
    });

    const cleared = reducer(seeded, {
      type: "CLEAR_IMAGE_EXTRACTION",
      imageId: "img_1",
    });

    const img = cleared.objects["img_1"] as ReferenceImage;
    expect(img.extraction).toBeUndefined();
    expect(cleared.objects["ext_1"]).toBeDefined(); // swatch survives
  });
});

describe("marker cleanup cascades", () => {
  beforeEach(() => setNextId(500));

  function seedWithLinkedSwatches(): CanvasState {
    const base = makeStateWithImage();
    return reducer(base, {
      type: "CREATE_EXTRACTION",
      imageId: "img_1",
      samples: [
        {
          id: "ext_1",
          color: { l: 0.5, c: 0.2, h: 30 },
          source: { x: 0.25, y: 0.25 },
          position: { x: 220, y: 0 },
        },
        {
          id: "ext_2",
          color: { l: 0.4, c: 0.18, h: 250 },
          source: { x: 0.75, y: 0.75 },
          position: { x: 220, y: 56 },
        },
      ],
    });
  }

  it("DELETE_OBJECTS on a linked swatch removes its marker", () => {
    const state = seedWithLinkedSwatches();
    const result = reducer(state, {
      type: "DELETE_OBJECTS",
      ids: ["ext_1"],
    });
    const img = result.objects["img_1"] as ReferenceImage;
    expect(img.extraction!.markers).toHaveLength(1);
    expect(img.extraction!.markers[0].swatchId).toBe("ext_2");
  });

  it("DELETE_OBJECTS removing every linked swatch drops extraction field", () => {
    const state = seedWithLinkedSwatches();
    const result = reducer(state, {
      type: "DELETE_OBJECTS",
      ids: ["ext_1", "ext_2"],
    });
    const img = result.objects["img_1"] as ReferenceImage;
    expect(img.extraction).toBeUndefined();
  });

  it("DELETE_SELECTED cleans up the marker of a selected linked swatch", () => {
    const state = { ...seedWithLinkedSwatches(), selectedIds: ["ext_1"] };
    const result = reducer(state, { type: "DELETE_SELECTED" });
    const img = result.objects["img_1"] as ReferenceImage;
    expect(img.extraction!.markers).toHaveLength(1);
    expect(img.extraction!.markers[0].swatchId).toBe("ext_2");
  });

  it("PROMOTE_TO_RAMP on a linked swatch removes its marker", () => {
    const state = seedWithLinkedSwatches();
    const result = reducer(state, {
      type: "PROMOTE_TO_RAMP",
      id: "ext_1",
      stopCount: 11,
    });
    const img = result.objects["img_1"] as ReferenceImage;
    expect(img.extraction!.markers).toHaveLength(1);
    expect(img.extraction!.markers[0].swatchId).toBe("ext_2");
    // The promoted id is now a ramp.
    const ramp = result.objects["ext_1"] as Ramp;
    expect(ramp.type).toBe("ramp");
    expect(ramp.targetGamut).toBe("dual");
    expect(ramp.solveMetadata?.exactness).toBe("source-exact");
    expect(ramp.fallbackStops).toHaveLength(ramp.stops.length);
  });

  it("DUPLICATE_SELECTED on an image with extraction yields a marker-free duplicate", () => {
    const state = { ...seedWithLinkedSwatches(), selectedIds: ["img_1"] };
    const result = reducer(state, {
      type: "DUPLICATE_SELECTED",
      idMap: { img_1: "img_1_copy" },
    });
    const dup = result.objects["img_1_copy"] as ReferenceImage;
    expect(dup.extraction).toBeUndefined();
    expect(dup.imageHandle).toMatchObject({
      kind: "local",
      blobId: "img_1_copy",
    });
    // Original is untouched.
    const orig = result.objects["img_1"] as ReferenceImage;
    expect(orig.extraction!.markers).toHaveLength(2);
  });
});

describe("LOAD_BOARD filters orphan markers", () => {
  it("drops markers whose swatchId is missing in the loaded state", () => {
    const loaded: CanvasState = {
      objects: {
        img_1: {
          id: "img_1",
          type: "reference-image",
          dataUrl: "",
          position: { x: 0, y: 0 },
          size: { width: 100, height: 100 },
          extraction: {
            markers: [
              {
                id: "mkr_alive",
                swatchId: "sw_alive",
                position: { x: 0.1, y: 0.1 },
                color: { l: 0.5, c: 0.2, h: 30 },
              },
              {
                id: "mkr_orphan",
                swatchId: "sw_missing",
                position: { x: 0.9, y: 0.9 },
                color: { l: 0.4, c: 0.18, h: 250 },
              },
            ],
            createdAt: 1,
            updatedAt: 1,
          },
        } as ReferenceImage,
        sw_alive: {
          id: "sw_alive",
          type: "swatch",
          color: { l: 0.5, c: 0.2, h: 30 },
          position: { x: 120, y: 0 },
        } as Swatch,
      },
      selectedIds: [],
      camera: { x: 0, y: 0, zoom: 1 },
      lightMode: true,
      showConnections: true,
    };

    const result = reducer(initialState, { type: "LOAD_BOARD", state: loaded });
    const img = result.objects["img_1"] as ReferenceImage;
    expect(img.extraction!.markers).toHaveLength(1);
    expect(img.extraction!.markers[0].id).toBe("mkr_alive");
  });
});

describe("MOVE_EXTRACTION_MARKER skips history", () => {
  it("does not push a past entry through historyReducer", () => {
    setNextId(500);
    const seeded = reducer(makeStateWithImage(), {
      type: "CREATE_EXTRACTION",
      imageId: "img_1",
      samples: [
        {
          id: "ext_1",
          color: { l: 0.5, c: 0.2, h: 30 },
          source: { x: 0.25, y: 0.25 },
          position: { x: 220, y: 0 },
        },
      ],
    });
    const marker = (seeded.objects["img_1"] as ReferenceImage).extraction!.markers[0];

    const history = { current: seeded, past: [], future: [] };
    const action: Action = {
      type: "MOVE_EXTRACTION_MARKER",
      imageId: "img_1",
      markerId: marker.id,
      position: { x: 0.6, y: 0.6 },
      color: { l: 0.3, c: 0.18, h: 200 },
    };
    const next = historyReducer(history, action);
    expect(next.past).toHaveLength(0);
    expect(next.future).toHaveLength(0);
    expect(next.current).not.toBe(history.current); // state still changed
  });
});
