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

describe("store-order customer row unread SSOT = participant count", () => {
  it("exposes customer/owner target types for push/lifecycle", () => {
    expect(STORE_ORDER_CUSTOMER_UNREAD_TARGET_TYPE).toBe("buyer_order");
    expect(STORE_ORDER_OWNER_UNREAD_TARGET_TYPE).toBe("owner_order_chat");
  });

  it("customer participant unread=6 regardless of target presence → row=6", () => {
    expect(
      resolveStoreOrderListUnreadCount({
        participantUnreadCount: 6,
        orderId: "order-a",
        unreadTargetOrderIds: new Set(),
      })
    ).toBe(6);
    expect(
      resolveStoreOrderListUnreadCount({
        participantUnreadCount: 6,
        orderId: "order-a",
        unreadTargetOrderIds: new Set(["order-a"]),
      })
    ).toBe(6);
  });

  it("customer participant unread=0 with target present → row=0", () => {
    expect(
      resolveStoreOrderListUnreadCount({
        participantUnreadCount: 0,
        orderId: "order-a",
        unreadTargetOrderIds: new Set(["order-a"]),
      })
    ).toBe(0);
  });

  it("does not emit 0|1 attention flag as row unread", () => {
    expect(
      resolveStoreOrderListUnreadCount({
        participantUnreadCount: 7,
        unreadTargetOrderIds: new Set(["x"]),
      })
    ).toBe(7);
    expect(
      resolveStoreOrderListUnreadCount({
        orderId: "order-a",
        unreadTargetOrderIds: new Set(["order-a"]),
      })
    ).toBe(0);
  });

  it("hub unreadRoomCount = count(rows where unread>0)", () => {
    const hub = buildStoreOrderHubViewModel([
      row({ orderId: "a", unreadCount: 0 }),
      row({ orderId: "b", unreadCount: 3 }),
      row({ orderId: "c", unreadCount: 1 }),
      row({ orderId: "d", unreadCount: 0 }),
    ]);
    expect(hub.unreadCount).toBe(2);
  });
});

describe("store-order owner list helpers (Owner surface — target matched)", () => {
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

  it("does not treat owner target_id as orderId", () => {
    const index = buildStoreOrderOwnerUnreadTargetIndex([
      { target_id: "room-abc", domain_identity_key: "store_order:order-xyz" },
    ]);
    expect(
      resolveStoreOrderOwnerListUnreadCount({
        orderId: "room-abc",
        roomId: "unrelated-room",
        index,
      })
    ).toBe(0);
  });
});
