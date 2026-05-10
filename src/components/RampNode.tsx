import { useState } from "react";
import type { Ramp, RampStop } from "../types";
import { clampToGamut, toCssColor, toHex } from "../engine/gamut";
import { solveRamp } from "../engine/ramp";
import { SWATCH_SIZE, FONT, FONT_SIZE } from "../constants";
import { useDrag } from "../hooks/useDrag";
import { SelectionBrackets, LockIcon } from "./SelectionBrackets";

/** Individual stop cell — shows hex value on hover */
function RampStopCell({
  stop,
  fallbackStop,
  rampId,
  lightMode,
}: {
  stop: RampStop;
  fallbackStop?: RampStop;
  rampId: string;
  lightMode: boolean;
}) {
  const [hovered, setHovered] = useState(false);
  const hex = toHex(fallbackStop?.color ?? clampToGamut(stop.color));
  const textColor = lightMode ? "rgba(0,0,0,0.85)" : "rgba(255,255,255,0.85)";

  return (
    <div
      data-ramp-id={rampId}
      data-stop-index={stop.index}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{ position: "relative" }}
    >
      <div
        style={{
          width: SWATCH_SIZE,
          height: SWATCH_SIZE,
          backgroundColor: toCssColor(stop.color),
        }}
      />
      <div
        style={{
          position: "absolute",
          top: "100%",
          left: 0,
          width: SWATCH_SIZE,
          fontFamily: FONT,
          fontSize: FONT_SIZE,
          color: textColor,
          textAlign: "center",
          marginTop: 4,
          userSelect: "none",
          pointerEvents: "none",
          opacity: hovered ? 1 : 0,
          transition: "opacity 0.15s ease",
        }}
      >
        <div style={{ textTransform: "uppercase", letterSpacing: "-0.55px" }}>
          {stop.label}
        </div>
        <div>{hex}</div>
      </div>
    </div>
  );
}

interface RampNodeProps {
  ramp: Ramp;
  selected: boolean;
  zoom: number;
  lightMode: boolean;
  peekPureMode?: boolean;
  onSelect: (id: string, additive: boolean) => void;
  onMove: (id: string, x: number, y: number) => void;
  onMoveSelected: (dx: number, dy: number) => void;
  onSnapshot?: () => void;
  onDuplicateDrag?: () => void;
}

export function RampNode({
  ramp,
  selected,
  zoom,
  lightMode,
  peekPureMode,
  onSelect,
  onMove,
  onMoveSelected,
  onSnapshot,
  onDuplicateDrag,
}: RampNodeProps) {
  const [hovered, setHovered] = useState(false);

  const peekPureSolve = peekPureMode
    ? solveRamp({
        hue: ramp.seedHue,
        stopCount: ramp.stopCount,
        mode: "pure",
        targetGamut: ramp.targetGamut,
      })
    : null;
  const displayStops = peekPureSolve?.stops ?? ramp.stops;
  const displayFallbackStops = peekPureSolve?.fallbackStops ?? ramp.fallbackStops;

  const handleMouseDown = useDrag(
    ramp.id,
    ramp.position,
    zoom,
    selected,
    onSelect,
    onMove,
    onMoveSelected,
    onSnapshot,
    onDuplicateDrag,
  );

  const outlineColor = lightMode ? "#000" : "#fff";

  return (
    <div
      className="ramp-node"
      data-object-id={ramp.id}
      onMouseDown={handleMouseDown}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        position: "absolute",
        left: ramp.position.x,
        top: ramp.position.y,
        cursor: "default",
      }}
    >
      {selected && (
        <SelectionBrackets
          width={displayStops.length * SWATCH_SIZE}
          height={SWATCH_SIZE}
          color={outlineColor}
        />
      )}
      {ramp.locked && (
        <LockIcon
          color={displayStops[displayStops.length - 1].color.l > 0.5
            ? "rgba(0,0,0,0.6)"
            : "rgba(255,255,255,0.6)"}
        />
      )}
      <div
        style={{
          position: "absolute",
          bottom: "100%",
          left: 0,
          marginBottom: 4,
          fontFamily: FONT,
          fontSize: FONT_SIZE,
          color: lightMode ? "rgba(0,0,0,0.85)" : "rgba(255,255,255,0.85)",
          textTransform: "uppercase",
          letterSpacing: "-0.55px",
          userSelect: "none",
          pointerEvents: "none",
          opacity: hovered ? 1 : 0,
          transition: "opacity 0.15s ease",
        }}
      >
        {ramp.name}
      </div>

      <div style={{ display: "flex" }}>
        {displayStops.map((stop, index) => (
          <RampStopCell
            key={stop.label}
            stop={stop}
            fallbackStop={displayFallbackStops?.[index]}
            rampId={ramp.id}
            lightMode={lightMode}
          />
        ))}
      </div>
    </div>
  );
}
