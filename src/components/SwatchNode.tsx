import { useCallback, useRef, useState, useEffect } from "react";
import type { Swatch, OklchColor } from "../types";
import {
  toCssColor,
  toHex,
  maxChroma,
  clampToGamut,
  parseColor,
} from "../engine/gamut";
import { SWATCH_SIZE, FONT, FONT_SIZE, FONT_WEIGHT_UI } from "../constants";
import { useDrag } from "../hooks/useDrag";
import { SelectionBrackets, LockIcon } from "./SelectionBrackets";
import { ColorField, HueStrip, LchControl, FIELD_SIZE, FIELD_LEFT, EDITOR_TOOL_WIDTH } from "./ColorEditor";
import type { LchChannel } from "./ColorEditor";

// Re-export components that Canvas.tsx imports from this file
export { RampNode } from "./RampNode";
export { RefImageNode } from "./RefImageNode";

interface SwatchNodeProps {
  swatch: Swatch;
  selected: boolean;
  zoom: number;
  lightMode: boolean;
  eKeyHeld: boolean;
  onSelect: (id: string, additive: boolean) => void;
  onMove: (id: string, x: number, y: number) => void;
  onMoveSelected: (dx: number, dy: number) => void;
  onAdjustColor?: (id: string, dl: number, dc: number) => void;
  onUpdateColor?: (id: string, color: OklchColor) => void;
  onSnapshot?: () => void;
  onDuplicateDrag?: () => void;
  /** True when the swatch's extraction marker is hovered (reverse link). */
  highlighted?: boolean;
  /** Reports hover over the swatch — used to reveal its extraction marker. */
  onHover?: (id: string | null) => void;
}

