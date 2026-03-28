import { useState, useEffect, useCallback, useRef } from "react";
import type { CanvasObject, Swatch, Ramp } from "../types";
import { toHex, toOklchString } from "../engine/gamut";

interface MenuAction {
  label: string;
  action: () => void;
  separator?: boolean;
}

interface ContextMenuState {
  x: number;
  y: number;
  items: MenuAction[];
}

interface ContextMenuProps {
  objects: Record<string, CanvasObject>;
  selectedIds: string[];
  darkMode: boolean;
  camera: { x: number; y: number; zoom: number };
  onCreateSwatch: (position: { x: number; y: number }) => void;
  onDeleteSelected: () => void;
  onPromoteToRamp: (id: string, stopCount: number) => void;
  onHarmonize: () => void;
  containerRef: React.RefObject<HTMLDivElement | null>;
}

export function useContextMenu({
  objects,
  selectedIds,
  darkMode,
  camera,
  onCreateSwatch,
  onDeleteSelected,
  onPromoteToRamp,
  onHarmonize,
  containerRef,
}: ContextMenuProps) {
  const [menu, setMenu] = useState<ContextMenuState | null>(null);

  useEffect(() => {
    if (!menu) return;
    const handler = () => setMenu(null);
    window.addEventListener("click", handler);
    return () => window.removeEventListener("click", handler);
  }, [menu]);

  useEffect(() => {
    if (!menu) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") setMenu(null);
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [menu]);

  const handleContextMenu = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault();

      const target = e.target as HTMLElement;
      const swatchEl = target.closest(".swatch-node");
      const rampEl = target.closest(".ramp-node");
      const objectEl = swatchEl || rampEl;
      const objectId = objectEl?.getAttribute("data-object-id");
      const obj = objectId ? objects[objectId] : null;

      const items: MenuAction[] = [];

      if (obj?.type === "swatch") {
        const swatch = obj as Swatch;
        items.push({
          label: toHex(swatch.color),
          action: () =>
            navigator.clipboard.writeText(toHex(swatch.color)).catch(() => {}),
        });
        items.push({
          label: toOklchString(swatch.color),
          action: () =>
            navigator.clipboard
              .writeText(toOklchString(swatch.color))
              .catch(() => {}),
        });
        items.push({
          label: "Ramp · 11",
          separator: true,
          action: () => onPromoteToRamp(objectId!, 11),
        });
        items.push({
          label: "Ramp · 7",
          action: () => onPromoteToRamp(objectId!, 7),
        });
        items.push({
          label: "Ramp · 5",
          action: () => onPromoteToRamp(objectId!, 5),
        });
        items.push({
          label: "Delete",
          separator: true,
          action: onDeleteSelected,
        });
      } else if (obj?.type === "ramp") {
        const ramp = obj as Ramp;
        items.push({
          label: "Hex list",
          action: () => {
            const list = ramp.stops
              .map((s) => toHex(darkMode ? s.darkColor : s.color))
              .join("\n");
            navigator.clipboard.writeText(list).catch(() => {});
          },
        });
        items.push({
          label: "oklch list",
          action: () => {
            const list = ramp.stops
              .map((s) => toOklchString(darkMode ? s.darkColor : s.color))
              .join("\n");
            navigator.clipboard.writeText(list).catch(() => {});
          },
        });
        items.push({
          label: "Delete",
          separator: true,
          action: onDeleteSelected,
        });
      } else {
        const rect = containerRef.current?.getBoundingClientRect();
        if (rect) {
          const canvasX = (e.clientX - rect.left - camera.x) / camera.zoom;
          const canvasY = (e.clientY - rect.top - camera.y) / camera.zoom;
          items.push({
            label: "New color",
            action: () => onCreateSwatch({ x: canvasX, y: canvasY }),
          });
        }
        if (selectedIds.length >= 2) {
          items.push({
            label: "Harmonize",
            separator: true,
            action: onHarmonize,
          });
        }
      }

      if (items.length > 0) {
        setMenu({ x: e.clientX, y: e.clientY, items });
      }
    },
    [
      objects,
      selectedIds,
      darkMode,
      camera,
      onCreateSwatch,
      onDeleteSelected,
      onPromoteToRamp,
      onHarmonize,
      containerRef,
    ],
  );

  return { menu, handleContextMenu };
}

// ---- Menu Component ----

export function ContextMenuOverlay({
  menu,
}: {
  menu: ContextMenuState | null;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<{ x: number; y: number }>({ x: 0, y: 0 });

  // Edge-aware positioning
  useEffect(() => {
    if (!menu || !ref.current) return;
    const el = ref.current;
    const rect = el.getBoundingClientRect();
    let x = menu.x;
    let y = menu.y;

    if (x + rect.width > window.innerWidth) {
      x = window.innerWidth - rect.width - 4;
    }
    if (y + rect.height > window.innerHeight) {
      y = window.innerHeight - rect.height - 4;
    }
    setPos({ x, y });
  }, [menu]);

  if (!menu) return null;

  return (
    <div
      ref={ref}
      style={{
        position: "fixed",
        left: pos.x || menu.x,
        top: pos.y || menu.y,
        zIndex: 9999,
        backgroundColor: "oklch(0.16 0 0)",
        border: "1px solid oklch(0.22 0 0)",
        padding: "3px 0",
        fontFamily: "'IBM Plex Mono', monospace",
        fontSize: 9,
        letterSpacing: "-0.2px",
      }}
    >
      {menu.items.map((item, i) => (
        <div key={i}>
          {item.separator && i > 0 && (
            <div
              style={{
                height: 1,
                backgroundColor: "oklch(0.22 0 0)",
                margin: "2px 0",
              }}
            />
          )}
          <div
            onClick={(e) => {
              e.stopPropagation();
              item.action();
            }}
            style={{
              padding: "3px 10px",
              cursor: "default",
              color: "oklch(0.6 0 0)",
              whiteSpace: "nowrap",
            }}
            onMouseEnter={(e) => {
              (e.target as HTMLElement).style.backgroundColor =
                "oklch(0.22 0 0)";
              (e.target as HTMLElement).style.color = "oklch(0.8 0 0)";
            }}
            onMouseLeave={(e) => {
              (e.target as HTMLElement).style.backgroundColor = "transparent";
              (e.target as HTMLElement).style.color = "oklch(0.6 0 0)";
            }}
          >
            {item.label}
          </div>
        </div>
      ))}
    </div>
  );
}
