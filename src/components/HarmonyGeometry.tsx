/**
 * Transient SVG geometry overlay for harmonization feedback.
 *
 * Renders lines between harmonized objects in screen space (fixed position).
 * Fades in quickly, holds, fades out. Shows relationship name, angle,
 * and cycle dots at the midpoint/centroid.
 */

import type { HarmonicRelationship } from "../types";

/** All relationships in canonical order (for cycle dots) */
export const HARMONY_ORDER: HarmonicRelationship[] = [
  "analogous",
  "tetradic",
  "triadic",
  "split-complementary",
  "complementary",
];

export interface HarmonyEndpoint {
  x: number; // screen-space X
  y: number; // screen-space Y
}

interface HarmonyGeometryProps {
  endpoints: HarmonyEndpoint[];
  relationship: HarmonicRelationship;
  angle: number;
  cycleIndex: number;
  visible: boolean;
  darkMode: boolean;
}

/** Dash pattern per relationship type */
function dashArray(rel: HarmonicRelationship): string {
  switch (rel) {
    case "complementary":
      return "none"; // solid
    case "split-complementary":
      return "8 4"; // long dash
    case "triadic":
      return "5 3"; // medium dash
    case "tetradic":
      return "3 3"; // short dash
    case "analogous":
      return "1.5 3"; // dotted
  }
}

export function HarmonyGeometry({
  endpoints,
  relationship,
  angle,
  cycleIndex,
  visible,
  darkMode,
}: HarmonyGeometryProps) {
  if (endpoints.length < 2) return null;

  // Compute centroid of all endpoints
  const cx = endpoints.reduce((s, e) => s + e.x, 0) / endpoints.length;
  const cy = endpoints.reduce((s, e) => s + e.y, 0) / endpoints.length;

  // Line color adapts to canvas (darkMode=true means light canvas)
  const lineColor = darkMode
    ? "rgba(0,0,0,0.6)"
    : "rgba(255,255,255,0.6)";
  const textColor = darkMode
    ? "rgba(0,0,0,0.7)"
    : "rgba(255,255,255,0.7)";
  const dotActive = darkMode
    ? "rgba(0,0,0,0.7)"
    : "rgba(255,255,255,0.7)";
  const dotInactive = darkMode
    ? "rgba(0,0,0,0.2)"
    : "rgba(255,255,255,0.2)";

  const dash = dashArray(relationship);

  // Build line segments: for 2 endpoints a single line, for 3+ a polygon
  const lines: Array<{ x1: number; y1: number; x2: number; y2: number }> = [];
  if (endpoints.length === 2) {
    lines.push({
      x1: endpoints[0].x,
      y1: endpoints[0].y,
      x2: endpoints[1].x,
      y2: endpoints[1].y,
    });
  } else {
    // Polygon: connect each pair, close the loop
    for (let i = 0; i < endpoints.length; i++) {
      const next = (i + 1) % endpoints.length;
      lines.push({
        x1: endpoints[i].x,
        y1: endpoints[i].y,
        x2: endpoints[next].x,
        y2: endpoints[next].y,
      });
    }
  }

  // Label position: midpoint for 2 endpoints, centroid for 3+
  const labelX = endpoints.length === 2
    ? (endpoints[0].x + endpoints[1].x) / 2
    : cx;
  const labelY = endpoints.length === 2
    ? (endpoints[0].y + endpoints[1].y) / 2
    : cy;

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        pointerEvents: "none",
        zIndex: 9998,
        opacity: visible ? 1 : 0,
        transition: visible
          ? "opacity 0.1s ease"
          : "opacity 0.3s ease 0s",
      }}
    >
      <svg
        style={{
          position: "absolute",
          inset: 0,
          width: "100%",
          height: "100%",
        }}
      >
        {lines.map((l, i) => (
          <line
            key={i}
            x1={l.x1}
            y1={l.y1}
            x2={l.x2}
            y2={l.y2}
            stroke={lineColor}
            strokeWidth={0.5}
            strokeDasharray={dash}
          />
        ))}
      </svg>

      {/* Label at midpoint/centroid */}
      <div
        style={{
          position: "absolute",
          left: labelX,
          top: labelY,
          transform: "translate(-50%, -50%)",
          fontFamily: "'IBM Plex Mono', monospace",
          fontSize: 9,
          textTransform: "uppercase",
          letterSpacing: "0.5px",
          color: textColor,
          whiteSpace: "nowrap",
          textAlign: "center",
        }}
      >
        <div>
          {relationship} · {angle}°
        </div>
        {/* Cycle dots */}
        <div
          style={{
            display: "flex",
            justifyContent: "center",
            gap: 5,
            marginTop: 4,
          }}
        >
          {HARMONY_ORDER.map((_, i) => (
            <div
              key={i}
              style={{
                width: 3,
                height: 3,
                borderRadius: "50%",
                backgroundColor: i === cycleIndex ? dotActive : dotInactive,
              }}
            />
          ))}
        </div>
      </div>
    </div>
  );
}
