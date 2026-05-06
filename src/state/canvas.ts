/**
 * Canvas state management.
 */

import { useReducer, useCallback, useEffect, useRef } from "react";
import type {
  Action,
  CanvasState,
  Swatch,
  Ramp,
  Connection,
  Camera,
  Point,
  ExtractionMarker,
  ImageExtraction,
} from "../types";
import { randomPurifiedColor, purifyColor } from "../engine/purify";
import { maxChroma, clampToGamut, NEUTRAL_CHROMA } from "../engine/gamut";
import { generateRamp, uniqueRampName } from "../engine/ramp";
import type { OklchColor, ReferenceImage, ReferenceImageSource } from "../types";
import { RAMP_STOP_PRESETS } from "../constants";
import {
  storeImageBlob,
  loadAllImageBlobs,
  cleanOrphanedBlobs,
} from "./imageStore";
import {
  loadBoardState,
  saveBoardState,
  collectAllImageIds,
} from "./boardStore";

// ---- Initial State ----

const initialCamera: Camera = { x: 0, y: 0, zoom: 1 };

export const initialState: CanvasState = {
  objects: {},
  selectedIds: [],
  camera: initialCamera,
  lightMode: true,
  showConnections: true,
};

// ---- Reducer ----

let nextId = 1;
function genId(): string {
  return `obj_${nextId++}`;
}

function markerId(): string {
  return `mkr_${nextId++}`;
}

/**
 * Remove markers whose swatchId is in the given set from every reference-image.
 * If an image's markers array becomes empty, drops the `extraction` field.
 * Returns the original objects record when nothing changed (preserves reference
 * equality so reducer no-op detection in historyReducer works).
 */
function clearMarkersBySwatchIds(
  objects: CanvasState["objects"],
  swatchIds: Set<string>,
): CanvasState["objects"] {
  if (swatchIds.size === 0) return objects;
  let changed = false;
  const next: CanvasState["objects"] = { ...objects };
  for (const [id, obj] of Object.entries(objects)) {
    if (obj.type !== "reference-image") continue;
    const img = obj as ReferenceImage;
    if (!img.extraction) continue;
    const remaining = img.extraction.markers.filter(
      (m) => !swatchIds.has(m.swatchId),
    );
    if (remaining.length === img.extraction.markers.length) continue;
    changed = true;
    const nextImg: ReferenceImage =
      remaining.length === 0
        ? withoutExtraction(img)
        : {
            ...img,
            extraction: {
              ...img.extraction,
              markers: remaining,
              updatedAt: Date.now(),
            },
          };
    next[id] = nextImg;
  }
  return changed ? next : objects;
}

function withoutExtraction(image: ReferenceImage): ReferenceImage {
  const rest = { ...image };
  delete rest.extraction;
  return rest;
}

