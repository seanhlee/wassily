import { useCallback, useRef, useEffect, useState } from "react";
import { useCanvasState } from "../state/canvas";
import { useBoardManager } from "../state/useBoardManager";
import type { BoardState } from "../state/useBoardManager";
import { useMcpBridge } from "../state/mcpBridge";
import { migrateFromLegacy } from "../state/boardStore";
import { SwatchNode, RampNode, RefImageNode } from "../components/SwatchNode";
import { NoteNode } from "../components/NoteNode";
import { ExtractionLoupe } from "../components/ExtractionLoupe";
import type { LoupeState } from "../components/RefImageNode";
import { CanvasContextMenu } from "../components/ContextMenu";
import { harmonizeMultiple } from "../engine/harmonize";
import { showHarmonizeFeedback } from "../components/harmonizeFeedback";
import {
  toHex,
  toOklchString,
  clampToGamut,
  maxChroma,
} from "../engine/gamut";
import { ConnectionLine } from "../components/ConnectionLine";
import { HelpOverlay } from "../components/HelpOverlay";
import { HarmonizeOverlay } from "../components/HarmonizeLabel";
import { BoardBar } from "../components/BoardBar";
import { ArenaImportPrompt } from "../components/ArenaImportPrompt";
import type { Swatch, Ramp, Connection, Point, OklchColor, HarmonicRelationship, ReferenceImage, Note } from "../types";
import { getObjectBounds, findStripPlacement, extractHues, objectsInRect } from "./canvasHelpers";
import { samplePixelAt } from "../hooks/useEyedropper";
import { usePasteAndDrop } from "../hooks/usePasteAndDrop";
import { extractColors, dataUrlToImageData } from "../engine/extract";
import { useArenaImport } from "../state/useArenaImport";

/** Prime an offscreen canvas for pixel sampling from a reference image */
function primeImageCanvas(
  image: ReferenceImage,
  cache: Map<string, CanvasRenderingContext2D>,
) {
  if (cache.has(image.id)) return;
  if (!image.dataUrl) return;
  const img = new Image();
  img.src = image.dataUrl;
  const draw = () => {
    const canvas = document.createElement("canvas");
    canvas.width = image.size.width;
    canvas.height = image.size.height;
    const ctx = canvas.getContext("2d", { willReadFrequently: true });
    if (ctx) {
      ctx.drawImage(img, 0, 0, image.size.width, image.size.height);
      cache.set(image.id, ctx);
    }
  };
  if (img.complete && img.naturalWidth > 0) draw();
  else img.onload = draw;
}

function normalizeShortcutKey(key: string): string {
  return key.length === 1 ? key.toLowerCase() : key;
}

