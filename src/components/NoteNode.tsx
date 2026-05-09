import { useCallback, useEffect, useRef } from "react";
import type { Note } from "../types";
import { FONT } from "../constants";
import { useDrag } from "../hooks/useDrag";

const NOTE_FONT_SIZE = 14;
const NOTE_LINE_HEIGHT = 1.25;
const NOTE_LETTER_SPACING = "0";
const NOTE_PADDING_X = 12;
const NOTE_PADDING_Y = 7;
const NOTE_MIN_WIDTH = 72;
const STRAIGHT_SINGLE_QUOTE = "'";
const STRAIGHT_DOUBLE_QUOTE = "\"";
const OPEN_SINGLE_QUOTE = "‘";
const CLOSE_SINGLE_QUOTE = "’";
const OPEN_DOUBLE_QUOTE = "“";
const CLOSE_DOUBLE_QUOTE = "”";

interface NoteNodeProps {
  note: Note;
  selected: boolean;
  suppressSelectedTint: boolean;
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
  onShowSelectedTint: () => void;
}

export function NoteNode({
  note,
  selected,
  suppressSelectedTint,
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
  onShowSelectedTint,
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
      onTextChange(note.id, smartenNoteText(e.target.value));
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

  const handleNoteMouseDown = useCallback(
    (e: React.MouseEvent) => {
      onShowSelectedTint();
      handleMouseDown(e);
    },
    [handleMouseDown, onShowSelectedTint],
  );

  const ink = lightMode ? "#000" : "#fff";

  // Barely-there neutral field for hover and selection.
  const tintHover = lightMode
    ? "rgba(0, 0, 0, 0.02)"
    : "rgba(255, 255, 255, 0.03)";
  const tintActive = lightMode
    ? "rgba(0, 0, 0, 0.035)"
    : "rgba(255, 255, 255, 0.045)";
  const showSelectedTint = selected && !editing && !suppressSelectedTint;

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
      onMouseDown={editing ? undefined : handleNoteMouseDown}
      onDoubleClick={handleDoubleClick}
      style={{
        position: "absolute",
        left: note.position.x,
        top: note.position.y,
        padding: `${NOTE_PADDING_Y}px ${NOTE_PADDING_X}px`,
        minWidth: editing ? NOTE_MIN_WIDTH : undefined,
        background: showSelectedTint ? tintActive : "transparent",
        cursor: editing ? "text" : selected ? "move" : "default",
        // Make the padded region a hover target via :hover via inline event
        // — see onMouseEnter/Leave below for the tint swap.
      }}
      // Use inline JS for hover state since we can't use :hover with style obj
      onMouseEnter={(e) => {
        if (editing || showSelectedTint) return;
        e.currentTarget.style.background = tintHover;
      }}
      onMouseLeave={(e) => {
        if (editing || showSelectedTint) return;
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

function smartenNoteText(text: string): string {
  let smart = "";
  for (let i = 0; i < text.length; i++) {
    const char = text[i];
    if (char === STRAIGHT_DOUBLE_QUOTE) {
      smart += isOpeningQuoteContext(smart)
        ? OPEN_DOUBLE_QUOTE
        : CLOSE_DOUBLE_QUOTE;
    } else if (char === STRAIGHT_SINGLE_QUOTE) {
      smart += isOpeningSingleQuote(text, i, smart)
        ? OPEN_SINGLE_QUOTE
        : CLOSE_SINGLE_QUOTE;
    } else {
      smart += char;
    }
  }
  return smart;
}

function isOpeningSingleQuote(
  text: string,
  index: number,
  smartText: string,
): boolean {
  const previous = smartText.at(-1);
  const next = text[index + 1];
  if (isWordChar(previous) && isWordChar(next)) return false;
  if (isDigit(next)) return false;
  return isOpeningQuoteContext(smartText);
}

function isOpeningQuoteContext(text: string): boolean {
  const previous = text.at(-1);
  return (
    previous === undefined ||
    /\s/.test(previous) ||
    "([{<".includes(previous) ||
    previous === OPEN_DOUBLE_QUOTE ||
    previous === OPEN_SINGLE_QUOTE ||
    previous === "—" ||
    previous === "–"
  );
}

function isWordChar(char: string | undefined): boolean {
  return char !== undefined && /[A-Za-z0-9]/.test(char);
}

function isDigit(char: string | undefined): boolean {
  return char !== undefined && /[0-9]/.test(char);
}