function reducer(state: CanvasState, action: Action): CanvasState {
  switch (action.type) {
    case "CREATE_SWATCH": {
      const id = action.id ?? genId();
      // Don't purify intentionally neutral colors
      const color = action.color
        ? action.color.c < NEUTRAL_CHROMA
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
      };
    }

    case "CREATE_SWATCHES": {
      const newObjects = { ...state.objects };
      const newIds: string[] = [];
      for (const s of action.swatches) {
        const id = s.id ?? genId();
        newIds.push(id);
        // Purify unless explicitly preserving source colors or intentionally neutral.
        const color = action.preserveColors || s.color.c < NEUTRAL_CHROMA
          ? s.color
          : purifyColor(s.color);
        newObjects[id] = {
          id,
          type: "swatch",
          color,
          position: s.position,
        };
      }
      return {
        ...state,
        objects: newObjects,
      };
    }

    case "CREATE_EXTRACTION": {
      const img = state.objects[action.imageId];
      if (!img || img.type !== "reference-image") return state;

      const newObjects = { ...state.objects };
      const markers: ExtractionMarker[] = [];

      for (const sample of action.samples) {
        const swatchId = sample.id ?? genId();
        // Source-exact: never purify extraction swatches.
        newObjects[swatchId] = {
          id: swatchId,
          type: "swatch",
          color: sample.color,
          position: sample.position,
        } as Swatch;
        markers.push({
          id: markerId(),
          swatchId,
          position: sample.source,
          color: sample.color,
        });
      }

      const now = Date.now();
      const existing = (img as ReferenceImage).extraction;
      const extraction: ImageExtraction = {
        markers,
        createdAt: existing?.createdAt ?? now,
        updatedAt: now,
      };

      newObjects[action.imageId] = {
        ...(img as ReferenceImage),
        extraction,
      } as ReferenceImage;

      return { ...state, objects: newObjects };
    }

    case "MOVE_EXTRACTION_MARKER": {
      const img = state.objects[action.imageId];
      if (!img || img.type !== "reference-image") return state;
      const refImg = img as ReferenceImage;
      if (!refImg.extraction) return state;

      const marker = refImg.extraction.markers.find((m) => m.id === action.markerId);
      if (!marker) return state;

      const swatch = state.objects[marker.swatchId];
      if (!swatch || swatch.type !== "swatch") return state;

      const now = Date.now();
      const nextMarkers = refImg.extraction.markers.map((m) =>
        m.id === action.markerId
          ? { ...m, position: action.position, color: action.color }
          : m,
      );

      return {
        ...state,
        objects: {
          ...state.objects,
          [action.imageId]: {
            ...refImg,
            extraction: {
              ...refImg.extraction,
              markers: nextMarkers,
              updatedAt: now,
            },
          } as ReferenceImage,
          [marker.swatchId]: {
            ...(swatch as Swatch),
            color: action.color,
          } as Swatch,
        },
      };
    }

    case "CLEAR_IMAGE_EXTRACTION": {
      const img = state.objects[action.imageId];
      if (!img || img.type !== "reference-image") return state;
      const refImg = img as ReferenceImage;
      if (!refImg.extraction) return state;
      return {
        ...state,
        objects: {
          ...state.objects,
          [action.imageId]: withoutExtraction(refImg),
        },
      };
    }

    case "ADD_REFERENCE_IMAGE": {
      const id = action.id ?? genId();
      const img: ReferenceImage = {
        id,
        type: "reference-image",
        dataUrl: action.dataUrl,
        position: action.position,
        size: action.size,
        source: action.source,
      };
      return {
        ...state,
        objects: { ...state.objects, [id]: img },
      };
    }

    case "ADD_REFERENCE_IMAGES": {
      if (action.images.length === 0) return state;
      const objects = { ...state.objects };
      for (const image of action.images) {
        const id = image.id ?? genId();
        objects[id] = {
          id,
          type: "reference-image",
          dataUrl: image.dataUrl,
          position: image.position,
          size: image.size,
          source: image.source,
        } as ReferenceImage;
      }
      return { ...state, objects };
    }

    case "RESTORE_IMAGE_URLS": {
      const objects = { ...state.objects };
      for (const [id, url] of Object.entries(action.urls)) {
        const obj = objects[id];
        if (obj && obj.type === "reference-image") {
          objects[id] = { ...(obj as ReferenceImage), dataUrl: url };
        }
      }
      return { ...state, objects };
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

    case "SELECT_IDS": {
      if (action.additive) {
        const existing = new Set(state.selectedIds);
        for (const id of action.ids) existing.add(id);
        return { ...state, selectedIds: [...existing] };
      }
      return { ...state, selectedIds: action.ids };
    }

    case "SELECT_ALL":
      return {
        ...state,
        selectedIds: Object.keys(state.objects).filter(
          (id) => state.objects[id].type !== "connection",
        ),
      };

    case "DESELECT_ALL":
      return { ...state, selectedIds: [] };

    case "DELETE_SELECTED": {
      let objects: CanvasState["objects"] = { ...state.objects };
      const deletedSwatchIds = new Set<string>();
      for (const id of state.selectedIds) {
        const obj = objects[id];
        if (obj?.type === "swatch") deletedSwatchIds.add(id);
        delete objects[id];
        for (const [connId, o] of Object.entries(objects)) {
          if (
            o.type === "connection" &&
            ((o as Connection).fromId === id ||
              (o as Connection).toId === id)
          ) {
            delete objects[connId];
          }
        }
      }
      objects = clearMarkersBySwatchIds(objects, deletedSwatchIds);
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
          seedChroma: ramp.seedChroma,
          seedLightness: ramp.seedLightness,
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
      const isNeutral = swatch.color.c < NEUTRAL_CHROMA;
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
        seedChroma: swatch.color.c,
        seedLightness: swatch.color.l,
      };

      // A promoted swatch is no longer swatch-shaped, so any marker pointing
      // at it must be dropped. Markers bind to swatches only (see Non-Goals).
      const nextObjects = clearMarkersBySwatchIds(
        { ...state.objects, [swatch.id]: ramp },
        new Set([swatch.id]),
      );

      return { ...state, objects: nextObjects };
    }

    case "CHANGE_STOP_COUNT": {
      const obj = state.objects[action.id];
      if (!obj || obj.type !== "ramp") return state;
      const ramp = obj as Ramp;

      // Step through presets: 3 → 5 → 7 → 9 → 11 → 13
      // If current count is non-preset (e.g. after stop deletion), snap to
      // the nearest preset in the requested direction.
      const presets: readonly number[] = RAMP_STOP_PRESETS;
      let currentIdx = presets.indexOf(ramp.stopCount);
      if (currentIdx === -1) {
        // Non-preset count: find the nearest preset in the delta direction
        if (action.delta > 0) {
          currentIdx = presets.findIndex((p) => p > ramp.stopCount);
          if (currentIdx === -1) return state; // already above max preset
          currentIdx -= 1; // so +delta lands on that next preset
        } else {
          // Find the last preset below current count
          let found = false;
          for (let i = presets.length - 1; i >= 0; i--) {
            if (presets[i] < ramp.stopCount) { currentIdx = i + 1; found = true; break; }
          }
          if (!found) return state; // already below min preset
        }
      }
      const newIdx = Math.max(
        0,
        Math.min(presets.length - 1, currentIdx + action.delta),
      );
      const newCount = presets[newIdx];
      if (newCount === ramp.stopCount) return state;

      const stops = generateRamp({
        hue: ramp.seedHue,
        stopCount: newCount,
        mode: ramp.mode,
        seedChroma: ramp.seedChroma,
        seedLightness: ramp.seedLightness,
      });

      return {
        ...state,
        objects: {
          ...state.objects,
          [action.id]: { ...ramp, stops, stopCount: newCount },
        },
      };
    }

    case "REMOVE_RAMP_STOP": {
      const obj = state.objects[action.id];
      if (!obj || obj.type !== "ramp") return state;
      const ramp = obj as Ramp;
      const newStops = ramp.stops.filter((_, i) => i !== action.stopIndex);
      // Re-index stops
      const reindexed = newStops.map((s, i) => ({ ...s, index: i }));

      if (reindexed.length === 0) {
        // Delete ramp if no stops remain
        const objects = { ...state.objects };
        delete objects[action.id];
        return { ...state, objects, selectedIds: state.selectedIds.filter(id => id !== action.id) };
      }

      if (reindexed.length === 1) {
        // Convert back to swatch
        const stop = reindexed[0];
        const swatch: Swatch = {
          id: ramp.id,
          type: "swatch",
          color: stop.color,
          position: ramp.position,
          locked: ramp.locked,
        };
        return { ...state, objects: { ...state.objects, [ramp.id]: swatch } };
      }

      return {
        ...state,
        objects: {
          ...state.objects,
          [action.id]: { ...ramp, stops: reindexed, stopCount: reindexed.length },
        },
      };
    }

    case "TOGGLE_LOCK_SELECTED": {
      const objects = { ...state.objects };
      // If ANY selected swatch/ramp is unlocked, lock all; otherwise unlock all
      const selected = state.selectedIds
        .map((id) => objects[id])
        .filter(
          (o): o is Swatch | Ramp =>
            !!o && (o.type === "swatch" || o.type === "ramp"),
        );
      if (selected.length === 0) return state;
      const anyUnlocked = selected.some((o) => !o.locked);
      for (const obj of selected) {
        objects[obj.id] = { ...obj, locked: anyUnlocked } as typeof obj;
      }
      return { ...state, objects };
    }

    case "CREATE_CONNECTION": {
      // Chain-connect adjacent pairs in selection order
      const endpoints = state.selectedIds.filter((id) => {
        const obj = state.objects[id];
        return obj && (obj.type === "swatch" || obj.type === "ramp");
      });
      if (endpoints.length < 2) return state;
      const newObjects = { ...state.objects };
      let added = false;
      for (let i = 0; i < endpoints.length - 1; i++) {
        const fromId = endpoints[i];
        const toId = endpoints[i + 1];
        // Skip if connection already exists between this pair
        const exists = Object.values(newObjects).some(
          (obj) =>
            obj.type === "connection" &&
            (((obj as Connection).fromId === fromId &&
              (obj as Connection).toId === toId) ||
              ((obj as Connection).fromId === toId &&
                (obj as Connection).toId === fromId)),
        );
        if (exists) continue;
        const id = genId();
        newObjects[id] = { id, type: "connection", fromId, toId } as Connection;
        added = true;
      }
      if (!added) return state;
      return { ...state, objects: newObjects, showConnections: true };
    }

    case "TOGGLE_CONNECTIONS":
      return { ...state, showConnections: !state.showConnections };

    case "HARMONIZE_SELECTED": {
      // Receives pre-computed hue adjustments. Duplicates source objects with
      // new hues and arranges in a vertical strip. Originals untouched.
      const objects = { ...state.objects };

      // Cycling: delete previous strip and any connections referencing it
      if (action.replaceIds) {
        const removing = new Set(action.replaceIds);
        for (const id of action.replaceIds) delete objects[id];
        // Clean up orphaned connections (same pattern as DELETE_SELECTED)
        for (const [connId, obj] of Object.entries(objects)) {
          if (
            obj.type === "connection" &&
            (removing.has((obj as Connection).fromId) ||
              removing.has((obj as Connection).toId))
          ) {
            delete objects[connId];
          }
        }
      }

      const newIds: string[] = [];
      const stripGap = 8; // px between swatches in vertical strip

      for (let i = 0; i < action.adjustments.length; i++) {
        const adj = action.adjustments[i];
        const sourceObj = state.objects[adj.id];
        if (!sourceObj) continue;

        const newId = adj.newId ?? genId();
        newIds.push(newId);

        const pos: Point = {
          x: action.placement.x,
          y: action.placement.y + i * (48 + stripGap),
        };

        if (sourceObj.type === "swatch") {
          const swatch = sourceObj as Swatch;
          const newC = maxChroma(swatch.color.l, adj.newHue);
          objects[newId] = {
            id: newId,
            type: "swatch",
            color: clampToGamut({
              l: swatch.color.l,
              c: Math.min(swatch.color.c, newC),
              h: adj.newHue,
            }),
            position: pos,
          };
        }

        if (sourceObj.type === "ramp") {
          const ramp = sourceObj as Ramp;
          const stops = generateRamp({
            hue: adj.newHue,
            stopCount: ramp.stopCount,
            mode: ramp.mode,
            seedChroma: ramp.seedChroma,
            seedLightness: ramp.seedLightness,
          });
          const existingNames = Object.values(objects)
            .filter((o): o is Ramp => o.type === "ramp" && o.id !== ramp.id)
            .map((r) => r.name);
          objects[newId] = {
            id: newId,
            type: "ramp",
            seedHue: adj.newHue,
            stops,
            stopCount: ramp.stopCount,
            position: pos,
            name: uniqueRampName(adj.newHue, existingNames),
            mode: ramp.mode,
            seedChroma: ramp.seedChroma,
            seedLightness: ramp.seedLightness,
          };
        }
      }

      return { ...state, objects, selectedIds: newIds };
    }

    case "SET_CAMERA":
      return { ...state, camera: action.camera };

    case "TOGGLE_LIGHT_MODE":
      return { ...state, lightMode: !state.lightMode };

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

    case "DELETE_OBJECTS": {
      let objects: CanvasState["objects"] = { ...state.objects };
      const removing = new Set(action.ids);
      const deletedSwatchIds = new Set<string>();
      for (const id of action.ids) {
        const obj = objects[id];
        if (obj?.type === "swatch") deletedSwatchIds.add(id);
        delete objects[id];
      }
      // Clean up orphaned connections
      for (const [connId, obj] of Object.entries(objects)) {
        if (
          obj.type === "connection" &&
          (removing.has((obj as Connection).fromId) ||
            removing.has((obj as Connection).toId))
        ) {
          delete objects[connId];
        }
      }
      objects = clearMarkersBySwatchIds(objects, deletedSwatchIds);
      // Remove deleted IDs from selection
      const selectedIds = state.selectedIds.filter(id => !removing.has(id));
      return { ...state, objects, selectedIds };
    }

    case "CONNECT_OBJECTS": {
      // Chain-connect adjacent pairs in the provided ID list
      const endpoints = action.ids.filter((id) => {
        const obj = state.objects[id];
        return obj && (obj.type === "swatch" || obj.type === "ramp");
      });
      if (endpoints.length < 2) return state;
      const newObjects = { ...state.objects };
      let added = false;
      for (let i = 0; i < endpoints.length - 1; i++) {
        const fromId = endpoints[i];
        const toId = endpoints[i + 1];
        // Skip if connection already exists between this pair
        const exists = Object.values(newObjects).some(
          (obj) =>
            obj.type === "connection" &&
            (((obj as Connection).fromId === fromId &&
              (obj as Connection).toId === toId) ||
              ((obj as Connection).fromId === toId &&
                (obj as Connection).toId === fromId)),
        );
        if (exists) continue;
        const id = genId();
        newObjects[id] = { id, type: "connection", fromId, toId } as Connection;
        added = true;
      }
      if (!added) return state;
      return { ...state, objects: newObjects, showConnections: true };
    }

    case "DUPLICATE_SELECTED": {
      const objects = { ...state.objects };
      const newIds: string[] = [];
      for (const id of state.selectedIds) {
        const obj = objects[id];
        if (!obj || obj.type === "connection") continue;
        const newId = action.idMap?.[id] ?? genId();
        newIds.push(newId);
        if (obj.type === "reference-image") {
          // Duplicated images do not carry markers — those still point at
          // the original swatches. Fresh image, fresh extraction on re-extract.
          objects[newId] = {
            ...withoutExtraction(obj as ReferenceImage),
            id: newId,
          };
        } else {
          objects[newId] = { ...obj, id: newId } as typeof obj;
        }
      }
      return { ...state, objects, selectedIds: newIds };
    }

    case "SET_LOCK": {
      const objects = { ...state.objects };
      for (const id of action.ids) {
        const obj = objects[id];
        if (obj && (obj.type === "swatch" || obj.type === "ramp")) {
          objects[id] = { ...obj, locked: action.locked } as typeof obj;
        }
      }
      return { ...state, objects };
    }

    case "LOAD_BOARD": {
      // Defensive: drop markers whose swatch no longer exists. Keeps the
      // UI honest against any future bug that could orphan markers at save time.
      const swatchIds = new Set(
        Object.values(action.state.objects)
          .filter((o) => o.type === "swatch")
          .map((o) => o.id),
      );
      let changedObjects: CanvasState["objects"] | null = null;
      for (const [id, obj] of Object.entries(action.state.objects)) {
        if (obj.type !== "reference-image") continue;
        const img = obj as ReferenceImage;
        if (!img.extraction) continue;
        const kept = img.extraction.markers.filter((m) => swatchIds.has(m.swatchId));
        if (kept.length === img.extraction.markers.length) continue;
        if (!changedObjects) changedObjects = { ...action.state.objects };
        changedObjects[id] =
          kept.length === 0
            ? withoutExtraction(img)
            : ({
                ...img,
                extraction: { ...img.extraction, markers: kept },
              } as ReferenceImage);
      }
      return changedObjects
        ? { ...action.state, objects: changedObjects }
        : action.state;
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

    case "SNAPSHOT":
      // No-op in the reducer — the historyReducer creates the undo checkpoint
      return state;

    default:
      return state;
  }
}

