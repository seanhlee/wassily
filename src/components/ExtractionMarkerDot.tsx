import type { OklchColor } from "../types";
import { toCssColor } from "../engine/gamut";
import { adaptiveRingStroke } from "./extractionMarkerStyle";

interface ExtractionMarkerDotProps {
  color: OklchColor;
  size?: number;
  active?: boolean;
}

const STROKE = 0.75;
const ACTIVE_RING_OFFSET = 3;

export function ExtractionMarkerDot({
  color,
  size = 7,
  active = false,
}: ExtractionMarkerDotProps) {
  const radius = size / 2;
  const stroke = adaptiveRingStroke(color);
  // Room for the active outer ring plus a hair of padding.
  const box = size + ACTIVE_RING_OFFSET * 2 + 4;
  const center = box / 2;

  return (
    <svg
      width={box}
      height={box}
      viewBox={`0 0 ${box} ${box}`}
      style={{ display: "block", pointerEvents: "none", overflow: "visible" }}
      aria-hidden="true"
    >
      <circle cx={center} cy={center} r={radius} fill={toCssColor(color)} />
      <circle
        cx={center}
        cy={center}
        r={radius - STROKE / 2}
        fill="none"
        stroke={stroke}
        strokeWidth={STROKE}
      />
      {active && (
        <circle
          cx={center}
          cy={center}
          r={radius + ACTIVE_RING_OFFSET}
          fill="none"
          stroke={stroke}
          strokeWidth={STROKE}
        />
      )}
    </svg>
  );
}
