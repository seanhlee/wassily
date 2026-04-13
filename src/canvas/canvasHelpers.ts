import type { CanvasObject, Ramp, Swatch, Point } from "../types";
import { SWATCH_SIZE } from "../constants";
import type { ReferenceImage } from "../types";

/** Bounding box of a canvas object (canvas space) */
export function getObjectBounds(obj: CanvasObject): { x: number; y: number; w: number; h: number } | null {
  if (obj.type === "swatch") return { x: obj.position.x, y: obj.position.y, w: SWATCH_SIZE, h: SWATCH_SIZE };
  if (obj.type === "ramp") return { x: obj.position.x, y: obj.position.y, w: (obj as Ramp).stops.length * SWATCH_SIZE, h: SWATCH_SIZE };
  if (obj.type === "reference-image") {
    const img = obj as ReferenceImage;
    return { x: img.position.x, y: img.position.y, w: img.size.width, h: img.size.height };
  }
  return null;
}

/** Find all selectable object IDs whose bounds intersect a rectangle (canvas space) */
export function objectsInRect(
  objects: Record<string, CanvasObject>,
  rect: { x: number; y: number; w: number; h: number },
): string[] {
  const ids: string[] = [];
  for (const obj of Object.values(objects)) {
    if (obj.type === "connection") continue;
    const bounds = getObjectBounds(obj);
    if (!bounds) continue;
    if (rectsOverlap(bounds, rect, 0)) ids.push(obj.id);
  }
  return ids;
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
export function findStripPlacement(
  objects: Record<string, CanvasObject>,
  selectedIds: string[],
  stripCount: number,
): Point {
  const stripW = SWATCH_SIZE;
  const stripH = stripCount * SWATCH_SIZE + (stripCount - 1) * 8;
  const padding = 40;

  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const id of selectedIds) {
    const b = getObjectBounds(objects[id]);
    if (!b) continue;
    minX = Math.min(minX, b.x);
    minY = Math.min(minY, b.y);
    maxX = Math.max(maxX, b.x + b.w);
    maxY = Math.max(maxY, b.y + b.h);
  }

  const selCenterY = (minY + maxY) / 2;
  const startY = selCenterY - stripH / 2;

  const allBounds = Object.values(objects)
    .map(getObjectBounds)
    .filter((b): b is NonNullable<typeof b> => b !== null);

  let x = maxX + padding;
  for (let attempt = 0; attempt < 20; attempt++) {
    const candidate = { x, y: startY, w: stripW, h: stripH };
    const collision = allBounds.some((b) => rectsOverlap(candidate, b, padding / 2));
    if (!collision) return { x, y: startY };
    x += 80;
  }

  return { x, y: startY };
}

/** Extract hues with locked flag from selected objects */
export function extractHues(
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