export function SwatchNode({
  swatch,
  selected,
  zoom,
  lightMode,
  eKeyHeld,
  onSelect,
  onMove,
  onMoveSelected,
  onAdjustColor,
  onUpdateColor,
  onSnapshot,
  onDuplicateDrag,
  highlighted,
  onHover,
}: SwatchNodeProps) {
  const hex = toHex(clampToGamut(swatch.color));
  const [editing, setEditing] = useState(false);
  const [hexEditing, setHexEditing] = useState(false);
  const [hexEditValue, setHexEditValue] = useState("");
  const hexInputRef = useRef<HTMLInputElement>(null);

  // Close editor when deselected
  useEffect(() => {
    if (selected) return;
    const timer = window.setTimeout(() => {
      setEditing(false);
      setHexEditing(false);
    }, 0);
    return () => window.clearTimeout(timer);
  }, [selected]);

  // Auto-select hex input text
  useEffect(() => {
    if (hexEditing && hexInputRef.current) {
      hexInputRef.current.select();
    }
  }, [hexEditing]);

  const handleHexClick = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    setHexEditValue(hex);
    setHexEditing(true);
  }, [hex]);

  const commitHex = useCallback((raw: string) => {
    setHexEditing(false);
    const parsed = parseColor(raw.trim());
    if (!parsed || !onUpdateColor) return;
    onSnapshot?.();
    onUpdateColor(swatch.id, parsed);
    onSnapshot?.();
  }, [swatch.id, onUpdateColor, onSnapshot]);

  // E+drag: adjust lightness (vertical) and chroma (horizontal)
  const handleEditDrag = useCallback(
    (e: React.MouseEvent) => {
      if (!eKeyHeld || !selected || !onAdjustColor) return false;
      e.stopPropagation();
      onSnapshot?.();

      const startY = e.clientY;
      const startX = e.clientX;
      let axis: "l" | "c" | null = null;
      let lastDy = 0;
      let lastDx = 0;

      const handleMove = (me: MouseEvent) => {
        const dy = (me.clientY - startY) / zoom;
        const dx = (me.clientX - startX) / zoom;

        if (!axis) {
          if (Math.abs(dy) > 3 || Math.abs(dx) > 3) {
            axis = Math.abs(dy) > Math.abs(dx) ? "l" : "c";
          }
          return;
        }

        if (axis === "l") {
          const incDy = dy - lastDy;
          lastDy = dy;
          onAdjustColor(swatch.id, -incDy * 0.002, 0);
        } else {
          const incDx = dx - lastDx;
          lastDx = dx;
          onAdjustColor(swatch.id, 0, incDx * 0.001);
        }
      };

      const handleUp = () => {
        window.removeEventListener("mousemove", handleMove);
        window.removeEventListener("mouseup", handleUp);
        onSnapshot?.();
      };

      window.addEventListener("mousemove", handleMove);
      window.addEventListener("mouseup", handleUp);
      return true;
    },
    [eKeyHeld, selected, onAdjustColor, onSnapshot, swatch.id, zoom],
  );

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

  const handleHueStripChange = useCallback(
    (newHue: number) => {
      if (!onUpdateColor) return;
      const { l, c } = swatch.color;
      const mc = maxChroma(l, newHue, "display-p3");
      onUpdateColor(
        swatch.id,
        clampToGamut({ l, c: Math.min(c, mc), h: newHue }, "display-p3"),
      );
    },
    [swatch.id, swatch.color, onUpdateColor],
  );

  const handleLchChange = useCallback(
    (channel: LchChannel, newValue: number) => {
      if (!onUpdateColor) return;
      const { l, c, h } = swatch.color;
      let color: OklchColor;
      if (channel === "l") {
        const mc = maxChroma(newValue, h, "display-p3");
        color = { l: newValue, c: Math.min(c, mc), h };
      } else if (channel === "c") {
        color = { l, c: newValue, h };
      } else {
        const mc = maxChroma(l, newValue, "display-p3");
        color = { l, c: Math.min(c, mc), h: newValue };
      }
      onUpdateColor(swatch.id, clampToGamut(color, "display-p3"));
    },
    [swatch.id, swatch.color, onUpdateColor],
  );

  const handleScrubStart = useCallback(() => {
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
    onSnapshot,
    onDuplicateDrag,
  );

  const outlineColor = lightMode ? "#000" : "#fff";
  const editorTextColor = lightMode ? "rgba(0,0,0,0.85)" : "rgba(255,255,255,0.85)";
  const editorPanelBg = lightMode ? "rgba(255,255,255,0.92)" : "rgba(0,0,0,0.86)";
  const editorTokenLabelColor = lightMode ? "rgba(0,0,0,0.7)" : "rgba(255,255,255,0.7)";
  const hexValueWidth = "7ch";
  const editorPanelPaddingX = 12;
  const editorPanelPaddingTop = 12;
  const editorPanelPaddingBottom = 13;
  const editorHeaderHeight = 13;
  const editorHeaderGap = 9;
  const editorReadoutGap = 8;
  const editorReadoutHeight = 13;

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
      onPointerEnter={onHover ? () => onHover(swatch.id) : undefined}
      onPointerLeave={onHover ? () => onHover(null) : undefined}
      style={{
        position: "absolute",
        left: swatch.position.x,
        top: swatch.position.y,
        width: SWATCH_SIZE,
        height: SWATCH_SIZE,
        backgroundColor: toCssColor(swatch.color),
        cursor: "default",
        zIndex: selected ? 10 : "auto",
      }}
    >
      {selected && (
        <SelectionBrackets
          width={SWATCH_SIZE}
          height={SWATCH_SIZE}
          color={outlineColor}
        />
      )}
      {highlighted && !selected && (
        <div
          aria-hidden="true"
          style={{
            position: "absolute",
            left: -3,
            top: -3,
            width: SWATCH_SIZE + 6,
            height: SWATCH_SIZE + 6,
            border: `0.75px solid ${outlineColor}`,
            pointerEvents: "none",
            opacity: 0.6,
          }}
        />
      )}
      {swatch.locked && (
        <LockIcon
          color={swatch.color.l > 0.5 ? "rgba(0,0,0,0.6)" : "rgba(255,255,255,0.6)"}
        />
      )}
      {editing && (
        <>
          <div
            aria-hidden="true"
            style={{
              position: "absolute",
              left: FIELD_LEFT - editorPanelPaddingX,
              top: -(editorPanelPaddingTop + editorHeaderHeight + editorHeaderGap),
              width: EDITOR_TOOL_WIDTH + editorPanelPaddingX * 2,
              height: editorHeaderHeight + editorHeaderGap + FIELD_SIZE + editorReadoutGap + editorReadoutHeight + editorPanelPaddingTop + editorPanelPaddingBottom,
              background: editorPanelBg,
              backdropFilter: "blur(18px) saturate(1.18)",
              WebkitBackdropFilter: "blur(18px) saturate(1.18)",
              pointerEvents: "none",
            }}
          />
          <div
            onMouseDown={(e) => e.stopPropagation()}
            style={{
              position: "absolute",
              top: -(editorHeaderHeight + editorHeaderGap),
              left: FIELD_LEFT,
              width: EDITOR_TOOL_WIDTH,
              height: editorHeaderHeight,
              fontFamily: FONT,
              fontSize: FONT_SIZE,
              fontWeight: FONT_WEIGHT_UI,
              color: editorTextColor,
              whiteSpace: "nowrap",
              userSelect: "none",
              pointerEvents: "auto",
              lineHeight: 1.1,
              fontVariantNumeric: "tabular-nums",
            }}
          >
            <span
              style={{
                display: "inline-grid",
                gridTemplateColumns: `3ch ${hexValueWidth}`,
                columnGap: "0.65ch",
                alignItems: "baseline",
              }}
            >
              <span style={{ color: editorTokenLabelColor }}>HEX</span>
              <div
                onClick={!hexEditing ? handleHexClick : undefined}
                style={{
                  cursor: hexEditing ? "auto" : "text",
                  position: "relative",
                  width: hexValueWidth,
                }}
              >
                <span style={{ visibility: hexEditing ? "hidden" : "visible" }}>{hex}</span>
                {hexEditing && (
                  <input
                    ref={hexInputRef}
                    type="text"
                    value={hexEditValue}
                    onChange={(e) => setHexEditValue(e.target.value)}
                    onKeyDown={(e) => {
                      e.stopPropagation();
                      if (e.key === "Enter") commitHex(hexEditValue);
                      else if (e.key === "Escape") setHexEditing(false);
                    }}
                    onBlur={() => commitHex(hexEditValue)}
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
              </div>
            </span>
          </div>
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
            lightMode={lightMode}
          />
          <div
            onMouseDown={(e) => e.stopPropagation()}
            style={{
              position: "absolute",
              top: FIELD_SIZE + editorReadoutGap,
              left: FIELD_LEFT,
              fontFamily: FONT,
              fontSize: FONT_SIZE,
              fontWeight: FONT_WEIGHT_UI,
              color: editorTextColor,
              whiteSpace: "nowrap",
              userSelect: "none",
              pointerEvents: "auto",
              display: "flex",
              alignItems: "baseline",
              gap: 18,
              lineHeight: 1.1,
              fontVariantNumeric: "tabular-nums",
            }}
          >
            {([
              { channel: "l" as LchChannel, value: swatch.color.l },
              { channel: "c" as LchChannel, value: swatch.color.c },
              { channel: "h" as LchChannel, value: swatch.color.h },
            ]).map(({ channel, value }) => (
              <span key={channel}>
                <LchControl
                  channel={channel}
                  value={value}
                  color={swatch.color}
                  lightMode={lightMode}
                  zoom={zoom}
                  onValueChange={handleLchChange}
                  onScrubStart={handleScrubStart}
                  onScrubEnd={handleScrubEnd}
                  onCommit={onSnapshot}
                />
              </span>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
