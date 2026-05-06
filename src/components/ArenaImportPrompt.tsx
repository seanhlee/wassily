import { useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import { FONT, FONT_SIZE } from "../constants";
import type { ArenaPreviewResult } from "../integrations/arena";

type ArenaImportLoading = "preview" | "more" | "import" | null;

interface ArenaImportPromptProps {
  anchor: { x: number; y: number };
  value: string;
  loading: ArenaImportLoading;
  error: string | null;
  preview: ArenaPreviewResult | null;
  selectedIds: number[];
  lightMode: boolean;
  onChange: (value: string) => void;
  onSubmit: () => void;
  onLoadMore: () => void;
  onToggleImage: (id: number) => void;
  onSelectAll: () => void;
  onSelectNone: () => void;
  onDismiss: () => void;
}

export function ArenaImportPrompt({
  anchor,
  value,
  loading,
  error,
  preview,
  selectedIds,
  lightMode,
  onChange,
  onSubmit,
  onLoadMore,
  onToggleImage,
  onSelectAll,
  onSelectNone,
  onDismiss,
}: ArenaImportPromptProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const width = preview ? 392 : 280;
  const panelHeight = preview ? 540 : 108;
  const left = Math.max(8, Math.min(anchor.x, window.innerWidth - width - 8));
  const top = Math.max(
    8,
    Math.min(anchor.y + 4, window.innerHeight - panelHeight - 8),
  );
  const gridMaxHeight = Math.max(
    180,
    Math.min(360, window.innerHeight - top - 150),
  );
  const textColor = lightMode ? "#000" : "#fff";
  const mutedColor = lightMode ? "rgba(0,0,0,0.55)" : "rgba(255,255,255,0.6)";
  const borderColor = lightMode ? "rgba(0,0,0,0.16)" : "rgba(255,255,255,0.18)";
  const selected = new Set(selectedIds);
  const selectedCount = preview
    ? preview.images.filter((image) => selected.has(image.id)).length
    : 0;
  const channelName = preview?.channel.title ?? preview?.channel.slug ?? "Are.na";
  const busy = loading !== null;
  const primaryLabel = getPrimaryLabel(loading, preview !== null, selectedCount);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onDismiss();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [onDismiss]);

  return createPortal(
    <form
      onSubmit={(event) => {
        event.preventDefault();
        if (!busy) onSubmit();
      }}
      onPointerDown={(event) => event.stopPropagation()}
      style={{
        position: "fixed",
        left,
        top,
        width,
        zIndex: 3000,
        background: lightMode ? "#fff" : "#000",
        border: `1px solid ${borderColor}`,
        padding: "7px 8px 6px",
        fontFamily: FONT,
        fontSize: FONT_SIZE,
        fontWeight: 400,
        textTransform: "uppercase",
        letterSpacing: "0.5px",
        color: textColor,
        maxHeight: "calc(100vh - 16px)",
        overflow: "hidden",
      }}
    >
      <input
        ref={inputRef}
        value={value}
        disabled={busy}
        placeholder="ARE.NA CHANNEL URL OR SLUG"
        onChange={(event) => onChange(event.target.value)}
        style={{
          width: "100%",
          border: "none",
          borderBottom: `1px solid ${borderColor}`,
          outline: "none",
          background: "transparent",
          color: textColor,
          padding: "0 0 5px",
          fontFamily: FONT,
          fontSize: FONT_SIZE,
          fontWeight: 400,
          textTransform: "uppercase",
          letterSpacing: "0.5px",
        }}
      />
      {preview && (
        <>
          <div
            style={{
              marginTop: 7,
              color: mutedColor,
              lineHeight: 1,
            }}
          >
            <div
              style={{
                overflow: "hidden",
                textOverflow: "ellipsis",
                whiteSpace: "nowrap",
              }}
            >
              {channelName}
            </div>
          </div>
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(4, 1fr)",
              gridAutoRows: 86,
              gap: 6,
              marginTop: 7,
              maxHeight: gridMaxHeight,
              overflowY: "auto",
              alignContent: "start",
            }}
          >
            {preview.images.map((image) => {
              const isSelected = selected.has(image.id);
              return (
                <button
                  key={image.id}
                  type="button"
                  aria-pressed={isSelected}
                  title={image.title ?? "Are.na image"}
                  onClick={() => onToggleImage(image.id)}
                  style={{
                    width: "100%",
                    height: 86,
                    minHeight: 86,
                    border: isSelected
                      ? `1px solid ${textColor}`
                      : `1px solid ${borderColor}`,
                    background: lightMode ? "#f7f7f7" : "#101010",
                    padding: 0,
                    opacity: isSelected ? 1 : 0.28,
                    cursor: "pointer",
                    overflow: "hidden",
                  }}
                >
                  <img
                    src={image.previewUrl}
                    alt=""
                    draggable={false}
                    style={{
                      width: "100%",
                      height: "100%",
                      objectFit: "cover",
                      display: "block",
                    }}
                  />
                </button>
              );
            })}
            {preview.pagination.hasMorePages && (
              <button
                type="button"
                disabled={busy}
                onClick={onLoadMore}
                style={{
                  width: "100%",
                  height: 86,
                  minHeight: 86,
                  border: `1px solid ${borderColor}`,
                  background: "transparent",
                  color: mutedColor,
                  cursor: busy ? "default" : "pointer",
                  fontFamily: FONT,
                  fontSize: FONT_SIZE,
                  fontWeight: 400,
                  textTransform: "uppercase",
                  letterSpacing: "0.5px",
                }}
              >
                {loading === "more" ? "Loading" : "More"}
              </button>
            )}
          </div>
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              gap: 10,
              marginTop: 6,
            }}
          >
            <button type="button" disabled={busy} onClick={onSelectAll} style={buttonStyle(mutedColor)}>
              All
            </button>
            <button type="button" disabled={busy} onClick={onSelectNone} style={buttonStyle(mutedColor)}>
              None
            </button>
          </div>
        </>
      )}
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          gap: 10,
          marginTop: 6,
          color: mutedColor,
        }}
      >
        <button
          type="submit"
          disabled={busy || (preview !== null && selectedCount === 0)}
          style={buttonStyle(mutedColor)}
        >
          {primaryLabel}
        </button>
        <button type="button" disabled={busy} onClick={onDismiss} style={buttonStyle(mutedColor)}>
          Cancel
        </button>
      </div>
      {error && (
        <div style={{ marginTop: 5, color: mutedColor, lineHeight: 1.25 }}>
          {error}
        </div>
      )}
    </form>,
    document.body,
  );
}

function getPrimaryLabel(
  loading: ArenaImportLoading,
  hasPreview: boolean,
  selectedCount: number,
): string {
  if (loading === "import") return "Importing";
  if (loading === "preview") return "Loading";
  return hasPreview ? `Import ${selectedCount}` : "Preview";
}

function buttonStyle(color: string): React.CSSProperties {
  return {
    border: "none",
    background: "transparent",
    color,
    cursor: "pointer",
    padding: 0,
    fontFamily: FONT,
    fontSize: FONT_SIZE,
    fontWeight: 400,
    textTransform: "uppercase",
    letterSpacing: "0.5px",
  };
}
