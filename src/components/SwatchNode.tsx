import { useCallback, useRef, useState, useEffect } from "react";
import type { Swatch, Ramp } from "../types";
import { toHex, maxChroma } from "../engine/gamut";
import { generateRamp, nameForHue } from "../engine/ramp";

// ---- Hue arc indicator (ghost readout) ----

function HueArc({ hue, darkMode }: { hue: number; darkMode: boolean }) {
  const size = 88;
  const stroke = 2;
  const r = (size - stroke) / 2;
  const cx = size / 2;
  const cy = size / 2;

  // Convert hue to radians for the marker position (0° = top, clockwise)
  const rad = ((hue - 90) * Math.PI) / 180;
  const mx = cx + r * Math.cos(rad);
  const my = cy + r * Math.sin(rad);

  const labelColor = darkMode ? "rgba(0,0,0,0.6)" : "rgba(255,255,255,0.6)";
  const arcColor = darkMode ? "rgba(0,0,0,0.15)" : "rgba(255,255,255,0.15)";
  const markerColor = darkMode ? "rgba(0,0,0,0.7)" : "rgba(255,255,255,0.7)";

  return (
    <div
      style={{
        position: "absolute",
        left: 24 - size / 2,
        top: 24 - size / 2,
        width: size,
        height: size,
        pointerEvents: "none",
      }}
    >
      <svg width={size} height={size}>
        <circle
          cx={cx}
          cy={cy}
          r={r}
          fill="none"
          stroke={arcColor}
          strokeWidth={stroke}
        />
        <circle cx={mx} cy={my} r={3} fill={markerColor} />
      </svg>
      <div
        style={{
          position: "absolute",
          top: -14,
          left: 0,
          width: size,
          textAlign: "center",
          fontFamily: "'IBM Plex Mono', monospace",
          fontSize: 9,
          color: labelColor,
          textTransform: "uppercase",
          letterSpacing: "-0.55px",
          userSelect: "none",
        }}
      >
        {nameForHue(hue)} {Math.round(hue)}°
      </div>
    </div>
  );
}

// ---- Shared drag logic ----

function useDrag(
  id: string,
  position: { x: number; y: number },
  zoom: number,
  selected: boolean,
  onSelect: (id: string, additive: boolean) => void,
  onMove: (id: string, x: number, y: number) => void,
  onMoveSelected: (dx: number, dy: number) => void,
) {
  const isDragging = useRef(false);
  const dragStart = useRef({ x: 0, y: 0 });
  const lastDelta = useRef({ x: 0, y: 0 });

  const handleMouseDown = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation();
      isDragging.current = false;
      dragStart.current = { x: e.clientX, y: e.clientY };
      lastDelta.current = { x: 0, y: 0 };

      const handleMove = (me: MouseEvent) => {
        const dx = (me.clientX - dragStart.current.x) / zoom;
        const dy = (me.clientY - dragStart.current.y) / zoom;
        if (!isDragging.current && (Math.abs(dx) > 2 || Math.abs(dy) > 2)) {
          isDragging.current = true;
        }
        if (isDragging.current) {
          // Calculate incremental delta since last move
          const incDx = dx - lastDelta.current.x;
          const incDy = dy - lastDelta.current.y;
          lastDelta.current = { x: dx, y: dy };

          if (selected) {
            // Move all selected objects together
            onMoveSelected(incDx, incDy);
          } else {
            // Move just this one
            onMove(id, position.x + dx, position.y + dy);
          }
        }
      };

      const handleUp = () => {
        window.removeEventListener("mousemove", handleMove);
        window.removeEventListener("mouseup", handleUp);
        if (!isDragging.current) {
          onSelect(id, e.shiftKey);
        }
        setTimeout(() => {
          isDragging.current = false;
        }, 0);
      };

      window.addEventListener("mousemove", handleMove);
      window.addEventListener("mouseup", handleUp);
    },
    [id, position, zoom, selected, onSelect, onMove, onMoveSelected],
  );

  return handleMouseDown;
}

// ---- Swatch ----

