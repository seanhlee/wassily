/**
 * Color editor components: SL color field, hue strip, and LCH controls.
 *
 * Used in SwatchNode's edit mode (double-click).
 */

import { useCallback, useRef, useState, useEffect, useMemo } from "react";
import type { OklchColor } from "../types";
import { toHex, maxChroma, generateFieldImage, oklchToOkhsl, okhslToOklch } from "../engine/gamut";
import { SWATCH_SIZE } from "../constants";

// ---- Layout constants ----

export const FIELD_SIZE = 216;
export const FIELD_LEFT = SWATCH_SIZE + 16;              // swatch + gap
const FIELD_TOP = 0;                            // top-aligned with swatch
const HUE_STRIP_W = 16;
const HUE_STRIP_GAP = 8;
const HUE_TRIANGLE_W = 6;
const HUE_STRIP_LEFT = FIELD_LEFT + FIELD_SIZE + HUE_STRIP_GAP;
export const EDITOR_TOOL_WIDTH = FIELD_SIZE + HUE_STRIP_GAP + HUE_STRIP_W + HUE_TRIANGLE_W;

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

// ---- Bracket indicator geometry ----

const BRACKET = {
  arm: 8,
  gap: 4,
  stroke: 0.75,
};

function FieldIndicator({ x, y }: { x: number; y: number }) {
  const { arm: a, gap: g, stroke } = BRACKET;
  return (
    <svg style={INDICATOR_SVG}>
      <path
        d={[
          `M${x - g + a},${y - g} L${x - g},${y - g} L${x - g},${y - g + a}`,
          `M${x + g - a},${y - g} L${x + g},${y - g} L${x + g},${y - g + a}`,
          `M${x - g},${y + g - a} L${x - g},${y + g} L${x - g + a},${y + g}`,
          `M${x + g},${y + g - a} L${x + g},${y + g} L${x + g - a},${y + g}`,
        ].join(" ")}
        fill="none"
        stroke="#fff"
        strokeWidth={stroke}
      />
    </svg>
  );
}

function HueTriangle({ y, stripWidth, color }: { y: number; stripWidth: number; color: string }) {
  const th = 8;
  return (
    <svg
      style={{
        position: "absolute",
        inset: 0,
        width: "100%",
        height: "100%",
        pointerEvents: "none",
        overflow: "visible",
      }}
    >
      <polygon
        points={`${stripWidth + HUE_TRIANGLE_W},${y - th / 2} ${stripWidth + HUE_TRIANGLE_W},${y + th / 2} ${stripWidth},${y}`}
        fill={color}
        stroke="none"
      />
    </svg>
  );
}

// ---- Color field ----

export function ColorField({
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
  const roundedHue = Math.round(color.h);

  const dataUrl = useMemo(
    () => generateFieldImage(roundedHue, FIELD_SIZE, FIELD_SIZE),
    [roundedHue],
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

// ---- Hue strip ----

export function HueStrip({
  hue,
  onHueChange,
  onDragStart,
  onDragEnd,
  lightMode,
}: {
  hue: number;
  onHueChange: (h: number) => void;
  onDragStart?: () => void;
  onDragEnd?: () => void;
  lightMode: boolean;
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
        width: HUE_STRIP_W + HUE_TRIANGLE_W,
        height: FIELD_SIZE,
        cursor: "ns-resize",
      }}
    >
      <div style={{
        width: HUE_STRIP_W,
        height: FIELD_SIZE,
        background: `linear-gradient(to bottom, ${stops.join(", ")})`,
      }} />
      <HueTriangle y={markerY} stripWidth={HUE_STRIP_W} color={lightMode ? "#000" : "#fff"} />
    </div>
  );
}

// ---- LCH control ----

export type LchChannel = "l" | "c" | "h";

const CHANNEL_SENSITIVITY: Record<LchChannel, { normal: number; fine: number }> = {
  l: { normal: 0.002, fine: 0.0004 },
  c: { normal: 0.001, fine: 0.0002 },
  h: { normal: 0.5, fine: 0.1 },
};

const CHANNEL_VALUE_WIDTH: Record<LchChannel, string> = {
  l: "4ch",
  c: "5ch",
  h: "3ch",
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
  if (channel === "c") {
    return Math.max(0, Math.min(maxChroma(color.l, color.h, "display-p3"), value));
  }
  return ((value % 360) + 360) % 360;
}

export function LchControl({
  channel,
  value,
  color,
  lightMode,
  zoom,
  onValueChange,
  onScrubStart,
  onScrubEnd,
  onCommit,
}: {
  channel: LchChannel;
  value: number;
  color: OklchColor;
  lightMode: boolean;
  zoom: number;
  onValueChange: (channel: LchChannel, value: number) => void;
  onScrubStart: (channel: LchChannel) => void;
  onScrubEnd: () => void;
  onCommit?: () => void;
}) {
  const [editing, setEditing] = useState(false);
  const [editValue, setEditValue] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);
  const labelColor = lightMode ? "rgba(0,0,0,0.7)" : "rgba(255,255,255,0.7)";

  useEffect(() => {
    if (editing && inputRef.current) {
      inputRef.current.select();
    }
  }, [editing]);

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
      if (isNaN(parsed)) return;
      onCommit?.();
      const clamped = clampChannel(channel, parsed, color);
      onValueChange(channel, clamped);
      onCommit?.();
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
  const valueWidth = CHANNEL_VALUE_WIDTH[channel];

  return (
    <span
      style={{
        display: "inline-grid",
        gridTemplateColumns: `1ch ${valueWidth}`,
        columnGap: "0.65ch",
        alignItems: "baseline",
        fontVariantNumeric: "tabular-nums",
      }}
    >
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
      <span
        onClick={!editing ? handleValueClick : undefined}
        onMouseDown={(e) => e.stopPropagation()}
        style={{
          position: "relative",
          cursor: editing ? "auto" : "text",
          userSelect: "none",
          width: valueWidth,
          overflow: "visible",
        }}
      >
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
              fontWeight: "inherit",
              lineHeight: "inherit",
              fontVariantNumeric: "tabular-nums",
              fontFeatureSettings: '"tnum"',
              color: "inherit",
              background: "transparent",
              border: "none",
              outline: "none",
              padding: 0,
              margin: 0,
              width: "100%",
              height: "1em",
              display: "block",
              appearance: "none",
              WebkitAppearance: "none",
            }}
          />
        )}
      </span>
    </span>
  );
}
