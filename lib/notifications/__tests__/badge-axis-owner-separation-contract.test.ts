import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { OWNER_ATTENTION_SURFACES } from "@/lib/notifications/badge-axis-taxonomy";
import { buildUnifiedAppIconProjection } from "@/lib/notifications/chat-notification-attention-projection";
import { buildNotificationBadgeProjection } from "@/lib/notifications/build-notification-badge-projection";
import {
  resolveBottomNavStoresTabBadgeForOwnerStore,
  resolveFabOwnerOrderChatBadgeCount,
  resolveOwnerOperationsCenterAttentionCount,
} from "@/lib/delivery/owner/owner-store-badge-display-policy";
import { OWNER_HUB_BADGE_EMPTY } from "@/lib/chats/owner-hub-badge-types";

describe("badge axis Owner separation contract (Phase 4)", () => {
  it("taxonomy lists Owner surfaces separate from Member A/B", () => {
    expect(OWNER_ATTENTION_SURFACES).toContain("owner_fab_order_chat");
    expect(OWNER_ATTENTION_SURFACES).not.toContain("memberAppIcon");
  });

  it("Owner order rooms never enter Member App Icon / Bell", () => {
    const unified = buildUnifiedAppIconProjection({
      chat: {
        generalRoomIds: ["g1"],
        groupRoomIds: [],
        tradeRoomIds: [],
        customerOrderRoomIds: [],
        ownerOrderRoomIds: ["o1", "o2", "o3"],
      },
      notificationEvents: [
        {
          id: "own1",
          type: "order_status",
          unread: true,
          read_at: null,
          dedupe_key: "commerce:owner:new_order:ord-1",
          display_payload: {
            legacyMeta: {
              kind: "store_order_created",
              store_id: "s1",
              order_id: "ord-1",
            },
          },
        },
      ],
    });
    expect(unified.chat.memberAppIconRoomCount).toBe(1);
    expect(unified.memberNotificationTotal).toBe(0);
    expect(unified.appIconTotal).toBe(1);
    expect(unified.notification.excludedStoreOwnerIntakeEventIds).toEqual(["own1"]);
  });

  it("Builder App Icon store axis is customer-only; owner rooms stay hub/FAB", () => {
    const p = buildNotificationBadgeProjection({
      domainUnreadRooms: { general_direct: 0, group: 0, trade: 0, store_order: 9 },
      storeOrderBuyerDeliveryUnread: 2,
      storeOrderOwnerChatUnread: 7,
      orphanMissedCall: 0,
      notificationAttentionTotal: 0,
      nonChatEventAttention: {
        tradeStatus: 0,
        orderStatus: 0,
        deliveryStatus: 0,
        communityActivity: 0,
        adminNotice: 0,
      },
    });
    expect(p.appIcon.storeOrder).toBe(2);
    expect(p.storeOrderOwnerUnreadRooms).toBe(7);
    expect(p.appIconTotal).toBe(2);
  });

  it("Owner with preferred store: Bottom stores tab 0; FAB uses store-scoped chat", () => {
    const bd = {
      ...OWNER_HUB_BADGE_EMPTY,
      orderAttention: 3,
      inquiryAttention: 1,
      ownerReviewAttention: 1,
      storeOrderChatUnread: 4,
      buyerOrderAttention: 9,
      storesTabAttention: 9,
      communityMessengerUnread: 5,
    };
    expect(resolveBottomNavStoresTabBadgeForOwnerStore(bd, true)).toBe(0);
    expect(resolveBottomNavStoresTabBadgeForOwnerStore(bd, false)).toBe(9);
    expect(resolveFabOwnerOrderChatBadgeCount(bd)).toBe(4);
    expect(resolveOwnerOperationsCenterAttentionCount(bd)).toBe(3 + 1 + 1 + 4);
  });

  it("Domain hub apply preserves store-scoped FAB and Owner ops axes", () => {
    const src = readFileSync(join(process.cwd(), "lib/chats/owner-hub-badge-store.ts"), "utf8");
    expect(src).toContain("storeOrderChatUnread: current.storeOrderChatUnread");
    expect(src).toContain("orderAttention: current.orderAttention");
    expect(src).toContain("inquiryAttention: current.inquiryAttention");
    expect(src).toContain("ownerReviewAttention: current.ownerReviewAttention");
  });
});
