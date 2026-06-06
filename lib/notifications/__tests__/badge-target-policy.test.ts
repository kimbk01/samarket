import { describe, expect, it } from "vitest";
import {
  BADGE_TARGET_POLICY_ID,
  buildTradeTargetId,
  unreadCountModeToBadgeSurface,
} from "@/lib/notifications/badge-target-policy";
import { ownerHubUnreadPartialFromTargetBundle } from "@/lib/chats/build-owner-hub-badge-from-targets";
import { resolveMessengerTabTotalUnreadBadgeCount } from "@/lib/notifications/samarket-messenger-notification-regulations";
import type { OwnerHubBadgeBreakdown } from "@/lib/chats/owner-hub-badge-types";

describe("badge-target-policy", () => {
  it("exposes stable policy id", () => {
    expect(BADGE_TARGET_POLICY_ID).toBe("badge-target-0001");
  });

  it("maps unread modes to badge surfaces", () => {
    expect(unreadCountModeToBadgeSurface("consumer")).toBe("tier1_inbox_bell");
    expect(unreadCountModeToBadgeSurface("owner_store_commerce")).toBe("owner_commerce_inbox");
    expect(unreadCountModeToBadgeSurface("bottom_nav")).toBe("bottom_nav_my");
  });

  it("builds trade target id from post and parties", () => {
    expect(buildTradeTargetId("post-1", "seller-2", "buyer-3")).toBe("post-1:seller-2:buyer-3");
  });
});

describe("hub bundle → messenger tab (no chatUnread sum)", () => {
  it("uses bottom_nav_chat only for messenger tab badge", () => {
    const partial: OwnerHubBadgeBreakdown = {
      ...ownerHubUnreadPartialFromTargetBundle({
        bottom_nav_chat: 4,
        bottom_nav_community: 9,
        bottom_nav_delivery: 0,
        fab_owner_orders: 0,
        fab_owner_store: 0,
        fab_owner_order_chat: 0,
        owner_commerce_inbox: 0,
      }),
      orderAttention: 0,
      inquiryAttention: 0,
      ownerReviewAttention: 0,
      storesTabAttention: 0,
      buyerOrderAttention: 0,
      storeDeepLink: null,
      total: 4,
    };
    expect(partial.chatUnread).toBe(0);
    expect(partial.communityMessengerUnread).toBe(4);
    expect(resolveMessengerTabTotalUnreadBadgeCount(partial)).toBe(4);
    expect(partial.chatUnread + partial.communityMessengerUnread).toBe(4);
  });
});
