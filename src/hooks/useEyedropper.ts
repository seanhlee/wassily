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
