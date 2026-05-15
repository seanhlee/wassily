export type BoardLocation =
  | {
      kind: "local";
      boardId: string;
    }
  | {
      kind: "cloud";
      workspaceId: string;
      boardId: string;
    };

export function localBoardLocation(boardId: string): BoardLocation {
  if (!boardId) throw new Error("local boardId is required");
  return { kind: "local", boardId };
}

export function cloudBoardLocation({
  workspaceId,
  boardId,
}: {
  workspaceId: string;
  boardId: string;
}): BoardLocation {
  if (!workspaceId) throw new Error("cloud workspaceId is required");
  if (!boardId) throw new Error("cloud boardId is required");
  return { kind: "cloud", workspaceId, boardId };
}

export function isCloudBoardLocation(
  location: BoardLocation,
): location is Extract<BoardLocation, { kind: "cloud" }> {
  return location.kind === "cloud";
}

export function boardLocationStorageKey(location: BoardLocation): string {
  return location.kind === "local"
    ? `local:${location.boardId}`
    : `cloud:${location.workspaceId}:${location.boardId}`;
}
