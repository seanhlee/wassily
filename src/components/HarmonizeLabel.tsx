import { useState, useEffect } from "react";
import type { HarmonicRelationship } from "../types";

interface HarmonizeFeedback {
  relationship: HarmonicRelationship;
  angle: number;
}

const listeners: Set<(msg: HarmonizeFeedback) => void> = new Set();

/** Show harmonize feedback from anywhere */
export function showHarmonizeFeedback(feedback: HarmonizeFeedback) {
  listeners.forEach((fn) => fn(feedback));
}

export function HarmonizeOverlay() {
  const [feedback, setFeedback] = useState<HarmonizeFeedback | null>(null);

  useEffect(() => {
    const handler = (msg: HarmonizeFeedback) => {
      setFeedback(msg);
      setTimeout(() => setFeedback(null), 1200);
    };
    listeners.add(handler);
    return () => {
      listeners.delete(handler);
    };
  }, []);

  if (!feedback) return null;

  return (
    <div
      style={{
        position: "fixed",
        top: "50%",
        left: "50%",
        transform: "translate(-50%, -50%)",
        fontFamily: "'IBM Plex Mono', monospace",
        fontSize: 9,
        textTransform: "uppercase",
        letterSpacing: "0.5px",
        color: "rgba(255,255,255,0.7)",
        pointerEvents: "none",
        zIndex: 9998,
      }}
    >
      {feedback.relationship} · {feedback.angle}°
    </div>
  );
}
