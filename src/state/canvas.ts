/**
 * Canvas state management.
 */

import { useReducer, useCallback, useEffect, useRef } from "react";
import type {
  CanvasState,
  Swatch,
  Ramp,
  Connection,
  Camera,
  Point,
} from "../types";
import { randomPurifiedColor, purifyColor } from "../engine/purify";
import { maxChroma, clampToGamut } from "../engine/gamut";
import { generateRamp, uniqueRampName } from "../engine/ramp";
import { harmonizeMultiple } from "../engine/harmonize";
import type {
  OklchColor,
  HarmonicRelationship,
  ReferenceImage,
} from "../types";

// ---- Initial State ----

const initialCamera: Camera = { x: 0, y: 0, zoom: 1 };

export const initialState: CanvasState = {
  objects: {},
  selectedIds: [],
  camera: initialCamera,
  darkMode: false,
};

// ---- Actions ----

type Action =
  | { type: "CREATE_SWATCH"; position: Point; color?: OklchColor }
  | { type: "SELECT"; id: string; additive?: boolean }
  | { type: "DESELECT_ALL" }
  | { type: "DELETE_SELECTED" }
  | { type: "MOVE_OBJECT"; id: string; position: Point }
  | { type: "MOVE_SELECTED"; dx: number; dy: number }
  | { type: "UPDATE_SWATCH_COLOR"; id: string; color: OklchColor }
  | { type: "ADJUST_SWATCH_COLOR"; id: string; dl: number; dc: number }
  | { type: "ROTATE_HUE"; id: string; delta: number }
  | {
      type: "CREATE_SWATCHES";
      swatches: { position: Point; color: OklchColor }[];
    }
  | {
      type: "ADD_REFERENCE_IMAGE";
      dataUrl: string;
      position: Point;
      size: { width: number; height: number };
    }
  | { type: "PROMOTE_TO_RAMP"; id: string; stopCount: number }
  | { type: "CHANGE_STOP_COUNT"; id: string; delta: number }
  | { type: "HARMONIZE_SELECTED"; startAfter?: HarmonicRelationship }
  | { type: "SET_CAMERA"; camera: Camera }
  | { type: "TOGGLE_DARK_MODE" }
  | { type: "RENAME_RAMP"; id: string; name: string }
  | { type: "LOAD_STATE"; state: CanvasState };

// ---- Reducer ----

let nextId = 1;
function genId(): string {
  return `obj_${nextId++}`;
}

/** Get the hue of any canvas object */
function getObjectHue(obj: Swatch | Ramp): number {
  if (obj.type === "swatch") return obj.color.h;
  if (obj.type === "ramp") return obj.seedHue;
  return 0;
}

