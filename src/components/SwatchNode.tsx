import { useCallback, useRef, useState, useEffect, useMemo } from "react";
import type { Swatch, Ramp, OklchColor } from "../types";
import { toHex, maxChroma, clampToGamut, generateFieldImage, oklchToOkhsl, okhslToOklch } from "../engine/gamut";
import { generateRamp, nameForHue } from "../engine/ramp";

// ---- Color picker controls ----
//
// Layout (all positions relative to the swatch's top-left):
//
//   [swatch 48×48]  8px  [field 128×128]  4px  [hue strip 6px]
//
// When selected, the SL field and hue strip appear to the right of the swatch.
// The field shows the Okhsl saturation × lightness space for the current hue.
// The hue strip shows the full spectrum; drag to change hue and repaint the field.
//
// Indicators use SVG at sub-pixel stroke with mix-blend-mode: difference.
// Both field and strip use matching bracket indicators (four inward-pointing L-corners).

const FIELD_SIZE = 128;
const FIELD_LEFT = 56;                          // 48 (swatch) + 8 (gap)
const FIELD_TOP = 24 - FIELD_SIZE / 2;          // vertically centered on swatch
const HUE_STRIP_W = 6;
const HUE_STRIP_LEFT = FIELD_LEFT + FIELD_SIZE + 4;

// Shared SVG indicator style
const INDICATOR_SVG: React.CSSProperties = {
  position: "absolute",
  inset: 0,
  width: "100%",
  height: "100%",
  pointerEvents: "none",
  mixBlendMode: "difference",
  overflow: "visible",
};

// Sub-pixel bracket indicator geometry.
//
// Both the field and strip use the same bracket language:
// four L-shaped corners forming a rectangle, arms pointing INWARD.
//
// Field (around a point):          Strip (around a Y position):
//
//   ┌     ┐                        ┌──────┐
//     · point                      │strip │
//   └     ┘                        └──────┘

const BRACKET = {
  arm: 5,      // length of each L-shaped arm in px
  gap: 2,      // distance from target to nearest bracket corner
  stroke: 0.75, // SVG stroke weight
};

/**
 * Four corner brackets framing a point in the SL color field.
 * Arms point inward toward the target point.
 *
 * Geometry for top-left ┌ (corner at (x-g, y-g)):
 *   Horizontal arm runs RIGHT from corner: (x-g, y-g) → (x-g+a, y-g)
 *   Vertical arm runs DOWN from corner:    (x-g, y-g) → (x-g, y-g+a)
 *
 * Path is drawn: arm-tip → corner → arm-tip (two segments per bracket).
 */
function FieldIndicator({ x, y }: { x: number; y: number }) {
  const { arm: a, gap: g, stroke } = BRACKET;
  return (
    <svg style={INDICATOR_SVG}>
      <path
        d={[
          // ┌ top-left: corner at (x-g, y-g), arms → right and ↓ down
          `M${x - g + a},${y - g} L${x - g},${y - g} L${x - g},${y - g + a}`,
          // ┐ top-right: corner at (x+g, y-g), arms ← left and ↓ down
          `M${x + g - a},${y - g} L${x + g},${y - g} L${x + g},${y - g + a}`,
          // └ bottom-left: corner at (x-g, y+g), arms → right and ↑ up
          `M${x - g},${y + g - a} L${x - g},${y + g} L${x - g + a},${y + g}`,
          // ┘ bottom-right: corner at (x+g, y+g), arms ← left and ↑ up
          `M${x + g},${y + g - a} L${x + g},${y + g} L${x + g - a},${y + g}`,
        ].join(" ")}
        fill="none"
        stroke="#fff"
        strokeWidth={stroke}
      />
    </svg>
  );
}

/**
 * Four corner brackets framing a position on the hue strip.
 * Same visual language as the field indicator, but the rectangle
 * spans the strip width instead of framing a point.
 *
 * The bracket rectangle is:
 *   left:   -gap
 *   right:  stripWidth + gap
 *   top:    y - gap
 *   bottom: y + gap
 */
