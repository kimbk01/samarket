import { describe, expect, it } from "vitest";
import {
  buildStoreOrderOwnerUnreadTargetIndex,
  parseStoreOrderOrderIdFromIdentityKey,
  resolveStoreOrderListUnreadCount,
  resolveStoreOrderOwnerListUnreadCount,
  STORE_ORDER_CUSTOMER_UNREAD_TARGET_TYPE,
  STORE_ORDER_OWNER_UNREAD_TARGET_TYPE,
} from "@/lib/messenger/store-order/unread-from-notification-targets";
import { buildStoreOrderHubViewModel } from "@/lib/messenger/store-order/hub";
import type { StoreOrderListItem } from "@/lib/messenger/store-order/types";

function row(partial: Partial<StoreOrderListItem> & { orderId: string; unreadCount: number }): StoreOrderListItem {
  return {
    roomId: partial.roomId ?? `room-${partial.orderId}`,
    chatDomain: "store_order",
    domainIdentityKey: `store_order:${partial.orderId}`,
    orderId: partial.orderId,
    storeId: partial.storeId ?? "store-1",
    storeName: partial.storeName ?? "Store",
    storeImageUrl: null,
    customerUserId: "buyer-1",
    customerName: "Buyer",
    customerAvatarUrl: null,
    latestChatMessageText: "hi",
    latestChatMessageAt: "2026-07-22T00:00:00.000Z",
    latestChatMessageType: "text",
    unreadCount: partial.unreadCount,
    orderStatusLabel: partial.orderStatusLabel ?? "completed",
    fulfillmentType: partial.fulfillmentType ?? null,
    generation: "test",
  };
}

describe("store-order unread from notification_targets", () => {
  it("exposes customer/owner target types used by hub-bundle axes", () => {
    expect(STORE_ORDER_CUSTOMER_UNREAD_TARGET_TYPE).toBe("buyer_order");
    expect(STORE_ORDER_OWNER_UNREAD_TARGET_TYPE).toBe("owner_order_chat");
  });

  describe("customer axis (buyer_order.target_id === orderId)", () => {
    it("zeros list unread when order has no buyer_order target (stale participant ignored)", () => {
      const targets = new Set(["alive-order"]);
      expect(
        resolveStoreOrderListUnreadCount({ orderId: "stale-completed", unreadTargetOrderIds: targets })
      ).toBe(0);
      expect(
        resolveStoreOrderListUnreadCount({ orderId: "alive-order", unreadTargetOrderIds: targets })
      ).toBe(1);
    });

    it("does not treat room ids as customer order ids", () => {
      const roomIdAsTarget = new Set(["room-abc"]);
      expect(
        resolveStoreOrderListUnreadCount({ orderId: "order-1", unreadTargetOrderIds: roomIdAsTarget })
      ).toBe(0);
    });
  });

  describe("owner axis (owner_order_chat.target_id === roomId)", () => {
    it("matches by roomId from target_id (primary)", () => {
      const index = buildStoreOrderOwnerUnreadTargetIndex([
        {
          target_id: "room-true",
          domain_identity_key: "store_order:order-true",
        },
      ]);
      expect(
        resolveStoreOrderOwnerListUnreadCount({
          orderId: "order-true",
          roomId: "room-true",
          index,
        })
      ).toBe(1);
      expect(
        resolveStoreOrderOwnerListUnreadCount({
          orderId: "stale-order",
          roomId: "room-stale",
          index,
        })
      ).toBe(0);
    });

    it("matches by orderId parsed from domain_identity_key (secondary)", () => {
      const index = buildStoreOrderOwnerUnreadTargetIndex([
        {
          target_id: "room-x",
          domain_identity_key: "store_order:order-from-identity",
        },
      ]);
      expect(parseStoreOrderOrderIdFromIdentityKey("store_order:order-from-identity")).toBe(
        "order-from-identity"
      );
      expect(
        resolveStoreOrderOwnerListUnreadCount({
          orderId: "order-from-identity",
          roomId: "different-room-id",
          index,
        })
      ).toBe(1);
    });

    it("does not treat owner target_id as orderId (customer-only semantics)", () => {
      const index = buildStoreOrderOwnerUnreadTargetIndex([
        { target_id: "room-abc", domain_identity_key: "store_order:order-xyz" },
      ]);
      // Wrong: using room id string as orderId with customer resolver would also fail;
      // owner resolver must not mark unread when only orderId equals a room target_id.
      expect(
        resolveStoreOrderOwnerListUnreadCount({
          orderId: "room-abc",
          roomId: "unrelated-room",
          index,
        })
      ).toBe(0);
      expect(
        resolveStoreOrderListUnreadCount({
          orderId: "room-abc",
          unreadTargetOrderIds: index.roomIds,
        })
      ).toBe(1);
    });
  });

  it("hub unreadRoomCount follows targets-aligned row unread only", () => {
    const hub = buildStoreOrderHubViewModel([
      row({ orderId: "a", unreadCount: 1 }),
      row({ orderId: "b", unreadCount: 0 }),
      row({ orderId: "c", unreadCount: 0 }),
    ]);
    expect(hub.unreadCount).toBe(1);
    expect(hub.roomCount).toBe(3);
  });
});