// ---- Undo/Redo History ----

/** Actions that should NOT create undo history (too granular) */
const SKIP_HISTORY: Set<string> = new Set([
  "SELECT",
  "SELECT_IDS",
  "SELECT_ALL",
  "DESELECT_ALL",
  "SET_CAMERA",
  "MOVE_OBJECT",
  "MOVE_SELECTED",
  "ROTATE_HUE",
  "UPDATE_SWATCH_COLOR",
  "ADJUST_SWATCH_COLOR",
  "MOVE_EXTRACTION_MARKER",
  "LOAD_STATE",
  "LOAD_BOARD",
  "RESTORE_IMAGE_URLS",
  "DUPLICATE_SELECTED",
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
  if (action.type === "SNAPSHOT") {
    return {
      current: history.current,
      past: [...history.past, history.current].slice(-50),
      future: [],
    };
  }

  if (action.type === "LOAD_BOARD") {
    const maxId = Object.keys(action.state.objects).reduce((max, key) => {
      const num = parseInt(key.replace("obj_", ""), 10);
      return isNaN(num) ? max : Math.max(max, num);
    }, 0);
    nextId = maxId + 1;
    return { current: action.state, past: [], future: [] };
  }

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

// ---- External action application ----

/**
 * Apply actions from an external source (MCP bridge).
 * Simulates the result using the pure reducer for deterministic diffing,
 * then dispatches for real (with SNAPSHOT for undo support).
 */
function applyExternalActionsImpl(
  actions: Action[],
  currentState: CanvasState,
  dispatch: (action: Action) => void,
): { created: string[]; deleted: string[] } {
  // 1. Simulate: run actions through the pure reducer.
  //    Save/restore nextId so genId() doesn't diverge between
  //    simulation and real dispatch.
  const savedNextId = nextId;
  let simState = currentState;
  for (const action of actions) {
    simState = reducer(simState, action);
  }
  nextId = savedNextId; // restore — real dispatch will produce the same IDs

  // 2. Diff: compare objects before and after
  const prevKeys = new Set(Object.keys(currentState.objects));
  const nextKeys = new Set(Object.keys(simState.objects));
  const created = [...nextKeys].filter(k => !prevKeys.has(k));
  const deleted = [...prevKeys].filter(k => !nextKeys.has(k));

  // 3. Dispatch for real: SNAPSHOT (undo boundary) then all actions
  dispatch({ type: "SNAPSHOT" });
  for (const action of actions) {
    dispatch(action);
  }

  return { created, deleted };
}

// ---- Hook ----

export function useCanvasState(activeBoardId: string) {
  const [history, dispatchHistory] = useReducer(
    historyReducer,
    { current: initialState, past: [], future: [] },
    (init) => {
      const loaded = loadBoardState(activeBoardId);
      if (loaded) {
        // Seed nextId from persisted objects to prevent ID collisions
        const maxId = Object.keys(loaded.objects).reduce((max, key) => {
          const num = parseInt(key.replace("obj_", ""), 10);
          return isNaN(num) ? max : Math.max(max, num);
        }, 0);
        nextId = maxId + 1;
      }
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

  // Restore reference image blobs from IndexedDB on mount
  useEffect(() => {
    (async () => {
      const blobs = await loadAllImageBlobs();
      if (blobs.length === 0) return;
      const urls: Record<string, string> = {};
      for (const { id, blob } of blobs) {
        urls[id] = URL.createObjectURL(blob);
      }
      dispatch({ type: "RESTORE_IMAGE_URLS", urls });
    })();
  }, [dispatch]);

  // Auto-save to localStorage on every state change (debounced)
  const saveTimer = useRef<ReturnType<typeof setTimeout>>(undefined);
  useEffect(() => {
    clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => {
      saveBoardState(activeBoardId, state);
      // Clean up orphaned blobs across all boards
      cleanOrphanedBlobs(collectAllImageIds());
    }, 300);
  }, [state, activeBoardId]);

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
    [dispatch],
  );

  const deselectAll = useCallback(() => dispatch({ type: "DESELECT_ALL" }), [dispatch]);

  const deleteSelected = useCallback(
    () => dispatch({ type: "DELETE_SELECTED" }),
    [dispatch],
  );

  const moveObject = useCallback(
    (id: string, position: Point) =>
      dispatch({ type: "MOVE_OBJECT", id, position }),
    [dispatch],
  );

  const moveSelected = useCallback(
    (dx: number, dy: number) => dispatch({ type: "MOVE_SELECTED", dx, dy }),
    [dispatch],
  );

  const rotateHue = useCallback(
    (id: string, delta: number) => dispatch({ type: "ROTATE_HUE", id, delta }),
    [dispatch],
  );

  const updateSwatchColor = useCallback(
    (id: string, color: OklchColor) =>
      dispatch({ type: "UPDATE_SWATCH_COLOR", id, color }),
    [dispatch],
  );

  const adjustSwatchColor = useCallback(
    (id: string, dl: number, dc: number) =>
      dispatch({ type: "ADJUST_SWATCH_COLOR", id, dl, dc }),
    [dispatch],
  );

  const createSwatches = useCallback(
    (
      swatches: { position: Point; color: OklchColor }[],
      options?: { preserveColors?: boolean },
    ) =>
      dispatch({
        type: "CREATE_SWATCHES",
        swatches,
        preserveColors: options?.preserveColors,
      }),
    [dispatch],
  );

  const createExtraction = useCallback(
    (
      imageId: string,
      samples: {
        id?: string;
        color: OklchColor;
        source: Point;
        position: Point;
      }[],
    ) => dispatch({ type: "CREATE_EXTRACTION", imageId, samples }),
    [dispatch],
  );

  const moveExtractionMarker = useCallback(
    (
      imageId: string,
      markerIdArg: string,
      position: Point,
      color: OklchColor,
    ) =>
      dispatch({
        type: "MOVE_EXTRACTION_MARKER",
        imageId,
        markerId: markerIdArg,
        position,
        color,
      }),
    [dispatch],
  );

  const clearImageExtraction = useCallback(
    (imageId: string) =>
      dispatch({ type: "CLEAR_IMAGE_EXTRACTION", imageId }),
    [dispatch],
  );

  const addReferenceImage = useCallback(
    (
      blob: Blob,
      dataUrl: string,
      position: Point,
      size: { width: number; height: number },
      source?: ReferenceImageSource,
    ) => {
      const id = `img_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
      // Store blob in IndexedDB (fire and forget — non-blocking)
      storeImageBlob(id, blob);
      dispatch({ type: "ADD_REFERENCE_IMAGE", id, dataUrl, position, size, source });
    },
    [dispatch],
  );

  const addReferenceImages = useCallback(
    (
      images: {
        blob: Blob;
        dataUrl: string;
        position: Point;
        size: { width: number; height: number };
        source?: ReferenceImageSource;
      }[],
    ) => {
      const stamped = images.map((image, index) => ({
        ...image,
        id: `img_${Date.now()}_${index}_${Math.random().toString(36).slice(2, 6)}`,
      }));
      for (const image of stamped) {
        storeImageBlob(image.id, image.blob);
      }
      dispatch({
        type: "ADD_REFERENCE_IMAGES",
        images: stamped.map(({ id, dataUrl, position, size, source }) => ({
          id,
          dataUrl,
          position,
          size,
          source,
        })),
      });
      return stamped.map((image) => image.id);
    },
    [dispatch],
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
    (
      adjustments: { id: string; newHue: number }[],
      placement: Point,
      replaceIds?: string[],
    ) =>
      dispatch({ type: "HARMONIZE_SELECTED", adjustments, placement, replaceIds }),
    [dispatch],
  );

  const toggleLockSelected = useCallback(
    () => dispatch({ type: "TOGGLE_LOCK_SELECTED" }),
    [dispatch],
  );

  const createConnection = useCallback(
    () => dispatch({ type: "CREATE_CONNECTION" }),
    [dispatch],
  );

  const toggleConnections = useCallback(
    () => dispatch({ type: "TOGGLE_CONNECTIONS" }),
    [dispatch],
  );

  const setCamera = useCallback(
    (camera: Camera) => dispatch({ type: "SET_CAMERA", camera }),
    [dispatch],
  );

  const toggleLightMode = useCallback(
    () => dispatch({ type: "TOGGLE_LIGHT_MODE" }),
    [dispatch],
  );

  const snapshot = useCallback(
    () => dispatch({ type: "SNAPSHOT" }),
    [dispatch],
  );

  const duplicateSelected = useCallback(
    () => {
      // Pre-generate IDs so we know old→new mapping for blob copies
      const idMap: Record<string, string> = {};
      for (const id of state.selectedIds) {
        const obj = state.objects[id];
        if (!obj || obj.type === "connection") continue;
        idMap[id] = genId();
      }
      dispatch({ type: "SNAPSHOT" });
      dispatch({ type: "DUPLICATE_SELECTED", idMap });
      // Copy IndexedDB blobs for duplicated reference images
      for (const [oldId, newId] of Object.entries(idMap)) {
        const obj = state.objects[oldId];
        if (obj?.type === "reference-image") {
          const dataUrl = (obj as ReferenceImage).dataUrl;
          if (dataUrl) {
            fetch(dataUrl)
              .then((r) => r.blob())
              .then((blob) => storeImageBlob(newId, blob))
              .catch(() => {}); // degrade silently
          }
        }
      }
    },
    [dispatch, state.selectedIds, state.objects],
  );

  const loadBoard = useCallback(
    (boardState: CanvasState) => dispatch({ type: "LOAD_BOARD", state: boardState }),
    [dispatch],
  );

  const applyExternalActions = useCallback(
    (actions: Action[]) => applyExternalActionsImpl(actions, state, dispatch),
    [state, dispatch],
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
    createExtraction,
    moveExtractionMarker,
    clearImageExtraction,
    addReferenceImage,
    addReferenceImages,
    promoteToRamp,
    changeStopCount,
    harmonizeSelected,
    toggleLockSelected,
    createConnection,
    toggleConnections,
    setCamera,
    toggleLightMode,
    snapshot,
    dispatch,
    duplicateSelected,
    loadBoard,
    applyExternalActions,
  };
}

// Test exports — not part of the public API
export const __test__ = { reducer, historyReducer, applyExternalActionsImpl, genId, setNextId: (n: number) => { nextId = n; }, getNextId: () => nextId };
