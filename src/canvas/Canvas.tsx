import { useCallback, useRef, useEffect, useState } from "react";
import { useCanvasState } from "../state/canvas";
import { SwatchNode, RampNode, RefImageNode } from "../components/SwatchNode";
import {
  extractColors,
  imageFileToImageData,
  fileToDataUrl,
} from "../engine/extract";
import { CanvasContextMenu } from "../components/ContextMenu";
import { harmonizeMultiple } from "../engine/harmonize";
import {
  toHex,
  toOklchString,
  parseColor,
  clampToGamut,
  maxChroma,
} from "../engine/gamut";
import { ConnectionLine } from "../components/ConnectionLine";
import { HelpOverlay } from "../components/HelpOverlay";
import { HarmonizeOverlay, showHarmonizeFeedback } from "../components/HarmonizeLabel";
import type { Swatch, Ramp, Connection, Point, OklchColor, HarmonicRelationship, CanvasObject, ReferenceImage } from "../types";
import { oklch } from "culori";

/** Bounding box of a canvas object (canvas space) */
function getObjectBounds(obj: CanvasObject): { x: number; y: number; w: number; h: number } | null {
  if (obj.type === "swatch") return { x: obj.position.x, y: obj.position.y, w: 48, h: 48 };
  if (obj.type === "ramp") return { x: obj.position.x, y: obj.position.y, w: (obj as Ramp).stops.length * 48, h: 48 };
  if (obj.type === "reference-image") {
    const img = obj as import("../types").ReferenceImage;
    return { x: img.position.x, y: img.position.y, w: img.size.width, h: img.size.height };
  }
  return null; // connections have no bounds
}

/** Check if two rectangles overlap (with padding) */
function rectsOverlap(
  a: { x: number; y: number; w: number; h: number },
  b: { x: number; y: number; w: number; h: number },
  pad: number,
): boolean {
  return !(
    a.x + a.w + pad <= b.x ||
    b.x + b.w + pad <= a.x ||
    a.y + a.h + pad <= b.y ||
    b.y + b.h + pad <= a.y
  );
}

/**
 * Find a clear position for a new vertical strip of swatches.
 * Starts to the right of the selected objects, scans rightward until no collisions.
 */
function findStripPlacement(
  objects: Record<string, CanvasObject>,
  selectedIds: string[],
  stripCount: number,
): Point {
  const stripW = 48;
  const stripH = stripCount * 48 + (stripCount - 1) * 8;
  const padding = 40; // gap between strip and nearest object

  // Get bounding box of selected objects
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const id of selectedIds) {
    const b = getObjectBounds(objects[id]);
    if (!b) continue;
    minX = Math.min(minX, b.x);
    minY = Math.min(minY, b.y);
    maxX = Math.max(maxX, b.x + b.w);
    maxY = Math.max(maxY, b.y + b.h);
  }

  // Vertical center of the selection
  const selCenterY = (minY + maxY) / 2;
  const startY = selCenterY - stripH / 2;

  // Collect all existing object bounds
  const allBounds = Object.values(objects)
    .map(getObjectBounds)
    .filter((b): b is NonNullable<typeof b> => b !== null);

  // Start to the right of selection, scan rightward
  let x = maxX + padding;
  for (let attempt = 0; attempt < 20; attempt++) {
    const candidate = { x, y: startY, w: stripW, h: stripH };
    const collision = allBounds.some((b) => rectsOverlap(candidate, b, padding / 2));
    if (!collision) return { x, y: startY };
    x += 80; // step rightward
  }

  // Fallback: just place it far right
  return { x, y: startY };
}

/** Prime an offscreen canvas for pixel sampling from a reference image */
/** Extract hues with locked flag from selected objects */
function extractHues(
  objects: Record<string, CanvasObject>,
  ids: string[],
): { id: string; hue: number; locked?: boolean }[] {
  return ids
    .map((id) => {
      const o = objects[id];
      if (!o || (o.type !== "swatch" && o.type !== "ramp")) return null;
      return {
        id,
        hue: o.type === "swatch" ? (o as Swatch).color.h : (o as Ramp).seedHue,
        locked: (o as Swatch | Ramp).locked,
      };
    })
    .filter((h): h is NonNullable<typeof h> => h !== null);
}

