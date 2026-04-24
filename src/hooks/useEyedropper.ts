import type { OklchColor, CanvasObject, Camera, ReferenceImage } from "../types";
import { oklch } from "culori";

/** Sample the pixel color at a viewport position from reference images */
export function samplePixelAt(
  clientX: number,
  clientY: number,
  containerRect: DOMRect,
  camera: Camera,
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

/**
 * Sample a specific image at a viewport pointer position, clamping to the
 * image's displayed bounds. Returns the sampled color and the in-image pixel
 * coordinate (useful for marker dragging + loupe rendering). Returns null if
 * the image's offscreen ctx isn't primed yet or the color can't be parsed.
 */
export function sampleImagePixelAt(
  clientX: number,
  clientY: number,
  image: ReferenceImage,
  containerRect: DOMRect,
  camera: Camera,
  cache: Map<string, CanvasRenderingContext2D>,
): { color: OklchColor; local: { x: number; y: number } } | null {
  const ctx = cache.get(image.id);
  if (!ctx) return null;

  const canvasX = (clientX - containerRect.left - camera.x) / camera.zoom;
  const canvasY = (clientY - containerRect.top - camera.y) / camera.zoom;
  const rawX = canvasX - image.position.x;
  const rawY = canvasY - image.position.y;
  const localX = Math.max(0, Math.min(image.size.width - 1, rawX));
  const localY = Math.max(0, Math.min(image.size.height - 1, rawY));

  const pixel = ctx.getImageData(Math.floor(localX), Math.floor(localY), 1, 1).data;
  const result = oklch({
    mode: "rgb",
    r: pixel[0] / 255,
    g: pixel[1] / 255,
    b: pixel[2] / 255,
  });
  if (!result) return null;
  return {
    color: { l: result.l ?? 0, c: result.c ?? 0, h: result.h ?? 0 },
    local: { x: localX, y: localY },
  };
}
