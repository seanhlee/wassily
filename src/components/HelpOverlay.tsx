import { FONT, FONT_SIZE, FONT_WEIGHT_UI } from "../constants";

interface Shortcut {
  key: string;
  action: string;
}

interface Section {
  title: string;
  description?: string;
  shortcuts: Shortcut[];
}

const COL1: Section[] = [
  {
    title: "COLOR",
    description: "purified to peak chroma at its hue",
    shortcuts: [
      { key: "CMD+CLICK", action: "SWATCH" },
      { key: "PASTE", action: "SWATCH" },
      { key: "DROP IMAGE", action: "PALETTE" },
    ],
  },
  {
    title: "RAMP",
    description: "lightness easing from one seed, chroma scaled to gamut",
    shortcuts: [
      { key: "R", action: "RAMP" },
      { key: "+ / \u2212", action: "STOPS" },
      { key: "M HOLD", action: "PURE MODE" },
    ],
  },
  {
    title: "EDIT",
    description: "double-click to open, scrub labels or type values",
    shortcuts: [
      { key: "DBL-CLICK", action: "EDITOR" },
      { key: "\u2191 \u2193", action: "LIGHTNESS" },
      { key: "\u2190 \u2192", action: "CHROMA" },
      { key: "SHIFT+ARROW", action: "5\u00D7" },
      { key: "I HOLD", action: "EYEDROPPER" },
    ],
  },
  {
    title: "HARMONY",
    description: "snap hues to harmonic geometry, press to cycle",
    shortcuts: [
      { key: "H", action: "HARMONIZE" },
      { key: "K", action: "LOCK HUE" },
      { key: "L", action: "CONNECT / TOGGLE" },
    ],
  },
];

const COL2: Section[] = [
  {
    title: "NAVIGATE",
    shortcuts: [
      { key: "SCROLL / SPACE+DRAG", action: "PAN" },
      { key: "CMD+SCROLL", action: "ZOOM" },
      { key: "CMD+0", action: "FIT" },
      { key: "D", action: "DARK / LIGHT" },
    ],
  },
  {
    title: "SELECT",
    shortcuts: [
      { key: "CLICK", action: "SELECT" },
      { key: "SHIFT+CLICK", action: "ADD" },
      { key: "CMD+A", action: "ALL" },
      { key: "DELETE", action: "DELETE" },
    ],
  },
  {
    title: "COPY",
    shortcuts: [
      { key: "C", action: "HEX" },
      { key: "O", action: "OKLCH" },
    ],
  },
  {
    title: "UNDO",
    shortcuts: [
      { key: "CMD+Z", action: "UNDO" },
      { key: "CMD+SHIFT+Z", action: "REDO" },
    ],
  },
];

interface HelpOverlayProps {
  lightMode: boolean;
  onDismiss: () => void;
}

export function HelpOverlay({ lightMode, onDismiss }: HelpOverlayProps) {
  const bg = lightMode ? "#fff" : "#000";
  const text = lightMode ? "rgba(0,0,0,0.85)" : "rgba(255,255,255,0.85)";
  const muted = lightMode ? "rgba(0,0,0,0.4)" : "rgba(255,255,255,0.4)";
  const desc = lightMode ? "rgba(0,0,0,0.45)" : "rgba(255,255,255,0.45)";
  const hint = lightMode ? "rgba(0,0,0,0.25)" : "rgba(255,255,255,0.25)";

  const renderSection = (section: Section) => (
    <div key={section.title} style={{ marginBottom: 20 }}>
      <div
        style={{
          color: text,
          fontSize: FONT_SIZE,
          fontFamily: FONT,
          fontWeight: FONT_WEIGHT_UI,
          textTransform: "uppercase",
          letterSpacing: "0.5px",
          marginBottom: section.description ? 4 : 6,
        }}
      >
        {section.title}
      </div>
      {section.description && (
        <div
          style={{
            color: desc,
            fontSize: FONT_SIZE,
            fontFamily: FONT,
            fontWeight: FONT_WEIGHT_UI,
            textTransform: "uppercase",
            letterSpacing: 0,
            marginBottom: 6,
            lineHeight: "1.5",
          }}
        >
          {section.description}
        </div>
      )}
      <div style={{ display: "flex", flexDirection: "column", gap: 1 }}>
        {section.shortcuts.map((s) => (
          <div
            key={s.key}
            style={{
              display: "flex",
              justifyContent: "space-between",
              gap: 16,
              fontSize: FONT_SIZE,
              fontFamily: FONT,
              fontWeight: FONT_WEIGHT_UI,
              textTransform: "uppercase",
              letterSpacing: "0.5px",
              lineHeight: "1.6",
            }}
          >
            <span style={{ color: text, opacity: 0.7, whiteSpace: "nowrap" }}>
              {s.key}
            </span>
            <span
              style={{
                color: muted,
                whiteSpace: "nowrap",
                flexShrink: 0,
              }}
            >
              {s.action}
            </span>
          </div>
        ))}
      </div>
    </div>
  );

  return (
    <div
      onClick={onDismiss}
      style={{
        position: "fixed",
        inset: 0,
        backgroundColor: bg,
        zIndex: 1000,
        display: "flex",
        justifyContent: "center",
        alignItems: "center",
        userSelect: "none",
        cursor: "default",
      }}
    >
      <div style={{ display: "flex", gap: 48 }}>
        <div>{COL1.map(renderSection)}</div>
        <div>{COL2.map(renderSection)}</div>
      </div>
      <div
        style={{
          position: "absolute",
          bottom: 24,
          left: "50%",
          transform: "translateX(-50%)",
          color: hint,
          fontSize: FONT_SIZE,
          fontFamily: FONT,
          fontWeight: FONT_WEIGHT_UI,
          textTransform: "uppercase",
          letterSpacing: "0.5px",
        }}
      >
        ?
      </div>
    </div>
  );
}
