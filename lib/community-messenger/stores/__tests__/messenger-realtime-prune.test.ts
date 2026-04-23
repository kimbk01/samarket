import { describe, expect, it } from "vitest";
import {
  MESSENGER_REALTIME_TRACKED_ROOMS_CAP,
  pruneTrackedRoomMaps,
  retentionScoreForTrackedRoom,
} from "@/lib/community-messenger/stores/messenger-realtime-prune";
import type { CommunityMessengerRoomSummary } from "@/lib/community-messenger/types";

function summary(id: string, lastMessageAt: string, unread = 0): CommunityMessengerRoomSummary {
  return {
    id,
    title: id,
    roomType: "direct",
    lastMessageAt,
    unreadCount: unread,
  } as CommunityMessengerRoomSummary;
}

describe("messenger-realtime-prune", () => {
  it("retentionScore prioritizes active room", () => {
    const roomSummariesById = {
      a: summary("a", "2020-01-01T00:00:00Z", 0),
      b: summary("b", "2025-01-01T00:00:00Z", 0),
    };
    const sa = retentionScoreForTrackedRoom("a", {
      roomSummariesById,
      unreadByRoomId: { a: 0, b: 0 },
      lastReadByRoomId: {},
      messagesByRoomId: {},
      activeRoomId: "a",
    });
    const sb = retentionScoreForTrackedRoom("b", {
      roomSummariesById,
      unreadByRoomId: { a: 0, b: 0 },
      lastReadByRoomId: {},
      messagesByRoomId: {},
      activeRoomId: "a",
    });
    expect(sa).toBeGreaterThan(sb);
  });

  it("pruneTrackedRoomMaps caps orphan unread keys and summaries", () => {
    const over = MESSENGER_REALTIME_TRACKED_ROOMS_CAP + 40;
    const roomSummariesById: Record<string, CommunityMessengerRoomSummary> = {};
    const unreadByRoomId: Record<string, number> = {};
    for (let i = 0; i < over; i += 1) {
      const id = `r${i}`;
      roomSummariesById[id] = summary(id, `2024-06-${String((i % 28) + 1).padStart(2, "0")}T00:00:00Z`, 0);
      unreadByRoomId[id] = i % 17 === 0 ? 1 : 0;
    }
    const orphanUnread: Record<string, number> = { ...unreadByRoomId, orphan_only: 1 };

    const pruned = pruneTrackedRoomMaps({
      roomSummariesById,
      unreadByRoomId: orphanUnread,
      lastReadByRoomId: {},
      messagesByRoomId: {},
      activeRoomId: "r0",
    });

    const keyCount = new Set([
      ...Object.keys(pruned.roomSummariesById),
      ...Object.keys(pruned.unreadByRoomId),
      ...Object.keys(pruned.messagesByRoomId),
    ]).size;
    expect(keyCount).toBeLessThanOrEqual(MESSENGER_REALTIME_TRACKED_ROOMS_CAP);
    expect(pruned.roomSummariesById.r0).toBeDefined();
  });
});
