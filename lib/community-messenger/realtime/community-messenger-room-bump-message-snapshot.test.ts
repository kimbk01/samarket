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

  it("serializes and parses gift_certificate metadata for room bump merge", () => {
    const transferId = "33333333-3333-4333-8333-333333333333";
    const message: CommunityMessengerMessage = {
      id: MESSAGE_ID,
      roomId: ROOM_ID,
      senderId: SENDER_ID,
      senderLabel: "보낸 사람",
      messageType: "gift_certificate",
      content: "Gift certificate",
      createdAt: "2026-05-20T00:00:00.000Z",
      metadata: {
        gift_transfer_id: transferId,
        instance_id: "44444444-4444-4444-8444-444444444444",
        transfer_status: "PENDING",
        face_value: 1000,
        remaining_balance: 1000,
        title: "Store gift",
      },
      clientMessageId: null,
      isMine: false,
    };

    const serialized = serializeCommunityMessengerMessageForBump(message);
    expect(serialized?.messageType).toBe("gift_certificate");
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

    expect(parsed?.messageType).toBe("gift_certificate");
    expect(parsed?.metadata).toEqual(message.metadata);
  });
});