function reducer(state: CanvasState, action: Action): CanvasState {
  switch (action.type) {
    case "CREATE_SWATCH": {
      const id = genId();
      // Don't purify intentionally neutral colors (C < 0.05)
      const color = action.color
        ? action.color.c < 0.05
          ? action.color
          : purifyColor(action.color)
        : randomPurifiedColor();
      const swatch: Swatch = {
        id,
        type: "swatch",
        color,
        position: action.position,
      };
      return {
        ...state,
        objects: { ...state.objects, [id]: swatch },
        selectedIds: [id],
      };
    }

    case "CREATE_SWATCHES": {
      const newObjects = { ...state.objects };
      const newIds: string[] = [];
      for (const s of action.swatches) {
        const id = genId();
        newIds.push(id);
        newObjects[id] = {
          id,
          type: "swatch",
          color: s.color,
          position: s.position,
        };
      }
      return {
        ...state,
        objects: newObjects,
        selectedIds: newIds,
      };
    }

    case "ADD_REFERENCE_IMAGE": {
      const id = genId();
      const img: ReferenceImage = {
        id,
        type: "reference-image",
        dataUrl: action.dataUrl,
        position: action.position,
        size: action.size,
      };
      return {
        ...state,
        objects: { ...state.objects, [id]: img },
      };
    }

    case "SELECT": {
      if (action.additive) {
        const ids = state.selectedIds.includes(action.id)
          ? state.selectedIds.filter((id) => id !== action.id)
          : [...state.selectedIds, action.id];
        return { ...state, selectedIds: ids };
      }
      return { ...state, selectedIds: [action.id] };
    }

    case "DESELECT_ALL":
      return { ...state, selectedIds: [] };

    case "DELETE_SELECTED": {
      const objects = { ...state.objects };
      for (const id of state.selectedIds) {
        delete objects[id];
        for (const [connId, obj] of Object.entries(objects)) {
          if (
            obj.type === "connection" &&
            ((obj as Connection).fromId === id ||
              (obj as Connection).toId === id)
          ) {
            delete objects[connId];
          }
        }
      }
      return { ...state, objects, selectedIds: [] };
    }

    case "MOVE_OBJECT": {
      const obj = state.objects[action.id];
      if (!obj || obj.type === "connection") return state;
      return {
        ...state,
        objects: {
          ...state.objects,
          [action.id]: { ...obj, position: action.position } as typeof obj,
        },
      };
    }

    case "MOVE_SELECTED": {
      const objects = { ...state.objects };
      for (const id of state.selectedIds) {
        const obj = objects[id];
        if (obj && obj.type !== "connection") {
          const positioned = obj as Swatch | Ramp;
          objects[id] = {
            ...positioned,
            position: {
              x: positioned.position.x + action.dx,
              y: positioned.position.y + action.dy,
            },
          } as typeof positioned;
        }
      }
      return { ...state, objects };
    }

    case "UPDATE_SWATCH_COLOR": {
      const obj = state.objects[action.id];
      if (!obj || obj.type !== "swatch") return state;
      return {
        ...state,
        objects: {
          ...state.objects,
          [action.id]: { ...obj, color: action.color },
        },
      };
    }

    case "ADJUST_SWATCH_COLOR": {
      const obj = state.objects[action.id];
      if (!obj || obj.type !== "swatch") return state;
      const sw = obj as Swatch;
      const newL = Math.max(0.06, Math.min(0.97, sw.color.l + action.dl));
      const mc = maxChroma(newL, sw.color.h);
      const newC = Math.max(0, Math.min(mc, sw.color.c + action.dc));
      return {
        ...state,
        objects: {
          ...state.objects,
          [action.id]: {
            ...sw,
            color: clampToGamut({ l: newL, c: newC, h: sw.color.h }),
          },
        },
      };
    }

    case "ROTATE_HUE": {
      const obj = state.objects[action.id];
      if (!obj) return state;

      if (obj.type === "swatch") {
        const swatch = obj as Swatch;
        const newH = (((swatch.color.h + action.delta) % 360) + 360) % 360;
        const newC = maxChroma(swatch.color.l, newH);
        const color = clampToGamut({
          l: swatch.color.l,
          c: Math.min(swatch.color.c, newC),
          h: newH,
        });
        return {
          ...state,
          objects: { ...state.objects, [action.id]: { ...swatch, color } },
        };
      }

      if (obj.type === "ramp") {
        const ramp = obj as Ramp;
        const newHue = (((ramp.seedHue + action.delta) % 360) + 360) % 360;
        const stops = generateRamp({
          hue: newHue,
          stopCount: ramp.stopCount,
          mode: ramp.mode,
        });
        const existingNames = Object.values(state.objects)
          .filter((o): o is Ramp => o.type === "ramp" && o.id !== ramp.id)
          .map((r) => r.name);
        return {
          ...state,
          objects: {
            ...state.objects,
            [action.id]: {
              ...ramp,
              seedHue: newHue,
              stops,
              name: ramp.customName
                ? ramp.name
                : uniqueRampName(newHue, existingNames),
            },
          },
        };
      }

      return state;
    }

    case "PROMOTE_TO_RAMP": {
      const obj = state.objects[action.id];
      if (!obj || obj.type !== "swatch") return state;

      const swatch = obj as Swatch;
      const isNeutral = swatch.color.c < 0.05;
      const existingNames = Object.values(state.objects)
        .filter((o): o is Ramp => o.type === "ramp")
        .map((r) => r.name);

      // Pass the seed color's chroma and lightness so the ramp generator
      // can calibrate the chroma curve to flow through the original color.
      const stops = generateRamp({
        hue: swatch.color.h,
        stopCount: action.stopCount,
        mode: "opinionated",
        seedChroma: swatch.color.c,
        seedLightness: swatch.color.l,
      });

      // Neutral ramps get named "gray", "warm-gray", "cool-gray"
      let name: string;
      if (isNeutral) {
        const hue = swatch.color.h;
        const warmish = (hue >= 20 && hue <= 80) || hue >= 340 || hue <= 20;
        const coolish = hue >= 200 && hue <= 280;
        const baseName = warmish ? "warm-gray" : coolish ? "cool-gray" : "gray";
        if (!existingNames.includes(baseName)) {
          name = baseName;
        } else {
          let i = 2;
          while (existingNames.includes(`${baseName}-${i}`)) i++;
          name = `${baseName}-${i}`;
        }
      } else {
        name = uniqueRampName(swatch.color.h, existingNames);
      }

      const ramp: Ramp = {
        id: swatch.id,
        type: "ramp",
        seedHue: swatch.color.h,
        stops,
        stopCount: action.stopCount,
        position: swatch.position,
        name,
        mode: "opinionated",
      };

      return {
        ...state,
        objects: { ...state.objects, [swatch.id]: ramp },
      };
    }

    case "CHANGE_STOP_COUNT": {
      const obj = state.objects[action.id];
      if (!obj || obj.type !== "ramp") return state;
      const ramp = obj as Ramp;

      // Step through presets: 3 → 5 → 7 → 9 → 11
      const presets = [3, 5, 7, 9, 11];
      const currentIdx = presets.indexOf(ramp.stopCount);
      const newIdx = Math.max(
        0,
        Math.min(
          presets.length - 1,
          currentIdx === -1
            ? action.delta > 0
              ? 2
              : 0 // default to 7 or 3
            : currentIdx + action.delta,
        ),
      );
      const newCount = presets[newIdx];
      if (newCount === ramp.stopCount) return state;

      const isNeutral = ramp.stops[0]?.color.c < 0.05;
      const stops = generateRamp({
        hue: ramp.seedHue,
        stopCount: newCount,
        mode: ramp.mode,
        seedChroma: isNeutral
          ? ramp.stops[Math.floor(ramp.stops.length / 2)]?.color.c
          : undefined,
      });

      return {
        ...state,
        objects: {
          ...state.objects,
          [action.id]: { ...ramp, stops, stopCount: newCount },
        },
      };
    }

    case "HARMONIZE_SELECTED": {
      const hues = state.selectedIds
        .map((id) => {
          const obj = state.objects[id];
          if (!obj || (obj.type !== "swatch" && obj.type !== "ramp"))
            return null;
          return {
            id,
            hue: getObjectHue(obj as Swatch | Ramp),
            locked: (obj as Swatch | Ramp).locked,
          };
        })
        .filter((h): h is NonNullable<typeof h> => h !== null);

      if (hues.length < 2) return state;

      const result = harmonizeMultiple(hues, action.startAfter);
      const objects = { ...state.objects };

      for (const adj of result.adjustments) {
        const obj = objects[adj.id];
        if (!obj) continue;

        if (obj.type === "swatch") {
          const swatch = obj as Swatch;
          const newC = maxChroma(swatch.color.l, adj.newHue);
          objects[adj.id] = {
            ...swatch,
            color: clampToGamut({
              l: swatch.color.l,
              c: Math.min(swatch.color.c, newC),
              h: adj.newHue,
            }),
          };
        }

        if (obj.type === "ramp") {
          const ramp = obj as Ramp;
          const stops = generateRamp({
            hue: adj.newHue,
            stopCount: ramp.stopCount,
            mode: ramp.mode,
          });
          const existingNames = Object.values(objects)
            .filter((o): o is Ramp => o.type === "ramp" && o.id !== ramp.id)
            .map((r) => r.name);
          objects[adj.id] = {
            ...ramp,
            seedHue: adj.newHue,
            stops,
            name: ramp.customName
              ? ramp.name
              : uniqueRampName(adj.newHue, existingNames),
          };
        }
      }

      return { ...state, objects };
    }

    case "SET_CAMERA":
      return { ...state, camera: action.camera };

    case "TOGGLE_DARK_MODE":
      return { ...state, darkMode: !state.darkMode };

    case "RENAME_RAMP": {
      const obj = state.objects[action.id];
      if (!obj || obj.type !== "ramp") return state;
      return {
        ...state,
        objects: {
          ...state.objects,
          [action.id]: { ...obj, name: action.name, customName: true },
        },
      };
    }

    case "LOAD_STATE": {
      // Restore nextId from loaded state
      const maxId = Object.keys(action.state.objects).reduce((max, key) => {
        const num = parseInt(key.replace("obj_", ""), 10);
        return isNaN(num) ? max : Math.max(max, num);
      }, 0);
      nextId = maxId + 1;
      return action.state;
    }

    default:
      return state;
  }
}

