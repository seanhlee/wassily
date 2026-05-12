import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type PointerEvent as ReactPointerEvent,
} from "react";
import type { Ramp } from "../types";
import { FONT, FONT_SIZE, FONT_WEIGHT_UI } from "../constants";
import {
  formatRampOklchList,
  formatRampSrgbHexList,
  getRampStopExportRows,
  serializePaletteExport,
  type RampVariant,
} from "../engine/exportPalette";
import { toCssColor } from "../engine/gamut";

interface RampInspectorProps {
  ramp: Ramp | null;
  lightMode: boolean;
}

type CopyCommand = {
  label: string;
  title: string;
  value: string;
};

interface PanelPosition {
  x: number;
  y: number;
}

interface DragState {
  pointerId: number;
  startClientX: number;
  startClientY: number;
  startX: number;
  startY: number;
  width: number;
  height: number;
}

const PANEL_MARGIN = 12;

function copyText(text: string) {
  navigator.clipboard.writeText(text).catch(() => {
    const el = document.createElement("textarea");
    el.value = text;
    el.style.position = "fixed";
    el.style.opacity = "0";
    document.body.appendChild(el);
    el.select();
    document.execCommand("copy");
    document.body.removeChild(el);
  });
}

function formatMetadataValue(value: string | number | undefined): string {
  if (value === undefined) return "N/A";
  return String(value).toUpperCase();
}

function formatDelta(value: number | undefined): string {
  if (value === undefined) return "N/A";
  if (value < 0.0001) return "0.0000";
  return value.toFixed(4);
}

function metadataRows(ramp: Ramp): Array<[string, string]> {
  const metadata = ramp.solveMetadata;
  return [
    ["MODE", ramp.mode.toUpperCase()],
    ["STOPS", String(ramp.stopCount)],
    ["TARGET", formatMetadataValue(ramp.targetGamut ?? metadata?.targetGamut)],
    ["FALLBACK", formatMetadataValue(metadata?.fallbackGamut ?? "none")],
    ["EXACTNESS", formatMetadataValue(metadata?.exactness)],
    ["SEED", metadata?.seedLabel ?? "N/A"],
    ["SOURCE DELTA", formatDelta(metadata?.seedDelta.source)],
    ["FALLBACK DELTA", formatDelta(metadata?.seedDelta.fallback)],
  ];
}

function clampPanelPosition(
  x: number,
  y: number,
  width: number,
  height: number,
): PanelPosition {
  const maxX = Math.max(PANEL_MARGIN, window.innerWidth - width - PANEL_MARGIN);
  const maxY = Math.max(PANEL_MARGIN, window.innerHeight - height - PANEL_MARGIN);
  return {
    x: Math.min(Math.max(PANEL_MARGIN, x), maxX),
    y: Math.min(Math.max(PANEL_MARGIN, y), maxY),
  };
}

