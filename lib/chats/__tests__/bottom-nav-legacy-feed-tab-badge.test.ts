import fs from "node:fs";
import path from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { OWNER_HUB_BADGE_EMPTY } from "@/lib/chats/owner-hub-badge-types";
import { resolveMessengerChatTabBadgeCount } from "@/lib/notifications/messenger-chat-tab-badge";
import {
  resolveFabOwnerOrdersBadgeCount,
  resolveFabOwnerOrderChatBadgeCount,
} from "@/lib/delivery/owner/owner-store-badge-display-policy";
import { resolveTier1BellListFetchOpts } from "@/lib/notifications/resolve-tier1-bell-surface";

let eventsSnap: {
  communityActivity?: number;
  tradeMessage?: number;
  tradeStatus?: number;
  orderStatus?: number;
  deliveryStatus?: number;
  total?: number;
} | null = {
  communityActivity: 24,
  tradeMessage: 3,
  tradeStatus: 5,
  orderStatus: 29,
  deliveryStatus: 2,
  total: 103,
};

vi.mock("@/lib/notifications/notification-badge-count-store", () => ({
  getNotificationBadgeCountSnapshot: () => eventsSnap,
}));

import { resolveBottomNavTabUnreadFromNotificationEvents } from "@/lib/chats/use-owner-hub-badge-total";
import { resolveBottomNavTradeTabBadgeCount } from "@/lib/notifications/samarket-messenger-notification-regulations";

describe("bottom nav Legacy feed tab badges", () => {
  beforeEach(() => {
    eventsSnap = {
      communityActivity: 24,
      tradeMessage: 3,
      tradeStatus: 5,
      orderStatus: 29,
      deliveryStatus: 2,
      total: 103,
    };
  });

  it("1. Community event unread → BottomNav community events slice not used (null)", () => {
    expect(resolveBottomNavTabUnreadFromNotificationEvents("community")).toBeNull();
  });

  it("2. Trade event unread → BottomNav Trade badge resolver = 0", () => {
    expect(resolveBottomNavTradeTabBadgeCount()).toBe(0);
    expect(resolveBottomNavTabUnreadFromNotificationEvents("trade")).toBeNull();
  });

  it("3. Delivery/order event unread → BottomNav stores events slice not used (null)", () => {
    expect(resolveBottomNavTabUnreadFromNotificationEvents("stores")).toBeNull();
  });

  it("4. tier1 bell / FAB retain domain cause surfaces", () => {
    expect(resolveTier1BellListFetchOpts("bottom_nav_community")).toEqual({
      excludeChatMessages: true,
      pushKind: "community",
    });
    expect(resolveTier1BellListFetchOpts("bottom_nav_my")).toEqual({
      excludeChatMessages: true,
      pushKind: "trade",
    });
    expect(resolveTier1BellListFetchOpts("bottom_nav_delivery")).toEqual({
      excludeChatMessages: true,
      excludeOwnerStoreCommerce: true,
      pushKind: "delivery",
    });
    const hub = {
      ...OWNER_HUB_BADGE_EMPTY,
      orderAttention: 2,
      storeOrderChatUnread: 3,
    };
    expect(resolveFabOwnerOrdersBadgeCount(hub)).toBe(2);
    expect(resolveFabOwnerOrderChatBadgeCount(hub)).toBe(3);
  });

  it("5. Chat unread room count still drives BottomNav Chat", () => {
    const hub = { ...OWNER_HUB_BADGE_EMPTY, communityMessengerUnread: 4 };
    expect(resolveMessengerChatTabBadgeCount(false, hub)).toBe(4);
    expect(resolveBottomNavTabUnreadFromNotificationEvents("chat")).toBeNull();
  });

  it("6. Chat row contract module still distinguishes room vs message count", () => {
    const src = fs.readFileSync(
      path.join(process.cwd(), "lib/notifications/__tests__/chat-room-count-vs-row-count-contract.test.ts"),
      "utf8"
    );
    expect(src).toContain("BottomNav Chat counts unread rooms");
    expect(src).toContain("not message sum");
  });

  it("7. App icon / Bell badge-count uses Domain authority (not events SUM SSOT)", () => {
    const src = fs.readFileSync(
      path.join(process.cwd(), "app/api/me/notifications/badge-count/route.ts"),
      "utf8"
    );
    expect(src).toContain("fetchDomainBadgeAuthorityPayload");
    expect(src).toContain("domain_badge");
    expect(src).toContain("total");
  });

  it("8. Sound eventKey matrix test file remains (registry untouched)", () => {
    expect(
      fs.existsSync(
        path.join(process.cwd(), "lib/notifications/__tests__/badge-source-eventkey-matrix.test.ts")
      )
    ).toBe(true);
  });

  it("lock: useOwnerHubBadgeTabUnreadCount Legacy feed tabs return 0 before events", () => {
    const src = fs.readFileSync(
      path.join(process.cwd(), "lib/chats/use-owner-hub-badge-total.ts"),
      "utf8"
    );
    expect(src).toContain("LEGACY_BOTTOM_NAV_FEED_TAB_ICONS");
    expect(src).toContain('if (LEGACY_BOTTOM_NAV_FEED_TAB_ICONS.has(icon))');
    expect(src).toContain("return 0;");
    expect(src).not.toContain("subscribeNotificationBadgeCount");
    expect(src).toContain("resolveMessengerChatTabBadgeCount");
  });

  it("lock: Trade BottomNav resolver is constant zero (Legacy)", () => {
    const src = fs.readFileSync(
      path.join(process.cwd(), "lib/notifications/samarket-messenger-notification-regulations.ts"),
      "utf8"
    );
    expect(src).toContain("export function resolveBottomNavTradeTabBadgeCount");
    expect(src).toContain("return 0;");
    expect(src).not.toContain("getNotificationBadgeCountSnapshot");
  });
});
