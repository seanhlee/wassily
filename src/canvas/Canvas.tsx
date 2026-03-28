import { useCallback, useRef, useEffect, useState } from "react";
import { useCanvasState } from "../state/canvas";
import { SwatchNode, RampNode } from "../components/SwatchNode";
import { toHex, toOklchString, parseColor } from "../engine/gamut";
import type { Swatch, Ramp, Point } from "../types";

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
    promoteToRamp,
    harmonizeSelected,
    setCamera,
    toggleDarkMode,
  } = useCanvasState();

  const containerRef = useRef<HTMLDivElement>(null);
  const [spaceHeld, setSpaceHeld] = useState(false);
  const isPanning = useRef(false);
  const panStart = useRef<Point>({ x: 0, y: 0 });
  const cameraStart = useRef(state.camera);

  const cameraRef = useRef(state.camera);
  cameraRef.current = state.camera;

  // ---- Canvas click → create swatch or deselect ----
  const handleCanvasClick = useCallback(
    (e: React.MouseEvent) => {
      if (isPanning.current) return;
      const target = e.target as HTMLElement;
      if (target.closest(".swatch-node, .ramp-node")) return;

      const rect = containerRef.current?.getBoundingClientRect();
      if (!rect) return;

      const canvasX =
        (e.clientX - rect.left - state.camera.x) / state.camera.zoom;
      const canvasY =
        (e.clientY - rect.top - state.camera.y) / state.camera.zoom;

      if (state.selectedIds.length > 0) {
        deselectAll();
      } else {
        createSwatch({ x: canvasX, y: canvasY });
      }
    },
    [state.camera, state.selectedIds, createSwatch, deselectAll],
  );

  // ---- Wheel: pinch-to-zoom + two-finger-pan + hue rotation ----
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    const handler = (e: WheelEvent) => {
      e.preventDefault();

      // Check if hovering a swatch or ramp — rotate hue
      const target = e.target as HTMLElement;
      const swatchEl = target.closest(".swatch-node");
      const rampEl = target.closest(".ramp-node");

      if (swatchEl || rampEl) {
        const objEl = swatchEl || rampEl;
        // Find the object id from the rendered elements
        const id = findObjectIdFromElement(objEl as HTMLElement);
        if (id) {
          const delta = e.deltaY > 0 ? -3 : 3;
          rotateHue(id, delta);
          return;
        }
      }

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
  }, [setCamera, rotateHue]);

  // Helper: find object ID from a DOM element (uses data attribute)
  function findObjectIdFromElement(el: HTMLElement): string | null {
    return el.getAttribute("data-object-id");
  }

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
              harmonizeSelected();
            }
          }
          break;

        case "Delete":
        case "Backspace":
          if (state.selectedIds.length > 0) deleteSelected();
          break;

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
    deleteSelected,
    setCamera,
    harmonizeSelected,
  ]);

  // ---- Paste handler ----
  useEffect(() => {
    const handler = (e: ClipboardEvent) => {
      if (
        e.target instanceof HTMLInputElement ||
        e.target instanceof HTMLTextAreaElement
      )
        return;

      const text = e.clipboardData?.getData("text");
      if (!text) return;

      const color = parseColor(text.trim());
      if (color) {
        e.preventDefault();
        const rect = containerRef.current?.getBoundingClientRect();
        if (!rect) return;
        const cam = cameraRef.current;
        const cx = (rect.width / 2 - cam.x) / cam.zoom;
        const cy = (rect.height / 2 - cam.y) / cam.zoom;
        createSwatch({ x: cx, y: cy }, color);
      }
    };

    window.addEventListener("paste", handler);
    return () => window.removeEventListener("paste", handler);
  }, [createSwatch]);

  // ---- Render ----
  const canvasBg = state.darkMode ? "oklch(0.98 0 0)" : "oklch(0.13 0 0)";
  const objects = Object.values(state.objects);

  return (
    <div
      ref={containerRef}
      onClick={handleCanvasClick}
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
                onSelect={select}
                onMove={(id, x, y) => moveObject(id, { x, y })}
                onMoveSelected={moveSelected}
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
  );
}
