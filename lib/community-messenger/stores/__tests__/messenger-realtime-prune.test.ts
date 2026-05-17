import { describe, expect, it } from "vitest";
import {
  MESSENGER_REALTIME_TRACKED_ROOMS_CAP,
  pruneTrackedRoomMaps,
  retentionScoreForTrackedRoom,
} from "@/lib/community-messenger/stores/messenger-realtime-prune";
import type { CommunityMessengerMessage } from "@/lib/community-messenger/types";

function message(id: string, roomId: string, createdAt: string): CommunityMessengerMessage {
  return {
    id,
    roomId,
    senderId: null,
    senderLabel: "x",
    messageType: "text",
    content: "",
    createdAt,
    isMine: false,
  };
}

describe("messenger-realtime-prune", () => {
  it("retentionScore prioritizes active room", () => {
    const messagesByRoomId = {
      a: [message("m1", "a", "2020-01-01T00:00:00Z")],
      b: [message("m2", "b", "2025-01-01T00:00:00Z")],
    };
    const sa = retentionScoreForTrackedRoom("a", {
      messagesByRoomId,
      lastReadByRoomId: {},
      activeRoomId: "a",
    });
    const sb = retentionScoreForTrackedRoom("b", {
      messagesByRoomId,
      lastReadByRoomId: {},
      activeRoomId: "a",
    });
    expect(sa).toBeGreaterThan(sb);
  });

  it("pruneTrackedRoomMaps caps message and lastRead keys", () => {
    const over = MESSENGER_REALTIME_TRACKED_ROOMS_CAP + 40;
    const messagesByRoomId: Record<string, CommunityMessengerMessage[]> = {};
    const lastReadByRoomId: Record<string, string | null> = {};
    for (let i = 0; i < over; i += 1) {
      const id = `r${i}`;
      messagesByRoomId[id] = [message(`m${i}`, id, `2024-06-${String((i % 28) + 1).padStart(2, "0")}T00:00:00Z`)];
      lastReadByRoomId[id] = null;
    }
    lastReadByRoomId.orphan_only = null;

    const pruned = pruneTrackedRoomMaps({
      messagesByRoomId,
      lastReadByRoomId,
      activeRoomId: "r0",
    });

    const keyCount = new Set([
      ...Object.keys(pruned.messagesByRoomId),
      ...Object.keys(pruned.lastReadByRoomId),
    ]).size;
    expect(keyCount).toBeLessThanOrEqual(MESSENGER_REALTIME_TRACKED_ROOMS_CAP);
    expect(pruned.messagesByRoomId.r0).toBeDefined();
  });
});
