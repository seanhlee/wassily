import { useCallback, useRef, useState } from "react";
import type { Swatch, Ramp } from "../types";
import { toHex } from "../engine/gamut";

// ---- Swatch ----

interface SwatchNodeProps {
  swatch: Swatch;
  selected: boolean;
  zoom: number;
  darkMode: boolean;
  onSelect: (id: string, additive: boolean) => void;
  onMove: (id: string, x: number, y: number) => void;
}

export function SwatchNode({
  swatch,
  selected,
  zoom,
  darkMode,
  onSelect,
  onMove,
}: SwatchNodeProps) {
  const hex = toHex(swatch.color);
  const showDetail = zoom > 1.5;
  const [hovered, setHovered] = useState(false);
  const isDragging = useRef(false);
  const dragStart = useRef({ x: 0, y: 0 });
  const posStart = useRef({ x: 0, y: 0 });

  const handleMouseDown = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation();
      isDragging.current = false;
      dragStart.current = { x: e.clientX, y: e.clientY };
      posStart.current = { x: swatch.position.x, y: swatch.position.y };

      const handleMove = (me: MouseEvent) => {
        const dx = (me.clientX - dragStart.current.x) / zoom;
        const dy = (me.clientY - dragStart.current.y) / zoom;
        if (Math.abs(dx) > 2 || Math.abs(dy) > 2) {
          isDragging.current = true;
          onMove(swatch.id, posStart.current.x + dx, posStart.current.y + dy);
        }
      };

      const handleUp = () => {
        window.removeEventListener("mousemove", handleMove);
        window.removeEventListener("mouseup", handleUp);
        if (!isDragging.current) {
          onSelect(swatch.id, e.shiftKey);
        }
        // Reset after a tick so click doesn't fire
        setTimeout(() => {
          isDragging.current = false;
        }, 0);
      };

      window.addEventListener("mousemove", handleMove);
      window.addEventListener("mouseup", handleUp);
    },
    [swatch.id, swatch.position, zoom, onSelect, onMove],
  );

  // Selection outline adapts to canvas
  const outlineColor = darkMode ? "rgba(0,0,0,0.5)" : "rgba(255,255,255,0.6)";

  return (
    <div
      className="swatch-node"
      onMouseDown={handleMouseDown}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
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
      {/* Hex on hover or at detail zoom */}
      {(hovered || showDetail) && (
        <div
          style={{
            position: "absolute",
            top: 52,
            left: 0,
            fontFamily: "'IBM Plex Mono', monospace",
            fontSize: 11,
            color: darkMode ? "oklch(0.35 0 0)" : "oklch(0.45 0 0)",
            whiteSpace: "nowrap",
            userSelect: "none",
            pointerEvents: "none",
          }}
        >
          {hex}
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
  onSelect: (id: string, additive: boolean) => void;
  onMove: (id: string, x: number, y: number) => void;
}

export function RampNode({
  ramp,
  selected,
  zoom,
  darkMode,
  onSelect,
  onMove,
}: RampNodeProps) {
  const showDetail = zoom > 1.5;
  const [hovered, setHovered] = useState(false);
  const isDragging = useRef(false);
  const dragStart = useRef({ x: 0, y: 0 });
  const posStart = useRef({ x: 0, y: 0 });

  const handleMouseDown = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation();
      isDragging.current = false;
      dragStart.current = { x: e.clientX, y: e.clientY };
      posStart.current = { x: ramp.position.x, y: ramp.position.y };

      const handleMove = (me: MouseEvent) => {
        const dx = (me.clientX - dragStart.current.x) / zoom;
        const dy = (me.clientY - dragStart.current.y) / zoom;
        if (Math.abs(dx) > 2 || Math.abs(dy) > 2) {
          isDragging.current = true;
          onMove(ramp.id, posStart.current.x + dx, posStart.current.y + dy);
        }
      };

      const handleUp = () => {
        window.removeEventListener("mousemove", handleMove);
        window.removeEventListener("mouseup", handleUp);
        if (!isDragging.current) {
          onSelect(ramp.id, e.shiftKey);
        }
        setTimeout(() => {
          isDragging.current = false;
        }, 0);
      };

      window.addEventListener("mousemove", handleMove);
      window.addEventListener("mouseup", handleUp);
    },
    [ramp.id, ramp.position, zoom, onSelect, onMove],
  );

  const outlineColor = darkMode ? "rgba(0,0,0,0.5)" : "rgba(255,255,255,0.6)";

  return (
    <div
      className="ramp-node"
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
      {/* Name label — hover only */}
      {hovered && (
        <div
          style={{
            fontFamily: "'IBM Plex Mono', monospace",
            fontSize: 11,
            color: darkMode ? "oklch(0.35 0 0)" : "oklch(0.45 0 0)",
            textTransform: "uppercase",
            letterSpacing: "-0.55px",
            marginBottom: 4,
            userSelect: "none",
            pointerEvents: "none",
          }}
        >
          {ramp.name}
        </div>
      )}

      {/* Continuous strip — no rounded corners, no gaps */}
      <div
        style={{
          display: "flex",
          outline: selected ? `1px solid ${outlineColor}` : "none",
          outlineOffset: 3,
        }}
      >
        {ramp.stops.map((stop) => {
          const color = darkMode ? stop.darkColor : stop.color;
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

      {/* Stop values — hover + detail zoom only */}
      {hovered && showDetail && (
        <div
          style={{
            display: "flex",
            pointerEvents: "none",
          }}
        >
          {ramp.stops.map((stop) => {
            const color = darkMode ? stop.darkColor : stop.color;
            const hex = toHex(color);
            return (
              <div
                key={stop.label}
                style={{
                  width: 48,
                  fontFamily: "'IBM Plex Mono', monospace",
                  fontSize: 8,
                  color: darkMode ? "oklch(0.35 0 0)" : "oklch(0.40 0 0)",
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
      )}
    </div>
  );
}
