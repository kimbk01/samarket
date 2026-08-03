import { describe, expect, it } from "vitest";
import {
  buildNotificationAttentionProjection,
  isOrphanMissedCallEvent,
  isRoomBoundMissedCallEvent,
} from "@/lib/notifications/chat-notification-attention-projection";

describe("chat-notification-attention-projection (Phase B Formula)", () => {
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

});
