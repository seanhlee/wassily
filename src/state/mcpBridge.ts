/**
 * useMcpBridge — connects to the Vite MCP bridge middleware via SSE.
 *
 * Dev-only. Receives dispatched actions from MCP tools, applies them
 * to the canvas state, posts results back, and syncs state to the
 * middleware cache.
 */

import { useState, useRef, useEffect, useCallback } from "react";
import type { Action, CanvasState } from "../types";
import type { BoardManager } from "./useBoardManager";

// ---- Helpers ----

function stripState(state: CanvasState): object {
  const objects: Record<string, unknown> = {};
  for (const [id, obj] of Object.entries(state.objects)) {
    if (obj.type === "reference-image") {
      objects[id] = { ...obj, dataUrl: "" };
    } else {
      objects[id] = obj;
    }
  }
  return { ...state, objects, selectedIds: [] };
}

// ---- Hook ----

export function useMcpBridge(
  state: CanvasState,
  boardManager: BoardManager,
  applyExternalActions: (actions: Action[]) => { created: string[]; deleted: string[] },
): void {
  // Client ID — survives HMR but unique per tab
  const [clientId] = useState(() => {
    const existing = sessionStorage.getItem("wassily-mcp-client-id");
    if (existing) return existing;
    const id = crypto.randomUUID();
    sessionStorage.setItem("wassily-mcp-client-id", id);
    return id;
  });

  // Refs so the SSE handler always sees current values
  const stateRef = useRef(state);
  const boardManagerRef = useRef(boardManager);
  const applyRef = useRef(applyExternalActions);
  useEffect(() => {
    stateRef.current = state;
  }, [state]);
  useEffect(() => {
    boardManagerRef.current = boardManager;
  }, [boardManager]);
  useEffect(() => {
    applyRef.current = applyExternalActions;
  }, [applyExternalActions]);

  const syncState = useCallback(() => {
    fetch("/__mcp__/state", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        clientId,
        state: stripState(stateRef.current),
        boards: boardManagerRef.current.boards,
        activeBoardId: boardManagerRef.current.activeBoardId,
      }),
    }).catch(() => {});
  }, [clientId]);

  // SSE connection effect
  useEffect(() => {
    if (!import.meta.env.DEV) return;

    const es = new EventSource(`/__mcp__/events?clientId=${clientId}`);

    es.onopen = () => {
      console.log("[mcp-bridge] SSE connected");
      syncState();
    };

    es.onmessage = async (event) => {
      try {
        const message = JSON.parse(event.data);

        if (message.type === "dispatch") {
          const { created, deleted } = applyRef.current(message.actions);
          await fetch("/__mcp__/result", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              requestId: message.requestId,
              clientId,
              success: true,
              created,
              deleted,
            }),
          });
          syncState();
          return;
        }

        if (message.type === "board-op") {
          let result: Record<string, unknown> = {};
          const bm = boardManagerRef.current;

          switch (message.op) {
            case "create": {
              const id = bm.createBoard(message.name, Boolean(message.andSwitch));
              result = { id, name: message.name };
              break;
            }
            case "switch": {
              bm.switchBoard(message.boardId);
              result = { activeBoardId: message.boardId };
              break;
            }
            case "delete": {
              bm.deleteBoard(message.boardId);
              result = { deleted: message.boardId };
              break;
            }
            case "rename": {
              bm.renameBoard(message.boardId, message.name);
              result = { id: message.boardId, name: message.name };
              break;
            }
            case "duplicate": {
              const id = bm.duplicateBoard(message.boardId);
              result = { id };
              break;
            }
          }

          await fetch("/__mcp__/board-result", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              requestId: message.requestId,
              clientId,
              success: true,
              ...result,
            }),
          });
          syncState();
          return;
        }
      } catch (err) {
        const message = JSON.parse(event.data);
        fetch("/__mcp__/result", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            requestId: message.requestId,
            clientId,
            success: false,
            error: err instanceof Error ? err.message : String(err),
          }),
        }).catch(() => {});
      }
    };

    es.onerror = () => {
      console.warn("[mcp-bridge] SSE error (will auto-reconnect)");
    };

    return () => {
      es.close();
      console.log("[mcp-bridge] SSE disconnected");
    };
  }, [clientId, syncState]);

  // Debounced state sync on local changes
  useEffect(() => {
    if (!import.meta.env.DEV) return;
    const timer = setTimeout(syncState, 300);
    return () => clearTimeout(timer);
  }, [state, syncState]);
}
