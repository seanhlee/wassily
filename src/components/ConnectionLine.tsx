/**
 * Persistent connection line between two canvas objects.
 *
 * Renders in canvas space (inside the camera-transform div).
 * Shows contrast ratio, hue distance, and deltaE on hover.
 * Uses vector-effect="non-scaling-stroke" to keep line width
 * constant regardless of zoom level.
 */

import { useState, useMemo, memo } from "react";
import type { Swatch, Ramp, Connection, OklchColor } from "../types";
import { contrastRatio } from "../engine/contrast";
import { angularDistance } from "../engine/harmonize";
import { differenceEuclidean } from "culori";
import { toCulori } from "../engine/gamut";

/** Get the representative color of a canvas object */
function getObjColor(obj: Swatch | Ramp, stopIndex?: number): OklchColor {
  if (obj.type === "swatch") return obj.color;
  // For ramps: use specific stop or middle (500-level)
  const ramp = obj as Ramp;
  if (stopIndex !== undefined && ramp.stops[stopIndex]) {
    return ramp.stops[stopIndex].color;
  }
  const anchor = ramp.stops.find((s) => s.label === "500") ||
    ramp.stops[Math.floor(ramp.stops.length / 2)];
  return anchor.color;
}

/** Get the center position of an object in canvas space */
function getObjCenter(obj: Swatch | Ramp): { x: number; y: number } {
  if (obj.type === "swatch") {
    return { x: obj.position.x + 24, y: obj.position.y + 24 };
  }
  const ramp = obj as Ramp;
  return {
    x: ramp.position.x + (ramp.stops.length * 48) / 2,
    y: ramp.position.y + 24,
  };
}

// OKLCH euclidean distance comparator
const deltaEOklch = differenceEuclidean("oklch");

interface ConnectionLineProps {
  connection: Connection;
  fromObj: Swatch | Ramp;
  toObj: Swatch | Ramp;
  darkMode: boolean;
  selected: boolean;
  onSelect: (id: string, additive: boolean) => void;
}

export const ConnectionLine = memo(
  function ConnectionLine({
    connection,
    fromObj,
    toObj,
    darkMode,
    selected,
    onSelect,
  }: ConnectionLineProps) {
    const [hovered, setHovered] = useState(false);

    const from = getObjCenter(fromObj);
    const to = getObjCenter(toObj);

    const colorA = getObjColor(fromObj, connection.fromStopIndex);
    const colorB = getObjColor(toObj, connection.toStopIndex);

    // Compute metrics
    const metrics = useMemo(() => {
      const contrast = contrastRatio(colorA, colorB);
      const hueDist = Math.abs(angularDistance(colorA.h, colorB.h));
      const dE = deltaEOklch(toCulori(colorA), toCulori(colorB));
      return {
        contrast: Math.round(contrast * 10) / 10,
        hueDist: Math.round(hueDist),
        deltaE: Math.round((dE ?? 0) * 100) / 100,
      };
    }, [colorA.l, colorA.c, colorA.h, colorB.l, colorB.c, colorB.h]);

    // darkMode=true means light canvas
    const lineColor = darkMode ? "rgba(0,0,0," : "rgba(255,255,255,";
    const lineOpacity = selected ? 0.4 : hovered ? 0.3 : 0.15;
    const lineWidth = selected ? 1 : 0.5;
    const stroke = `${lineColor}${lineOpacity})`;

    // Label bg and text color
    const labelBg = darkMode ? "rgba(255,255,255,0.85)" : "rgba(0,0,0,0.85)";
    const labelColor = darkMode ? "rgba(0,0,0,0.85)" : "rgba(255,255,255,0.85)";

    // Midpoint for hover label
    const mx = (from.x + to.x) / 2;
    const my = (from.y + to.y) / 2;

    return (
      <g
        className="connection-line"
        onMouseEnter={() => setHovered(true)}
        onMouseLeave={() => setHovered(false)}
      >
        {/* Visible line */}
        <line
          x1={from.x}
          y1={from.y}
          x2={to.x}
          y2={to.y}
          stroke={stroke}
          strokeWidth={lineWidth}
          vectorEffect="non-scaling-stroke"
        />
        {/* Invisible hit target for click/hover */}
        <line
          x1={from.x}
          y1={from.y}
          x2={to.x}
          y2={to.y}
          stroke="transparent"
          strokeWidth={8}
          vectorEffect="non-scaling-stroke"
          style={{ pointerEvents: "stroke", cursor: "pointer" }}
          onClick={(e) => {
            e.stopPropagation();
            onSelect(connection.id, e.shiftKey);
          }}
        />
        {/* Hover label with metrics */}
        {hovered && (
          <foreignObject
            x={mx - 40}
            y={my - 28}
            width={80}
            height={56}
            style={{ pointerEvents: "none", overflow: "visible" }}
          >
            <div
              style={{
                background: labelBg,
                padding: "4px 6px",
                fontFamily: "'IBM Plex Mono', monospace",
                fontSize: 9,
                color: labelColor,
                textTransform: "uppercase",
                letterSpacing: "0.3px",
                whiteSpace: "nowrap",
                textAlign: "center",
                lineHeight: 1.4,
              }}
            >
              <div>{metrics.contrast}:1</div>
              <div>{metrics.hueDist}°</div>
              <div>{metrics.deltaE} ΔE</div>
            </div>
          </foreignObject>
        )}
      </g>
    );
  },
  (prev, next) =>
    prev.connection === next.connection &&
    prev.fromObj === next.fromObj &&
    prev.toObj === next.toObj &&
    prev.darkMode === next.darkMode &&
    prev.selected === next.selected,
);
