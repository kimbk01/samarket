import { describe, expect, it } from "vitest";
import {
  computeMessengerRoomTimelineInitialLoadComplete,
  isMessengerRoomNearBottomFromMetrics,
  messengerRoomTimelineItemKey,
  resolveMessengerRoomTimelinePaintSource,
  sortMessengerRoomTimelineMessages,
} from "@/lib/community-messenger/room/messenger-room-timeline-ssot";
import type { CommunityMessengerMessage } from "@/lib/community-messenger/types";
import { MESSENGER_STICK_TO_BOTTOM_THRESHOLD_PX } from "@/lib/ui/messenger-chat-viewport-tuning";

function msg(
  partial: Partial<CommunityMessengerMessage> & Pick<CommunityMessengerMessage, "id" | "createdAt">
): CommunityMessengerMessage {
  return {
    roomId: "room-1",
    senderId: "user-a",
    senderLabel: "User",
    messageType: "text",
    content: partial.content ?? "hello",
    metadata: {},
    isMine: false,
    ...partial,
  };
}

function snap(partial: {
  messages?: CommunityMessengerMessage[];
  lastMessage?: string;
}): NonNullable<Parameters<typeof resolveMessengerRoomTimelinePaintSource>[0]["snapshot"]> {
  return {
    messages: partial.messages,
    room: { lastMessage: partial.lastMessage ?? "" },
  };
}

describe("messenger-room-timeline-ssot", () => {
  it("A — sorts created_at ASC with id tie-breaker (call_stub in same timeline)", () => {
    const rows = sortMessengerRoomTimelineMessages([
      msg({ id: "b", createdAt: "2026-01-01T00:00:02.000Z", messageType: "call_stub", content: "missed" }),
      msg({ id: "a", createdAt: "2026-01-01T00:00:01.000Z" }),
      msg({ id: "c", createdAt: "2026-01-01T00:00:02.000Z" }),
    ]);
    expect(rows.map((r) => r.id)).toEqual(["a", "b", "c"]);
  });

  it("B — incomplete initial load with lastMessage hint paints empty (skeleton path)", () => {
    const paint = resolveMessengerRoomTimelinePaintSource({
      displayRoomMessages: [],
      roomMessages: [],
      loading: true,
      timelineInitialLoadComplete: false,
      snapshot: snap({ lastMessage: "preview" }),
    });
    expect(paint).toEqual([]);
  });

  it("C — does not fall back to snapshot.messages when room state is empty", () => {
    const snapMsg = msg({ id: "snap-only", createdAt: "2026-01-01T00:00:00.000Z" });
    const paint = resolveMessengerRoomTimelinePaintSource({
      displayRoomMessages: [],
      roomMessages: [],
      loading: false,
      timelineInitialLoadComplete: false,
      snapshot: snap({ messages: [snapMsg], lastMessage: "x" }),
    });
    expect(paint).toEqual([]);
  });

  it("D/E/F — near-bottom threshold uses unified 80px constant", () => {
    const threshold = MESSENGER_STICK_TO_BOTTOM_THRESHOLD_PX;
    expect(threshold).toBe(80);
    expect(
      isMessengerRoomNearBottomFromMetrics(
        { scrollHeight: 1000, scrollTop: 920, clientHeight: 80 },
        threshold
      )
    ).toBe(true);
    expect(
      isMessengerRoomNearBottomFromMetrics(
        { scrollHeight: 1000, scrollTop: 800, clientHeight: 80 },
        threshold
      )
    ).toBe(false);
  });

  it("G — paint source prefers displayRoomMessages SSOT", () => {
    const display = [msg({ id: "live-1", createdAt: "2026-01-02T00:00:00.000Z" })];
    const paint = resolveMessengerRoomTimelinePaintSource({
      displayRoomMessages: display,
      roomMessages: [msg({ id: "other", createdAt: "2026-01-01T00:00:00.000Z" })],
      loading: false,
      timelineInitialLoadComplete: true,
      snapshot: snap({ lastMessage: "x" }),
    });
    expect(paint.map((m) => m.id)).toEqual(["live-1"]);
  });

  it("H — call_stub shares timeline item key namespace", () => {
    expect(messengerRoomTimelineItemKey(msg({ id: "c1", createdAt: "t", messageType: "call_stub" }))).toBe(
      "call_stub:c1"
    );
    expect(messengerRoomTimelineItemKey(msg({ id: "m1", createdAt: "t", messageType: "text" }))).toBe("text:m1");
  });

  it("initial load complete waits for persisted messages when lastMessage hint exists", () => {
    expect(
      computeMessengerRoomTimelineInitialLoadComplete({
        loaded: true,
        loading: false,
        roomMessages: [],
        snapshot: snap({ messages: [msg({ id: "1", createdAt: "t" })], lastMessage: "hint" }),
      })
    ).toBe(false);

    expect(
      computeMessengerRoomTimelineInitialLoadComplete({
        loaded: true,
        loading: false,
        roomMessages: [msg({ id: "1", createdAt: "t" })],
        snapshot: snap({ messages: [msg({ id: "1", createdAt: "t" })], lastMessage: "hint" }),
      })
    ).toBe(true);
  });

  it("I — new empty room completes initial load without messages", () => {
    expect(
      computeMessengerRoomTimelineInitialLoadComplete({
        loaded: true,
        loading: false,
        roomMessages: [],
        snapshot: snap({ messages: [], lastMessage: "" }),
      })
    ).toBe(true);
  });
});
