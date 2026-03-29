import { useCallback, useRef, useEffect, useState } from "react";
import { useCanvasState } from "../state/canvas";
import { SwatchNode, RampNode, RefImageNode } from "../components/SwatchNode";
import {
  extractColors,
  imageFileToImageData,
  fileToDataUrl,
} from "../engine/extract";
import { useContextMenu, ContextMenuOverlay } from "../components/ContextMenu";
import { showHarmonizeFeedback } from "../components/HarmonizeLabel";
import { harmonizeMultiple } from "../engine/harmonize";
import {
  toHex,
  toOklchString,
  parseColor,
  clampToGamut,
  maxChroma,
} from "../engine/gamut";
import type { Swatch, Ramp, Point, OklchColor } from "../types";

export function Canvas() {
  const {
    state,
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
    snapshot,
    undo,
    redo,
  } = useCanvasState();

  const containerRef = useRef<HTMLDivElement>(null);
  const [spaceHeld, setSpaceHeld] = useState(false);
  const [peekPureMode, setPeekPureMode] = useState(false);
  const [eKeyHeld, setEKeyHeld] = useState(false);
  const isPanning = useRef(false);
  const panStart = useRef<Point>({ x: 0, y: 0 });
  const cameraStart = useRef(state.camera);

  const cameraRef = useRef(state.camera);
  cameraRef.current = state.camera;

  const selectedIdsRef = useRef(state.selectedIds);
  selectedIdsRef.current = state.selectedIds;

  // ---- Canvas click → deselect only ----
  const handleCanvasClick = useCallback(
    (e: React.MouseEvent) => {
      if (isPanning.current) return;
      const target = e.target as HTMLElement;
      if (target.closest(".swatch-node, .ramp-node, .ref-image-node")) return;

      if (state.selectedIds.length > 0) {
        deselectAll();
      }
    },
    [state.camera, state.selectedIds, deselectAll],
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
        // Scroll on selected swatch → hue rotation
        const swatchEl = (e.target as HTMLElement).closest(".swatch-node");
        if (swatchEl) {
          const objId = swatchEl.getAttribute("data-object-id");
          if (objId && selectedIdsRef.current.includes(objId)) {
            const delta = e.deltaY * (e.altKey ? 0.1 : 0.5);
            rotateHue(objId, delta);
            return;
          }
        }

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
  }, [setCamera, rotateHue]);

  // ---- Space+drag → pan ----
  const handleMouseDown = useCallback(
    (e: React.MouseEvent) => {
      if (spaceHeld) {
        isPanning.current = true;
        panStart.current = { x: e.clientX, y: e.clientY };
        cameraStart.current = { ...cameraRef.current };
        e.preventDefault();
      }
    },
    [spaceHeld],
  );

  const handleMouseMove = useCallback(
    (e: React.MouseEvent) => {
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
    [setCamera],
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

      if (e.key === " " && !e.repeat) {
        e.preventDefault();
        setSpaceHeld(true);
        return;
      }

      if (e.key === "e" && !e.repeat && !e.metaKey && !e.ctrlKey) {
        setEKeyHeld(true);
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
            if (state.selectedIds.length >= 2) {
              // Compute the result to show feedback
              const hues = state.selectedIds
                .map((id) => {
                  const o = state.objects[id];
                  if (!o || (o.type !== "swatch" && o.type !== "ramp"))
                    return null;
                  return {
                    id,
                    hue:
                      o.type === "swatch"
                        ? (o as Swatch).color.h
                        : (o as Ramp).seedHue,
                  };
                })
                .filter((h): h is NonNullable<typeof h> => h !== null);
              if (hues.length >= 2) {
                const result = harmonizeMultiple(hues);
                showHarmonizeFeedback({
                  relationship: result.relationship,
                  angle: result.angle,
                });
              }
              harmonizeSelected();
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
            setCamera({ x: 0, y: 0, zoom: 1 });
          }
          break;
      }
    };

    const handleKeyUp = (e: KeyboardEvent) => {
      if (e.key === " ") setSpaceHeld(false);
      if (e.key === "m") setPeekPureMode(false);
      if (e.key === "e") setEKeyHeld(false);
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
    select,
    undo,
    redo,
    updateSwatchColor,
  ]);

  // ---- Reset modifier keys on window blur (prevents stuck states) ----
  useEffect(() => {
    const handleBlur = () => {
      setSpaceHeld(false);
      setPeekPureMode(false);
      setEKeyHeld(false);
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

  // ---- Context menu ----
  const { menu, handleContextMenu } = useContextMenu({
    objects: state.objects,
    selectedIds: state.selectedIds,
    darkMode: state.darkMode,
    camera: state.camera,
    onCreateSwatch: createSwatch,
    onSelect: select,
    onDeleteSelected: deleteSelected,
    onPromoteToRamp: promoteToRamp,
    onHarmonize: harmonizeSelected,
    containerRef,
  });

  // ---- Render ----
  const canvasBg = state.darkMode ? "#fff" : "#000";
  const objects = Object.values(state.objects);

  return (
    <div
      ref={containerRef}
      onClick={handleCanvasClick}
      onContextMenu={handleContextMenu}
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
                image={obj as import("../types").ReferenceImage}
                selected={state.selectedIds.includes(obj.id)}
                zoom={state.camera.zoom}
                darkMode={state.darkMode}
                onSelect={select}
                onMove={(id, x, y) => moveObject(id, { x, y })}
                onMoveSelected={moveSelected}
              />
            );
          }
          return null;
        })}
      </div>

      <ContextMenuOverlay menu={menu} />
    </div>
  );
}