interface SwatchNodeProps {
  swatch: Swatch;
  selected: boolean;
  zoom: number;
  darkMode: boolean;
  eKeyHeld: boolean;
  onSelect: (id: string, additive: boolean) => void;
  onMove: (id: string, x: number, y: number) => void;
  onMoveSelected: (dx: number, dy: number) => void;
  onAdjustColor?: (id: string, dl: number, dc: number) => void;
}

export function SwatchNode({
  swatch,
  selected,
  zoom,
  darkMode,
  eKeyHeld,
  onSelect,
  onMove,
  onMoveSelected,
  onAdjustColor,
}: SwatchNodeProps) {
  const hex = toHex(swatch.color);
  const showDetail = zoom > 1.5;
  const [hovered, setHovered] = useState(false);
  const [isScrolling, setIsScrolling] = useState(false);
  const scrollTimer = useRef<ReturnType<typeof setTimeout>>(undefined);

  // Detect wheel events on this swatch to show the hue arc
  const handleWheel = useCallback(() => {
    if (!selected) return;
    setIsScrolling(true);
    clearTimeout(scrollTimer.current);
    scrollTimer.current = setTimeout(() => setIsScrolling(false), 400);
  }, [selected]);

  // Clean up timer on unmount
  useEffect(() => () => clearTimeout(scrollTimer.current), []);

  // E+drag: adjust lightness (vertical) and chroma (horizontal)
  const [editAxis, setEditAxis] = useState<"l" | "c" | null>(null);
  const handleEditDrag = useCallback(
    (e: React.MouseEvent) => {
      if (!eKeyHeld || !selected || !onAdjustColor) return false;
      e.stopPropagation();

      const startY = e.clientY;
      const startX = e.clientX;
      let axis: "l" | "c" | null = null;
      let lastDy = 0;
      let lastDx = 0;

      const handleMove = (me: MouseEvent) => {
        const dy = (me.clientY - startY) / zoom;
        const dx = (me.clientX - startX) / zoom;

        // Determine axis from dominant drag direction (on first significant move)
        if (!axis) {
          if (Math.abs(dy) > 3 || Math.abs(dx) > 3) {
            axis = Math.abs(dy) > Math.abs(dx) ? "l" : "c";
            setEditAxis(axis);
          }
          return;
        }

        if (axis === "l") {
          // Vertical drag → lightness: up = lighter, down = darker
          const incDy = dy - lastDy;
          lastDy = dy;
          onAdjustColor(swatch.id, -incDy * 0.002, 0);
        } else {
          // Horizontal drag → chroma: right = more, left = less
          const incDx = dx - lastDx;
          lastDx = dx;
          onAdjustColor(swatch.id, 0, incDx * 0.001);
        }
      };

      const handleUp = () => {
        window.removeEventListener("mousemove", handleMove);
        window.removeEventListener("mouseup", handleUp);
        setEditAxis(null);
      };

      window.addEventListener("mousemove", handleMove);
      window.addEventListener("mouseup", handleUp);
      return true;
    },
    [eKeyHeld, selected, onAdjustColor, swatch.id, zoom],
  );

  const handleMouseDown = useDrag(
    swatch.id,
    swatch.position,
    zoom,
    selected,
    onSelect,
    onMove,
    onMoveSelected,
  );

  const outlineColor = darkMode ? "#000" : "#fff";
  // Note: darkMode=true means light canvas (D was pressed), darkMode=false means dark canvas

  return (
    <div
      className="swatch-node"
      data-object-id={swatch.id}
      onMouseDown={(e) => {
        if (!handleEditDrag(e)) handleMouseDown(e);
      }}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      onWheel={handleWheel}
      style={{
        position: "absolute",
        left: swatch.position.x,
        top: swatch.position.y,
        width: 48,
        height: 48,
        backgroundColor: hex,
        cursor: "default",
        outline: selected ? `1px solid ${outlineColor}` : "none",
        outlineOffset: 3,
      }}
    >
      {isScrolling && (
        <HueArc hue={swatch.color.h} darkMode={darkMode} />
      )}
      {editAxis === "l" && (
        <div
          style={{
            position: "absolute",
            left: -28,
            top: -8,
            width: 20,
            height: 64,
            pointerEvents: "none",
          }}
        >
          {/* Lightness scale */}
          <div
            style={{
              position: "absolute",
              left: 8,
              top: 0,
              width: 1,
              height: 64,
              background: darkMode
                ? "rgba(0,0,0,0.15)"
                : "rgba(255,255,255,0.15)",
            }}
          />
          {/* Current L position marker */}
          <div
            style={{
              position: "absolute",
              left: 4,
              top: (1 - swatch.color.l) * 64 - 1,
              width: 9,
              height: 2,
              background: darkMode
                ? "rgba(0,0,0,0.6)"
                : "rgba(255,255,255,0.6)",
            }}
          />
          <div
            style={{
              position: "absolute",
              left: -24,
              top: (1 - swatch.color.l) * 64 - 5,
              fontFamily: "'IBM Plex Mono', monospace",
              fontSize: 9,
              color: darkMode ? "rgba(0,0,0,0.6)" : "rgba(255,255,255,0.6)",
              userSelect: "none",
            }}
          >
            {swatch.color.l.toFixed(2)}
          </div>
        </div>
      )}
      {editAxis === "c" && (
        <div
          style={{
            position: "absolute",
            left: -8,
            top: 56,
            width: 64,
            height: 20,
            pointerEvents: "none",
          }}
        >
          {/* Chroma bar background (gamut max) */}
          <div
            style={{
              position: "absolute",
              left: 0,
              top: 8,
              width: 64,
              height: 2,
              background: darkMode
                ? "rgba(0,0,0,0.1)"
                : "rgba(255,255,255,0.1)",
            }}
          />
          {/* Current C fill */}
          <div
            style={{
              position: "absolute",
              left: 0,
              top: 8,
              width: Math.min(64, (swatch.color.c / (maxChroma(swatch.color.l, swatch.color.h) || 0.4)) * 64),
              height: 2,
              background: darkMode
                ? "rgba(0,0,0,0.5)"
                : "rgba(255,255,255,0.5)",
            }}
          />
          <div
            style={{
              position: "absolute",
              left: 0,
              top: 14,
              fontFamily: "'IBM Plex Mono', monospace",
              fontSize: 9,
              color: darkMode ? "rgba(0,0,0,0.6)" : "rgba(255,255,255,0.6)",
              whiteSpace: "nowrap",
              userSelect: "none",
            }}
          >
            C {swatch.color.c.toFixed(3)}
          </div>
        </div>
      )}
      {(hovered || showDetail || selected) && (
        <div
          style={{
            position: "absolute",
            top: 52,
            left: 0,
            fontFamily: "'IBM Plex Mono', monospace",
            fontSize: 9,
            color: darkMode ? "rgba(0,0,0,0.85)" : "rgba(255,255,255,0.85)",
            whiteSpace: "nowrap",
            userSelect: "none",
            pointerEvents: "none",
          }}
        >
          <div>{hex}</div>
          {selected && (
            <>
              <div style={{ marginTop: 2, opacity: 0.7 }}>
                L {swatch.color.l.toFixed(2)}{" "}
                C {swatch.color.c.toFixed(3)}{" "}
                H {Math.round(swatch.color.h)}
              </div>
              <div
                style={{
                  marginTop: 2,
                  textTransform: "uppercase",
                  letterSpacing: "-0.55px",
                  opacity: 0.7,
                }}
              >
                {nameForHue(swatch.color.h)}
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}

// ---- Ramp ----

interface RampNodeProps {
  ramp: Ramp;
  selected: boolean;
  zoom: number;
  darkMode: boolean;
  peekPureMode?: boolean;
  onSelect: (id: string, additive: boolean) => void;
  onMove: (id: string, x: number, y: number) => void;
  onMoveSelected: (dx: number, dy: number) => void;
}

export function RampNode({
  ramp,
  selected,
  zoom,
  darkMode,
  peekPureMode,
  onSelect,
  onMove,
  onMoveSelected,
}: RampNodeProps) {
  const showDetail = zoom > 1.5;
  const [hovered, setHovered] = useState(false);

  // Generate pure math stops when M is held
  const displayStops = peekPureMode
    ? generateRamp({
        hue: ramp.seedHue,
        stopCount: ramp.stopCount,
        mode: "pure",
      })
    : ramp.stops;

  const handleMouseDown = useDrag(
    ramp.id,
    ramp.position,
    zoom,
    selected,
    onSelect,
    onMove,
    onMoveSelected,
  );

  const outlineColor = darkMode ? "#000" : "#fff";
  // Note: darkMode=true means light canvas (D was pressed), darkMode=false means dark canvas

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
      {/* Name label — absolutely positioned above, no layout shift */}
      <div
        style={{
          position: "absolute",
          bottom: "100%",
          left: 0,
          marginBottom: 4,
          fontFamily: "'IBM Plex Mono', monospace",
          fontSize: 9,
          color: darkMode ? "rgba(0,0,0,0.85)" : "rgba(255,255,255,0.85)",
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

      {/* Continuous strip */}
      <div
        style={{
          display: "flex",
          outline: selected ? `1px solid ${outlineColor}` : "none",
          outlineOffset: 3,
        }}
      >
        {displayStops.map((stop) => {
          // Always show vivid colors — dark variant is for export only
          const color = stop.color;
          const hex = toHex(color);

          return (
            <div
              key={stop.label}
              style={{
                width: 48,
                height: 48,
                backgroundColor: hex,
              }}
            />
          );
        })}
      </div>

      {/* Stop values — absolutely positioned below, no layout shift */}
      <div
        style={{
          position: "absolute",
          top: "100%",
          left: 0,
          display: "flex",
          pointerEvents: "none",
          opacity: hovered && showDetail ? 1 : 0,
          transition: "opacity 0.15s ease",
        }}
      >
        {displayStops.map((stop) => {
          // Always show vivid colors — dark variant is for export only
          const color = stop.color;
          const hex = toHex(color);
          return (
            <div
              key={stop.label}
              style={{
                width: 48,
                fontFamily: "'IBM Plex Mono', monospace",
                fontSize: 9,
                color: darkMode ? "rgba(0,0,0,0.85)" : "rgba(255,255,255,0.85)",
                textAlign: "center",
                marginTop: 4,
                userSelect: "none",
              }}
            >
              <div
                style={{
                  textTransform: "uppercase",
                  letterSpacing: "-0.55px",
                }}
              >
                {stop.label}
              </div>
              <div>{hex}</div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ---- Reference Image ----

interface RefImageNodeProps {
  image: import("../types").ReferenceImage;
  darkMode: boolean;
  onSelect: (id: string, additive: boolean) => void;
  onMove: (id: string, x: number, y: number) => void;
  onMoveSelected: (dx: number, dy: number) => void;
  selected: boolean;
  zoom: number;
}

export function RefImageNode({
  image,
  darkMode,
  onSelect,
  onMove,
  onMoveSelected,
  selected,
  zoom,
}: RefImageNodeProps) {
  const handleMouseDown = useDrag(
    image.id,
    image.position,
    zoom,
    selected,
    onSelect,
    onMove,
    onMoveSelected,
  );

  const outlineColor = darkMode ? "#000" : "#fff";

  return (
    <div
      className="ref-image-node"
      data-object-id={image.id}
      onMouseDown={handleMouseDown}
      style={{
        position: "absolute",
        left: image.position.x,
        top: image.position.y,
        width: image.size.width,
        height: image.size.height,
        cursor: "default",
        outline: selected ? `1px solid ${outlineColor}` : "none",
        outlineOffset: 3,
        opacity: 1,
      }}
    >
      <img
        src={image.dataUrl}
        alt=""
        draggable={false}
        style={{
          width: "100%",
          height: "100%",
          objectFit: "cover",
          pointerEvents: "none",
        }}
      />
    </div>
  );
}