function StripIndicator({ y, stripWidth }: { y: number; stripWidth: number }) {
  const { arm: a, gap: g, stroke } = BRACKET;
  const l = -g;              // left edge of bracket rectangle
  const r = stripWidth + g;  // right edge
  const t = y - g;           // top edge
  const b = y + g;           // bottom edge
  return (
    <svg style={INDICATOR_SVG}>
      <path
        d={[
          // ┌ top-left: corner at (l, t), arms → right and ↓ down
          `M${l + a},${t} L${l},${t} L${l},${t + a}`,
          // ┐ top-right: corner at (r, t), arms ← left and ↓ down
          `M${r - a},${t} L${r},${t} L${r},${t + a}`,
          // └ bottom-left: corner at (l, b), arms → right and ↑ up
          `M${l},${b - a} L${l},${b} L${l + a},${b}`,
          // ┘ bottom-right: corner at (r, b), arms ← left and ↑ up
          `M${r},${b - a} L${r},${b} L${r - a},${b}`,
        ].join(" ")}
        fill="none"
        stroke="#fff"
        strokeWidth={stroke}
      />
    </svg>
  );
}

/**
 * Okhsl saturation × lightness field.
 * X = saturation [0→1], Y = lightness [1→0] (top = light, bottom = dark).
 * Every pixel maps to a valid in-gamut sRGB color.
 */
function ColorField({
  color,
  onColorChange,
  onDragStart,
  onDragEnd,
}: {
  color: OklchColor;
  onColorChange: (color: OklchColor) => void;
  onDragStart?: () => void;
  onDragEnd?: () => void;
}) {
  const fieldRef = useRef<HTMLDivElement>(null);

  const dataUrl = useMemo(
    () => generateFieldImage(Math.round(color.h), FIELD_SIZE, FIELD_SIZE),
    [Math.round(color.h)],
  );

  const okhsl = oklchToOkhsl(color);
  const indicatorX = okhsl.s * FIELD_SIZE;
  const indicatorY = (1 - okhsl.l) * FIELD_SIZE;

  const colorFromPosition = useCallback(
    (clientX: number, clientY: number) => {
      if (!fieldRef.current) return color;
      const rect = fieldRef.current.getBoundingClientRect();
      const s = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
      const l = 1 - Math.max(0, Math.min(1, (clientY - rect.top) / rect.height));
      return okhslToOklch(color.h, s, l);
    },
    [color],
  );

  const handleMouseDown = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation();
      e.preventDefault();
      onDragStart?.();
      onColorChange(colorFromPosition(e.clientX, e.clientY));

      const handleMove = (me: MouseEvent) => {
        onColorChange(colorFromPosition(me.clientX, me.clientY));
      };
      const handleUp = () => {
        window.removeEventListener("mousemove", handleMove);
        window.removeEventListener("mouseup", handleUp);
        onDragEnd?.();
      };
      window.addEventListener("mousemove", handleMove);
      window.addEventListener("mouseup", handleUp);
    },
    [onColorChange, onDragStart, onDragEnd, colorFromPosition],
  );

  return (
    <div
      ref={fieldRef}
      onMouseDown={handleMouseDown}
      style={{
        position: "absolute",
        left: FIELD_LEFT,
        top: FIELD_TOP,
        width: FIELD_SIZE,
        height: FIELD_SIZE,
        backgroundImage: `url(${dataUrl})`,
        backgroundSize: "cover",
        pointerEvents: "auto",
        cursor: "crosshair",
      }}
    >
      <FieldIndicator x={indicatorX} y={indicatorY} />
    </div>
  );
}

/**
 * Vertical hue spectrum strip.
 * 0° at top, 360° at bottom. Click or drag to set hue.
 * The field repaints to show the new hue's saturation × lightness space.
 */
