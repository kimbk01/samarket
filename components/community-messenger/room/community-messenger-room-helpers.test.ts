import { describe, expect, it } from "vitest";
import { mergeRoomMessages } from "@/components/community-messenger/room/community-messenger-room-helpers";
import type { CommunityMessengerMessage } from "@/lib/community-messenger/types";

function baseMessage(overrides: Partial<CommunityMessengerMessage>): CommunityMessengerMessage {
  return {
    id: "msg-1",
    roomId: "room-1",
    senderId: null,
    senderLabel: "시스템",
    messageType: "system",
    content: "주문 접수",
    createdAt: "2026-05-20T00:00:00.000Z",
    clientMessageId: null,
    isMine: false,
    ...overrides,
  };
}

describe("mergeRoomMessages metadata preservation", () => {
  it("does not overwrite existing metadata with an empty update", () => {
    const prev = [
      baseMessage({
        metadata: {
          domain: "store_order",
          lineKind: "status",
          orderStatus: "accepted",
        },
      }),
    ];
    const next = [baseMessage({ content: "주문 접수됨", metadata: {} })];

    const merged = mergeRoomMessages(prev, next);

    expect(merged[0]?.metadata).toEqual(prev[0]?.metadata);
    expect(merged[0]?.content).toBe("주문 접수됨");
  });
});
