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
import type { OklchColor, HarmonicRelationship } from "../types";

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
  | { type: "ROTATE_HUE"; id: string; delta: number }
  | { type: "PROMOTE_TO_RAMP"; id: string; stopCount: number }
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
      const color = action.color
        ? purifyColor(action.color)
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
      const existingNames = Object.values(state.objects)
        .filter((o): o is Ramp => o.type === "ramp")
        .map((r) => r.name);

      const stops = generateRamp({
        hue: swatch.color.h,
        stopCount: action.stopCount,
        mode: "opinionated",
      });

      const ramp: Ramp = {
        id: swatch.id,
        type: "ramp",
        seedHue: swatch.color.h,
        stops,
        stopCount: action.stopCount,
        position: swatch.position,
        name: uniqueRampName(swatch.color.h, existingNames),
        mode: "opinionated",
      };

      return {
        ...state,
        objects: { ...state.objects, [swatch.id]: ramp },
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
    const serializable = {
      objects: state.objects,
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

// ---- Hook ----

export function useCanvasState() {
  const [state, dispatch] = useReducer(
    reducer,
    initialState,
    (_init: CanvasState) => loadFromStorage() || _init,
  );

  // Auto-save to localStorage on every state change (debounced)
  const saveTimer = useRef<ReturnType<typeof setTimeout>>(undefined);
  useEffect(() => {
    clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => {
      saveToStorage(state);
    }, 300);
  }, [state]);

  const createSwatch = useCallback(
    (position: Point, color?: OklchColor) =>
      dispatch({ type: "CREATE_SWATCH", position, color }),
    [],
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

  const promoteToRamp = useCallback(
    (id: string, stopCount: number = 11) =>
      dispatch({ type: "PROMOTE_TO_RAMP", id, stopCount }),
    [],
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
    createSwatch,
    select,
    deselectAll,
    deleteSelected,
    moveObject,
    moveSelected,
    rotateHue,
    promoteToRamp,
    harmonizeSelected,
    setCamera,
    toggleDarkMode,
  };
}
