/**
 * Canvas context menu built on Base UI.
 *
 * Base UI handles all the hard parts: positioning at cursor, portal rendering,
 * dismissal (click outside, Escape, item click), keyboard navigation.
 * We just provide the styling and context-aware menu items.
 */

import { useState, useCallback, useRef } from "react";
import { ContextMenu } from "@base-ui/react/context-menu";
import type { CanvasObject, Swatch, Ramp, Camera, Point } from "../types";
import { toHex, toOklchString } from "../engine/gamut";

// ---- Menu context types ----

type MenuContext =
  | { type: "canvas"; canvasPos: Point }
  | { type: "multi-selection"; anyUnlocked: boolean }
  | { type: "swatch"; objectId: string; swatch: Swatch }
  | { type: "ramp"; objectId: string; ramp: Ramp }
  | { type: "image"; objectId: string }
  | null;

// ---- Styles ----

const popupStyle: React.CSSProperties = {
  backgroundColor: "#000",
  border: "1px solid rgba(255,255,255,0.15)",
  padding: "3px 0",
  fontFamily: "'IBM Plex Mono', monospace",
  fontSize: 9,
  textTransform: "uppercase",
  letterSpacing: "0.5px",
  outline: "none",
};

function itemStyle(state: { highlighted: boolean }): React.CSSProperties {
  return {
    padding: "3px 10px",
    cursor: "default",
    color: state.highlighted ? "#fff" : "rgba(255,255,255,0.6)",
    backgroundColor: state.highlighted
      ? "rgba(255,255,255,0.08)"
      : "transparent",
    whiteSpace: "nowrap",
    outline: "none",
  };
}

const separatorStyle: React.CSSProperties = {
  height: 1,
  backgroundColor: "rgba(255,255,255,0.1)",
  margin: "2px 0",
};

// ---- Props ----

export interface CanvasContextMenuProps {
  objects: Record<string, CanvasObject>;
  selectedIds: string[];
  darkMode: boolean;
  camera: Camera;
  containerRef: React.RefObject<HTMLDivElement | null>;
  onCreateSwatch: (position: Point, color?: { l: number; c: number; h: number }) => void;
  onSelect: (id: string, additive?: boolean) => void;
  onDeleteSelected: () => void;
  onPromoteToRamp: (id: string, stopCount: number) => void;
  onHarmonize: () => void;
  onToggleLock: () => void;
  children: React.ReactNode;
}

// ---- Component ----

