/**
 * Tests for canvas.ts reducer, historyReducer, and applyExternalActionsImpl.
 *
 * Uses the __test__ export to access module-private functions.
 */

import { describe, it, expect, beforeEach } from "vitest";
import { initialState, __test__ } from "../canvas";
import type { Action, CanvasState, Swatch, Connection } from "../../types";

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
    darkMode: true,
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
    expect(initialState.darkMode).toBe(true);
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
    expect((conn as any).locked).toBeUndefined();
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
      darkMode: false,
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
    const altState = { ...state, darkMode: false };
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
    const current = { ...prev, darkMode: false };
    const history = { current, past: [prev], future: [] };
    const result = historyReducer(history, { type: "UNDO" });
    // Should restore objects from past but keep selection/camera from current
    expect(result.current.darkMode).toBe(true);
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
    const next = { ...current, darkMode: false };
    const history = { current, past: [], future: [next] };
    const result = historyReducer(history, { type: "REDO" });
    expect(result.current.darkMode).toBe(false);
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
