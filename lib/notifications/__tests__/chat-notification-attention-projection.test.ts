import { describe, expect, it } from "vitest";
import {
  assertUnifiedAppIconProjection,
  buildChatAttentionProjection,
  buildNotificationAttentionProjection,
  buildUnifiedAppIconProjection,
  isOrphanMissedCallEvent,
  isRoomBoundMissedCallEvent,
} from "@/lib/notifications/chat-notification-attention-projection";

describe("chat-notification-attention-projection (Phase B Formula)", () => {
  it("ChatAttentionTotal = distinct unread room IDs (message count irrelevant)", () => {
    const chat = buildChatAttentionProjection({
      generalRoomIds: ["g1", "g1", "g2"],
      groupRoomIds: [],
      tradeRoomIds: ["t1", "t2", "t3"],
      customerOrderRoomIds: [],
      ownerOrderRoomIds: [],
    });
    expect(chat.total).toBe(5);
    expect(chat.generalRoomIds).toEqual(["g1", "g2"]);
    expect(chat.tradeRoomIds).toHaveLength(3);
  });

  it("NotificationAttention excludes chat_message and compresses same attention_key", () => {
    const notification = buildNotificationAttentionProjection([
      {
        id: "e1",
        type: "chat_message",
        room_id: "g1",
        unread: true,
        read_at: null,
        display_payload: {},
      },
      {
        id: "e2",
        type: "trade_status",
        dedupe_key: "ts:p1:a",
        unread: true,
        read_at: null,
        display_payload: { product_id: "p1", legacyMeta: { product_id: "p1" } },
      },
      {
        id: "e3",
        type: "trade_status",
        dedupe_key: "ts:p1:b",
        unread: true,
        read_at: null,
        display_payload: { product_id: "p1", legacyMeta: { product_id: "p1" } },
      },
    ]);
    expect(notification.excludedChatMessageEventIds).toEqual(["e1"]);
    expect(notification.total).toBe(1);
    expect(notification.attentionKeys).toEqual(["trade_status:p1"]);
    expect(notification.eventIdsByAttentionKey["trade_status:p1"]).toEqual(["e2", "e3"]);
  });

  it("orphan missed_call ∈ NotificationAttention; room-bound excluded", () => {
    expect(
      isOrphanMissedCallEvent({ type: "missed_call", room_id: null })
    ).toBe(true);
    expect(
      isRoomBoundMissedCallEvent({ type: "missed_call", room_id: "r1" })
    ).toBe(true);

    const notification = buildNotificationAttentionProjection([
      {
        id: "m-orphan",
        type: "missed_call",
        category: "missed_call",
        room_id: null,
        unread: true,
        read_at: null,
        display_payload: {},
        dedupe_key: "missed_call:call-1",
      },
      {
        id: "m-room",
        type: "missed_call",
        category: "missed_call",
        room_id: "r1",
        unread: true,
        read_at: null,
        display_payload: {},
        dedupe_key: "missed_call:call-2",
      },
    ]);
    expect(notification.total).toBe(1);
    expect(notification.excludedRoomBoundMissedCallEventIds).toEqual(["m-room"]);
    expect(notification.attentionKeys[0]).toMatch(/^missed_call:/);
  });

  it("AppIconTotal = Chat + Notification; example contract 1+3+1 → 5", () => {
    const unified = buildUnifiedAppIconProjection({
      chat: {
        generalRoomIds: ["g1"],
        groupRoomIds: [],
        tradeRoomIds: ["t1", "t2", "t3"],
        customerOrderRoomIds: [],
        ownerOrderRoomIds: [],
      },
      notificationEvents: [
        {
          id: "offer1",
          type: "trade_status",
          unread: true,
          read_at: null,
          display_payload: { product_id: "listing-1", legacyMeta: { product_id: "listing-1" } },
        },
        {
          id: "chat-hist",
          type: "chat_message",
          room_id: "g1",
          unread: true,
          read_at: null,
          display_payload: {},
        },
      ],
    });
    expect(unified.chat.total).toBe(4);
    expect(unified.notification.total).toBe(1);
    expect(unified.notification.excludedChatMessageEventIds).toEqual(["chat-hist"]);
    expect(unified.appIconTotal).toBe(5);
    expect(assertUnifiedAppIconProjection(unified)).toEqual({ ok: true, errors: [] });
  });

  it("price-offer read path: Notification −1 leaves Chat unchanged", () => {
    const before = buildUnifiedAppIconProjection({
      chat: {
        generalRoomIds: ["a", "b", "c"],
        groupRoomIds: [],
        tradeRoomIds: ["t1", "t2", "t3"],
        customerOrderRoomIds: Array.from({ length: 23 }, (_, i) => `c${i}`),
        ownerOrderRoomIds: ["o1", "o2"],
      },
      notificationEvents: [
        {
          id: "offer",
          type: "trade_status",
          unread: true,
          read_at: null,
          display_payload: { product_id: "p-offer", legacyMeta: { product_id: "p-offer" } },
        },
      ],
    });
    expect(before.chat.total).toBe(31);
    expect(before.notification.total).toBe(1);
    expect(before.appIconTotal).toBe(32);

    const after = buildUnifiedAppIconProjection({
      chat: {
        generalRoomIds: before.chat.generalRoomIds,
        groupRoomIds: before.chat.groupRoomIds,
        tradeRoomIds: before.chat.tradeRoomIds,
        customerOrderRoomIds: before.chat.customerOrderRoomIds,
        ownerOrderRoomIds: before.chat.ownerOrderRoomIds,
      },
      notificationEvents: [],
    });
    expect(after.chat.total).toBe(31);
    expect(after.notification.total).toBe(0);
    expect(after.appIconTotal).toBe(31);
  });
});
