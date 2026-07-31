import { describe, expect, it } from "vitest";
import { resolveNotificationAttentionKey } from "@/lib/notifications/core/notification-attention-key";

describe("resolveNotificationAttentionKey", () => {
  it("collapses buyer status chain to one attention per order", () => {
    const a = resolveNotificationAttentionKey({
      type: "order_status",
      dedupe_key: "commerce:buyer:owner_status:ord-1:accepted",
      display_payload: {
        legacyMeta: { kind: "store_order_owner_status", order_id: "ord-1" },
        legacyRefId: "ord-1",
      },
    });
    const b = resolveNotificationAttentionKey({
      type: "order_status",
      dedupe_key: "commerce:buyer:owner_status:ord-1:completed",
      display_payload: {
        legacyMeta: { kind: "store_order_owner_status", order_id: "ord-1", order_status: "completed" },
        legacyRefId: "ord-1",
      },
    });
    expect(a).toBe("order_status:buyer:ord-1");
    expect(b).toBe(a);
  });

  it("maps owner new_order and reminder to owner_intake attention", () => {
    expect(
      resolveNotificationAttentionKey({
        type: "order_status",
        dedupe_key: "commerce:owner:new_order:ord-2",
        display_payload: {
          legacyMeta: { kind: "store_order_created", order_id: "ord-2" },
          legacyRefId: "ord-2",
        },
      })
    ).toBe("order_status:owner_intake:ord-2");
  });

  it("keeps fee attention separate from intake", () => {
    expect(
      resolveNotificationAttentionKey({
        type: "order_status",
        dedupe_key: "store_point_deduct:ord-3",
        display_payload: {
          legacyMeta: { kind: "store_point_deducted", order_id: "ord-3" },
          legacyRefId: "ord-3",
        },
      })
    ).toBe("order_status:owner_fee:ord-3");
  });

  it("scopes message attention by room", () => {
    expect(
      resolveNotificationAttentionKey({
        type: "chat_message",
        room_id: "room-9",
        dedupe_key: "msg:room-9:m1",
      })
    ).toBe("message_room:room-9");
  });
});
