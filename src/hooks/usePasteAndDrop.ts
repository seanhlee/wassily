import { useCallback, useEffect } from "react";
import type { Point, OklchColor, Camera } from "../types";
import {
  fileToDataUrl,
} from "../engine/extract";
import { parseColor } from "../engine/gamut";

interface UsePasteAndDropConfig {
  containerRef: React.RefObject<HTMLDivElement | null>;
  cameraRef: React.RefObject<Camera>;
  createSwatch: (position: Point, color?: OklchColor) => void;
  addReferenceImage: (
    blob: Blob,
    dataUrl: string,
    position: Point,
    size: { width: number; height: number },
  ) => void;
}

export function usePasteAndDrop({
  containerRef,
  cameraRef,
  createSwatch,
  addReferenceImage,
}: UsePasteAndDropConfig) {
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

      const dataUrl = await fileToDataUrl(file);

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
    },
    [containerRef, cameraRef, addReferenceImage],
  );

  // Paste handler (text colors + images)
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

      const items = e.clipboardData?.items;
      if (items) {
        for (const item of Array.from(items)) {
          if (item.type.startsWith("image/")) {
            e.preventDefault();
            const file = item.getAsFile();
            if (!file) return;

            const dataUrl = await fileToDataUrl(file);

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
            return;
          }
        }
      }

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
  }, [containerRef, cameraRef, createSwatch, addReferenceImage]);

  return { handleDragOver, handleDrop };
}
