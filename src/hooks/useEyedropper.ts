import { useState, useEffect, useRef } from "react";
import type { OklchColor, CanvasObject, Swatch, Camera, ReferenceImage } from "../types";
import { oklch } from "culori";

/** Prime an offscreen canvas for pixel sampling from a reference image */
function primeImageCanvas(
  image: ReferenceImage,
  cache: Map<string, CanvasRenderingContext2D>,
) {
  if (cache.has(image.id)) return;
  if (!image.dataUrl) return;
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

interface UseEyedropperConfig {
  objects: Record<string, CanvasObject>;
  selectedIds: string[];
  updateSwatchColor: (id: string, color: OklchColor) => void;
  snapshot: () => void;
}

export function useEyedropper({ objects, selectedIds, updateSwatchColor, snapshot }: UseEyedropperConfig) {
  const [iKeyHeld, setIKeyHeld] = useState(false);
  const eyedropperOriginalColor = useRef<OklchColor | null>(null);
  const eyedropperCommitted = useRef(false);
  const eyedropperTargetId = useRef<string | null>(null);
  const eyedropperCanvasCache = useRef<Map<string, CanvasRenderingContext2D>>(new Map());

  // Prime offscreen canvases for ref images
  useEffect(() => {
    const cache = eyedropperCanvasCache.current;
    const imageIds = new Set<string>();
    for (const obj of Object.values(objects)) {
      if (obj.type === "reference-image") {
        imageIds.add(obj.id);
        primeImageCanvas(obj as ReferenceImage, cache);
      }
    }
    for (const id of cache.keys()) {
      if (!imageIds.has(id)) cache.delete(id);
    }
  }, [objects]);

  const startEyedropper = () => {
    const targetId = selectedIds[0];
    const targetObj = targetId ? objects[targetId] : null;
    if (targetObj?.type === "swatch") {
      eyedropperTargetId.current = targetId;
      eyedropperOriginalColor.current = { ...(targetObj as Swatch).color };
      eyedropperCommitted.current = false;
    } else {
      eyedropperTargetId.current = null;
    }
    setIKeyHeld(true);
  };

  const stopEyedropper = () => {
    if (!eyedropperCommitted.current && eyedropperTargetId.current && eyedropperOriginalColor.current) {
      updateSwatchColor(eyedropperTargetId.current, eyedropperOriginalColor.current);
    }
    setIKeyHeld(false);
    eyedropperTargetId.current = null;
    eyedropperOriginalColor.current = null;
  };

  const commitEyedropper = (color: OklchColor) => {
    if (eyedropperTargetId.current) {
      snapshot();
      updateSwatchColor(eyedropperTargetId.current, color);
      eyedropperCommitted.current = true;
    }
  };

  const previewEyedropper = (color: OklchColor | null) => {
    if (!eyedropperTargetId.current) return;
    if (color) {
      updateSwatchColor(eyedropperTargetId.current, color);
    } else if (eyedropperOriginalColor.current) {
      updateSwatchColor(eyedropperTargetId.current, eyedropperOriginalColor.current);
    }
  };

  return {
    iKeyHeld,
    eyedropperTargetId,
    eyedropperCanvasCache,
    startEyedropper,
    stopEyedropper,
    commitEyedropper,
    previewEyedropper,
  };
}