export function RampInspector({ ramp, lightMode }: RampInspectorProps) {
  const [variant, setVariant] = useState<RampVariant>("light");
  const [showDetails, setShowDetails] = useState(false);
  const [copiedLabel, setCopiedLabel] = useState<string | null>(null);
  const [panelPosition, setPanelPosition] = useState<PanelPosition | null>(null);
  const [dragState, setDragState] = useState<DragState | null>(null);
  const panelRef = useRef<HTMLElement | null>(null);

  const rows = useMemo(
    () => (ramp ? getRampStopExportRows(ramp, variant) : []),
    [ramp, variant],
  );

  const copyCommands = useMemo<CopyCommand[]>(() => {
    if (!ramp) return [];
    return [
      {
        label: "OKLCH",
        title: "Copy OKLCH values",
        value: formatRampOklchList(ramp, variant),
      },
      {
        label: "HEX",
        title: "Copy hex values",
        value: formatRampSrgbHexList(ramp, variant),
      },
      {
        label: "CSS",
        title: "Copy CSS custom properties",
        value: serializePaletteExport([ramp], "css"),
      },
      {
        label: "TAILWIND",
        title: "Copy Tailwind theme",
        value: serializePaletteExport([ramp], "tailwind"),
      },
      {
        label: "TOKENS",
        title: "Copy design tokens",
        value: serializePaletteExport([ramp], "tokens"),
      },
    ];
  }, [ramp, variant]);

  const handleHeaderPointerDown = useCallback(
    (event: ReactPointerEvent<HTMLDivElement>) => {
      if (event.pointerType === "mouse" && event.button !== 0) return;
      const panel = panelRef.current;
      if (!panel) return;

      const rect = panel.getBoundingClientRect();
      const startPosition = { x: rect.left, y: rect.top };
      setPanelPosition(startPosition);
      setDragState({
        pointerId: event.pointerId,
        startClientX: event.clientX,
        startClientY: event.clientY,
        startX: startPosition.x,
        startY: startPosition.y,
        width: rect.width,
        height: rect.height,
      });
      event.currentTarget.setPointerCapture(event.pointerId);
      event.preventDefault();
    },
    [],
  );

  useEffect(() => {
    if (!dragState) return;

    const handlePointerMove = (event: PointerEvent) => {
      if (event.pointerId !== dragState.pointerId) return;
      setPanelPosition(
        clampPanelPosition(
          dragState.startX + event.clientX - dragState.startClientX,
          dragState.startY + event.clientY - dragState.startClientY,
          dragState.width,
          dragState.height,
        ),
      );
    };

    const handlePointerUp = (event: PointerEvent) => {
      if (event.pointerId === dragState.pointerId) {
        setDragState(null);
      }
    };

    window.addEventListener("pointermove", handlePointerMove);
    window.addEventListener("pointerup", handlePointerUp);
    window.addEventListener("pointercancel", handlePointerUp);
    return () => {
      window.removeEventListener("pointermove", handlePointerMove);
      window.removeEventListener("pointerup", handlePointerUp);
      window.removeEventListener("pointercancel", handlePointerUp);
    };
  }, [dragState]);

  useEffect(() => {
    if (!panelPosition) return;

    const handleResize = () => {
      const rect = panelRef.current?.getBoundingClientRect();
      if (!rect) return;
      setPanelPosition((current) =>
        current
          ? clampPanelPosition(current.x, current.y, rect.width, rect.height)
          : current,
      );
    };

    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, [panelPosition]);

  useEffect(() => {
    if (!copiedLabel) return;
    const timer = window.setTimeout(() => setCopiedLabel(null), 900);
    return () => window.clearTimeout(timer);
  }, [copiedLabel]);

  if (!ramp) return null;

  const ink = lightMode ? "#000" : "#fff";
  const muted = lightMode ? "rgba(0,0,0,0.52)" : "rgba(255,255,255,0.58)";
  const panelBg = lightMode ? "rgba(255,255,255,0.78)" : "rgba(0,0,0,0.72)";

  const baseText: CSSProperties = {
    fontFamily: FONT,
    fontSize: FONT_SIZE,
    fontWeight: FONT_WEIGHT_UI,
    textTransform: "uppercase",
    letterSpacing: 0,
    color: ink,
  };

  const buttonBase: CSSProperties = {
    ...baseText,
    border: "none",
    background: "transparent",
    height: 24,
    padding: 0,
    color: muted,
    cursor: "pointer",
    appearance: "none",
    WebkitAppearance: "none",
    borderRadius: 0,
    lineHeight: 1,
  };

  return (
    <aside
      ref={panelRef}
      aria-label="Ramp inspector"
      style={{
        position: "fixed",
        ...(panelPosition
          ? { left: panelPosition.x, top: panelPosition.y }
          : { top: PANEL_MARGIN, right: PANEL_MARGIN }),
        width: "min(348px, calc(100vw - 24px))",
        maxHeight: "calc(100vh - 24px)",
        overflow: "auto",
        zIndex: 1200,
        background: panelBg,
        backdropFilter: "blur(18px) saturate(1.18)",
        WebkitBackdropFilter: "blur(18px) saturate(1.18)",
      }}
    >
      <div
        onPointerDown={handleHeaderPointerDown}
        style={{
          display: "grid",
          gridTemplateColumns: "minmax(0, 1fr) 58px",
          columnGap: 8,
          alignItems: "center",
          padding: "8px 10px",
          cursor: dragState ? "grabbing" : "move",
          touchAction: "none",
          userSelect: "none",
        }}
      >
        <div
          style={{
            ...baseText,
            letterSpacing: 0,
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
          }}
          title={ramp.name}
        >
          {ramp.name}
        </div>
        <button
          type="button"
          title="Show ramp info"
          onPointerDown={(event) => event.stopPropagation()}
          onClick={() => setShowDetails((value) => !value)}
          style={{
            ...buttonBase,
            height: 22,
            color: showDetails ? ink : muted,
          }}
        >
          INFO
        </button>
      </div>

      {showDetails && (
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "1fr 1fr",
            gap: 8,
            padding: "0 10px 8px",
          }}
        >
          {metadataRows(ramp).map(([label, value]) => (
            <div
              key={label}
              style={{
                minWidth: 0,
                padding: 0,
              }}
            >
              <div style={{ ...baseText, color: muted, marginBottom: 3 }}>
                {label}
              </div>
              <div
                style={{
                  ...baseText,
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                  whiteSpace: "nowrap",
                }}
                title={value}
              >
                {value}
              </div>
            </div>
          ))}
        </div>
      )}

      <div
        style={{
          padding: 8,
        }}
      >
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(5, minmax(0, 1fr))",
            gap: 4,
          }}
        >
          {copyCommands.map((command) => (
            <button
              key={command.label}
              type="button"
              title={command.title}
              onClick={() => {
                copyText(command.value);
                setCopiedLabel(command.label);
              }}
              style={{
                ...buttonBase,
                color: copiedLabel === command.label ? ink : muted,
              }}
              onMouseEnter={(event) => {
                event.currentTarget.style.color = ink;
              }}
              onMouseLeave={(event) => {
                event.currentTarget.style.color =
                  copiedLabel === command.label ? ink : muted;
              }}
            >
              {copiedLabel === command.label ? "COPIED" : command.label}
            </button>
          ))}
        </div>
      </div>

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "1fr 1fr",
          gap: 4,
          padding: "8px 8px 0",
        }}
      >
        {(["light", "dark"] as const).map((value) => (
          <button
            key={value}
            type="button"
            onClick={() => setVariant(value)}
            style={{
              ...buttonBase,
              color: variant === value ? ink : muted,
            }}
          >
            {value}
          </button>
        ))}
      </div>

      <div
        style={{
          display: "grid",
          gap: 0,
          padding: 8,
        }}
      >
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "36px 18px minmax(0, 1fr) 72px",
            columnGap: 8,
            alignItems: "center",
            padding: "0 0 5px",
            ...baseText,
            color: muted,
          }}
        >
          <div>STOP</div>
          <div />
          <div>OKLCH</div>
          <div>HEX</div>
        </div>

        {rows.map((row) => (
          <div
            key={row.label}
            style={{
              display: "grid",
              gridTemplateColumns: "36px 18px minmax(0, 1fr) 72px",
              columnGap: 8,
              alignItems: "center",
              minHeight: 24,
              ...baseText,
            }}
          >
            <div>{row.label}</div>
            <div
              aria-hidden="true"
              style={{
                width: 14,
                height: 14,
                background: toCssColor(row.canonicalColor),
              }}
            />
            <div
              title={row.canonicalOklch}
              style={{
                minWidth: 0,
                overflow: "hidden",
                textOverflow: "ellipsis",
                whiteSpace: "nowrap",
                textTransform: "none",
                letterSpacing: 0,
              }}
            >
              {row.canonicalOklch}
            </div>
            <div
              title={row.fallbackOklch}
              style={{
                minWidth: 0,
                overflow: "hidden",
                textOverflow: "ellipsis",
                whiteSpace: "nowrap",
                letterSpacing: 0,
              }}
            >
              {row.srgbHex}
            </div>
          </div>
        ))}
      </div>
    </aside>
  );
}
