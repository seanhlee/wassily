import { useState, useRef, useEffect, useCallback } from "react";
import type { BoardManager } from "../state/useBoardManager";

export function BoardBar({
  boardManager,
  darkMode,
}: {
  boardManager: BoardManager;
  darkMode: boolean;
}) {
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const [renaming, setRenaming] = useState(false);
  const [renameValue, setRenameValue] = useState("");
  const dropdownRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Close dropdown on outside click
  useEffect(() => {
    if (!dropdownOpen) return;
    const handler = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setDropdownOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [dropdownOpen]);

  // Auto-focus and select rename input
  useEffect(() => {
    if (renaming && inputRef.current) {
      inputRef.current.focus();
      inputRef.current.select();
    }
  }, [renaming]);

  const startRename = useCallback(() => {
    setRenameValue(boardManager.activeBoard.name);
    setRenaming(true);
    setDropdownOpen(false);
  }, [boardManager.activeBoard.name]);

  const commitRename = useCallback(() => {
    const trimmed = renameValue.trim();
    if (trimmed && trimmed !== boardManager.activeBoard.name) {
      boardManager.renameBoard(boardManager.activeBoardId, trimmed);
    }
    setRenaming(false);
  }, [renameValue, boardManager]);

  const handleNewBoard = useCallback(() => {
    boardManager.createBoard("Untitled", true); // andSwitch=true, single state update
    setDropdownOpen(false);
  }, [boardManager]);

  // Colors: darkMode=true means LIGHT canvas
  const textColor = darkMode ? "#666" : "#888";
  const dropdownBg = darkMode ? "#f8f8f8" : "#1a1a1a";
  const borderColor = darkMode ? "#e0e0e0" : "#333";
  const hoverBg = darkMode ? "rgba(0,0,0,0.06)" : "rgba(255,255,255,0.08)";

  const baseFont: React.CSSProperties = {
    fontFamily: "'IBM Plex Mono', monospace",
    fontSize: 11,
    fontWeight: 400,
    textTransform: "uppercase",
    letterSpacing: "0.5px",
  };

  return (
    <div
      ref={dropdownRef}
      style={{ position: "fixed", top: 8, left: 12, zIndex: 1000, userSelect: "none" }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
        {renaming ? (
          <input
            ref={inputRef}
            value={renameValue}
            onChange={(e) => setRenameValue(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") commitRename();
              if (e.key === "Escape") setRenaming(false);
            }}
            onBlur={commitRename}
            style={{
              ...baseFont,
              color: textColor,
              background: "transparent",
              border: "none",
              borderBottom: `1px solid ${borderColor}`,
              outline: "none",
              padding: "1px 0",
              width: 120,
            }}
          />
        ) : (
          <span
            onDoubleClick={startRename}
            style={{ ...baseFont, color: textColor, cursor: "default" }}
          >
            {boardManager.activeBoard.name}
          </span>
        )}
        <span
          onClick={() => setDropdownOpen((o) => !o)}
          style={{ ...baseFont, color: textColor, cursor: "default", lineHeight: 1 }}
        >
          {"\u25BE"}
        </span>
      </div>

      {dropdownOpen && (
        <div
          style={{
            position: "absolute",
            top: "100%",
            left: 0,
            marginTop: 4,
            background: dropdownBg,
            border: `1px solid ${borderColor}`,
            padding: "3px 0",
            minWidth: 140,
          }}
        >
          {boardManager.boards.map((b) => (
            <BoardRow
              key={b.id}
              name={b.name}
              active={b.id === boardManager.activeBoardId}
              canDelete={boardManager.boards.length > 1}
              baseFont={baseFont}
              textColor={textColor}
              hoverBg={hoverBg}
              onSwitch={() => {
                boardManager.switchBoard(b.id);
                setDropdownOpen(false);
              }}
              onDelete={() => boardManager.deleteBoard(b.id)}
            />
          ))}
          <div
            style={{
              height: 1,
              backgroundColor: darkMode ? "rgba(0,0,0,0.08)" : "rgba(255,255,255,0.1)",
              margin: "2px 0",
            }}
          />
          <div
            onClick={handleNewBoard}
            style={{ ...baseFont, color: textColor, padding: "3px 10px", cursor: "default" }}
            onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = hoverBg)}
            onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = "transparent")}
          >
            New board
          </div>
        </div>
      )}
    </div>
  );
}

function BoardRow({
  name,
  active,
  canDelete,
  baseFont,
  textColor,
  hoverBg,
  onSwitch,
  onDelete,
}: {
  name: string;
  active: boolean;
  canDelete: boolean;
  baseFont: React.CSSProperties;
  textColor: string;
  hoverBg: string;
  onSwitch: () => void;
  onDelete: () => void;
}) {
  return (
    <div
      style={{
        ...baseFont,
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        padding: "3px 10px",
        color: textColor,
        fontWeight: active ? 700 : 400,
        cursor: "default",
      }}
      onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = hoverBg)}
      onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = "transparent")}
    >
      <span onClick={onSwitch} style={{ flex: 1 }}>
        {name}
      </span>
      {canDelete && (
        <span
          onClick={(e) => {
            e.stopPropagation();
            onDelete();
          }}
          style={{ marginLeft: 8, opacity: 0.4 }}
        >
          {"\u00D7"}
        </span>
      )}
    </div>
  );
}
