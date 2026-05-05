/**
 * Canvas context menu built on Base UI.
 *
 * Base UI handles all the hard parts: positioning at cursor, portal rendering,
 * dismissal (click outside, Escape, item click), keyboard navigation.
 * We just provide the styling and context-aware menu items.
 */

import { useState, useCallback } from "react";
import { ContextMenu } from "@base-ui/react/context-menu";
import type {
  CanvasObject,
  Swatch,
  Ramp,
  RampStop,
  Camera,
  Point,
  ReferenceImage,
} from "../types";
import { FONT, FONT_SIZE } from "../constants";
import { toHex, toOklchString } from "../engine/gamut";

// ---- Clipboard helper ----
// navigator.clipboard.writeText can fail in custom context menus (user gesture
// chain breaks through portals). Fall back to execCommand.
function copyText(text: string) {
  navigator.clipboard.writeText(text).catch(() => {
    const el = document.createElement("textarea");
    el.value = text;
    el.style.position = "fixed";
    el.style.opacity = "0";
    document.body.appendChild(el);
    el.select();
    document.execCommand("copy");
    document.body.removeChild(el);
  });
}

// ---- Menu context types ----

type MenuContext =
  | { type: "canvas"; canvasPos: Point }
  | { type: "multi-selection"; anyUnlocked: boolean }
  | { type: "swatch"; objectId: string; swatch: Swatch }
  | { type: "ramp"; objectId: string; ramp: Ramp }
  | { type: "ramp-stop"; objectId: string; ramp: Ramp; stop: RampStop }
  | { type: "image"; objectId: string }
  | null;

// ---- Styles ----

function getPopupStyle(lightMode: boolean): React.CSSProperties {
  return {
    backgroundColor: lightMode ? "#fff" : "#000",
    border: lightMode
      ? "1px solid rgba(0,0,0,0.12)"
      : "1px solid rgba(255,255,255,0.15)",
    padding: "3px 0",
    fontFamily: FONT,
    fontSize: FONT_SIZE,
    textTransform: "uppercase",
    letterSpacing: "0.5px",
    outline: "none",
  };
}

function getItemStyle(lightMode: boolean, state: { highlighted: boolean }): React.CSSProperties {
  return {
    padding: "3px 10px",
    cursor: "default",
    color: lightMode
      ? (state.highlighted ? "#000" : "rgba(0,0,0,0.55)")
      : (state.highlighted ? "#fff" : "rgba(255,255,255,0.6)"),
    backgroundColor: state.highlighted
      ? (lightMode ? "rgba(0,0,0,0.06)" : "rgba(255,255,255,0.08)")
      : "transparent",
    whiteSpace: "nowrap",
    outline: "none",
  };
}

function getSeparatorStyle(lightMode: boolean): React.CSSProperties {
  return {
    height: 1,
    backgroundColor: lightMode ? "rgba(0,0,0,0.08)" : "rgba(255,255,255,0.1)",
    margin: "2px 0",
  };
}

// ---- Props ----

interface CanvasContextMenuProps {
  objects: Record<string, CanvasObject>;
  selectedIds: string[];
  lightMode: boolean;
  camera: Camera;
  containerRef: React.RefObject<HTMLDivElement | null>;
  onCreateSwatch: (position: Point, color?: { l: number; c: number; h: number }) => void;
  onSelect: (id: string, additive?: boolean) => void;
  onDeleteSelected: () => void;
  onPromoteToRamp: (id: string, stopCount: number) => void;
  onHarmonize: () => void;
  onToggleLock: () => void;
  onExtractColors?: (imageId: string) => void;
  onRemoveRampStop?: (rampId: string, stopIndex: number) => void;
  children: React.ReactNode;
}

// ---- Component ----