// ---- localStorage persistence ----

const STORAGE_KEY = "wassily-canvas";

function saveToStorage(state: CanvasState) {
  try {
    // Exclude reference images — too large for localStorage
    const filteredObjects: Record<string, any> = {};
    for (const [id, obj] of Object.entries(state.objects)) {
      if (obj.type !== "reference-image") {
        filteredObjects[id] = obj;
      }
    }
    const serializable = {
      objects: filteredObjects,
      selectedIds: [],
      camera: state.camera,
      darkMode: state.darkMode,
    };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(serializable));
  } catch {
    // localStorage full or unavailable — silently ignore
  }
}

function loadFromStorage(): CanvasState | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (parsed && parsed.objects && parsed.camera) {
      return {
        objects: parsed.objects,
        selectedIds: [],
        camera: parsed.camera,
        darkMode: parsed.darkMode ?? false,
      };
    }
  } catch {
    // Corrupt data — ignore
  }
  return null;
}

// ---- Undo/Redo History ----

/** Actions that should NOT create undo history (too granular) */
const SKIP_HISTORY: Set<string> = new Set([
  "SELECT",
  "DESELECT_ALL",
  "SET_CAMERA",
  "MOVE_OBJECT",
  "MOVE_SELECTED",
  "ROTATE_HUE",
  "UPDATE_SWATCH_COLOR",
  "ADJUST_SWATCH_COLOR",
  "LOAD_STATE",
]);

