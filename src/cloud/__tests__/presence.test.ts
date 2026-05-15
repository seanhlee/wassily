import { describe, expect, it } from "vitest";
import { CLOUD_LIMITS } from "../limits";
import {
  createCloudPresenceState,
  filterFreshPresence,
  isPresenceFresh,
  markPresenceUpdateSent,
  PRESENCE_UPDATE_INTERVAL_MS,
  shouldSendPresenceUpdate,
  type PresenceSendWindow,
} from "../presence";

describe("cloud presence helpers", () => {
  it("creates bounded presence records", () => {
    const selectedObjectIds = Array.from(
      { length: CLOUD_LIMITS.maxObjectsPerBoard + 5 },
      (_, index) => `object-${index}`,
    );

    const presence = createCloudPresenceState({
      boardId: "board-1",
      userId: "user-1",
      cursor: { x: 12, y: 24 },
      selectedObjectIds: ["object-1", "object-1", ...selectedObjectIds],
      activeTool: "eyedropper",
      now: 100,
    });

    expect(presence).toMatchObject({
      schemaVersion: 1,
      boardId: "board-1",
      userId: "user-1",
      cursor: { x: 12, y: 24 },
      activeTool: "eyedropper",
      updatedAt: 100,
    });
    expect(presence.selectedObjectIds).toHaveLength(
      CLOUD_LIMITS.maxObjectsPerBoard,
    );
    expect(presence.selectedObjectIds?.[0]).toBe("object-1");
  });

  it("drops invalid cursor coordinates instead of writing noisy presence", () => {
    const presence = createCloudPresenceState({
      boardId: "board-1",
      userId: "user-1",
      cursor: { x: Number.NaN, y: 24 },
      now: 100,
    });

    expect(presence.cursor).toBeUndefined();
  });

  it("throttles cursor writes to the beta budget", () => {
    const window: PresenceSendWindow = markPresenceUpdateSent({
      window: {},
      kind: "cursor",
      now: 1_000,
    });

    expect(
      shouldSendPresenceUpdate({
        window,
        kind: "cursor",
        now: 1_000 + PRESENCE_UPDATE_INTERVAL_MS - 1,
      }),
    ).toBe(false);
    expect(
      shouldSendPresenceUpdate({
        window,
        kind: "cursor",
        now: 1_000 + PRESENCE_UPDATE_INTERVAL_MS,
      }),
    ).toBe(true);
  });

  it("allows one immediate selection/tool write before coalescing", () => {
    const afterCursor = markPresenceUpdateSent({
      window: {},
      kind: "cursor",
      now: 1_000,
    });

    expect(
      shouldSendPresenceUpdate({
        window: afterCursor,
        kind: "selection",
        now: 1_100,
      }),
    ).toBe(true);

    const afterSelection = markPresenceUpdateSent({
      window: afterCursor,
      kind: "selection",
      now: 1_100,
    });

    expect(
      shouldSendPresenceUpdate({
        window: afterSelection,
        kind: "tool",
        now: 1_200,
      }),
    ).toBe(false);
  });

  it("ignores stale presence records after the ttl", () => {
    expect(isPresenceFresh({ updatedAt: 1_000 }, 1_000)).toBe(true);
    expect(
      isPresenceFresh({ updatedAt: 1_000 }, 1_000 + CLOUD_LIMITS.presenceTtlMs),
    ).toBe(true);
    expect(
      isPresenceFresh(
        { updatedAt: 1_000 },
        1_000 + CLOUD_LIMITS.presenceTtlMs + 1,
      ),
    ).toBe(false);

    expect(
      filterFreshPresence([{ updatedAt: 1_000 }, { updatedAt: 40_001 }], 40_001),
    ).toEqual([{ updatedAt: 40_001 }]);
  });
});