function primeImageCanvas(
  image: ReferenceImage,
  cache: Map<string, CanvasRenderingContext2D>,
) {
  if (cache.has(image.id)) return;
  if (!image.dataUrl) return; // skip images with expired/empty URLs
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

/** Sample the pixel color at a viewport position from reference images */
function samplePixelAt(
  clientX: number,
  clientY: number,
  containerRect: DOMRect,
  camera: { x: number; y: number; zoom: number },
  objects: Record<string, CanvasObject>,
  cache: Map<string, CanvasRenderingContext2D>,
): OklchColor | null {
  const canvasX = (clientX - containerRect.left - camera.x) / camera.zoom;
  const canvasY = (clientY - containerRect.top - camera.y) / camera.zoom;

  for (const obj of Object.values(objects)) {
    if (obj.type !== "reference-image") continue;
    const img = obj as ReferenceImage;
    const localX = canvasX - img.position.x;
    const localY = canvasY - img.position.y;
    if (localX < 0 || localY < 0 || localX >= img.size.width || localY >= img.size.height) continue;

    const ctx = cache.get(img.id);
    if (!ctx) continue;

    const pixel = ctx.getImageData(Math.floor(localX), Math.floor(localY), 1, 1).data;
    const result = oklch({ mode: "rgb", r: pixel[0] / 255, g: pixel[1] / 255, b: pixel[2] / 255 });
    if (!result) continue;
    return { l: result.l ?? 0, c: result.c ?? 0, h: result.h ?? 0 };
  }
  return null;
}

export function Canvas() {
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
    createSwatches,
    addReferenceImage,
    promoteToRamp,
    changeStopCount,
    harmonizeSelected,
    toggleLockSelected,
    createConnection,
    toggleConnections,
    setCamera,
    toggleDarkMode,
    snapshot,
    undo,
    redo,
  } = useCanvasState();

  const containerRef = useRef<HTMLDivElement>(null);
  const [spaceHeld, setSpaceHeld] = useState(false);
  const [peekPureMode, setPeekPureMode] = useState(false);
  const [eKeyHeld, setEKeyHeld] = useState(false);
  const [iKeyHeld, setIKeyHeld] = useState(false);
  const [showHelp, setShowHelp] = useState(false);
  const isPanning = useRef(false);
  const panStart = useRef<Point>({ x: 0, y: 0 });
  const cameraStart = useRef(state.camera);

  // ---- Eyedropper state ----
  const eyedropperOriginalColor = useRef<OklchColor | null>(null);
  const eyedropperCommitted = useRef(false);
  const eyedropperTargetId = useRef<string | null>(null);
  const eyedropperCanvasCache = useRef<Map<string, CanvasRenderingContext2D>>(new Map());

  const cameraRef = useRef(state.camera);
  cameraRef.current = state.camera;

  const selectedIdsRef = useRef(state.selectedIds);
  selectedIdsRef.current = state.selectedIds;

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
    const cache = eyedropperCanvasCache.current;
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
  }, [state.objects]);

  // ---- Canvas click → deselect only (+ eyedropper commit) ----
  const handleCanvasClick = useCallback(
    (e: React.MouseEvent) => {
      // Eyedropper: commit sampled color on click
      if (iKeyHeld && eyedropperTargetId.current) {
        const rect = containerRef.current?.getBoundingClientRect();
        if (rect) {
          const color = samplePixelAt(
            e.clientX, e.clientY, rect, cameraRef.current,
            state.objects, eyedropperCanvasCache.current,
          );
          if (color) {
            snapshot();
            updateSwatchColor(eyedropperTargetId.current, color);
            eyedropperCommitted.current = true;
          }
        }
        return; // never deselect during eyedropper
      }

      if (isPanning.current) return;
      const target = e.target as HTMLElement;
      if (target.closest(".swatch-node, .ramp-node, .ref-image-node")) return;

      if (state.selectedIds.length > 0) {
        deselectAll();
      }
    },
    [state.camera, state.selectedIds, state.objects, deselectAll, iKeyHeld, snapshot, updateSwatchColor],
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
        isPanning.current = true;
        panStart.current = { x: e.clientX, y: e.clientY };
        cameraStart.current = { ...cameraRef.current };
        e.preventDefault();
      }
    },
    [spaceHeld, iKeyHeld],
  );

  const handleMouseMove = useCallback(
    (e: React.MouseEvent) => {
      // Eyedropper: live preview
      if (iKeyHeld && eyedropperTargetId.current) {
        const rect = containerRef.current?.getBoundingClientRect();
        if (rect) {
          const color = samplePixelAt(
            e.clientX, e.clientY, rect, cameraRef.current,
            state.objects, eyedropperCanvasCache.current,
          );
          if (color) {
            updateSwatchColor(eyedropperTargetId.current, color);
          } else if (eyedropperOriginalColor.current) {
            // Off image — revert to original
            updateSwatchColor(eyedropperTargetId.current, eyedropperOriginalColor.current);
          }
        }
        return;
      }

      if (isPanning.current) {
        const dx = e.clientX - panStart.current.x;
        const dy = e.clientY - panStart.current.y;
        setCamera({
          x: cameraStart.current.x + dx,
          y: cameraStart.current.y + dy,
          zoom: cameraStart.current.zoom,
        });
      }
    },
    [setCamera, iKeyHeld, state.objects, updateSwatchColor],
  );

  const handleMouseUp = useCallback(() => {
    setTimeout(() => {
      isPanning.current = false;
    }, 50);
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

      if (e.key === " " && !e.repeat) {
        e.preventDefault();
        setSpaceHeld(true);
        return;
      }

      if (e.key === "e" && !e.repeat && !e.metaKey && !e.ctrlKey) {
        setEKeyHeld(true);
        return;
      }

      if (e.key === "i" && !e.repeat && !e.metaKey && !e.ctrlKey) {
        // Store original color for revert on cancel
        const targetId = state.selectedIds[0];
        const targetObj = targetId ? state.objects[targetId] : null;
        if (targetObj?.type === "swatch") {
          eyedropperTargetId.current = targetId;
          eyedropperOriginalColor.current = { ...(targetObj as Swatch).color };
          eyedropperCommitted.current = false;
        } else {
          eyedropperTargetId.current = null;
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
          return state.darkMode ? anchor.darkColor : anchor.color;
        }
        return null;
      };

      switch (e.key) {
        case "d":
          if (!e.metaKey && !e.ctrlKey && !e.repeat) toggleDarkMode();
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
            const allIds = Object.keys(state.objects).filter(
              (id) => state.objects[id].type !== "connection",
            );
            // Select all by dispatching multiple selects is awkward,
            // so we'll just select all non-connection objects
            for (let i = 0; i < allIds.length; i++) {
              select(allIds[i], i > 0);
            }
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
          if (e.key === "ArrowUp") {
            newColor = { ...sw.color, l: Math.min(0.97, sw.color.l + 0.01 * step) };
          } else if (e.key === "ArrowDown") {
            newColor = { ...sw.color, l: Math.max(0.06, sw.color.l - 0.01 * step) };
          } else if (e.key === "ArrowRight") {
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
      if (e.key === " ") setSpaceHeld(false);
      if (e.key === "m") setPeekPureMode(false);
      if (e.key === "e") setEKeyHeld(false);
      if (e.key === "i") {
        // Revert if not committed
        if (!eyedropperCommitted.current && eyedropperTargetId.current && eyedropperOriginalColor.current) {
          updateSwatchColor(eyedropperTargetId.current, eyedropperOriginalColor.current);
        }
        setIKeyHeld(false);
        eyedropperTargetId.current = null;
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
    state.darkMode,
    toggleDarkMode,
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
    showHelp,
  ]);

  // ---- Reset modifier keys on window blur (prevents stuck states) ----
  const updateSwatchColorRef = useRef(updateSwatchColor);
  updateSwatchColorRef.current = updateSwatchColor;

  useEffect(() => {
    const handleBlur = () => {
      setSpaceHeld(false);
      setPeekPureMode(false);
      setEKeyHeld(false);
      // Revert eyedropper on blur
      if (!eyedropperCommitted.current && eyedropperTargetId.current && eyedropperOriginalColor.current) {
        updateSwatchColorRef.current(eyedropperTargetId.current, eyedropperOriginalColor.current);
      }
      setIKeyHeld(false);
      eyedropperTargetId.current = null;
      eyedropperOriginalColor.current = null;
    };
    window.addEventListener("blur", handleBlur);
    return () => window.removeEventListener("blur", handleBlur);
  }, []);

  // ---- Drop handler (images) ----
  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = "copy";
  }, []);

  const handleDrop = useCallback(
    async (e: React.DragEvent) => {
      e.preventDefault();

      const file = e.dataTransfer.files[0];
      if (!file || !file.type.startsWith("image/")) return;

      const rect = containerRef.current?.getBoundingClientRect();
      if (!rect) return;
      const cam = cameraRef.current;
      const dropX = (e.clientX - rect.left - cam.x) / cam.zoom;
      const dropY = (e.clientY - rect.top - cam.y) / cam.zoom;

      // Load image and extract colors
      const [imageData, dataUrl] = await Promise.all([
        imageFileToImageData(file),
        fileToDataUrl(file),
      ]);

      // Add reference image to canvas (display at reasonable size)
      const displayWidth = 200;
      const img = new Image();
      img.src = dataUrl;
      await new Promise((r) => {
        img.onload = r;
      });
      const aspectRatio = img.naturalHeight / img.naturalWidth;
      const displayHeight = Math.round(displayWidth * aspectRatio);

      addReferenceImage(
        file,
        dataUrl,
        { x: dropX, y: dropY },
        { width: displayWidth, height: displayHeight },
      );

      // Extract colors and place swatches beside the image
      const result = extractColors(imageData);
      const swatches = result.colors.map((color, i) => ({
        position: { x: dropX + displayWidth + 16, y: dropY + i * 56 },
        color,
      }));

      createSwatches(swatches);
    },
    [addReferenceImage, createSwatches],
  );

  // ---- Paste handler (text colors + images) ----
  useEffect(() => {
    const handler = async (e: ClipboardEvent) => {
      if (
        e.target instanceof HTMLInputElement ||
        e.target instanceof HTMLTextAreaElement
      )
        return;

      const rect = containerRef.current?.getBoundingClientRect();
      if (!rect) return;
      const cam = cameraRef.current;
      const cx = (rect.width / 2 - cam.x) / cam.zoom;
      const cy = (rect.height / 2 - cam.y) / cam.zoom;

      // Check for image in clipboard (e.g., copied from a website)
      const items = e.clipboardData?.items;
      if (items) {
        for (const item of Array.from(items)) {
          if (item.type.startsWith("image/")) {
            e.preventDefault();
            const file = item.getAsFile();
            if (!file) return;

            const [imageData, dataUrl] = await Promise.all([
              imageFileToImageData(file),
              fileToDataUrl(file),
            ]);

            const img = new Image();
            img.src = dataUrl;
            await new Promise((r) => {
              img.onload = r;
            });
            const displayWidth = Math.min(300, img.naturalWidth);
            const aspectRatio = img.naturalHeight / img.naturalWidth;
            const displayHeight = Math.round(displayWidth * aspectRatio);

            addReferenceImage(
              file,
              dataUrl,
              { x: cx, y: cy },
              { width: displayWidth, height: displayHeight },
            );

            const result = extractColors(imageData);
            const swatches = result.colors.map((color, i) => ({
              position: { x: cx + displayWidth + 16, y: cy + i * 56 },
              color,
            }));
            createSwatches(swatches);
            return;
          }
        }
      }

      // Fall back to text color
      const text = e.clipboardData?.getData("text");
      if (!text) return;

      const color = parseColor(text.trim());
      if (color) {
        e.preventDefault();
        createSwatch({ x: cx, y: cy }, color);
      }
    };

    window.addEventListener("paste", handler);
    return () => window.removeEventListener("paste", handler);
  }, [createSwatch, createSwatches, addReferenceImage]);

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
  }, [state.selectedIds, state.objects, harmonizeSelected]);

  // ---- Render ----
  const canvasBg = state.darkMode ? "#fff" : "#000";
  const objects = Object.values(state.objects);

  return (
    <CanvasContextMenu
      objects={state.objects}
      selectedIds={state.selectedIds}
      darkMode={state.darkMode}
      camera={state.camera}
      containerRef={containerRef}
      onCreateSwatch={createSwatch}
      onSelect={select}
      onDeleteSelected={deleteSelected}
      onPromoteToRamp={promoteToRamp}
      onHarmonize={handleHarmonize}
      onToggleLock={toggleLockSelected}
    >
      <div
        onClick={handleCanvasClick}
        onDragOver={handleDragOver}
        onDrop={handleDrop}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        style={{
          width: "100vw",
          height: "100vh",
          backgroundColor: canvasBg,
          overflow: "hidden",
          cursor: spaceHeld
            ? isPanning.current
              ? "grabbing"
              : "grab"
            : iKeyHeld && eyedropperTargetId.current
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
                  darkMode={state.darkMode}
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
                darkMode={state.darkMode}
                eKeyHeld={eKeyHeld}
                onSelect={select}
                onMove={(id, x, y) => moveObject(id, { x, y })}
                onMoveSelected={moveSelected}
                onAdjustColor={adjustSwatchColor}
                onUpdateColor={updateSwatchColor}
                onSnapshot={snapshot}
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
                darkMode={state.darkMode}
                peekPureMode={peekPureMode}
                onSelect={select}
                onMove={(id, x, y) => moveObject(id, { x, y })}
                onMoveSelected={moveSelected}
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
                darkMode={state.darkMode}
                eyedropperActive={iKeyHeld && !!eyedropperTargetId.current}
                onSelect={select}
                onMove={(id, x, y) => moveObject(id, { x, y })}
                onMoveSelected={moveSelected}
              />
            );
          }
          return null;
        })}
      </div>

      </div>
      {showHelp && (
        <HelpOverlay
          darkMode={state.darkMode}
          onDismiss={() => setShowHelp(false)}
        />
      )}
      <HarmonizeOverlay />
    </CanvasContextMenu>
  );
}
