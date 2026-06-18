import { describe, expect, it } from "vitest";
import { mergeRoomMessages, messengerTimelineVirtualRowKey } from "@/components/community-messenger/room/community-messenger-room-helpers";
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

describe("mergeRoomMessages send pipeline dedupe", () => {
  it("optimistic temp id → server ack replaces by clientMessageId (no duplicate rows)", () => {
    const clientMessageId = "cid-send-001";
    const optimistic = baseMessage({
      id: "temp-optimistic",
      messageType: "text",
      content: "hello",
      pending: true,
      clientMessageId,
      isMine: true,
      senderId: "user-me",
    });
    const server = baseMessage({
      id: "server-confirmed",
      messageType: "text",
      content: "hello",
      pending: false,
      clientMessageId,
      isMine: true,
      senderId: "user-me",
    });

    const afterOptimistic = mergeRoomMessages([], [optimistic]);
    expect(afterOptimistic).toHaveLength(1);
    expect(afterOptimistic[0]?.id).toBe("temp-optimistic");

    const afterAck = mergeRoomMessages(afterOptimistic, [server]);
    expect(afterAck).toHaveLength(1);
    expect(afterAck[0]?.id).toBe("server-confirmed");
    expect(afterAck[0]?.pending).toBeFalsy();

    const afterRealtimeEcho = mergeRoomMessages(afterAck, [server]);
    expect(afterRealtimeEcho).toHaveLength(1);
    expect(afterRealtimeEcho[0]?.id).toBe("server-confirmed");
  });

  it("virtual row key stable across optimistic → server id replace", () => {
    const clientMessageId = "cid-vrow";
    const optimisticKey = messengerTimelineVirtualRowKey(
      baseMessage({ id: "temp", clientMessageId, messageType: "text" })
    );
    const serverKey = messengerTimelineVirtualRowKey(
      baseMessage({ id: "server", clientMessageId, messageType: "text" })
    );
    expect(optimisticKey).toBe(serverKey);
    expect(optimisticKey).toBe("cmc:cid-vrow");
  });
});
