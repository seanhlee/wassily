import { describe, expect, it } from "vitest";
import {
  boardLocationStorageKey,
  cloudBoardLocation,
  isCloudBoardLocation,
  localBoardLocation,
} from "../documentSource";

describe("board location model", () => {
  it("keeps local and cloud board identities distinct", () => {
    const local = localBoardLocation("board-1");
    const cloud = cloudBoardLocation({
      workspaceId: "workspace-1",
      boardId: "board-1",
    });

    expect(isCloudBoardLocation(local)).toBe(false);
    expect(isCloudBoardLocation(cloud)).toBe(true);
    expect(boardLocationStorageKey(local)).toBe("local:board-1");
    expect(boardLocationStorageKey(cloud)).toBe("cloud:workspace-1:board-1");
  });
});
