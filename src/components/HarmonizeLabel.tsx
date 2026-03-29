/**
 * Brief relationship label that appears near a newly created harmony strip.
 * Shows "TRIADIC · 120°" for 1.5s then fades. No geometry, no lines.
 */

import { useState, useEffect, useRef, useCallback } from "react";
import type { HarmonicRelationship } from "../types";
import type { Point, Camera } from "../types";

export interface HarmonizeFeedback {
  relationship: HarmonicRelationship;
  angle: number;
  /** Canvas-space position of the strip top-left */
  placement?: Point;
  camera?: Camera;
  darkMode?: boolean;
}

const listeners: Set<(msg: HarmonizeFeedback) => void> = new Set();

/** Show harmonize feedback from anywhere */
export function showHarmonizeFeedback(feedback: HarmonizeFeedback) {
  listeners.forEach((fn) => fn(feedback));
}

export function HarmonizeOverlay() {
  const [feedback, setFeedback] = useState<HarmonizeFeedback | null>(null);
  const [visible, setVisible] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout>>(undefined);

  const handleFeedback = useCallback((msg: HarmonizeFeedback) => {
    clearTimeout(timerRef.current);
    setFeedback(msg);
    setVisible(true);

    timerRef.current = setTimeout(() => {
      setVisible(false);
      setTimeout(() => setFeedback(null), 300);
    }, 1500);
  }, []);

  useEffect(() => {
    listeners.add(handleFeedback);
    return () => {
      listeners.delete(handleFeedback);
      clearTimeout(timerRef.current);
    };
  }, [handleFeedback]);

  if (!feedback) return null;

  // Position near the strip if placement info is available
  let style: React.CSSProperties;
  if (feedback.placement && feedback.camera) {
    const cam = feedback.camera;
    // Position label just to the left of the strip, vertically centered
    const screenX = feedback.placement.x * cam.zoom + cam.x - 8;
    const screenY = feedback.placement.y * cam.zoom + cam.y + 24;
    style = {
      position: "fixed",
      left: screenX,
      top: screenY,
      transform: "translateX(-100%)",
    };
  } else {
    // Fallback: centered on screen
    style = {
      position: "fixed",
      top: "50%",
      left: "50%",
      transform: "translate(-50%, -50%)",
    };
  }

  const textColor =
    feedback.darkMode
      ? "rgba(0,0,0,0.5)"
      : "rgba(255,255,255,0.5)";

  return (
    <div
      style={{
        ...style,
        fontFamily: "'IBM Plex Mono', monospace",
        fontSize: 9,
        textTransform: "uppercase",
        letterSpacing: "0.5px",
        color: textColor,
        pointerEvents: "none",
        zIndex: 9998,
        whiteSpace: "nowrap",
        opacity: visible ? 1 : 0,
        transition: visible
          ? "opacity 0.1s ease"
          : "opacity 0.3s ease",
      }}
    >
      {feedback.relationship} · {feedback.angle}°
    </div>
  );
}