function HueStrip({
  hue,
  onHueChange,
  onDragStart,
  onDragEnd,
}: {
  hue: number;
  onHueChange: (h: number) => void;
  onDragStart?: () => void;
  onDragEnd?: () => void;
}) {
  const stripRef = useRef<HTMLDivElement>(null);
  const markerY = (hue / 360) * FIELD_SIZE;

  const hueFromY = useCallback((clientY: number) => {
    if (!stripRef.current) return hue;
    const rect = stripRef.current.getBoundingClientRect();
    const t = Math.max(0, Math.min(1, (clientY - rect.top) / rect.height));
    return t * 360;
  }, [hue]);

  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    e.preventDefault();
    onDragStart?.();
    onHueChange(hueFromY(e.clientY));

    const handleMove = (me: MouseEvent) => onHueChange(hueFromY(me.clientY));
    const handleUp = () => {
      window.removeEventListener("mousemove", handleMove);
      window.removeEventListener("mouseup", handleUp);
      onDragEnd?.();
    };
    window.addEventListener("mousemove", handleMove);
    window.addEventListener("mouseup", handleUp);
  }, [onHueChange, onDragStart, onDragEnd, hueFromY]);

  const stops = useMemo(() => {
    const result: string[] = [];
    for (let i = 0; i <= 12; i++) {
      const h = (i / 12) * 360;
      result.push(`${toHex(okhslToOklch(h, 1, 0.65))} ${(i / 12) * 100}%`);
    }
    return result;
  }, []);

  return (
    <div
      ref={stripRef}
      onMouseDown={handleMouseDown}
      style={{
        position: "absolute",
        left: HUE_STRIP_LEFT,
        top: FIELD_TOP,
        width: HUE_STRIP_W,
        height: FIELD_SIZE,
        cursor: "ns-resize",
      }}
    >
      <div style={{
        width: HUE_STRIP_W,
        height: FIELD_SIZE,
        background: `linear-gradient(to bottom, ${stops.join(", ")})`,
      }} />
      <StripIndicator y={markerY} stripWidth={HUE_STRIP_W} />
    </div>
  );
}

// ---- Scrubbable / typeable LCH control ----

type LchChannel = "l" | "c" | "h";

const CHANNEL_SENSITIVITY: Record<LchChannel, { normal: number; fine: number }> = {
  l: { normal: 0.002, fine: 0.0004 },
  c: { normal: 0.001, fine: 0.0002 },
  h: { normal: 0.5, fine: 0.1 },
};

function formatValue(channel: LchChannel, value: number): string {
  if (channel === "l") return value.toFixed(2);
  if (channel === "c") return value.toFixed(3);
  return String(Math.round(value));
}

function clampChannel(
  channel: LchChannel,
  value: number,
  color: OklchColor,
): number {
  if (channel === "l") return Math.max(0.06, Math.min(0.97, value));
  if (channel === "c") return Math.max(0, Math.min(maxChroma(color.l, color.h), value));
  // hue wraps
  return ((value % 360) + 360) % 360;
}

