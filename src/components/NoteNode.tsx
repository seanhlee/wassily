import { useCallback, useEffect, useRef } from "react";
import type { Note } from "../types";
import { FONT } from "../constants";
import { useDrag } from "../hooks/useDrag";

const NOTE_FONT_SIZE = 14;
const NOTE_LINE_HEIGHT = 1.25;
const NOTE_LETTER_SPACING = "-0.55px";
const NOTE_PADDING_X = 8;
const NOTE_PADDING_Y = 4;
const NOTE_MIN_WIDTH = 60;

interface NoteNodeProps {
  note: Note;
  selected: boolean;
  editing: boolean;
  zoom: number;
  lightMode: boolean;
  onSelect: (id: string, additive: boolean) => void;
  onMove: (id: string, x: number, y: number) => void;
  onMoveSelected: (dx: number, dy: number) => void;
  onSnapshot: () => void;
  onDuplicateDrag?: () => void;
  onTextChange: (id: string, text: string) => void;
  onCommit: (id: string, text: string) => void;
  onStartEdit: (id: string) => void;
}

export function NoteNode({
  note,
  selected,
  editing,
  zoom,
  lightMode,
  onSelect,
  onMove,
  onMoveSelected,
  onSnapshot,
  onDuplicateDrag,
  onTextChange,
  onCommit,
  onStartEdit,
}: NoteNodeProps) {
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const handleMouseDown = useDrag(
    note.id,
    note.position,
    zoom,
    selected,
    onSelect,
    onMove,
    onMoveSelected,
    onSnapshot,
    onDuplicateDrag,
  );

  // Focus + select-all when entering edit mode
  useEffect(() => {
    if (!editing) return;
    const el = textareaRef.current;
    if (!el) return;
    el.focus();
    el.select();
  }, [editing]);

  const handleInput = useCallback(
    (e: React.ChangeEvent<HTMLTextAreaElement>) => {
      onTextChange(note.id, e.target.value);
    },
    [note.id, onTextChange],
  );

  const commit = useCallback(() => {
    onCommit(note.id, note.text);
  }, [note.id, note.text, onCommit]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
      if (e.key === "Escape") {
        e.preventDefault();
        e.stopPropagation();
        commit();
      }
    },
    [commit],
  );

  const handleDoubleClick = useCallback(
    (e: React.MouseEvent) => {
      if (editing) return;
      e.stopPropagation();
      onStartEdit(note.id);
    },
    [editing, note.id, onStartEdit],
  );

  const ink = lightMode ? "#000" : "#fff";

  // Warm-tinted highlighter background
  const tintHover = lightMode
    ? "rgba(245, 225, 190, 0.32)"
    : "rgba(70, 55, 35, 0.32)";
  const tintActive = lightMode
    ? "rgba(245, 225, 190, 0.55)"
    : "rgba(70, 55, 35, 0.55)";

  // Empty + not editing collapses to nothing visually, but the box stays
  // around for the grow-wrap mirror in edit mode.
  const displayText = note.text.length > 0 ? note.text : "";

  // Shared text styles — must match between display div and textarea so that
  // toggling edit mode doesn't shift the layout.
  const textStyle: React.CSSProperties = {
    fontFamily: FONT,
    fontSize: NOTE_FONT_SIZE,
    fontWeight: 400,
    lineHeight: NOTE_LINE_HEIGHT,
    letterSpacing: NOTE_LETTER_SPACING,
    textTransform: "uppercase",
    color: ink,
    whiteSpace: "pre",
    margin: 0,
    padding: 0,
    border: "none",
    background: "transparent",
    outline: "none",
    resize: "none",
    overflow: "hidden",
  };

  return (
    <div
      className="note-node"
      onMouseDown={editing ? undefined : handleMouseDown}
      onDoubleClick={handleDoubleClick}
      style={{
        position: "absolute",
        left: note.position.x,
        top: note.position.y,
        padding: `${NOTE_PADDING_Y}px ${NOTE_PADDING_X}px`,
        minWidth: editing ? NOTE_MIN_WIDTH : undefined,
        background: editing
          ? tintActive
          : selected
            ? tintActive
            : "transparent",
        cursor: editing ? "text" : selected ? "move" : "default",
        // Make the padded region a hover target via :hover via inline event
        // — see onMouseEnter/Leave below for the tint swap.
      }}
      // Use inline JS for hover state since we can't use :hover with style obj
      onMouseEnter={(e) => {
        if (editing || selected) return;
        e.currentTarget.style.background = tintHover;
      }}
      onMouseLeave={(e) => {
        if (editing || selected) return;
        e.currentTarget.style.background = "transparent";
      }}
    >
      {editing ? (
        <textarea
          ref={textareaRef}
          value={note.text}
          onChange={handleInput}
          onBlur={commit}
          onKeyDown={handleKeyDown}
          onMouseDown={(e) => e.stopPropagation()}
          rows={1}
          wrap="off"
          spellCheck={false}
          style={{
            ...textStyle,
            // field-sizing: content makes the textarea auto-grow to fit its
            // value in both directions (Chromium 123+, Safari 17.4+).
            // Falls back to the explicit min-width below in older browsers,
            // which is acceptable.
            fieldSizing: "content",
            minWidth: NOTE_MIN_WIDTH,
            display: "block",
          } as React.CSSProperties}
        />
      ) : (
        <div style={textStyle}>{displayText}</div>
      )}
    </div>
  );
}
