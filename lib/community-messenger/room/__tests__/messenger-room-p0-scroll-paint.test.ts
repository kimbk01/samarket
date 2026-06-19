import { describe, expect, it } from "vitest";
import {
  __resetMessengerRoomScrollPositionStoreForTest,
  peekMessengerRoomScrollPosition,
  saveMessengerRoomScrollPosition,
} from "@/lib/community-messenger/room/messenger-room-scroll-position-store";
import {
  buildMessengerRoomTimelinePaintModel,
  roomMessagesTimelineFingerprint,
} from "@/lib/community-messenger/room/messenger-room-timeline-paint-model";
import type { CommunityMessengerMessage } from "@/lib/community-messenger/types";

function msg(id: string): CommunityMessengerMessage {
  return {
    id,
    roomId: "room-1",
    senderId: "u1",
    senderLabel: "U",
    messageType: "text",
    content: "hi",
    metadata: {},
    createdAt: "2026-01-01T00:00:00.000Z",
    isMine: false,
  };
}

describe("messenger-room-scroll-position-store", () => {
  it("persists and peeks scroll anchor within TTL", () => {
    __resetMessengerRoomScrollPositionStoreForTest();
    saveMessengerRoomScrollPosition("room-a", {
      scrollTop: 420,
      firstVisibleMessageId: "m-1",
      stickToBottom: false,
    });
    const row = peekMessengerRoomScrollPosition("room-a");
    expect(row?.scrollTop).toBe(420);
    expect(row?.firstVisibleMessageId).toBe("m-1");
    expect(row?.stickToBottom).toBe(false);
  });
});

describe("messenger-room-timeline-paint-model", () => {
  it("uses virtual layout for normal rooms with messages", () => {
    const model = buildMessengerRoomTimelinePaintModel({
      displayRoomMessages: [msg("1"), msg("2")],
      roomMessages: [msg("1"), msg("2")],
      loading: false,
      timelineInitialLoadComplete: true,
      snapshot: { messages: [msg("1"), msg("2")], room: { lastMessage: "hi" } },
      hasStoreOrderDock: false,
      hasStoreOrderTimeline: false,
    });
    expect(model.layoutMode).toBe("virtual");
    expect(model.paintMessages).toHaveLength(2);
  });

  it("skips identical room message fingerprints", () => {
    const a = [msg("1"), msg("2")];
    const b = [msg("1"), msg("2")];
    expect(roomMessagesTimelineFingerprint(a)).toBe(roomMessagesTimelineFingerprint(b));
  });
});
