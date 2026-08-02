import { describe, expect, it } from "vitest";
import {
  assertUnifiedAppIconProjection,
  buildChatAttentionProjection,
  buildNotificationAttentionProjection,
  buildUnifiedAppIconProjection,
  isOrphanMissedCallEvent,
  isRoomBoundMissedCallEvent,
} from "@/lib/notifications/chat-notification-attention-projection";
import { buildNotificationBadgeProjection } from "@/lib/notifications/build-notification-badge-projection";

describe("chat-notification-attention-projection (A/B rebuild)", () => {
  it("B_member_rooms excludes owner SO from memberAppIconRoomCount", () => {
    const chat = buildChatAttentionProjection({
      generalRoomIds: ["g1", "g1", "g2"],
      groupRoomIds: [],
      tradeRoomIds: ["t1", "t2", "t3"],
      customerOrderRoomIds: ["c1"],
      ownerOrderRoomIds: ["o1", "o2"],
    });
    expect(chat.total).toBe(8);
    expect(chat.memberAppIconRoomCount).toBe(6);
    expect(chat.ownerOrderRoomIds).toHaveLength(2);
  });

  it("A_member excludes chat_message and compresses attention_key", () => {
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
  });

  it("orphan missed not in Bell; counted for App Icon", () => {
    expect(isOrphanMissedCallEvent({ type: "missed_call", room_id: null })).toBe(true);
    expect(isRoomBoundMissedCallEvent({ type: "missed_call", room_id: "r1" })).toBe(true);

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
    expect(notification.total).toBe(0);
    expect(notification.orphanMissedCallCount).toBe(1);
    expect(notification.excludedOrphanMissedCallEventIds).toEqual(["m-orphan"]);
  });

  it("store owner intake: Member Bell/AppIcon +0 (classify only, no Store Projection)", () => {
    const unified = buildUnifiedAppIconProjection({
      chat: {
        generalRoomIds: [],
        groupRoomIds: [],
        tradeRoomIds: [],
        customerOrderRoomIds: [],
        ownerOrderRoomIds: ["own-room-1"],
      },
      notificationEvents: [
        {
          id: "owner-new",
          type: "order_status",
          unread: true,
          read_at: null,
          dedupe_key: "commerce:owner:new_order:ord-1",
          display_payload: {
            legacyMeta: {
              kind: "store_order_created",
              store_id: "store-a",
              order_id: "ord-1",
            },
          },
        },
      ],
    });
    expect(unified.memberNotificationTotal).toBe(0);
    expect(unified.notification.total).toBe(0);
    expect(unified.chat.memberAppIconRoomCount).toBe(0);
    expect(unified.appIconTotal).toBe(0);
    expect(unified.notification.excludedStoreOwnerIntakeEventIds).toEqual(["owner-new"]);
    expect(assertUnifiedAppIconProjection(unified)).toEqual({ ok: true, errors: [] });
  });

  it("memberAppIconTotal = A + GD/Group/Trade/Customer + missed (no owner rooms)", () => {
    const unified = buildUnifiedAppIconProjection({
      chat: {
        generalRoomIds: ["g1"],
        groupRoomIds: [],
        tradeRoomIds: ["t1", "t2", "t3"],
        customerOrderRoomIds: [],
        ownerOrderRoomIds: ["o1"],
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
          id: "missed",
          type: "missed_call",
          category: "missed_call",
          room_id: null,
          unread: true,
          read_at: null,
          dedupe_key: "missed:s1:u1",
          display_payload: {},
        },
      ],
    });
    expect(unified.chat.memberAppIconRoomCount).toBe(4);
    expect(unified.memberNotificationTotal).toBe(1);
    expect(unified.missedCallCount).toBe(1);
    expect(unified.appIconTotal).toBe(6);
    expect(assertUnifiedAppIconProjection(unified)).toEqual({ ok: true, errors: [] });
  });

  it("0→N→0 store intake never moves member Bell/AppIcon", () => {
    const empty = buildUnifiedAppIconProjection({
      chat: {
        generalRoomIds: [],
        groupRoomIds: [],
        tradeRoomIds: [],
        customerOrderRoomIds: [],
        ownerOrderRoomIds: [],
      },
      notificationEvents: [],
    });
    expect(empty.appIconTotal).toBe(0);

    const withStore = buildUnifiedAppIconProjection({
      chat: {
        generalRoomIds: [],
        groupRoomIds: [],
        tradeRoomIds: [],
        customerOrderRoomIds: [],
        ownerOrderRoomIds: [],
      },
      notificationEvents: [
        {
          id: "n1",
          type: "order_status",
          unread: true,
          read_at: null,
          dedupe_key: "commerce:owner:new_order:ord-9",
          display_payload: {
            legacyMeta: { kind: "store_order_created", store_id: "s1", order_id: "ord-9" },
          },
        },
      ],
    });
    expect(withStore.memberNotificationTotal).toBe(0);
    expect(withStore.appIconTotal).toBe(0);
  });

  it("Builder keeps owner hub fields; App Icon customer-only", () => {
    const projection = buildNotificationBadgeProjection({
      domainUnreadRooms: { general_direct: 2, group: 1, trade: 1, store_order: 5 },
      storeOrderBuyerDeliveryUnread: 2,
      storeOrderOwnerChatUnread: 3,
      storeOrderOwnerUnreadByStoreId: { "store-a": 3 },
      orphanMissedCall: 1,
      memberMissedCallCount: 1,
      nonChatEventAttention: {
        tradeStatus: 0,
        orderStatus: 0,
        deliveryStatus: 0,
        communityActivity: 0,
        adminNotice: 0,
      },
      notificationAttentionTotal: 1,
    });
    expect(projection.bellTotal).toBe(1);
    expect(projection.bottomChat).toBe(3);
    expect(projection.tradeHub).toBe(1);
    expect(projection.storeOrderCustomerUnreadRooms).toBe(2);
    expect(projection.storeOrderOwnerUnreadRooms).toBe(3);
    expect(projection.appIcon.storeOrder).toBe(2);
    expect(projection.appIconTotal).toBe(3 + 1 + 2 + 2);
  });
});
