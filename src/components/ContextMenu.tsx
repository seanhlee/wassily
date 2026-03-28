import { useState, useEffect, useCallback } from "react";
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

  const close = useCallback(() => setMenu(null), []);

  // Close on any click
  useEffect(() => {
    if (!menu) return;
    const handler = () => setMenu(null);
    window.addEventListener("click", handler);
    return () => window.removeEventListener("click", handler);
  }, [menu]);

  // Close on escape
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
        const color = swatch.color;

        items.push({
          label: `Copy hex`,
          action: () => {
            navigator.clipboard.writeText(toHex(color)).catch(() => {});
          },
        });
        items.push({
          label: `Copy oklch`,
          action: () => {
            navigator.clipboard.writeText(toOklchString(color)).catch(() => {});
          },
        });
        items.push({
          label: "Generate ramp",
          separator: true,
          action: () => onPromoteToRamp(objectId!, 11),
        });
        items.push({
          label: "Ramp (5 stops)",
          action: () => onPromoteToRamp(objectId!, 5),
        });
        items.push({
          label: "Ramp (7 stops)",
          action: () => onPromoteToRamp(objectId!, 7),
        });
        items.push({
          label: "Delete",
          separator: true,
          action: onDeleteSelected,
        });
      } else if (obj?.type === "ramp") {
        const ramp = obj as Ramp;

        items.push({
          label: "Copy CSS",
          action: () => {
            const css = exportRampCSS(ramp, darkMode);
            navigator.clipboard.writeText(css).catch(() => {});
          },
        });
        items.push({
          label: "Copy hex list",
          action: () => {
            const hexList = ramp.stops
              .map((s) => toHex(darkMode ? s.darkColor : s.color))
              .join("\n");
            navigator.clipboard.writeText(hexList).catch(() => {});
          },
        });
        items.push({
          label: "Copy Tailwind",
          action: () => {
            const tw = exportRampTailwind(ramp, darkMode);
            navigator.clipboard.writeText(tw).catch(() => {});
          },
        });
        items.push({
          label: "Copy oklch list",
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
        // Empty space
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
            label: "Harmonize selected",
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

  return { menu, handleContextMenu, close };
}

// ---- Menu Component ----

export function ContextMenuOverlay({
  menu,
}: {
  menu: ContextMenuState | null;
}) {
  if (!menu) return null;

  return (
    <div
      style={{
        position: "fixed",
        left: menu.x,
        top: menu.y,
        zIndex: 9999,
        backgroundColor: "oklch(0.18 0 0)",
        border: "1px solid oklch(0.25 0 0)",
        padding: "4px 0",
        minWidth: 160,
        fontFamily: "'IBM Plex Mono', monospace",
        fontSize: 11,
      }}
    >
      {menu.items.map((item, i) => (
        <div key={i}>
          {item.separator && i > 0 && (
            <div
              style={{
                height: 1,
                backgroundColor: "oklch(0.25 0 0)",
                margin: "4px 0",
              }}
            />
          )}
          <div
            onClick={(e) => {
              e.stopPropagation();
              item.action();
            }}
            style={{
              padding: "6px 12px",
              cursor: "default",
              color: "oklch(0.75 0 0)",
            }}
            onMouseEnter={(e) => {
              (e.target as HTMLElement).style.backgroundColor =
                "oklch(0.25 0 0)";
            }}
            onMouseLeave={(e) => {
              (e.target as HTMLElement).style.backgroundColor = "transparent";
            }}
          >
            {item.label}
          </div>
        </div>
      ))}
    </div>
  );
}

// ---- Export Helpers ----

function exportRampCSS(ramp: Ramp, darkMode: boolean): string {
  const lines = ramp.stops.map((stop) => {
    const color = darkMode ? stop.darkColor : stop.color;
    return `  --${ramp.name}-${stop.label}: ${toOklchString(color)}; /* ${toHex(color)} */`;
  });
  return `/* ${ramp.name} */\n${lines.join("\n")}`;
}

function exportRampTailwind(ramp: Ramp, darkMode: boolean): string {
  const lines = ramp.stops.map((stop) => {
    const color = darkMode ? stop.darkColor : stop.color;
    return `  --color-${ramp.name}-${stop.label}: ${toOklchString(color)};`;
  });
  return `@theme inline {\n${lines.join("\n")}\n}`;
}
