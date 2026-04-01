/**
 * useBoardManager.ts — React hook for board lifecycle management.
 *
 * Manages creating, switching, deleting, renaming, and duplicating boards.
 * Canvas state is owned by useCanvasState; this hook coordinates persistence
 * around board transitions.
 *
 * Board initialization (useState + migrateFromLegacy) lives in the caller
 * (Canvas.tsx) to break the circular dependency with useCanvasState.
 */

import { useCallback, useRef } from "react";
import type { BoardMeta, CanvasState } from "../types";
import { initialState } from "./canvas";
import {
  saveBoards,
  loadBoardState,
  saveBoardState,
  saveActiveBoardId,
  deleteBoardStorage,
} from "./boardStore";

// ---- Types ----

export interface BoardState {
  boards: BoardMeta[];
  activeBoardId: string;
}

export interface BoardManager {
  boards: BoardMeta[];
  activeBoardId: string;
  activeBoard: BoardMeta;
  createBoard(name: string, andSwitch?: boolean): string;
  switchBoard(id: string): void;
  deleteBoard(id: string): void;
  renameBoard(id: string, name: string): void;
  duplicateBoard(id: string): string;
}

// ---- Hook ----

export function useBoardManager(
  boardState: BoardState,
  setBoardState: React.Dispatch<React.SetStateAction<BoardState>>,
  canvasState: CanvasState,
  loadBoard: (state: CanvasState) => void,
): BoardManager {
  const { boards, activeBoardId } = boardState;
  const activeBoard = boards.find((b) => b.id === activeBoardId) ?? boards[0];

  // Refs for latest values — avoids stale closures in callbacks
  const canvasStateRef = useRef(canvasState);
  canvasStateRef.current = canvasState;
  const loadBoardRef = useRef(loadBoard);
  loadBoardRef.current = loadBoard;

  // ---- createBoard ----

  const createBoard = useCallback(
    (name: string, andSwitch?: boolean): string => {
      const id = crypto.randomUUID();
      const now = Date.now();
      const meta: BoardMeta = { id, name, createdAt: now, updatedAt: now };

      saveBoardState(id, initialState);

      setBoardState((prev) => {
        const next = [...prev.boards, meta];
        saveBoards(next);

        if (andSwitch) {
          // Save current board and switch in the same state update
          // to avoid React batching issues
          saveBoardState(prev.activeBoardId, canvasStateRef.current);
          loadBoardRef.current(initialState);
          saveActiveBoardId(id);
          return { boards: next, activeBoardId: id };
        }

        return { ...prev, boards: next };
      });

      return id;
    },
    [setBoardState],
  );

  // ---- switchBoard ----

  const switchBoard = useCallback(
    (id: string): void => {
      setBoardState((prev) => {
        // Validate target exists
        if (!prev.boards.some((b) => b.id === id)) return prev;
        if (id === prev.activeBoardId) return prev;

        // Save current board's canvas state (use ref for latest)
        saveBoardState(prev.activeBoardId, canvasStateRef.current);

        // Load the target board
        const newState = loadBoardState(id) ?? initialState;
        loadBoardRef.current(newState);

        // Update timestamps on the board being left
        const now = Date.now();
        const updatedBoards = prev.boards.map((b) =>
          b.id === prev.activeBoardId ? { ...b, updatedAt: now } : b,
        );
        saveBoards(updatedBoards);
        saveActiveBoardId(id);

        return { boards: updatedBoards, activeBoardId: id };
      });
    },
    [setBoardState],
  );

  // ---- deleteBoard ----

  const deleteBoard = useCallback(
    (id: string): void => {
      setBoardState((prev) => {
        let nextBoards = prev.boards;
        let nextActiveId = prev.activeBoardId;

        // If it's the only board, create a replacement first
        if (nextBoards.length === 1) {
          const now = Date.now();
          const newId = crypto.randomUUID();
          const replacement: BoardMeta = {
            id: newId,
            name: "Untitled",
            createdAt: now,
            updatedAt: now,
          };
          saveBoardState(newId, initialState);
          nextBoards = [...nextBoards, replacement];
        }

        // If deleting the active board, switch to the first non-deleted board
        if (nextActiveId === id) {
          const target = nextBoards.find((b) => b.id !== id);
          if (target) {
            saveBoardState(prev.activeBoardId, canvasStateRef.current);
            const newState = loadBoardState(target.id) ?? initialState;
            loadBoardRef.current(newState);
            nextActiveId = target.id;
            saveActiveBoardId(nextActiveId);
          }
        }

        // Remove from list and persist
        nextBoards = nextBoards.filter((b) => b.id !== id);
        saveBoards(nextBoards);
        deleteBoardStorage(id);

        return { boards: nextBoards, activeBoardId: nextActiveId };
      });
    },
    [setBoardState],
  );

  // ---- renameBoard ----

  const renameBoard = useCallback(
    (id: string, name: string): void => {
      setBoardState((prev) => {
        const now = Date.now();
        const updatedBoards = prev.boards.map((b) =>
          b.id === id ? { ...b, name, updatedAt: now } : b,
        );
        saveBoards(updatedBoards);
        return { ...prev, boards: updatedBoards };
      });
    },
    [setBoardState],
  );

  // ---- duplicateBoard ----

  const duplicateBoard = useCallback(
    (id: string): string => {
      const source = boards.find((b) => b.id === id);
      const sourceName = source?.name ?? "Untitled";

      // Load the source board's state (if it's the active board, use live state)
      const sourceState =
        id === activeBoardId ? canvasStateRef.current : (loadBoardState(id) ?? initialState);

      const newId = crypto.randomUUID();
      const now = Date.now();
      const meta: BoardMeta = {
        id: newId,
        name: `${sourceName} copy`,
        createdAt: now,
        updatedAt: now,
      };

      saveBoardState(newId, sourceState);

      setBoardState((prev) => {
        const next = [...prev.boards, meta];
        saveBoards(next);
        return { ...prev, boards: next };
      });

      return newId;
    },
    [boards, activeBoardId, setBoardState],
  );

  return {
    boards,
    activeBoardId,
    activeBoard,
    createBoard,
    switchBoard,
    deleteBoard,
    renameBoard,
    duplicateBoard,
  };
}
