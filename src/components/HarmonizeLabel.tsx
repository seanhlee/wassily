import { useState, useEffect, useRef } from "react";
import { SWATCH_SIZE, FONT, FONT_SIZE, FONT_WEIGHT_UI } from "../constants";
import {
  subscribeToHarmonizeFeedback,
  type HarmonizeFeedback,
} from "./harmonizeFeedback";

// ---- Display formatting ----

function formatFeedback(fb: HarmonizeFeedback): string {
  const prefix = fb.alreadyHarmonized ? "ALREADY " : "";

  // 5+ objects: show count and angle instead of misleading relationship name
  if (fb.count >= 5) {
    return `${prefix}${fb.count} \u00d7 ${Math.round(fb.angle)}\u00b0`;
  }

  return `${prefix}${fb.relationship.toUpperCase()} \u00b7 ${Math.round(fb.angle)}\u00b0`;
}

// ---- Overlay component ----

// SWATCH_SIZE imported from constants
const LABEL_OFFSET_Y = 24; // px above the strip (clears selection brackets)

export function HarmonizeOverlay() {
  const [feedback, setFeedback] = useState<HarmonizeFeedback | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout>>(undefined);

  useEffect(() => {
    const handler = (fb: HarmonizeFeedback) => {
      clearTimeout(timerRef.current);
      setFeedback(fb);
      timerRef.current = setTimeout(() => setFeedback(null), 2400);
    };
    const unsubscribe = subscribeToHarmonizeFeedback(handler);
    return () => {
      unsubscribe();
      clearTimeout(timerRef.current);
    };
  }, []);

  if (!feedback) return null;

  // Position above the strip if placement + camera are available,
  // otherwise fall back to centered on screen
  let positionStyle: React.CSSProperties;

  if (feedback.placement && feedback.camera) {
    const cam = feedback.camera;
    // Canvas → screen: screenX = canvasX * zoom + cam.x
    const screenX = (feedback.placement.x + SWATCH_SIZE / 2) * cam.zoom + cam.x;
    const screenY = feedback.placement.y * cam.zoom + cam.y - LABEL_OFFSET_Y;
    positionStyle = {
      position: "fixed",
      left: screenX,
      top: screenY,
      transform: "translateX(-50%)",
    };
  } else {
    positionStyle = {
      position: "fixed",
      top: "50%",
      left: "50%",
      transform: "translate(-50%, -50%)",
    };
  }

  return (
    <div
      style={{
        ...positionStyle,
        fontFamily: FONT,
        fontSize: FONT_SIZE,
        fontWeight: FONT_WEIGHT_UI,
        textTransform: "uppercase",
        letterSpacing: "0.5px",
        color: "oklch(0.55 0 0)",
        pointerEvents: "none",
        zIndex: 9998,
        whiteSpace: "nowrap",
      }}
    >
      {formatFeedback(feedback)}
    </div>
  );
}
