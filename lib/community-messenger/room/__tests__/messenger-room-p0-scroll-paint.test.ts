import { describe, expect, it } from "vitest";
import {
  buildMessengerRoomFallbackVirtualRows,
  buildMessengerRoomTimelinePaintModel,
  MESSENGER_VIRTUAL_FALLBACK_TAIL_ROWS,
  roomMessagesTimelineFingerprint,
  resolveMessengerRoomTimelineLayoutMode,
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

describe("messenger-room-timeline-paint-model", () => {
  it("uses direct layout for normal rooms (Telegram contiguous flow)", () => {
    const model = buildMessengerRoomTimelinePaintModel({
      displayRoomMessages: [msg("1"), msg("2")],
      roomMessages: [msg("1"), msg("2")],
      loading: false,
      timelineInitialLoadComplete: true,
      snapshot: { messages: [msg("1"), msg("2")], room: { lastMessage: "hi" } },
      hasStoreOrderDock: false,
      hasStoreOrderTimeline: false,
    });
    expect(model.layoutMode).toBe("direct");
    expect(model.useDirectLayout).toBe(true);
    expect(model.paintMessages).toHaveLength(2);
  });

  it("resolveMessengerRoomTimelineLayoutMode stays direct until measured virtual threshold", () => {
    expect(resolveMessengerRoomTimelineLayoutMode({ paintMessageCount: 0 })).toBe("direct");
    expect(resolveMessengerRoomTimelineLayoutMode({ paintMessageCount: 50 })).toBe("direct");
    expect(
      resolveMessengerRoomTimelineLayoutMode({
        paintMessageCount: 50,
        virtualizerMeasuredReady: true,
      })
    ).toBe("direct");
  });

  it("skips identical room message fingerprints", () => {
    const a = [msg("1"), msg("2")];
    const b = [msg("1"), msg("2")];
    expect(roomMessagesTimelineFingerprint(a)).toBe(roomMessagesTimelineFingerprint(b));
  });

  it("caps virtual fallback rows to tail window", () => {
    const messages = Array.from({ length: 120 }, (_, i) => msg(`m-${i}`));
    const rows = buildMessengerRoomFallbackVirtualRows(messages);
    expect(rows).toHaveLength(MESSENGER_VIRTUAL_FALLBACK_TAIL_ROWS);
    expect(rows[0]?.index).toBe(120 - MESSENGER_VIRTUAL_FALLBACK_TAIL_ROWS);
    expect(rows.at(-1)?.index).toBe(119);
  });
});
