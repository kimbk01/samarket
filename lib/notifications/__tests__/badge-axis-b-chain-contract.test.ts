import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  BOTTOM_CHAT_UNREAD_ROOM_DOMAINS,
  MEMBER_COMMUNICATION_B_ROOM_DOMAINS,
  memberAppIconTotal,
} from "@/lib/notifications/badge-axis-taxonomy";
import {
  buildChatAttentionProjection,
  buildUnifiedAppIconProjection,
} from "@/lib/notifications/chat-notification-attention-projection";
import { buildNotificationBadgeProjection } from "@/lib/notifications/build-notification-badge-projection";

describe("badge axis B chain contract (Phase 3)", () => {
  it("Bottom Chat domains are GD+Group only", () => {
    expect(BOTTOM_CHAT_UNREAD_ROOM_DOMAINS).toEqual(["general_direct", "group"]);
    expect(MEMBER_COMMUNICATION_B_ROOM_DOMAINS).toContain("trade");
    expect(MEMBER_COMMUNICATION_B_ROOM_DOMAINS).toContain("store_order_customer");
    expect(MEMBER_COMMUNICATION_B_ROOM_DOMAINS).not.toContain("store_order_owner");
  });

  it("Row unit is message count; Hub/Bottom/App Icon rooms are room counts", () => {
    const chat = buildChatAttentionProjection({
      generalRoomIds: ["g1", "g2"],
      groupRoomIds: ["grp1"],
      tradeRoomIds: ["t1"],
      customerOrderRoomIds: ["c1"],
      ownerOrderRoomIds: ["o1", "o2"],
    });
    // Hub/App Icon B rooms = distinct unread rooms (not message SUM).
    expect(chat.generalRoomIds).toHaveLength(2);
    expect(chat.groupRoomIds).toHaveLength(1);
    expect(chat.memberAppIconRoomCount).toBe(5); // gd2+grp1+t1+c1; owner excluded
    expect(chat.ownerOrderRoomIds).toHaveLength(2);
  });

  it("Builder: Bottom=GD+Group; App Icon B rooms exclude owner; Bell ignores rooms", () => {
    const p = buildNotificationBadgeProjection({
      domainUnreadRooms: { general_direct: 2, group: 1, trade: 3, store_order: 8 },
      storeOrderBuyerDeliveryUnread: 2,
      storeOrderOwnerChatUnread: 6,
      orphanMissedCall: 1,
      memberMissedCallCount: 1,
      notificationAttentionTotal: 4,
      nonChatEventAttention: {
        tradeStatus: 0,
        orderStatus: 0,
        deliveryStatus: 0,
        communityActivity: 0,
        adminNotice: 0,
      },
    });
    expect(p.bottomChat).toBe(3);
    expect(p.bellTotal).toBe(4);
    expect(p.appIcon.storeOrder).toBe(2);
    expect(p.appIcon.messenger).toBe(3);
    expect(p.appIcon.trade).toBe(3);
    expect(p.appIconTotal).toBe(memberAppIconTotal({
      notificationA: 4,
      communicationUnreadRooms: 2 + 1 + 3 + 2,
      orphanMissedCalls: 1,
    }));
  });

  it("orphan missed is App Icon B, not Bell", () => {
    const unified = buildUnifiedAppIconProjection({
      chat: {
        generalRoomIds: [],
        groupRoomIds: [],
        tradeRoomIds: [],
        customerOrderRoomIds: [],
        ownerOrderRoomIds: ["o1"],
      },
      notificationEvents: [
        {
          id: "m1",
          type: "missed_call",
          category: "missed_call",
          room_id: null,
          unread: true,
          read_at: null,
          dedupe_key: "missed:1",
          display_payload: {},
        },
      ],
    });
    expect(unified.memberNotificationTotal).toBe(0);
    expect(unified.missedCallCount).toBe(1);
    expect(unified.appIconTotal).toBe(1);
  });

  it("Projection Apply maps Bottom←bottomChat and App Icon←appIcon axes separately", () => {
    const bridge = readFileSync(
      join(process.cwd(), "lib/messenger/contracts/domain-badge-authority-product-bridge.ts"),
      "utf8"
    );
    expect(bridge).toContain("communityMessengerUnread: projection.bottomChat");
    expect(bridge).toContain("communityMessengerUnread: projection.appIcon.messenger");
    expect(bridge).toContain("buyerOrderAttention: projection.storeOrderCustomerUnreadRooms");
    expect(bridge).not.toContain("storeOrderChatUnread: projection.storeOrderOwnerUnreadRooms");
  });

  it("room unread fact path is Projection Authority only (no second Hub formula)", () => {
    const auth = readFileSync(
      join(process.cwd(), "lib/notifications/projection-authority.ts"),
      "utf8"
    );
    expect(auth).toContain("commitCmRoomUnreadFactEvent");
    expect(auth).toContain("room_unread_delta");
    expect(auth).toContain("applyNotificationBadgeProjection");
  });
});