export function CanvasContextMenu({
  objects,
  selectedIds,
  darkMode,
  camera,
  containerRef,
  onCreateSwatch,
  onSelect,
  onDeleteSelected,
  onPromoteToRamp,
  onHarmonize,
  onToggleLock,
  children,
}: CanvasContextMenuProps) {
  const [ctx, setCtx] = useState<MenuContext>(null);
  // Store refs for values needed in callbacks that fire after menu opens
  const selectedIdsRef = useRef(selectedIds);
  selectedIdsRef.current = selectedIds;
  const objectsRef = useRef(objects);
  objectsRef.current = objects;

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
      const obj = objectId ? objectsRef.current[objectId] : null;

      // Selection logic: if right-clicked object isn't selected, replace selection
      let effectiveSelectedIds = selectedIdsRef.current;
      if (objectId && !selectedIdsRef.current.includes(objectId)) {
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
          const o = objectsRef.current[id];
          return o && (o.type === "swatch" || o.type === "ramp");
        }).length;

        if (harmonizableCount >= 2) {
          const anyUnlocked = effectiveSelectedIds.some((id) => {
            const o = objectsRef.current[id];
            return o && (o.type === "swatch" || o.type === "ramp") && !(o as Swatch | Ramp).locked;
          });
          setCtx({ type: "multi-selection", anyUnlocked });
        } else if (obj.type === "swatch") {
          setCtx({ type: "swatch", objectId: objectId!, swatch: obj as Swatch });
        } else if (obj.type === "ramp") {
          setCtx({ type: "ramp", objectId: objectId!, ramp: obj as Ramp });
        } else if (obj.type === "reference-image") {
          setCtx({ type: "image", objectId: objectId! });
        }
      }
    },
    [camera, onSelect, containerRef],
  );

  return (
    <ContextMenu.Root onOpenChange={handleOpenChange}>
      <ContextMenu.Trigger render={<div ref={containerRef} />}>
        {children}
      </ContextMenu.Trigger>

      <ContextMenu.Portal>
        <ContextMenu.Positioner sideOffset={0}>
          <ContextMenu.Popup style={popupStyle}>
            {ctx?.type === "canvas" && (
              <>
                <ContextMenu.Item
                  style={itemStyle}
                  onClick={() => onCreateSwatch(ctx.canvasPos)}
                >
                  New color
                </ContextMenu.Item>
                <ContextMenu.Item
                  style={itemStyle}
                  onClick={() =>
                    onCreateSwatch(ctx.canvasPos, { l: 0.55, c: 0.015, h: 60 })
                  }
                >
                  Warm neutral
                </ContextMenu.Item>
                <ContextMenu.Item
                  style={itemStyle}
                  onClick={() =>
                    onCreateSwatch(ctx.canvasPos, { l: 0.55, c: 0.015, h: 250 })
                  }
                >
                  Cool neutral
                </ContextMenu.Item>
                <ContextMenu.Item
                  style={itemStyle}
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
                <ContextMenu.Item style={itemStyle} onClick={onHarmonize}>
                  Harmonize
                </ContextMenu.Item>
                <ContextMenu.Separator style={separatorStyle} />
                <ContextMenu.Item style={itemStyle} onClick={onToggleLock}>
                  {ctx.anyUnlocked ? "Lock hue" : "Unlock hue"}
                </ContextMenu.Item>
                <ContextMenu.Separator style={separatorStyle} />
                <ContextMenu.Item style={itemStyle} onClick={onDeleteSelected}>
                  Delete
                </ContextMenu.Item>
              </>
            )}

            {ctx?.type === "swatch" && (
              <>
                <ContextMenu.Item
                  style={itemStyle}
                  onClick={() =>
                    navigator.clipboard.writeText(toHex(ctx.swatch.color)).catch(() => {})
                  }
                >
                  {toHex(ctx.swatch.color)}
                </ContextMenu.Item>
                <ContextMenu.Item
                  style={itemStyle}
                  onClick={() =>
                    navigator.clipboard.writeText(toOklchString(ctx.swatch.color)).catch(() => {})
                  }
                >
                  {toOklchString(ctx.swatch.color)}
                </ContextMenu.Item>
                <ContextMenu.Separator style={separatorStyle} />
                <ContextMenu.Item
                  style={itemStyle}
                  onClick={() => onPromoteToRamp(ctx.objectId, 11)}
                >
                  Ramp · 11
                </ContextMenu.Item>
                <ContextMenu.Item
                  style={itemStyle}
                  onClick={() => onPromoteToRamp(ctx.objectId, 7)}
                >
                  Ramp · 7
                </ContextMenu.Item>
                <ContextMenu.Item
                  style={itemStyle}
                  onClick={() => onPromoteToRamp(ctx.objectId, 5)}
                >
                  Ramp · 5
                </ContextMenu.Item>
                <ContextMenu.Separator style={separatorStyle} />
                <ContextMenu.Item style={itemStyle} onClick={onToggleLock}>
                  {ctx.swatch.locked ? "Unlock hue" : "Lock hue"}
                </ContextMenu.Item>
                <ContextMenu.Separator style={separatorStyle} />
                <ContextMenu.Item style={itemStyle} onClick={onDeleteSelected}>
                  Delete
                </ContextMenu.Item>
              </>
            )}

            {ctx?.type === "ramp" && (
              <>
                <ContextMenu.Item
                  style={itemStyle}
                  onClick={() => {
                    const list = ctx.ramp.stops
                      .map((s) => toHex(darkMode ? s.darkColor : s.color))
                      .join("\n");
                    navigator.clipboard.writeText(list).catch(() => {});
                  }}
                >
                  Hex list
                </ContextMenu.Item>
                <ContextMenu.Item
                  style={itemStyle}
                  onClick={() => {
                    const list = ctx.ramp.stops
                      .map((s) => toOklchString(darkMode ? s.darkColor : s.color))
                      .join("\n");
                    navigator.clipboard.writeText(list).catch(() => {});
                  }}
                >
                  oklch list
                </ContextMenu.Item>
                <ContextMenu.Separator style={separatorStyle} />
                <ContextMenu.Item style={itemStyle} onClick={onToggleLock}>
                  {ctx.ramp.locked ? "Unlock hue" : "Lock hue"}
                </ContextMenu.Item>
                <ContextMenu.Separator style={separatorStyle} />
                <ContextMenu.Item style={itemStyle} onClick={onDeleteSelected}>
                  Delete
                </ContextMenu.Item>
              </>
            )}

            {ctx?.type === "image" && (
              <ContextMenu.Item style={itemStyle} onClick={onDeleteSelected}>
                Delete
              </ContextMenu.Item>
            )}
          </ContextMenu.Popup>
        </ContextMenu.Positioner>
      </ContextMenu.Portal>
    </ContextMenu.Root>
  );
}
