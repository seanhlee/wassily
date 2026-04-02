import { useState, useRef, useEffect, useCallback } from "react";
import { Menu } from "@base-ui/react/menu";
import type { BoardManager } from "../state/useBoardManager";
import { FONT, FONT_SIZE } from "../constants";

export function BoardBar({
  boardManager,
  lightMode,
}: {
  boardManager: BoardManager;
  lightMode: boolean;
}) {
  const [renaming, setRenaming] = useState(false);
  const [renameValue, setRenameValue] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (renaming && inputRef.current) {
      inputRef.current.focus();
      inputRef.current.select();
    }
  }, [renaming]);

  const startRename = useCallback(() => {
    setRenameValue(boardManager.activeBoard.name);
    setRenaming(true);
  }, [boardManager.activeBoard.name]);

  const commitRename = useCallback(() => {
    const trimmed = renameValue.trim();
    if (trimmed && trimmed !== boardManager.activeBoard.name) {
      boardManager.renameBoard(boardManager.activeBoardId, trimmed);
    }
    setRenaming(false);
  }, [renameValue, boardManager]);

  const textColor = lightMode ? "#666" : "#888";
  const popupBg = lightMode ? "#f8f8f8" : "#1a1a1a";
  const borderColor = lightMode ? "#e0e0e0" : "#333";

  const baseFont: React.CSSProperties = {
    fontFamily: FONT,
    fontSize: FONT_SIZE,
    fontWeight: 400,
    textTransform: "uppercase",
    letterSpacing: "0.5px",
  };

  function getItemStyle(state: { highlighted: boolean }): React.CSSProperties {
    return {
      ...baseFont,
      padding: "3px 10px",
      cursor: "pointer",
      color: textColor,
      backgroundColor: state.highlighted
        ? (lightMode ? "rgba(0,0,0,0.06)" : "rgba(255,255,255,0.08)")
        : "transparent",
      whiteSpace: "nowrap",
      outline: "none",
      display: "flex",
      alignItems: "center",
      justifyContent: "space-between",
    };
  }

  return (
    <div style={{ position: "fixed", top: 8, left: 12, zIndex: 1000, userSelect: "none" }}>
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
        <Menu.Root>
          <Menu.Trigger
            style={{
              ...baseFont,
              color: textColor,
              cursor: "pointer",
              lineHeight: 1,
              background: "none",
              border: "none",
              padding: 0,
              margin: 0,
              display: "flex",
              alignItems: "center",
              gap: 4,
            }}
          >
            <span onDoubleClick={(e) => { e.preventDefault(); startRename(); }}>
              {boardManager.activeBoard.name}
            </span>
            {"\u25BE"}
          </Menu.Trigger>
          <Menu.Portal>
            <Menu.Positioner sideOffset={4} align="start">
              <Menu.Popup
                style={{
                  background: popupBg,
                  border: `1px solid ${borderColor}`,
                  padding: "3px 0",
                  minWidth: 140,
                  outline: "none",
                }}
              >
                {boardManager.boards.map((b) => (
                  <Menu.Item
                    key={b.id}
                    style={(state) => ({
                      ...getItemStyle(state),
                      fontWeight: b.id === boardManager.activeBoardId ? 700 : 400,
                    })}
                    onClick={() => boardManager.switchBoard(b.id)}
                  >
                    <span style={{ flex: 1 }}>{b.name}</span>
                    {boardManager.boards.length > 1 && (
                      <span
                        onClick={(e) => {
                          e.stopPropagation();
                          boardManager.deleteBoard(b.id);
                        }}
                        style={{ marginLeft: 8, opacity: 0.4 }}
                      >
                        {"\u00D7"}
                      </span>
                    )}
                  </Menu.Item>
                ))}
                <Menu.Separator
                  style={{
                    height: 1,
                    backgroundColor: lightMode ? "rgba(0,0,0,0.08)" : "rgba(255,255,255,0.1)",
                    margin: "2px 0",
                  }}
                />
                <Menu.Item
                  style={(state) => getItemStyle(state)}
                  onClick={() => boardManager.createBoard("Untitled", true)}
                >
                  New board
                </Menu.Item>
              </Menu.Popup>
            </Menu.Positioner>
          </Menu.Portal>
        </Menu.Root>
      )}
    </div>
  );
}
