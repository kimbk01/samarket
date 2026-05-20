import { describe, expect, it } from "vitest";
import {
  parseCommunityMessengerBumpMessageSnapshot,
  serializeCommunityMessengerMessageForBump,
} from "@/lib/community-messenger/realtime/community-messenger-room-bump-message-snapshot";
import type { CommunityMessengerMessage } from "@/lib/community-messenger/types";

const MESSAGE_ID = "11111111-1111-4111-8111-111111111111";
const ROOM_ID = "room-1";
const SENDER_ID = "22222222-2222-4222-8222-222222222222";

describe("community messenger bump message metadata", () => {
  it("serializes and parses store_order system metadata", () => {
    const message: CommunityMessengerMessage = {
      id: MESSAGE_ID,
      roomId: ROOM_ID,
      senderId: SENDER_ID,
      senderLabel: "시스템",
      messageType: "system",
      content: "배달을 시작했습니다.",
      createdAt: "2026-05-20T00:00:00.000Z",
      metadata: {
        domain: "store_order",
        lineKind: "delivery",
        orderStatus: "delivering",
        storeOrderId: "order-1",
      },
      clientMessageId: null,
      isMine: false,
    };

    const serialized = serializeCommunityMessengerMessageForBump(message);
    expect(serialized?.metadata).toEqual(message.metadata);

    const parsed = parseCommunityMessengerBumpMessageSnapshot(
      {
        fromUserId: SENDER_ID,
        canonicalRoomId: ROOM_ID,
        messageId: MESSAGE_ID,
        message: serialized,
      },
      "viewer-1"
    );

    expect(parsed?.metadata).toEqual(message.metadata);
  });
});
