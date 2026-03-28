/**
 * Canvas state management.
 *
 * Single source of truth for all canvas objects, selection, and camera.
 * Uses React's useReducer pattern for predictable state updates.
 */

import { useReducer, useCallback } from "react";
import type {
  CanvasState,
  Swatch,
  Ramp,
  Connection,
  Camera,
  Point,
} from "../types";
import { randomPurifiedColor, purifyColor } from "../engine/purify";
import { generateRamp, uniqueRampName } from "../engine/ramp";
import type { OklchColor } from "../types";

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
  | { type: "SELECT_STOP"; rampId: string; stopIndex: number }
  | { type: "DESELECT_ALL" }
  | { type: "DELETE_SELECTED" }
  | { type: "MOVE_OBJECT"; id: string; position: Point }
  | { type: "UPDATE_SWATCH_COLOR"; id: string; color: OklchColor }
  | {
      type: "PROMOTE_TO_RAMP";
      id: string;
      stopCount: number;
    }
  | { type: "SET_CAMERA"; camera: Camera }
  | { type: "TOGGLE_DARK_MODE" }
  | { type: "RENAME_RAMP"; id: string; name: string };

// ---- Reducer ----

let nextId = 1;
function genId(): string {
  return `obj_${nextId++}`;
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
        // Also remove connections referencing deleted objects
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
          [action.id]: {
            ...obj,
            name: action.name,
            customName: true,
          },
        },
      };
    }

    default:
      return state;
  }
}

// ---- Hook ----

export function useCanvasState() {
  const [state, dispatch] = useReducer(reducer, initialState);

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

  const promoteToRamp = useCallback(
    (id: string, stopCount: number = 11) =>
      dispatch({ type: "PROMOTE_TO_RAMP", id, stopCount }),
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
    promoteToRamp,
    setCamera,
    toggleDarkMode,
  };
}
