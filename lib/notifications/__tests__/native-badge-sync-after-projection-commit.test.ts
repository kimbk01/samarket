/**
 * @vitest-environment jsdom
 *
 * Delivery contract: Projection Authority commit → surface appIconTotal → NativeBadgeSync input.
 * DO NOT read Bell / Hub / local Cap cache as App Icon source.
 */
import fs from "node:fs";
import path from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  __resetDomainBadgeSurfaceStoreForTests,
  getDomainBadgeSurfaceSnapshot,
  publishDomainAppIconCompleteSnapshot,
  subscribeDomainBadgeSurface,
} from "@/lib/messenger/contracts/domain-badge-surface-store";
import { applyNotificationBadgeProjection } from "@/lib/messenger/contracts/domain-badge-authority-product-bridge";
import { buildNotificationBadgeProjection } from "@/lib/notifications/build-notification-badge-projection";

function projectionWithAppIcon(parts: {
  messenger: number;
  trade: number;
  storeOrder: number;
  missedCall: number;
  notificationAttentionTotal?: number;
}) {
  return buildNotificationBadgeProjection({
    domainUnreadRooms: {
      general_direct: parts.messenger,
      group: 0,
      trade: parts.trade,
      store_order: parts.storeOrder,
    },
    storeOrderBuyerDeliveryUnread: 0,
    storeOrderOwnerChatUnread: parts.storeOrder,
    orphanMissedCall: parts.missedCall,
    nonChatEventAttention: {
      tradeStatus: 0,
      orderStatus: 0,
      deliveryStatus: 0,
      communityActivity: 0,
      adminNotice: 0,
    },
    notificationAttentionTotal: parts.notificationAttentionTotal ?? 0,
    unreadApprovedNotificationEvents: parts.notificationAttentionTotal ?? 0,
  });
}

describe("NativeBadgeSync after Projection commit", () => {
  beforeEach(() => {
    __resetDomainBadgeSurfaceStoreForTests();
  });

  it("increase: surface 22 → projection commit 23 → subscriber sees 23", () => {
    publishDomainAppIconCompleteSnapshot({
      communityMessengerUnread: 22,
      tradeUnread: 0,
      storeOrderChatUnread: 0,
      missedCall: 0,
      projectionFactsVersion: 1_000,
    });
    expect(getDomainBadgeSurfaceSnapshot().appIconTotal).toBe(22);

    const onChange = vi.fn();
    subscribeDomainBadgeSurface(onChange);
    const next = projectionWithAppIcon({
      messenger: 22,
      trade: 0,
      storeOrder: 0,
      missedCall: 0,
      notificationAttentionTotal: 1,
    });
    expect(next.appIconTotal).toBe(23);
    applyNotificationBadgeProjection(next, {
      applyBell: true,
      projectionVersionMs: 2_000,
    });
    expect(onChange).toHaveBeenCalled();
    expect(getDomainBadgeSurfaceSnapshot().appIconTotal).toBe(23);
  });

  it("decrease: surface 23 → read projection 22 → subscriber sees 22", () => {
    publishDomainAppIconCompleteSnapshot({
      communityMessengerUnread: 22,
      tradeUnread: 0,
      storeOrderChatUnread: 0,
      missedCall: 1,
      projectionFactsVersion: 3_000,
    });
    expect(getDomainBadgeSurfaceSnapshot().appIconTotal).toBe(23);

    const onChange = vi.fn();
    subscribeDomainBadgeSurface(onChange);
    const next = projectionWithAppIcon({
      messenger: 22,
      trade: 0,
      storeOrder: 0,
      missedCall: 0,
      notificationAttentionTotal: 0,
    });
    expect(next.appIconTotal).toBe(22);
    applyNotificationBadgeProjection(next, {
      applyBell: true,
      projectionVersionMs: 4_000,
    });
    expect(onChange).toHaveBeenCalled();
    expect(getDomainBadgeSurfaceSnapshot().appIconTotal).toBe(22);
  });

  it("stale bootstrap: older factsVersion appIcon=22 does not overwrite 23", () => {
    publishDomainAppIconCompleteSnapshot({
      communityMessengerUnread: 22,
      tradeUnread: 0,
      storeOrderChatUnread: 0,
      missedCall: 1,
      projectionFactsVersion: 5_000,
    });
    expect(getDomainBadgeSurfaceSnapshot().appIconTotal).toBe(23);

    const stale = publishDomainAppIconCompleteSnapshot({
      communityMessengerUnread: 22,
      tradeUnread: 0,
      storeOrderChatUnread: 0,
      missedCall: 0,
      projectionFactsVersion: 4_000,
    });
    expect(stale.committed).toBe(false);
    expect(stale.reason).toBe("stale_facts_version");
    expect(getDomainBadgeSurfaceSnapshot().appIconTotal).toBe(23);
  });

  it("same count: unchanged skip is idempotent (no extra surface notify)", () => {
    publishDomainAppIconCompleteSnapshot({
      communityMessengerUnread: 23,
      tradeUnread: 0,
      storeOrderChatUnread: 0,
      missedCall: 0,
      projectionFactsVersion: 6_000,
    });
    const onChange = vi.fn();
    subscribeDomainBadgeSurface(onChange);
    const again = publishDomainAppIconCompleteSnapshot({
      communityMessengerUnread: 23,
      tradeUnread: 0,
      storeOrderChatUnread: 0,
      missedCall: 0,
      projectionFactsVersion: 7_000,
    });
    expect(again.committed).toBe(false);
    expect(again.reason).toBe("unchanged");
    expect(onChange).toHaveBeenCalledTimes(0);
    expect(getDomainBadgeSurfaceSnapshot().appIconTotal).toBe(23);
  });

  it("source contract: NativeBadgeSync reads Projection surface appIconTotal only", () => {
    const native = fs.readFileSync(
      path.join(process.cwd(), "components/push/NativeBadgeSync.tsx"),
      "utf8"
    );
    expect(native).toContain("subscribeDomainBadgeSurface");
    expect(native).toContain("surface.appIconTotal");
    expect(native).toContain("syncNativeBadgeCount(n)");
    expect(native).not.toContain("subscribeOwnerHubBadge");
    expect(native).not.toContain("getNotificationBadgeCountSnapshot");
    expect(native).not.toMatch(/from\s+["']@\/lib\/chat-domain\/projections\/app-icon-badge-projection["']/);
  });

  it("import ban: mutation/Bell/list paths do not call Badge.set or DibayAppIconDelivery", () => {
    const roots = [
      "lib/offers/price-offers.server.ts",
      "lib/notifications/client/notification-event-read-client.ts",
      "lib/notifications/inbox-read-bridge.ts",
      "lib/chats/owner-hub-badge-store.ts",
    ];
    for (const rel of roots) {
      const src = fs.readFileSync(path.join(process.cwd(), rel), "utf8");
      expect(src).not.toContain("syncNativeBadgeCount");
      expect(src).not.toContain("DibayAppIconDelivery");
      expect(src).not.toMatch(/Badge\.set\s*\(/);
    }
  });
});
