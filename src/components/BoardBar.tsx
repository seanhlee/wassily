import { useState, useRef, useEffect, useCallback } from "react";
import { Menu } from "@base-ui/react/menu";
import type { BoardManager } from "../state/useBoardManager";
import { FONT, FONT_SIZE, FONT_WEIGHT_UI, FONT_WEIGHT_TEXT } from "../constants";

const BOARD_ACTION_COLUMN_WIDTH = "8ch";
const BOARD_EDITOR_MIN_WIDTH = 276;
const UNTITLED_BOARD_NAME = "Untitled";

export function BoardBar({
  boardManager,
  lightMode,
}: {
  boardManager: BoardManager;
  lightMode: boolean;
}) {
  const [editingBoards, setEditingBoards] = useState(false);
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState("");
  const [pendingDeleteId, setPendingDeleteId] = useState<string | null>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (renamingId && inputRef.current) {
      inputRef.current.focus();
      inputRef.current.select();
    }
  }, [renamingId]);

  const startRename = useCallback((id: string, name: string) => {
    setEditingBoards(true);
    setPendingDeleteId(null);
    setRenameValue(name);
    setRenamingId(id);
  }, []);

  const commitRename = useCallback(() => {
    if (!renamingId) return;
    const trimmed = renameValue.trim();
    const board = boardManager.boards.find((item) => item.id === renamingId);
    if (trimmed && board && trimmed !== board.name) {
      boardManager.renameBoard(renamingId, trimmed);
    }
    setRenamingId(null);
  }, [boardManager, renameValue, renamingId]);

  useEffect(() => {
    if (!editingBoards) return;

    const onPointerDown = (event: PointerEvent) => {
      const target = event.target;
      if (target instanceof Node && rootRef.current?.contains(target)) return;
      commitRename();
      setEditingBoards(false);
      setPendingDeleteId(null);
    };

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      setEditingBoards(false);
      setRenamingId(null);
      setPendingDeleteId(null);
    };

    window.addEventListener("pointerdown", onPointerDown, true);
    window.addEventListener("keydown", onKeyDown);
    return () => {
      window.removeEventListener("pointerdown", onPointerDown, true);
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [commitRename, editingBoards]);

  const closeEditor = useCallback(() => {
    commitRename();
    setEditingBoards(false);
    setPendingDeleteId(null);
  }, [commitRename]);

  const requestDelete = useCallback(
    (id: string) => {
      if (pendingDeleteId !== id) {
        setPendingDeleteId(id);
        return;
      }

      setPendingDeleteId(null);
      if (renamingId === id) setRenamingId(null);
      boardManager.deleteBoard(id);
    },
    [boardManager, pendingDeleteId, renamingId],
  );

  const textColor = lightMode ? "#666" : "#888";
  const actionColor = lightMode ? "rgba(0,0,0,0.45)" : "rgba(255,255,255,0.5)";
  const popupBg = lightMode ? "rgba(255,255,255,0.76)" : "rgba(0,0,0,0.72)";

  const baseFont: React.CSSProperties = {
    fontFamily: FONT,
    fontSize: FONT_SIZE,
    fontWeight: FONT_WEIGHT_UI,
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
    <div
      ref={rootRef}
      style={{ position: "fixed", top: 8, left: 12, zIndex: 1000, userSelect: "none" }}
    >
      {editingBoards ? (
        <>
          <button
            type="button"
            onMouseDown={(event) => event.preventDefault()}
            onClick={closeEditor}
            style={{
              ...baseFont,
              color: textColor,
              cursor: "pointer",
              lineHeight: 1,
              background: "none",
              border: "none",
              padding: 0,
              margin: 0,
            }}
          >
            Done
          </button>
          <div
            style={{
              position: "absolute",
              top: 18,
              left: 0,
              minWidth: BOARD_EDITOR_MIN_WIDTH,
              background: popupBg,
              backdropFilter: "blur(18px) saturate(1.18)",
              WebkitBackdropFilter: "blur(18px) saturate(1.18)",
              padding: "4px 0",
              outline: "none",
            }}
          >
            {boardManager.boards.map((board) => {
              const isRenaming = renamingId === board.id;
              const isPendingDelete = pendingDeleteId === board.id;
              return (
                <div
                  key={board.id}
                  style={{
                    ...baseFont,
                    display: "grid",
                    gridTemplateColumns: `minmax(128px, 1fr) ${BOARD_ACTION_COLUMN_WIDTH} ${BOARD_ACTION_COLUMN_WIDTH}`,
                    columnGap: 10,
                    alignItems: "center",
                    minHeight: 22,
                    padding: "2px 10px",
                    color: textColor,
                  }}
                >
                  {isRenaming ? (
                    <input
                      ref={inputRef}
                      value={renameValue}
                      onChange={(event) => setRenameValue(event.target.value)}
                      onKeyDown={(event) => {
                        if (event.key === "Enter") commitRename();
                        if (event.key === "Escape") setRenamingId(null);
                      }}
                      onBlur={commitRename}
                      style={{
                        ...baseFont,
                        minWidth: 0,
                        width: "100%",
                        color: textColor,
                        background: "transparent",
                        border: "none",
                        outline: "none",
                        padding: 0,
                      }}
                    />
                  ) : (
                    <button
                      type="button"
                      onClick={() => boardManager.switchBoard(board.id)}
                      style={{
                        ...baseFont,
                        minWidth: 0,
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                        whiteSpace: "nowrap",
                        textAlign: "left",
                        color: textColor,
                        background: "transparent",
                        border: "none",
                        padding: 0,
                        cursor: board.id === boardManager.activeBoardId ? "default" : "pointer",
                      }}
                    >
                      {board.name}
                    </button>
                  )}
                  <button
                    type="button"
                    onMouseDown={(event) => event.preventDefault()}
                    onClick={() => (
                      isRenaming ? commitRename() : startRename(board.id, board.name)
                    )}
                    style={{
                      ...baseFont,
                      color: isRenaming ? textColor : actionColor,
                      background: "transparent",
                      border: "none",
                      padding: 0,
                      width: "100%",
                      textAlign: "left",
                      cursor: "pointer",
                    }}
                  >
                    {isRenaming ? "Done" : "Rename"}
                  </button>
                  {boardManager.boards.length > 1 ? (
                    <button
                      type="button"
                      onMouseDown={(event) => event.preventDefault()}
                      onClick={() => requestDelete(board.id)}
                      style={{
                        ...baseFont,
                        color: isPendingDelete ? textColor : actionColor,
                        background: "transparent",
                        border: "none",
                        padding: 0,
                        width: "100%",
                        textAlign: "left",
                        cursor: "pointer",
                      }}
                    >
                      {isPendingDelete ? "Delete?" : "Delete"}
                    </button>
                  ) : (
                    <span />
                  )}
                </div>
              );
            })}
          </div>
        </>
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
            <span
              onDoubleClick={(e) => {
                e.preventDefault();
                startRename(boardManager.activeBoardId, boardManager.activeBoard.name);
              }}
            >
              {boardManager.activeBoard.name}
            </span>
            {"\u25BE"}
          </Menu.Trigger>
          <Menu.Portal>
            <Menu.Positioner sideOffset={4} align="start">
              <Menu.Popup
                style={{
                  background: popupBg,
                  backdropFilter: "blur(18px) saturate(1.18)",
                  WebkitBackdropFilter: "blur(18px) saturate(1.18)",
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
                      fontWeight: b.id === boardManager.activeBoardId ? FONT_WEIGHT_UI : FONT_WEIGHT_TEXT,
                    })}
                    onClick={() => boardManager.switchBoard(b.id)}
                  >
                    <span style={{ flex: 1 }}>{b.name}</span>
                  </Menu.Item>
                ))}
                <Menu.Item
                  style={(state) => getItemStyle(state)}
                  onClick={() =>
                    boardManager.createBoard(
                      getNextUntitledBoardName(boardManager.boards),
                      true,
                    )
                  }
                >
                  New board
                </Menu.Item>
                <Menu.Item
                  style={(state) => getItemStyle(state)}
                  onClick={() => {
                    setEditingBoards(true);
                    setPendingDeleteId(null);
                  }}
                >
                  Edit boards
                </Menu.Item>
              </Menu.Popup>
            </Menu.Positioner>
          </Menu.Portal>
        </Menu.Root>
      )}
    </div>
  );
}

function getNextUntitledBoardName(boards: BoardManager["boards"]): string {
  const existingNames = new Set(
    boards.map((board) => board.name.trim().toLocaleLowerCase()),
  );

  let index = 1;
  while (existingNames.has(formatUntitledBoardName(index).toLocaleLowerCase())) {
    index += 1;
  }

  return formatUntitledBoardName(index);
}

function formatUntitledBoardName(index: number): string {
  return index === 1
    ? UNTITLED_BOARD_NAME
    : `${UNTITLED_BOARD_NAME} ${toRomanNumeral(index)}`;
}

function toRomanNumeral(value: number): string {
  const numerals: Array<[number, string]> = [
    [1000, "M"],
    [900, "CM"],
    [500, "D"],
    [400, "CD"],
    [100, "C"],
    [90, "XC"],
    [50, "L"],
    [40, "XL"],
    [10, "X"],
    [9, "IX"],
    [5, "V"],
    [4, "IV"],
    [1, "I"],
  ];
  let remaining = Math.max(1, Math.floor(value));
  let result = "";

  for (const [amount, numeral] of numerals) {
    while (remaining >= amount) {
      result += numeral;
      remaining -= amount;
    }
  }

  return result;
}