export function Canvas() {
  // Board state initialized from localStorage (migration happens on first load)
  const [boardState, setBoardState] = useState<BoardState>(() => migrateFromLegacy());

  // Canvas state scoped to the active board
  const {
    state,
    createSwatch,
    select,
    deselectAll,
    deleteSelected,
    moveObject,
    moveSelected,
    updateSwatchColor,
    adjustSwatchColor,
    createExtraction,
    clearImageExtraction,
    moveExtractionMarker,
    addReferenceImage,
    addReferenceImages,
    createNote,
    updateNoteText,
    deleteObjects,
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
    undo,
    redo,
    applyExternalActions,
  } = useCanvasState(boardState.activeBoardId);

  // Board manager for create/switch/delete/rename
  const boardManager = useBoardManager(boardState, setBoardState, state, loadBoard);
  useMcpBridge(state, boardManager, applyExternalActions);

  const containerRef = useRef<HTMLDivElement>(null);
  const cameraRef = useRef(state.camera);
  const isPanningRef = useRef(false);
  const panStart = useRef<Point>({ x: 0, y: 0 });
  const cameraStart = useRef(state.camera);
  const [isPanning, setIsPanning] = useState(false);
  const [spaceHeld, setSpaceHeld] = useState(false);
  const [peekPureMode, setPeekPureMode] = useState(false);
  const [eKeyHeld, setEKeyHeld] = useState(false);
  const [iKeyHeld, setIKeyHeld] = useState(false);
  const [showHelp, setShowHelp] = useState(false);
  const [editingNoteId, setEditingNoteId] = useState<string | null>(null);
  const [suppressedNoteTintId, setSuppressedNoteTintId] = useState<string | null>(null);
  const mouseClientPosRef = useRef<{ x: number; y: number } | null>(null);

  // ---- Eyedropper state ----
  const eyedropperOriginalColor = useRef<OklchColor | null>(null);
  const eyedropperCommitted = useRef(false);
  const eyedropperTargetId = useRef<string | null>(null);
  const [eyedropperCanvasCache] = useState(
    () => new Map<string, CanvasRenderingContext2D>(),
  );
  const [eyedropperTargetIdState, setEyedropperTargetIdState] = useState<string | null>(null);
  const eyedropperActive = iKeyHeld && eyedropperTargetIdState !== null;

  // ---- Marquee selection state ----
  const marqueeOriginRef = useRef<Point | null>(null);
  const marqueeActiveRef = useRef(false);
  const marqueeCompletedRef = useRef(false);
  const [marqueeRect, setMarqueeRect] = useState<{ x1: number; y1: number; x2: number; y2: number } | null>(null);

  // ---- Extraction marker drag + loupe ----
  const [loupeState, setLoupeState] = useState<LoupeState | null>(null);
  // Shared hover state — bidirectional link between a swatch and its
  // extraction marker. A marker hover and a swatch hover both resolve here.
  const [hoveredSwatchId, setHoveredSwatchId] = useState<string | null>(null);

  useEffect(() => {
    cameraRef.current = state.camera;
  }, [state.camera]);

  const setPanningState = useCallback((value: boolean) => {
    isPanningRef.current = value;
    setIsPanning(value);
  }, []);

  const setEyedropperTarget = useCallback((id: string | null) => {
    eyedropperTargetId.current = id;
    setEyedropperTargetIdState(id);
  }, []);

  // ---- Harmony cycling state ----
  const lastHarmonyRef = useRef<{
    sourceKey: string; // selectionKey of the original objects
    sourceIds: string[]; // IDs of original source objects
    stripIds: string[]; // IDs of strip objects (for replaceIds on cycling)
    relationship: HarmonicRelationship;
    cycleCount: number;
    pendingCapture: boolean; // true = next selection change should capture stripIds
  } | null>(null);

  // Capture strip IDs after harmonization completes (selection changes to new strip).
  // Only fires when pendingCapture is set by the H handler, not on arbitrary selection changes.
  useEffect(() => {
    if (
      lastHarmonyRef.current?.pendingCapture &&
      state.selectedIds.length > 0
    ) {
      lastHarmonyRef.current.stripIds = [...state.selectedIds];
      lastHarmonyRef.current.pendingCapture = false;
    }
  }, [state.selectedIds]);

  // ---- Eyedropper: prime offscreen canvases for ref images ----
  useEffect(() => {
    const cache = eyedropperCanvasCache;
    const imageIds = new Set<string>();
    for (const obj of Object.values(state.objects)) {
      if (obj.type === "reference-image") {
        imageIds.add(obj.id);
        primeImageCanvas(obj as ReferenceImage, cache);
      }
    }
    // Remove stale entries
    for (const id of cache.keys()) {
      if (!imageIds.has(id)) cache.delete(id);
    }
  }, [eyedropperCanvasCache, state.objects]);

  // ---- Canvas click → deselect only (+ eyedropper commit) ----
  const handleCanvasClick = useCallback(
    (e: React.MouseEvent) => {
      // Eyedropper: commit sampled color on click
      const targetId = eyedropperTargetId.current;
      if (iKeyHeld && targetId) {
        const rect = containerRef.current?.getBoundingClientRect();
        if (rect) {
          const color = samplePixelAt(
            e.clientX, e.clientY, rect, cameraRef.current,
            state.objects, eyedropperCanvasCache,
          );
          if (color) {
            snapshot();
            updateSwatchColor(targetId, color);
            eyedropperCommitted.current = true;
          }
        }
        return; // never deselect during eyedropper
      }

      if (isPanningRef.current) return;
      if (marqueeCompletedRef.current) return;
      const target = e.target as HTMLElement;
      if (target.closest(".swatch-node, .ramp-node, .ref-image-node, .note-node")) return;

      if (state.selectedIds.length > 0) {
        deselectAll();
      }
    },
    [
      state.selectedIds,
      state.objects,
      deselectAll,
      eyedropperCanvasCache,
      iKeyHeld,
      snapshot,
      updateSwatchColor,
    ],
  );

  // ---- Wheel: pinch-to-zoom + two-finger-pan + hue rotation ----
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    const handler = (e: WheelEvent) => {
      e.preventDefault();

      const rect = el.getBoundingClientRect();
      const mouseX = e.clientX - rect.left;
      const mouseY = e.clientY - rect.top;
      const cam = cameraRef.current;

      if (e.ctrlKey || e.metaKey) {
        // Pinch-to-zoom
        const zoomFactor = 1 - e.deltaY * 0.01;
        const newZoom = Math.max(0.1, Math.min(10, cam.zoom * zoomFactor));
        const newX = mouseX - (mouseX - cam.x) * (newZoom / cam.zoom);
        const newY = mouseY - (mouseY - cam.y) * (newZoom / cam.zoom);
        setCamera({ x: newX, y: newY, zoom: newZoom });
      } else {
        // Two-finger scroll → pan
        setCamera({
          x: cam.x - e.deltaX,
          y: cam.y - e.deltaY,
          zoom: cam.zoom,
        });
      }
    };

    el.addEventListener("wheel", handler, { passive: false });
    return () => el.removeEventListener("wheel", handler);
  }, [setCamera]);

  // ---- Space+drag → pan ----
  const handleMouseDown = useCallback(
    (e: React.MouseEvent) => {
      if (iKeyHeld) return; // eyedropper mode — don't start panning
      if (spaceHeld) {
        setPanningState(true);
        panStart.current = { x: e.clientX, y: e.clientY };
        cameraStart.current = { ...cameraRef.current };
        e.preventDefault();
        return;
      }

      // Marquee: start on left-click on empty canvas
      if (e.button !== 0) return;
      const target = e.target as HTMLElement;
      if (target.closest(".swatch-node, .ramp-node, .ref-image-node")) return;

      marqueeOriginRef.current = { x: e.clientX, y: e.clientY };
      marqueeActiveRef.current = false;
      marqueeCompletedRef.current = false;
      const shiftKey = e.shiftKey;

      const handleMove = (me: MouseEvent) => {
        const origin = marqueeOriginRef.current!;
        const dx = me.clientX - origin.x;
        const dy = me.clientY - origin.y;
        if (!marqueeActiveRef.current && (Math.abs(dx) > 3 || Math.abs(dy) > 3)) {
          marqueeActiveRef.current = true;
        }
        if (marqueeActiveRef.current) {
          setMarqueeRect({ x1: origin.x, y1: origin.y, x2: me.clientX, y2: me.clientY });
        }
      };

      const handleUp = (me: MouseEvent) => {
        window.removeEventListener("mousemove", handleMove);
        window.removeEventListener("mouseup", handleUp);

        if (marqueeActiveRef.current) {
          const rect = containerRef.current?.getBoundingClientRect();
          if (rect) {
            const cam = cameraRef.current;
            const origin = marqueeOriginRef.current!;
            const toCanvas = (sx: number, sy: number) => ({
              x: (sx - rect.left - cam.x) / cam.zoom,
              y: (sy - rect.top - cam.y) / cam.zoom,
            });
            const p1 = toCanvas(origin.x, origin.y);
            const p2 = toCanvas(me.clientX, me.clientY);
            const canvasRect = {
              x: Math.min(p1.x, p2.x),
              y: Math.min(p1.y, p2.y),
              w: Math.abs(p2.x - p1.x),
              h: Math.abs(p2.y - p1.y),
            };
            const hitIds = objectsInRect(state.objects, canvasRect);
            dispatch({ type: "SELECT_IDS", ids: hitIds, additive: shiftKey });
          }
          marqueeCompletedRef.current = true;
          setTimeout(() => { marqueeCompletedRef.current = false; }, 0);
        }

        setMarqueeRect(null);
        marqueeOriginRef.current = null;
        marqueeActiveRef.current = false;
      };

      window.addEventListener("mousemove", handleMove);
      window.addEventListener("mouseup", handleUp);
    },
    [spaceHeld, iKeyHeld, setPanningState, state.objects, dispatch],
  );

  const handleMouseMove = useCallback(
    (e: React.MouseEvent) => {
      mouseClientPosRef.current = { x: e.clientX, y: e.clientY };

      // Eyedropper: live preview
      const targetId = eyedropperTargetId.current;
      if (iKeyHeld && targetId) {
        const rect = containerRef.current?.getBoundingClientRect();
        if (rect) {
          const color = samplePixelAt(
            e.clientX, e.clientY, rect, cameraRef.current,
            state.objects, eyedropperCanvasCache,
          );
          if (color) {
            updateSwatchColor(targetId, color);
          } else if (eyedropperOriginalColor.current) {
            // Off image — revert to original
            updateSwatchColor(targetId, eyedropperOriginalColor.current);
          }
        }
        return;
      }

      if (isPanningRef.current) {
        const dx = e.clientX - panStart.current.x;
        const dy = e.clientY - panStart.current.y;
        setCamera({
          x: cameraStart.current.x + dx,
          y: cameraStart.current.y + dy,
          zoom: cameraStart.current.zoom,
        });
      }
    },
    [
      setCamera,
      eyedropperCanvasCache,
      iKeyHeld,
      state.objects,
      updateSwatchColor,
    ],
  );

  const handleMouseUp = useCallback(() => {
    setTimeout(() => {
      setPanningState(false);
    }, 50);
  }, [setPanningState]);

  // ---- Notes (defined before keyboard effect because T uses handleCreateNote) ----
  const handleCreateNote = useCallback(
    (canvasPosition: Point) => {
      // CREATE_NOTE produces its own undo entry via historyReducer; no extra
      // snapshot needed (matches the createSwatch flow).
      const id = createNote(canvasPosition);
      setSuppressedNoteTintId(null);
      setEditingNoteId(id);
    },
    [createNote],
  );

  const handleNoteTextChange = useCallback(
    (id: string, text: string) => updateNoteText(id, text),
    [updateNoteText],
  );

  const handleNoteCommit = useCallback(
    (id: string, text: string) => {
      setSuppressedNoteTintId(id);
      setEditingNoteId(null);
      if (text.trim() === "") {
        deleteObjects([id]);
      }
    },
    [deleteObjects],
  );

  const handleNoteStartEdit = useCallback((id: string) => {
    setSuppressedNoteTintId(null);
    setEditingNoteId(id);
  }, []);

  const handleShowNoteSelectedTint = useCallback(() => {
    setSuppressedNoteTintId(null);
  }, []);

  // ---- Keyboard shortcuts ----
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (
        e.target instanceof HTMLInputElement ||
        e.target instanceof HTMLTextAreaElement
      )
        return;

      if (showHelp) {
        setShowHelp(false);
        return;
      }

      const key = normalizeShortcutKey(e.key);

      if (key === " " && !e.repeat) {
        e.preventDefault();
        setSpaceHeld(true);
        return;
      }

      if (key === "e" && !e.repeat && !e.metaKey && !e.ctrlKey) {
        setEKeyHeld(true);
        return;
      }

      if (key === "i" && !e.repeat && !e.metaKey && !e.ctrlKey) {
        // Store original color for revert on cancel
        const targetId = state.selectedIds[0];
        const targetObj = targetId ? state.objects[targetId] : null;
        if (targetObj?.type === "swatch") {
          setEyedropperTarget(targetId);
          eyedropperOriginalColor.current = { ...(targetObj as Swatch).color };
          eyedropperCommitted.current = false;
        } else {
          setEyedropperTarget(null);
        }
        setIKeyHeld(true);
        return;
      }

      const selected = state.selectedIds[0];
      const selectedObj = selected ? state.objects[selected] : null;

      const getSelectedColor = () => {
        if (!selectedObj) return null;
        if (selectedObj.type === "swatch") return (selectedObj as Swatch).color;
        if (selectedObj.type === "ramp") {
          const ramp = selectedObj as Ramp;
          const anchor =
            ramp.stops.find((s) => s.label === "500") ||
            ramp.stops[Math.floor(ramp.stops.length / 2)];
          return state.lightMode ? anchor.darkColor : anchor.color;
        }
        return null;
      };

      switch (key) {
        case "d":
          if (!e.metaKey && !e.ctrlKey && !e.repeat) toggleLightMode();
          break;

        case "r":
          if (
            !e.metaKey &&
            !e.ctrlKey &&
            !e.repeat &&
            selectedObj?.type === "swatch"
          ) {
            promoteToRamp(selected, 11);
          }
          break;

        case "c": {
          if (e.metaKey || e.ctrlKey || e.repeat) break;
          const colorC = getSelectedColor();
          if (colorC) {
            const value = toHex(colorC);
            navigator.clipboard.writeText(value).catch(() => {});
          }
          break;
        }

        case "o": {
          if (e.metaKey || e.ctrlKey || e.repeat) break;
          const colorO = getSelectedColor();
          if (colorO) {
            const value = toOklchString(colorO);
            navigator.clipboard.writeText(value).catch(() => {});
          }
          break;
        }

        case "h":
          if (!e.metaKey && !e.ctrlKey && !e.repeat) {
            const selectionKey = state.selectedIds.slice().sort().join(",");
            const ref = lastHarmonyRef.current;

            // Determine if cycling: current selection matches the source or the strip
            const isCycling =
              ref !== null &&
              (ref.sourceKey === selectionKey ||
                (ref.stripIds.length > 0 &&
                  ref.stripIds.slice().sort().join(",") === selectionKey));

            // Source IDs: use originals when cycling, fall back to current
            // selection if source objects have been deleted
            let sourceIds = isCycling ? ref!.sourceIds : state.selectedIds;
            let hues = extractHues(state.objects, sourceIds);
            if (hues.length < 2 && isCycling) {
              // Source objects were deleted — fall back to current selection
              sourceIds = state.selectedIds;
              hues = extractHues(state.objects, sourceIds);
            }
            if (hues.length >= 2) {
              // Cycling: use startAfter to skip to next relationship
              const startAfter = isCycling ? ref!.relationship : undefined;
              const cycleCount = isCycling ? ref!.cycleCount + 1 : 0;

              const result = harmonizeMultiple(hues, startAfter);

              // No-op: already harmonized
              if (result.totalDisplacement < 1) {
                showHarmonizeFeedback({
                  ...result,
                  count: hues.length,
                  alreadyHarmonized: true,
                  camera: state.camera,
                });
                // Update ref so next H press cycles to a different relationship
                lastHarmonyRef.current = {
                  sourceKey: isCycling ? ref!.sourceKey : selectionKey,
                  sourceIds: [...sourceIds],
                  stripIds: isCycling ? ref!.stripIds : [],
                  relationship: result.relationship,
                  cycleCount,
                  pendingCapture: false,
                };
                break;
              }

              // Cycling: reuse the old strip's position; otherwise find clear space
              const replaceIds = isCycling && ref!.stripIds.length > 0
                ? ref!.stripIds
                : undefined;
              let placement: Point;
              if (replaceIds) {
                // Reuse position of the first object in the strip being replaced
                const firstReplace = state.objects[replaceIds[0]];
                placement = firstReplace && "position" in firstReplace
                  ? (firstReplace as { position: Point }).position
                  : findStripPlacement(state.objects, sourceIds, hues.length);
              } else {
                placement = findStripPlacement(state.objects, sourceIds, hues.length);
              }
              harmonizeSelected(result.adjustments, placement, replaceIds);

              // Show feedback above the strip
              showHarmonizeFeedback({
                ...result,
                count: hues.length,
                alreadyHarmonized: false,
                placement,
                camera: state.camera,
              });

              // Track for cycling — stripIds captured by useEffect on next selection change
              lastHarmonyRef.current = {
                sourceKey: isCycling ? ref!.sourceKey : selectionKey,
                sourceIds: [...sourceIds],
                stripIds: [],
                relationship: result.relationship,
                cycleCount,
                pendingCapture: true,
              };
            }
          }
          break;

        case "k":
          if (!e.metaKey && !e.ctrlKey && !e.repeat) {
            if (state.selectedIds.length > 0) {
              toggleLockSelected();
            }
          }
          break;

        case "l":
          if (!e.metaKey && !e.ctrlKey && !e.repeat) {
            // 2+ swatches/ramps selected → create connections
            // Otherwise → toggle connection visibility
            const swatchEndpoints = state.selectedIds.filter((id) => {
              const obj = state.objects[id];
              return obj && (obj.type === "swatch" || obj.type === "ramp");
            });
            if (swatchEndpoints.length >= 2) {
              createConnection();
            } else {
              toggleConnections();
            }
          }
          break;

        case "m":
          if (!e.metaKey && !e.ctrlKey && !e.repeat) {
            setPeekPureMode(true);
          }
          break;

        case "t":
          if (!e.metaKey && !e.ctrlKey && !e.repeat) {
            e.preventDefault();
            const rect = containerRef.current?.getBoundingClientRect();
            const cam = cameraRef.current;
            const mouse = mouseClientPosRef.current;
            const overCanvas =
              !!rect &&
              !!mouse &&
              mouse.x >= rect.left &&
              mouse.x <= rect.right &&
              mouse.y >= rect.top &&
              mouse.y <= rect.bottom;
            const point: Point = overCanvas && rect && mouse
              ? {
                  x: (mouse.x - rect.left - cam.x) / cam.zoom,
                  y: (mouse.y - rect.top - cam.y) / cam.zoom,
                }
              : {
                  x: (window.innerWidth / 2 - (rect?.left ?? 0) - cam.x) / cam.zoom,
                  y: (window.innerHeight / 2 - (rect?.top ?? 0) - cam.y) / cam.zoom,
                };
            handleCreateNote(point);
          }
          break;

        case "=":
        case "+":
          if (
            !e.metaKey &&
            !e.ctrlKey &&
            !e.repeat &&
            selectedObj?.type === "ramp"
          ) {
            changeStopCount(selected, 1);
          }
          break;

        case "-":
          if (
            !e.metaKey &&
            !e.ctrlKey &&
            !e.repeat &&
            selectedObj?.type === "ramp"
          ) {
            changeStopCount(selected, -1);
          }
          break;

        case "a":
          if (e.metaKey || e.ctrlKey) {
            e.preventDefault();
            dispatch({ type: "SELECT_ALL" });
          }
          break;

        case "z":
          if (e.metaKey || e.ctrlKey) {
            e.preventDefault();
            if (e.shiftKey) {
              redo();
            } else {
              undo();
            }
          }
          break;

        case "Delete":
        case "Backspace":
          if (state.selectedIds.length > 0) deleteSelected();
          break;

        case "ArrowUp":
        case "ArrowDown":
        case "ArrowLeft":
        case "ArrowRight": {
          if (!selectedObj || selectedObj.type !== "swatch") break;
          e.preventDefault();
          const sw = selectedObj as Swatch;
          const step = e.shiftKey ? 5 : 1;
          let newColor: OklchColor;
          if (key === "ArrowUp") {
            newColor = { ...sw.color, l: Math.min(0.97, sw.color.l + 0.01 * step) };
          } else if (key === "ArrowDown") {
            newColor = { ...sw.color, l: Math.max(0.06, sw.color.l - 0.01 * step) };
          } else if (key === "ArrowRight") {
            const max = maxChroma(sw.color.l, sw.color.h);
            newColor = { ...sw.color, c: Math.min(max, sw.color.c + 0.005 * step) };
          } else {
            newColor = { ...sw.color, c: Math.max(0, sw.color.c - 0.005 * step) };
          }
          updateSwatchColor(selected, clampToGamut(newColor));
          break;
        }

        case "0":
          if (e.metaKey || e.ctrlKey) {
            e.preventDefault();
            // Fit camera to content bounds (fall back to origin if canvas is empty)
            const allObjects = Object.values(state.objects);
            let cMinX = Infinity, cMinY = Infinity, cMaxX = -Infinity, cMaxY = -Infinity;
            let hasContent = false;
            for (const obj of allObjects) {
              const b = getObjectBounds(obj);
              if (!b) continue;
              hasContent = true;
              cMinX = Math.min(cMinX, b.x);
              cMinY = Math.min(cMinY, b.y);
              cMaxX = Math.max(cMaxX, b.x + b.w);
              cMaxY = Math.max(cMaxY, b.y + b.h);
            }
            if (!hasContent) {
              setCamera({ x: 0, y: 0, zoom: 1 });
            } else {
              const pad = 64;
              const contentW = cMaxX - cMinX + pad * 2;
              const contentH = cMaxY - cMinY + pad * 2;
              const vw = window.innerWidth;
              const vh = window.innerHeight;
              const zoom = Math.min(vw / contentW, vh / contentH, 2);
              const cx = (vw - contentW * zoom) / 2 - (cMinX - pad) * zoom;
              const cy = (vh - contentH * zoom) / 2 - (cMinY - pad) * zoom;
              setCamera({ x: cx, y: cy, zoom });
            }
          }
          break;

        case "?":
          setShowHelp(true);
          break;
      }
    };

    const handleKeyUp = (e: KeyboardEvent) => {
      const key = normalizeShortcutKey(e.key);
      if (key === " ") setSpaceHeld(false);
      if (key === "m") setPeekPureMode(false);
      if (key === "e") setEKeyHeld(false);
      if (key === "i") {
        // Revert if not committed
        const targetId = eyedropperTargetId.current;
        if (!eyedropperCommitted.current && targetId && eyedropperOriginalColor.current) {
          updateSwatchColor(targetId, eyedropperOriginalColor.current);
        }
        setIKeyHeld(false);
        setEyedropperTarget(null);
        eyedropperOriginalColor.current = null;
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    window.addEventListener("keyup", handleKeyUp);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
      window.removeEventListener("keyup", handleKeyUp);
    };
  }, [
    state.selectedIds,
    state.objects,
    state.lightMode,
    toggleLightMode,
    promoteToRamp,
    changeStopCount,
    deleteSelected,
    setCamera,
    harmonizeSelected,
    toggleLockSelected,
    createConnection,
    toggleConnections,
    select,
    undo,
    redo,
    updateSwatchColor,
    dispatch,
    state.camera,
    showHelp,
    setEyedropperTarget,
    handleCreateNote,
  ]);

  // ---- Reset modifier keys on window blur (prevents stuck states) ----
  useEffect(() => {
    const handleBlur = () => {
      setSpaceHeld(false);
      setPeekPureMode(false);
      setEKeyHeld(false);
      // Revert eyedropper on blur
      const targetId = eyedropperTargetId.current;
      if (!eyedropperCommitted.current && targetId && eyedropperOriginalColor.current) {
        updateSwatchColor(targetId, eyedropperOriginalColor.current);
      }
      setIKeyHeld(false);
      setEyedropperTarget(null);
      eyedropperOriginalColor.current = null;
    };
    window.addEventListener("blur", handleBlur);
    return () => window.removeEventListener("blur", handleBlur);
  }, [setEyedropperTarget, updateSwatchColor]);

  // ---- Paste & Drop ----
  const { handleDragOver, handleDrop } = usePasteAndDrop({
    containerRef,
    cameraRef,
    createSwatch,
    addReferenceImage,
  });

  // ---- Are.na import ----
  const arenaImport = useArenaImport({
    addReferenceImages,
    containerRef,
    camera: state.camera,
  });

  // ---- Context menu extract colors handler ----
  const handleExtractColors = useCallback(
    async (imageId: string) => {
      const obj = state.objects[imageId];
      if (!obj || obj.type !== "reference-image") return;
      const img = obj as ReferenceImage;
      const imageData = await dataUrlToImageData(img.dataUrl);
      const result = extractColors(imageData);
      const samples = result.samples.map((s, i) => ({
        color: s.color,
        source: s.source,
        position: {
          x: img.position.x + img.size.width + 16,
          y: img.position.y + i * 56,
        },
      }));
      snapshot();
      if (img.extraction) clearImageExtraction(imageId);
      createExtraction(imageId, samples);
      // Image stays selected so markers stay visible.
      select(imageId);
    },
    [state.objects, createExtraction, clearImageExtraction, select, snapshot],
  );


  // ---- Context menu harmonize handler ----
  const handleHarmonize = useCallback(() => {
    const hues = extractHues(state.objects, state.selectedIds);
    if (hues.length < 2) return;
    const result = harmonizeMultiple(hues);
    if (result.totalDisplacement < 1) {
      showHarmonizeFeedback({ ...result, count: hues.length, alreadyHarmonized: true, camera: state.camera });
      return;
    }
    const placement = findStripPlacement(state.objects, state.selectedIds, hues.length);
    harmonizeSelected(result.adjustments, placement);
    showHarmonizeFeedback({ ...result, count: hues.length, alreadyHarmonized: false, placement, camera: state.camera });
  }, [state.selectedIds, state.objects, harmonizeSelected, state.camera]);

  // ---- Render ----
  const canvasBg = state.lightMode ? "#fff" : "#000";
  const objects = Object.values(state.objects);

  return (
    <>
    <BoardBar boardManager={boardManager} lightMode={state.lightMode} />
    {arenaImport.props && (
      <ArenaImportPrompt {...arenaImport.props} lightMode={state.lightMode} />
    )}
    <CanvasContextMenu
      objects={state.objects}
      selectedIds={state.selectedIds}
      lightMode={state.lightMode}
      camera={state.camera}
      containerRef={containerRef}
      onCreateSwatch={createSwatch}
      onSelect={select}
      onDeleteSelected={deleteSelected}
      onPromoteToRamp={promoteToRamp}
      onHarmonize={handleHarmonize}
      onToggleLock={toggleLockSelected}
      onImportArenaChannel={arenaImport.open}
      onCreateNote={handleCreateNote}
      onExtractColors={handleExtractColors}
      onRemoveRampStop={(id, stopIndex) => {
        snapshot();
        dispatch({ type: "REMOVE_RAMP_STOP", id, stopIndex });
      }}
    >
      <div
        onClick={handleCanvasClick}
        onDragOver={handleDragOver}
        onDrop={handleDrop}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={() => {
          mouseClientPosRef.current = null;
        }}
        style={{
          width: "100vw",
          height: "100vh",
          backgroundColor: canvasBg,
          overflow: "hidden",
          cursor: spaceHeld
            ? isPanning
              ? "grabbing"
              : "grab"
            : eyedropperActive
              ? "crosshair"
              : "default",
          userSelect: "none",
        }}
      >
      <div
        style={{
          transform: `translate(${state.camera.x}px, ${state.camera.y}px) scale(${state.camera.zoom})`,
          transformOrigin: "0 0",
          position: "relative",
          width: 0,
          height: 0,
        }}
      >
        {/* Connection lines — rendered below objects */}
        {state.showConnections && <svg
          style={{
            position: "absolute",
            left: 0,
            top: 0,
            width: "200vw",
            height: "200vh",
            overflow: "visible",
            pointerEvents: "none",
          }}
        >
          {objects
            .filter((obj) => obj.type === "connection")
            .map((obj) => {
              const conn = obj as Connection;
              const fromObj = state.objects[conn.fromId];
              const toObj = state.objects[conn.toId];
              if (
                !fromObj ||
                !toObj ||
                (fromObj.type !== "swatch" && fromObj.type !== "ramp") ||
                (toObj.type !== "swatch" && toObj.type !== "ramp")
              )
                return null;
              return (
                <ConnectionLine
                  key={conn.id}
                  connection={conn}
                  fromObj={fromObj as Swatch | Ramp}
                  toObj={toObj as Swatch | Ramp}
                  lightMode={state.lightMode}
                  selected={state.selectedIds.includes(conn.id)}
                  onSelect={select}
                />
              );
            })}
        </svg>}

        {objects.map((obj) => {
          if (obj.type === "swatch") {
            return (
              <SwatchNode
                key={obj.id}
                swatch={obj as Swatch}
                selected={state.selectedIds.includes(obj.id)}
                zoom={state.camera.zoom}
                lightMode={state.lightMode}
                eKeyHeld={eKeyHeld}
                onSelect={select}
                onMove={(id, x, y) => moveObject(id, { x, y })}
                onMoveSelected={moveSelected}
                onAdjustColor={adjustSwatchColor}
                onUpdateColor={updateSwatchColor}
                onSnapshot={snapshot}
                onDuplicateDrag={duplicateSelected}
                highlighted={hoveredSwatchId === obj.id}
                onHover={setHoveredSwatchId}
              />
            );
          }
          if (obj.type === "ramp") {
            return (
              <RampNode
                key={obj.id}
                ramp={obj as Ramp}
                selected={state.selectedIds.includes(obj.id)}
                zoom={state.camera.zoom}
                lightMode={state.lightMode}
                peekPureMode={peekPureMode}
                onSelect={select}
                onMove={(id, x, y) => moveObject(id, { x, y })}
                onMoveSelected={moveSelected}
                onSnapshot={snapshot}
                onDuplicateDrag={duplicateSelected}
              />
            );
          }
          if (obj.type === "reference-image") {
            return (
              <RefImageNode
                key={obj.id}
                image={obj as ReferenceImage}
                selected={state.selectedIds.includes(obj.id)}
                zoom={state.camera.zoom}
                lightMode={state.lightMode}
                eyedropperActive={eyedropperActive}
                onSelect={select}
                onMove={(id, x, y) => moveObject(id, { x, y })}
                onMoveSelected={moveSelected}
                onSnapshot={snapshot}
                onDuplicateDrag={duplicateSelected}
                objects={state.objects}
                selectedIds={state.selectedIds}
                sampleCache={eyedropperCanvasCache}
                camera={state.camera}
                containerRef={containerRef}
                onMoveExtractionMarker={moveExtractionMarker}
                onLoupeUpdate={setLoupeState}
                hoveredSwatchId={hoveredSwatchId}
                onHoverMarker={setHoveredSwatchId}
              />
            );
          }
          if (obj.type === "note") {
            return (
              <NoteNode
                key={obj.id}
                note={obj as Note}
                selected={state.selectedIds.includes(obj.id)}
                suppressSelectedTint={suppressedNoteTintId === obj.id}
                editing={editingNoteId === obj.id}
                zoom={state.camera.zoom}
                lightMode={state.lightMode}
                onSelect={select}
                onMove={(id, x, y) => moveObject(id, { x, y })}
                onMoveSelected={moveSelected}
                onSnapshot={snapshot}
                onDuplicateDrag={duplicateSelected}
                onTextChange={handleNoteTextChange}
                onCommit={handleNoteCommit}
                onStartEdit={handleNoteStartEdit}
                onShowSelectedTint={handleShowNoteSelectedTint}
              />
            );
          }
          return null;
        })}
      </div>

      </div>
      {marqueeRect && (
        <div
          style={{
            position: "fixed",
            left: Math.min(marqueeRect.x1, marqueeRect.x2),
            top: Math.min(marqueeRect.y1, marqueeRect.y2),
            width: Math.abs(marqueeRect.x2 - marqueeRect.x1),
            height: Math.abs(marqueeRect.y2 - marqueeRect.y1),
            border: `1px solid ${state.lightMode ? "#000" : "#fff"}`,
            pointerEvents: "none",
            zIndex: 9999,
          }}
        />
      )}
      {showHelp && (
        <HelpOverlay
          lightMode={state.lightMode}
          onDismiss={() => setShowHelp(false)}
        />
      )}
      <HarmonizeOverlay />
      {loupeState && (
        <ExtractionLoupe
          clientX={loupeState.clientX}
          clientY={loupeState.clientY}
          sampleCanvasCtx={
            eyedropperCanvasCache.get(loupeState.imageId) ?? null
          }
          samplePixel={loupeState.samplePixel}
          color={loupeState.color}
        />
      )}
    </CanvasContextMenu>
    </>
  );
}
