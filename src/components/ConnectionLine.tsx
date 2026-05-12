/**
 * Persistent connection line between two canvas objects.
 *
 * Renders in canvas space (inside the camera-transform div).
 * Shows contrast ratio, hue distance, and deltaE on hover.
 * Uses vector-effect="non-scaling-stroke" to keep line width
 * constant regardless of zoom level.
 */

import { useState, memo } from "react";
import type { Swatch, Ramp, Connection, OklchColor } from "../types";
import { SWATCH_SIZE, FONT, FONT_SIZE, FONT_WEIGHT_UI } from "../constants";
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
    return { x: obj.position.x + SWATCH_SIZE / 2, y: obj.position.y + SWATCH_SIZE / 2 };
  }
  const ramp = obj as Ramp;
  return {
    x: ramp.position.x + (ramp.stops.length * SWATCH_SIZE) / 2,
    y: ramp.position.y + SWATCH_SIZE / 2,
  };
}

// OKLCH euclidean distance comparator
const deltaEOklch = differenceEuclidean("oklch");

interface ConnectionLineProps {
  connection: Connection;
  fromObj: Swatch | Ramp;
  toObj: Swatch | Ramp;
  lightMode: boolean;
  selected: boolean;
  onSelect: (id: string, additive: boolean) => void;
}

export const ConnectionLine = memo(
  function ConnectionLine({
    connection,
    fromObj,
    toObj,
    lightMode,
    selected,
    onSelect,
  }: ConnectionLineProps) {
    const [hovered, setHovered] = useState(false);

    const from = getObjCenter(fromObj);
    const to = getObjCenter(toObj);

    const colorA = getObjColor(fromObj, connection.fromStopIndex);
    const colorB = getObjColor(toObj, connection.toStopIndex);

    // Compute metrics
    const contrast = contrastRatio(colorA, colorB);
    const hueDist = Math.abs(angularDistance(colorA.h, colorB.h));
    const dE = deltaEOklch(toCulori(colorA), toCulori(colorB));
    const metrics = {
      contrast: Math.round(contrast * 10) / 10,
      hueDist: Math.round(hueDist),
      deltaE: Math.round((dE ?? 0) * 100) / 100,
    };

    const lineColor = lightMode ? "rgba(0,0,0," : "rgba(255,255,255,";
    const lineOpacity = 1;
    const lineWidth = selected ? 1.5 : 1;
    const stroke = `${lineColor}${lineOpacity})`;

    // Label bg and text color
    const labelBg = lightMode ? "rgba(255,255,255,0.85)" : "rgba(0,0,0,0.85)";
    const labelColor = lightMode ? "rgba(0,0,0,0.85)" : "rgba(255,255,255,0.85)";

    // Cubic bezier curve: offset control points perpendicular to the line
    const dx = to.x - from.x;
    const dy = to.y - from.y;
    const dist = Math.sqrt(dx * dx + dy * dy);
    // Perpendicular unit vector
    const px = -dy / (dist || 1);
    const py = dx / (dist || 1);
    // Bow amount: proportional to distance, capped
    const bow = Math.min(dist * 0.15, 60);
    const c1x = from.x + dx * 0.33 + px * bow;
    const c1y = from.y + dy * 0.33 + py * bow;
    const c2x = from.x + dx * 0.67 + px * bow;
    const c2y = from.y + dy * 0.67 + py * bow;
    const curvePath = `M ${from.x} ${from.y} C ${c1x} ${c1y}, ${c2x} ${c2y}, ${to.x} ${to.y}`;

    // Midpoint on the bezier curve (t=0.5)
    const mx = (from.x + 3 * c1x + 3 * c2x + to.x) / 8;
    const my = (from.y + 3 * c1y + 3 * c2y + to.y) / 8;

    return (
      <g
        className="connection-line"
        onMouseEnter={() => setHovered(true)}
        onMouseLeave={() => setHovered(false)}
      >
        {/* Visible curve */}
        <path
          d={curvePath}
          fill="none"
          stroke={stroke}
          strokeWidth={lineWidth}
          vectorEffect="non-scaling-stroke"
        />
        {/* Invisible hit target for click/hover */}
        <path
          d={curvePath}
          fill="none"
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
                fontFamily: FONT,
                fontSize: FONT_SIZE,
                fontWeight: FONT_WEIGHT_UI,
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
    prev.lightMode === next.lightMode &&
    prev.selected === next.selected,
);
