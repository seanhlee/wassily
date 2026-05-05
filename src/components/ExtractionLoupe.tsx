import { useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import type { OklchColor } from "../types";
import { adaptiveRingStroke } from "./extractionMarkerStyle";
import {
  LOUPE_CROP_SIZE,
  LOUPE_DISPLAY_SIZE,
  LOUPE_GAP,
  computeLoupeOffset,
} from "./extractionLoupeMath";

interface ExtractionLoupeProps {
  clientX: number;
  clientY: number;
  sampleCanvasCtx: CanvasRenderingContext2D | null;
  samplePixel: { x: number; y: number }; // image-local pixel coord
  color: OklchColor;
}

export function ExtractionLoupe({
  clientX,
  clientY,
  sampleCanvasCtx,
  samplePixel,
  color,
}: ExtractionLoupeProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    // Out-of-bounds areas get a quiet neutral so the crosshair stays legible
    // even at the image edge.
    ctx.fillStyle = "#1a1a1a";
    ctx.fillRect(0, 0, LOUPE_CROP_SIZE, LOUPE_CROP_SIZE);

    if (!sampleCanvasCtx) return;

    const half = Math.floor(LOUPE_CROP_SIZE / 2);
    const cropX = Math.round(samplePixel.x) - half;
    const cropY = Math.round(samplePixel.y) - half;
    const src = sampleCanvasCtx.canvas;
    const sx = Math.max(0, cropX);
    const sy = Math.max(0, cropY);
    const ex = Math.min(src.width, cropX + LOUPE_CROP_SIZE);
    const ey = Math.min(src.height, cropY + LOUPE_CROP_SIZE);
    if (ex > sx && ey > sy) {
      ctx.drawImage(
        src,
        sx,
        sy,
        ex - sx,
        ey - sy,
        sx - cropX,
        sy - cropY,
        ex - sx,
        ey - sy,
      );
    }
  }, [sampleCanvasCtx, samplePixel.x, samplePixel.y]);

  const vw = typeof window !== "undefined" ? window.innerWidth : 0;
  const vh = typeof window !== "undefined" ? window.innerHeight : 0;
  const { left, top } = computeLoupeOffset(
    clientX,
    clientY,
    vw,
    vh,
    LOUPE_DISPLAY_SIZE,
    LOUPE_GAP,
  );

  const stroke = adaptiveRingStroke(color);
  const pixelDisplay = LOUPE_DISPLAY_SIZE / LOUPE_CROP_SIZE;
  const centerCellOffset = (LOUPE_CROP_SIZE / 2) * pixelDisplay;

  // Portal to body — CSS `position: fixed` inside a transformed ancestor
  // (canvas camera uses `transform`) anchors to the ancestor, not the viewport.
  // Mounting at body scope guarantees viewport-relative positioning.
  if (typeof document === "undefined") return null;
  return createPortal(
    <div
      style={{
        position: "fixed",
        left,
        top,
        zIndex: 10000,
        pointerEvents: "none",
      }}
      aria-hidden="true"
    >
      <canvas
        ref={canvasRef}
        width={LOUPE_CROP_SIZE}
        height={LOUPE_CROP_SIZE}
        style={{
          width: LOUPE_DISPLAY_SIZE,
          height: LOUPE_DISPLAY_SIZE,
          imageRendering: "pixelated",
          display: "block",
        }}
      />
      <div
        style={{
          position: "absolute",
          left: centerCellOffset - pixelDisplay / 2,
          top: centerCellOffset - pixelDisplay / 2,
          width: pixelDisplay,
          height: pixelDisplay,
          outline: `1px solid ${stroke}`,
          pointerEvents: "none",
        }}
      />
    </div>,
    document.body,
  );
}