function LchControl({
  channel,
  value,
  color,
  darkMode,
  zoom,
  onValueChange,
  onScrubStart,
  onScrubEnd,
  onCommit,
}: {
  channel: LchChannel;
  value: number;
  color: OklchColor;
  darkMode: boolean;
  zoom: number;
  onValueChange: (channel: LchChannel, value: number) => void;
  onScrubStart: (channel: LchChannel) => void;
  onScrubEnd: () => void;
  onCommit?: () => void;
}) {
  const [editing, setEditing] = useState(false);
  const [editValue, setEditValue] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);
  const labelColor = darkMode ? "rgba(0,0,0,0.7)" : "rgba(255,255,255,0.7)";

  // Auto-select input text on mount
  useEffect(() => {
    if (editing && inputRef.current) {
      inputRef.current.select();
    }
  }, [editing]);

  // Scrub: drag on the channel letter
  const handleLabelMouseDown = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation();
      e.preventDefault();
      let lastX = e.clientX;
      let currentValue = value;
      onScrubStart(channel);

      const handleMove = (me: MouseEvent) => {
        const dx = (me.clientX - lastX) / zoom;
        lastX = me.clientX;
        const sens = me.altKey
          ? CHANNEL_SENSITIVITY[channel].fine
          : CHANNEL_SENSITIVITY[channel].normal;
        currentValue = clampChannel(channel, currentValue + dx * sens, color);
        onValueChange(channel, currentValue);
      };

      const handleUp = () => {
        window.removeEventListener("mousemove", handleMove);
        window.removeEventListener("mouseup", handleUp);
        onScrubEnd();
      };

      window.addEventListener("mousemove", handleMove);
      window.addEventListener("mouseup", handleUp);
    },
    [channel, value, color, zoom, onValueChange, onScrubStart, onScrubEnd],
  );

  // Type: click on the numeric value
  const handleValueClick = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation();
      setEditValue(formatValue(channel, value));
      setEditing(true);
    },
    [channel, value],
  );

  const commitEdit = useCallback(
    (raw: string) => {
      setEditing(false);
      const parsed = parseFloat(raw);
      if (isNaN(parsed)) return; // invalid → revert silently
      onCommit?.(); // capture pre-change state for undo
      const clamped = clampChannel(channel, parsed, color);
      onValueChange(channel, clamped);
      onCommit?.(); // capture post-change state for undo
    },
    [channel, color, onValueChange, onCommit],
  );

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      e.stopPropagation();
      if (e.key === "Enter") {
        commitEdit(editValue);
      } else if (e.key === "Escape") {
        setEditing(false);
      }
    },
    [editValue, commitEdit],
  );

  const formatted = formatValue(channel, value);

  return (
    <span style={{ display: "inline-flex", gap: "0.2ch", alignItems: "baseline" }}>
      {/* Channel letter — drag handle */}
      <span
        onMouseDown={handleLabelMouseDown}
        style={{
          cursor: "ew-resize",
          userSelect: "none",
          color: labelColor,
        }}
      >
        {channel.toUpperCase()}
      </span>
      {/* Value — the span always occupies space; input overlays it */}
      <span
        onClick={!editing ? handleValueClick : undefined}
        onMouseDown={(e) => e.stopPropagation()}
        style={{
          position: "relative",
          cursor: editing ? "auto" : "text",
          userSelect: "none",
        }}
      >
        {/* Invisible text holds the width stable */}
        <span style={{ visibility: editing ? "hidden" : "visible" }}>
          {formatted}
        </span>
        {editing && (
          <input
            ref={inputRef}
            type="text"
            value={editValue}
            onChange={(e) => setEditValue(e.target.value)}
            onKeyDown={handleKeyDown}
            onBlur={() => commitEdit(editValue)}
            onMouseDown={(e) => e.stopPropagation()}
            style={{
              position: "absolute",
              left: 0,
              top: 0,
              fontFamily: "inherit",
              fontSize: "inherit",
              color: "inherit",
              background: "transparent",
              border: "none",
              outline: "none",
              padding: 0,
              margin: 0,
              width: "100%",
            }}
          />
        )}
      </span>
    </span>
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
      if (e.button !== 0 || e.ctrlKey) return; // ignore right-click and Ctrl+click (macOS right-click)
      e.stopPropagation();
      isDragging.current = false;
      dragStart.current = { x: e.clientX, y: e.clientY };
      lastDelta.current = { x: 0, y: 0 };
      // Capture shiftKey now — React's SyntheticEvent gets nullified after this handler returns
      const shiftKey = e.shiftKey;

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
          onSelect(id, shiftKey);
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
  onUpdateColor?: (id: string, color: OklchColor) => void;
  onSnapshot?: () => void;
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
  onUpdateColor,
  onSnapshot,
}: SwatchNodeProps) {
  const hex = toHex(swatch.color);
  const showDetail = zoom > 1.5;
  const [hovered, setHovered] = useState(false);
  const [editing, setEditing] = useState(false);

  // Close editor when deselected
  useEffect(() => {
    if (!selected) setEditing(false);
  }, [selected]);

  // E+drag: adjust lightness (vertical) and chroma (horizontal)
  const handleEditDrag = useCallback(
    (e: React.MouseEvent) => {
      if (!eKeyHeld || !selected || !onAdjustColor) return false;
      e.stopPropagation();
      onSnapshot?.(); // capture pre-gesture state for undo

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
            // axis locked
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
        onSnapshot?.(); // undo checkpoint after E+drag gesture
      };

      window.addEventListener("mousemove", handleMove);
      window.addEventListener("mouseup", handleUp);
      return true;
    },
    [eKeyHeld, selected, onAdjustColor, onSnapshot, swatch.id, zoom],
  );

  // ---- Color field value change (click/drag in L×C field) ----
  const handleFieldColorChange = useCallback(
    (newColor: OklchColor) => {
      if (!onUpdateColor) return;
      onUpdateColor(swatch.id, newColor);
    },
    [swatch.id, onUpdateColor],
  );

  const handleFieldDragStart = useCallback(() => {
    onSnapshot?.();
  }, [onSnapshot]);

  const handleFieldDragEnd = useCallback(() => {
    onSnapshot?.();
  }, [onSnapshot]);

  // ---- Hue strip change ----
  const handleHueStripChange = useCallback(
    (newHue: number) => {
      if (!onUpdateColor) return;
      const { l, c } = swatch.color;
      const mc = maxChroma(l, newHue);
      onUpdateColor(swatch.id, clampToGamut({ l, c: Math.min(c, mc), h: newHue }));
    },
    [swatch.id, swatch.color, onUpdateColor],
  );

  // ---- LCH label value change (scrub or typed) ----
  const handleLchChange = useCallback(
    (channel: LchChannel, newValue: number) => {
      if (!onUpdateColor) return;
      const { l, c, h } = swatch.color;
      let color: OklchColor;
      if (channel === "l") {
        const mc = maxChroma(newValue, h);
        color = { l: newValue, c: Math.min(c, mc), h };
      } else if (channel === "c") {
        color = { l, c: newValue, h };
      } else {
        const mc = maxChroma(l, newValue);
        color = { l, c: Math.min(c, mc), h: newValue };
      }
      onUpdateColor(swatch.id, clampToGamut(color));
    },
    [swatch.id, swatch.color, onUpdateColor],
  );

  const handleScrubStart = useCallback((_ch: LchChannel) => {
    onSnapshot?.();
  }, [onSnapshot]);

  const handleScrubEnd = useCallback(() => {
    onSnapshot?.();
  }, [onSnapshot]);

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
      onDoubleClick={(e) => {
        e.stopPropagation();
        if (selected) setEditing(true);
      }}
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
        zIndex: selected ? 10 : "auto",
      }}
    >
      {/* Lock indicator — always visible when locked */}
      {swatch.locked && (
        <div
          style={{
            position: "absolute",
            top: -6,
            right: -6,
            width: 3,
            height: 3,
            borderRadius: "50%",
            backgroundColor: darkMode
              ? "rgba(0,0,0,0.7)"
              : "rgba(255,255,255,0.7)",
            pointerEvents: "none",
          }}
        />
      )}
      {/* L×C color field — appears on double-click */}
      {editing && (
        <>
          <ColorField
            color={swatch.color}
            onColorChange={handleFieldColorChange}
            onDragStart={handleFieldDragStart}
            onDragEnd={handleFieldDragEnd}
          />
          <HueStrip
            hue={swatch.color.h}
            onHueChange={handleHueStripChange}
            onDragStart={handleFieldDragStart}
            onDragEnd={handleFieldDragEnd}
          />
        </>
      )}
      {(hovered || showDetail || selected) && (
        <div
          style={{
            position: "absolute",
            top: editing ? FIELD_TOP + FIELD_SIZE + 4 : 52,
            left: 0,
            zIndex: 2,
            fontFamily: "'IBM Plex Mono', monospace",
            fontSize: 9,
            color: darkMode ? "rgba(0,0,0,0.85)" : "rgba(255,255,255,0.85)",
            whiteSpace: "nowrap",
            userSelect: "none",
            pointerEvents: editing ? "auto" : "none",
          }}
        >
          <div>{hex}</div>
          {editing && (
            <>
              <div style={{ marginTop: 2, opacity: 0.7, display: "flex", gap: "0.6ch" }}>
                <LchControl
                  channel="l"
                  value={swatch.color.l}
                  color={swatch.color}
                  darkMode={darkMode}
                  zoom={zoom}
                  onValueChange={handleLchChange}
                  onScrubStart={handleScrubStart}
                  onScrubEnd={handleScrubEnd}
                  onCommit={onSnapshot}
                />
                <LchControl
                  channel="c"
                  value={swatch.color.c}
                  color={swatch.color}
                  darkMode={darkMode}
                  zoom={zoom}
                  onValueChange={handleLchChange}
                  onScrubStart={handleScrubStart}
                  onScrubEnd={handleScrubEnd}
                  onCommit={onSnapshot}
                />
                <LchControl
                  channel="h"
                  value={swatch.color.h}
                  color={swatch.color}
                  darkMode={darkMode}
                  zoom={zoom}
                  onValueChange={handleLchChange}
                  onScrubStart={handleScrubStart}
                  onScrubEnd={handleScrubEnd}
                  onCommit={onSnapshot}
                />
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
      {/* Lock indicator — always visible when locked */}
      {ramp.locked && (
        <div
          style={{
            position: "absolute",
            top: -6,
            right: -6,
            width: 3,
            height: 3,
            borderRadius: "50%",
            backgroundColor: darkMode
              ? "rgba(0,0,0,0.7)"
              : "rgba(255,255,255,0.7)",
            pointerEvents: "none",
            zIndex: 1,
          }}
        />
      )}
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