export function CanvasContextMenu({
  objects,
  selectedIds,
  lightMode,
  camera,
  containerRef,
  onCreateSwatch,
  onSelect,
  onDeleteSelected,
  onPromoteToRamp,
  onHarmonize,
  onToggleLock,
  onExtractColors,
  onRemoveRampStop,
  children,
}: CanvasContextMenuProps) {
  const [ctx, setCtx] = useState<MenuContext>(null);

  const handleOpenChange = useCallback(
    (open: boolean, details: { event: Event }) => {
      if (!open) {
        setCtx(null);
        return;
      }

      const nativeEvent = details.event as MouseEvent | undefined;
      if (!nativeEvent) return;

      const target = nativeEvent.target as HTMLElement;
      const swatchEl = target.closest(".swatch-node");
      const rampEl = target.closest(".ramp-node");
      const imageEl = target.closest(".ref-image-node");
      const objectEl = swatchEl || rampEl || imageEl;
      const objectId = objectEl?.getAttribute("data-object-id") ?? null;
      const obj = objectId ? objects[objectId] : null;

      // Detect stop-level right-click on ramp
      const stopEl = target.closest("[data-stop-index]");
      const stopIndex = stopEl?.getAttribute("data-stop-index");

      // Selection logic: if right-clicked object isn't selected, replace selection
      let effectiveSelectedIds = selectedIds;
      if (objectId && !selectedIds.includes(objectId)) {
        onSelect(objectId);
        effectiveSelectedIds = [objectId];
      }

      if (!obj) {
        // Empty canvas
        const rect = containerRef.current?.getBoundingClientRect();
        if (rect) {
          const canvasX = (nativeEvent.clientX - rect.left - camera.x) / camera.zoom;
          const canvasY = (nativeEvent.clientY - rect.top - camera.y) / camera.zoom;
          setCtx({ type: "canvas", canvasPos: { x: canvasX, y: canvasY } });
        }
      } else {
        const harmonizableCount = effectiveSelectedIds.filter((id) => {
          const o = objects[id];
          return o && (o.type === "swatch" || o.type === "ramp");
        }).length;

        if (harmonizableCount >= 2) {
          const anyUnlocked = effectiveSelectedIds.some((id) => {
            const o = objects[id];
            return o && (o.type === "swatch" || o.type === "ramp") && !(o as Swatch | Ramp).locked;
          });
          setCtx({ type: "multi-selection", anyUnlocked });
        } else if (obj.type === "swatch") {
          setCtx({ type: "swatch", objectId: objectId!, swatch: obj as Swatch });
        } else if (obj.type === "ramp" && stopIndex != null) {
          const ramp = obj as Ramp;
          const idx = parseInt(stopIndex, 10);
          const stop = ramp.stops[idx];
          if (stop) {
            setCtx({ type: "ramp-stop", objectId: objectId!, ramp, stop });
          } else {
            setCtx({ type: "ramp", objectId: objectId!, ramp });
          }
        } else if (obj.type === "ramp") {
          setCtx({ type: "ramp", objectId: objectId!, ramp: obj as Ramp });
        } else if (obj.type === "reference-image") {
          setCtx({ type: "image", objectId: objectId! });
        }
      }
    },
    [camera, containerRef, objects, onSelect, selectedIds],
  );

  return (
    <ContextMenu.Root onOpenChange={handleOpenChange}>
      <ContextMenu.Trigger render={<div ref={containerRef} />}>
        {children}
      </ContextMenu.Trigger>

      <ContextMenu.Portal>
        <ContextMenu.Positioner sideOffset={0}>
          <ContextMenu.Popup style={getPopupStyle(lightMode)}>
            {ctx?.type === "canvas" && (
              <>
                <ContextMenu.Item
                  style={(state) => getItemStyle(lightMode, state)}
                  onClick={() => onCreateSwatch(ctx.canvasPos)}
                >
                  New color
                </ContextMenu.Item>
                <ContextMenu.Item
                  style={(state) => getItemStyle(lightMode, state)}
                  onClick={() =>
                    onCreateSwatch(ctx.canvasPos, { l: 0.55, c: 0.015, h: 60 })
                  }
                >
                  Warm neutral
                </ContextMenu.Item>
                <ContextMenu.Item
                  style={(state) => getItemStyle(lightMode, state)}
                  onClick={() =>
                    onCreateSwatch(ctx.canvasPos, { l: 0.55, c: 0.015, h: 250 })
                  }
                >
                  Cool neutral
                </ContextMenu.Item>
                <ContextMenu.Item
                  style={(state) => getItemStyle(lightMode, state)}
                  onClick={() =>
                    onCreateSwatch(ctx.canvasPos, { l: 0.55, c: 0, h: 0 })
                  }
                >
                  Pure neutral
                </ContextMenu.Item>
              </>
            )}

            {ctx?.type === "multi-selection" && (
              <>
                <ContextMenu.Item style={(state) => getItemStyle(lightMode, state)} onClick={onHarmonize}>
                  Harmonize
                </ContextMenu.Item>
                <ContextMenu.Separator style={getSeparatorStyle(lightMode)} />
                <ContextMenu.Item style={(state) => getItemStyle(lightMode, state)} onClick={onToggleLock}>
                  {ctx.anyUnlocked ? "Lock hue" : "Unlock hue"}
                </ContextMenu.Item>
                <ContextMenu.Separator style={getSeparatorStyle(lightMode)} />
                <ContextMenu.Item style={(state) => getItemStyle(lightMode, state)} onClick={onDeleteSelected}>
                  Delete
                </ContextMenu.Item>
              </>
            )}

            {ctx?.type === "swatch" && (
              <>
                <ContextMenu.Item
                  style={(state) => getItemStyle(lightMode, state)}
                  onClick={() =>
                    copyText(toHex(ctx.swatch.color))
                  }
                >
                  {toHex(ctx.swatch.color)}
                </ContextMenu.Item>
                <ContextMenu.Item
                  style={(state) => getItemStyle(lightMode, state)}
                  onClick={() =>
                    copyText(toOklchString(ctx.swatch.color))
                  }
                >
                  {toOklchString(ctx.swatch.color)}
                </ContextMenu.Item>
                <ContextMenu.Separator style={getSeparatorStyle(lightMode)} />
                <ContextMenu.Item
                  style={(state) => getItemStyle(lightMode, state)}
                  onClick={() => onPromoteToRamp(ctx.objectId, 13)}
                >
                  Ramp · 13
                </ContextMenu.Item>
                <ContextMenu.Item
                  style={(state) => getItemStyle(lightMode, state)}
                  onClick={() => onPromoteToRamp(ctx.objectId, 11)}
                >
                  Ramp · 11
                </ContextMenu.Item>
                <ContextMenu.Item
                  style={(state) => getItemStyle(lightMode, state)}
                  onClick={() => onPromoteToRamp(ctx.objectId, 7)}
                >
                  Ramp · 7
                </ContextMenu.Item>
                <ContextMenu.Item
                  style={(state) => getItemStyle(lightMode, state)}
                  onClick={() => onPromoteToRamp(ctx.objectId, 5)}
                >
                  Ramp · 5
                </ContextMenu.Item>
                <ContextMenu.Separator style={getSeparatorStyle(lightMode)} />
                <ContextMenu.Item style={(state) => getItemStyle(lightMode, state)} onClick={onToggleLock}>
                  {ctx.swatch.locked ? "Unlock hue" : "Lock hue"}
                </ContextMenu.Item>
                <ContextMenu.Separator style={getSeparatorStyle(lightMode)} />
                <ContextMenu.Item style={(state) => getItemStyle(lightMode, state)} onClick={onDeleteSelected}>
                  Delete
                </ContextMenu.Item>
              </>
            )}

            {ctx?.type === "ramp" && (
              <>
                <ContextMenu.Item
                  style={(state) => getItemStyle(lightMode, state)}
                  onClick={() => {
                    const list = ctx.ramp.stops
                      .map((s) => toHex(lightMode ? s.darkColor : s.color))
                      .join("\n");
                    copyText(list);
                  }}
                >
                  Hex list
                </ContextMenu.Item>
                <ContextMenu.Item
                  style={(state) => getItemStyle(lightMode, state)}
                  onClick={() => {
                    const list = ctx.ramp.stops
                      .map((s) => toOklchString(lightMode ? s.darkColor : s.color))
                      .join("\n");
                    copyText(list);
                  }}
                >
                  oklch list
                </ContextMenu.Item>
                <ContextMenu.Separator style={getSeparatorStyle(lightMode)} />
                <ContextMenu.Item style={(state) => getItemStyle(lightMode, state)} onClick={onToggleLock}>
                  {ctx.ramp.locked ? "Unlock hue" : "Lock hue"}
                </ContextMenu.Item>
                <ContextMenu.Separator style={getSeparatorStyle(lightMode)} />
                <ContextMenu.Item style={(state) => getItemStyle(lightMode, state)} onClick={onDeleteSelected}>
                  Delete
                </ContextMenu.Item>
              </>
            )}

            {ctx?.type === "ramp-stop" && (
              <>
                <ContextMenu.Item
                  style={(state) => getItemStyle(lightMode, state)}
                  onClick={() =>
                    copyText(toHex(ctx.stop.color))
                  }
                >
                  {toHex(ctx.stop.color)}
                </ContextMenu.Item>
                <ContextMenu.Item
                  style={(state) => getItemStyle(lightMode, state)}
                  onClick={() =>
                    copyText(toOklchString(ctx.stop.color))
                  }
                >
                  {toOklchString(ctx.stop.color)}
                </ContextMenu.Item>
                <ContextMenu.Separator style={getSeparatorStyle(lightMode)} />
                <ContextMenu.Item
                  style={(state) => getItemStyle(lightMode, state)}
                  onClick={() => onRemoveRampStop?.(ctx.objectId, ctx.stop.index)}
                >
                  Delete stop
                </ContextMenu.Item>
              </>
            )}

            {ctx?.type === "image" && (
              <>
                <ContextMenu.Item
                  style={(state) => getItemStyle(lightMode, state)}
                  onClick={() => onExtractColors?.(ctx.objectId)}
                >
                  {(objects[ctx.objectId] as ReferenceImage | undefined)
                    ?.extraction
                    ? "Re-extract colors"
                    : "Extract colors"}
                </ContextMenu.Item>
                <ContextMenu.Separator style={getSeparatorStyle(lightMode)} />
                <ContextMenu.Item style={(state) => getItemStyle(lightMode, state)} onClick={onDeleteSelected}>
                  Delete
                </ContextMenu.Item>
              </>
            )}
          </ContextMenu.Popup>
        </ContextMenu.Positioner>
      </ContextMenu.Portal>
    </ContextMenu.Root>
  );
}
