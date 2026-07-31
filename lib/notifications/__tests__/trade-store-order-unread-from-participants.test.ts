import { describe, expect, it } from "vitest";
import { partitionTradeStoreOrderUnreadRoomFactsFromParticipants } from "@/lib/notifications/load-trade-store-order-unread-room-facts-from-participants";

const VIEWER = "viewer-1";

describe("partitionTradeStoreOrderUnreadRoomFactsFromParticipants", () => {
  it("counts trade rooms with real last_message and excludes phantom", () => {
    const out = partitionTradeStoreOrderUnreadRoomFactsFromParticipants({
      userId: VIEWER,
      parts: [
        { room_id: "t-valid", unread_count: 1, left_at: null },
        { room_id: "t-phantom", unread_count: 1, left_at: null },
      ],
      rooms: [
        {
          id: "t-valid",
          chat_domain: "trade",
          deleted_at: null,
          last_message: "hi",
          domain_identity_key: "trade:l1:b1:viewer-1",
        },
        {
          id: "t-phantom",
          chat_domain: "trade",
          deleted_at: null,
          last_message: "",
          domain_identity_key: "trade:l2:b2:viewer-1",
        },
      ],
      orderBuyerById: {},
      storeOwnerById: {},
      orderStoreById: {},
    });
    expect(out.tradeUnreadRoomIds).toEqual(["t-valid"]);
    expect(out.domainUnreadRooms.trade).toBe(1);
  });

  it("splits store_order into customer vs owner without double-count", () => {
    const out = partitionTradeStoreOrderUnreadRoomFactsFromParticipants({
      userId: VIEWER,
      parts: [
        { room_id: "so-customer", unread_count: 2, left_at: null },
        { room_id: "so-owner", unread_count: 3, left_at: null },
        { room_id: "so-other", unread_count: 1, left_at: null },
      ],
      rooms: [
        {
          id: "so-customer",
          chat_domain: "store_order",
          deleted_at: null,
          last_message: "ok",
          domain_identity_key: "store_order:ord-c",
        },
        {
          id: "so-owner",
          chat_domain: "store_order",
          deleted_at: null,
          last_message: "owner msg",
          domain_identity_key: "store_order:ord-o",
        },
        {
          id: "so-other",
          chat_domain: "store_order",
          deleted_at: null,
          last_message: "nope",
          domain_identity_key: "store_order:ord-x",
        },
      ],
      orderBuyerById: {
        "ord-c": VIEWER,
        "ord-o": "someone-else",
        "ord-x": "buyer-x",
      },
      orderStoreById: {
        "ord-c": "store-a",
        "ord-o": "store-mine",
        "ord-x": "store-z",
      },
      storeOwnerById: {
        "store-a": "other-owner",
        "store-mine": VIEWER,
        "store-z": "other-owner",
      },
    });
    expect(out.customerOrderUnreadRoomIds).toEqual(["so-customer"]);
    expect(out.ownerOrderUnreadRoomIds).toEqual(["so-owner"]);
    expect(out.storeOrderBuyerDeliveryUnread).toBe(1);
    expect(out.storeOrderOwnerChatUnread).toBe(1);
    expect(out.ownerOrderUnreadByStoreId).toEqual({ "store-mine": 1 });
    expect(out.domainUnreadRooms.store_order).toBe(2);
  });
});