interface HistoryState {
  current: CanvasState;
  past: CanvasState[];
  future: CanvasState[];
}

function historyReducer(
  history: HistoryState,
  action: Action | { type: "UNDO" } | { type: "REDO" },
): HistoryState {
  if (action.type === "UNDO") {
    if (history.past.length === 0) return history;
    const prev = history.past[history.past.length - 1];
    return {
      current: {
        ...prev,
        selectedIds: history.current.selectedIds,
        camera: history.current.camera,
      },
      past: history.past.slice(0, -1),
      future: [history.current, ...history.future].slice(0, 50),
    };
  }

  if (action.type === "REDO") {
    if (history.future.length === 0) return history;
    const next = history.future[0];
    return {
      current: {
        ...next,
        selectedIds: history.current.selectedIds,
        camera: history.current.camera,
      },
      past: [...history.past, history.current].slice(-50),
      future: history.future.slice(1),
    };
  }

  const newState = reducer(history.current, action as Action);
  if (newState === history.current) return history;

  // Skip history for granular actions
  if (SKIP_HISTORY.has(action.type)) {
    return { ...history, current: newState };
  }

  return {
    current: newState,
    past: [...history.past, history.current].slice(-50),
    future: [],
  };
}

// ---- Hook ----

export function useCanvasState() {
  const [history, dispatchHistory] = useReducer(
    historyReducer,
    { current: initialState, past: [], future: [] },
    (init) => {
      const loaded = loadFromStorage();
      return { current: loaded || init.current, past: [], future: [] };
    },
  );

  const state = history.current;
  const canUndo = history.past.length > 0;
  const canRedo = history.future.length > 0;

  // Dispatch wrapper
  const dispatch = useCallback(
    (action: Action | { type: "UNDO" } | { type: "REDO" }) =>
      dispatchHistory(action),
    [],
  );

  // Auto-save to localStorage on every state change (debounced)
  const saveTimer = useRef<ReturnType<typeof setTimeout>>(undefined);
  useEffect(() => {
    clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => {
      saveToStorage(state);
    }, 300);
  }, [state]);

  const undo = useCallback(() => dispatch({ type: "UNDO" }), [dispatch]);
  const redo = useCallback(() => dispatch({ type: "REDO" }), [dispatch]);

  const createSwatch = useCallback(
    (position: Point, color?: OklchColor) =>
      dispatch({ type: "CREATE_SWATCH", position, color }),
    [dispatch],
  );

  const select = useCallback(
    (id: string, additive?: boolean) =>
      dispatch({ type: "SELECT", id, additive }),
    [],
  );

  const deselectAll = useCallback(() => dispatch({ type: "DESELECT_ALL" }), []);

  const deleteSelected = useCallback(
    () => dispatch({ type: "DELETE_SELECTED" }),
    [],
  );

  const moveObject = useCallback(
    (id: string, position: Point) =>
      dispatch({ type: "MOVE_OBJECT", id, position }),
    [],
  );

  const moveSelected = useCallback(
    (dx: number, dy: number) => dispatch({ type: "MOVE_SELECTED", dx, dy }),
    [],
  );

  const rotateHue = useCallback(
    (id: string, delta: number) => dispatch({ type: "ROTATE_HUE", id, delta }),
    [],
  );

  const updateSwatchColor = useCallback(
    (id: string, color: OklchColor) =>
      dispatch({ type: "UPDATE_SWATCH_COLOR", id, color }),
    [],
  );

  const adjustSwatchColor = useCallback(
    (id: string, dl: number, dc: number) =>
      dispatch({ type: "ADJUST_SWATCH_COLOR", id, dl, dc }),
    [],
  );

  const createSwatches = useCallback(
    (swatches: { position: Point; color: OklchColor }[]) =>
      dispatch({ type: "CREATE_SWATCHES", swatches }),
    [],
  );

  const addReferenceImage = useCallback(
    (
      dataUrl: string,
      position: Point,
      size: { width: number; height: number },
    ) => dispatch({ type: "ADD_REFERENCE_IMAGE", dataUrl, position, size }),
    [],
  );

  const promoteToRamp = useCallback(
    (id: string, stopCount: number = 11) =>
      dispatch({ type: "PROMOTE_TO_RAMP", id, stopCount }),
    [dispatch],
  );

  const changeStopCount = useCallback(
    (id: string, delta: number) =>
      dispatch({ type: "CHANGE_STOP_COUNT", id, delta }),
    [dispatch],
  );

  const harmonizeSelected = useCallback(
    (startAfter?: HarmonicRelationship) =>
      dispatch({ type: "HARMONIZE_SELECTED", startAfter }),
    [],
  );

  const setCamera = useCallback(
    (camera: Camera) => dispatch({ type: "SET_CAMERA", camera }),
    [],
  );

  const toggleDarkMode = useCallback(
    () => dispatch({ type: "TOGGLE_DARK_MODE" }),
    [],
  );

  return {
    state,
    undo,
    redo,
    canUndo,
    canRedo,
    createSwatch,
    select,
    deselectAll,
    deleteSelected,
    moveObject,
    moveSelected,
    rotateHue,
    updateSwatchColor,
    adjustSwatchColor,
    createSwatches,
    addReferenceImage,
    promoteToRamp,
    changeStopCount,
    harmonizeSelected,
    setCamera,
    toggleDarkMode,
  };
}
