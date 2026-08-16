/**
 * @vitest-environment jsdom
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import fs from "node:fs";
import path from "node:path";
import {
  __resetDomainBadgeSurfaceStoreForTests,
  getDomainBadgeSurfaceAuthEpoch,
  getDomainBadgeSurfaceSnapshot,
  publishDomainAppIconCompleteSnapshot,
  publishDomainBadgeShellToSurfaceStore,
  publishMissedCallToDomainBadgeSurface,
  resetDomainBadgeSurfaceForAuthEpoch,
  subscribeDomainBadgeSurface,
} from "@/lib/messenger/contracts/domain-badge-surface-store";
import { resolveDomainAppIconBadgeCount } from "@/lib/notifications/domain-app-icon-badge";
import {
  __resetOwnerHubBadgeStoreForTest,
  applyDomainAuthorityHubBadgeOptimistic,
  subscribeOwnerHubBadge,
} from "@/lib/chats/owner-hub-badge-store";
import { applyNotificationBadgeProjection } from "@/lib/messenger/contracts/domain-badge-authority-product-bridge";
import { buildNotificationBadgeProjection } from "@/lib/notifications/build-notification-badge-projection";

describe("App Icon runtime authority (Option A + Phase 3-1 atomic)", () => {
  beforeEach(() => {
    __resetDomainBadgeSurfaceStoreForTests();
    __resetOwnerHubBadgeStoreForTest();
  });

  it("keeps 4-axis App Icon formula unchanged", () => {
    expect(
      resolveDomainAppIconBadgeCount({
        messenger: 2,
        trade: 1,
        storeOrder: 3,
        missedCall: 1,
      })
    ).toBe(2 + 1 + 3 + 1);
  });

  it("complete snapshot: shell+missedCall change notifies once with final appIconTotal", () => {
    const onChange = vi.fn();
    subscribeDomainBadgeSurface(onChange);
    const result = publishDomainAppIconCompleteSnapshot({
      communityMessengerUnread: 2,
      tradeUnread: 1,
      storeOrderChatUnread: 0,
      missedCall: 1,
    });
    expect(result.committed).toBe(true);
    expect(onChange).toHaveBeenCalledTimes(1);
    expect(getDomainBadgeSurfaceSnapshot().appIconTotal).toBe(4);
    expect(getDomainBadgeSurfaceSnapshot().missedCall).toBe(1);
  });

  it("same complete values do not notify or bump generation", () => {
    const onChange = vi.fn();
    subscribeDomainBadgeSurface(onChange);
    publishDomainAppIconCompleteSnapshot({
      communityMessengerUnread: 2,
      tradeUnread: 1,
      storeOrderChatUnread: 0,
      missedCall: 1,
    });
    const gen = getDomainBadgeSurfaceSnapshot().generation;
    onChange.mockClear();

    const again = publishDomainAppIconCompleteSnapshot({
      communityMessengerUnread: 2,
      tradeUnread: 1,
      storeOrderChatUnread: 0,
      missedCall: 1,
    });
    expect(again.committed).toBe(false);
    expect(again.reason).toBe("unchanged");
    expect(onChange).toHaveBeenCalledTimes(0);
    expect(getDomainBadgeSurfaceSnapshot().generation).toBe(gen);
  });

  it("rejects stale auth epoch after logout reset", () => {
    const epoch = getDomainBadgeSurfaceAuthEpoch();
    publishDomainAppIconCompleteSnapshot({
      communityMessengerUnread: 3,
      tradeUnread: 0,
      storeOrderChatUnread: 0,
      missedCall: 0,
      authEpochAtSchedule: epoch,
    });
    expect(getDomainBadgeSurfaceSnapshot().appIconTotal).toBe(3);

    resetDomainBadgeSurfaceForAuthEpoch();
    expect(getDomainBadgeSurfaceSnapshot().appIconTotal).toBe(0);

    const late = publishDomainAppIconCompleteSnapshot({
      communityMessengerUnread: 9,
      tradeUnread: 9,
      storeOrderChatUnread: 9,
      missedCall: 9,
      authEpochAtSchedule: epoch,
    });
    expect(late.committed).toBe(false);
    expect(late.reason).toBe("stale_auth_epoch");
    expect(getDomainBadgeSurfaceSnapshot().appIconTotal).toBe(0);
  });

  it("rejects older projectionFactsVersion", () => {
    publishDomainAppIconCompleteSnapshot({
      communityMessengerUnread: 1,
      tradeUnread: 0,
      storeOrderChatUnread: 0,
      missedCall: 0,
      projectionFactsVersion: 5_000,
    });
    expect(getDomainBadgeSurfaceSnapshot().appIconTotal).toBe(1);

    const stale = publishDomainAppIconCompleteSnapshot({
      communityMessengerUnread: 8,
      tradeUnread: 0,
      storeOrderChatUnread: 0,
      missedCall: 0,
      projectionFactsVersion: 4_000,
    });
    expect(stale.committed).toBe(false);
    expect(stale.reason).toBe("stale_facts_version");
    expect(getDomainBadgeSurfaceSnapshot().appIconTotal).toBe(1);
  });

  it("applyNotificationBadgeProjection publishes App Icon atomically (one surface notify)", () => {
    const onChange = vi.fn();
    subscribeDomainBadgeSurface(onChange);
    const projection = buildNotificationBadgeProjection({
      domainUnreadRooms: {
        general_direct: 2,
        group: 1,
        trade: 1,
        store_order: 0,
      },
      storeOrderBuyerDeliveryUnread: 0,
      storeOrderOwnerChatUnread: 0,
      orphanMissedCall: 2,
      nonChatEventAttention: {
        tradeStatus: 0,
        orderStatus: 0,
        deliveryStatus: 0,
        communityActivity: 0,
        adminNotice: 0,
      },
      unreadApprovedNotificationEvents: 5,
    });
    applyNotificationBadgeProjection(projection, {
      applyBell: true,
      projectionVersionMs: 10_000,
    });
    expect(onChange).toHaveBeenCalledTimes(1);
    expect(getDomainBadgeSurfaceSnapshot().appIconTotal).toBe(projection.appIconTotal);
    expect(getDomainBadgeSurfaceSnapshot().missedCall).toBe(2);
  });

  it("Owner hub-only changes do not notify App Icon surface subscribers", () => {
    publishDomainAppIconCompleteSnapshot({
      communityMessengerUnread: 2,
      tradeUnread: 0,
      storeOrderChatUnread: 0,
      missedCall: 0,
    });
    const appIconOnChange = vi.fn();
    const hubOnChange = vi.fn();
    subscribeDomainBadgeSurface(appIconOnChange);
    subscribeOwnerHubBadge(hubOnChange);
    appIconOnChange.mockClear();
    hubOnChange.mockClear();

    applyDomainAuthorityHubBadgeOptimistic({
      communityMessengerUnread: 2,
      tradeUnread: 9,
      storeOrderOwnerUnreadRooms: 4,
      buyerOrderAttention: 3,
      socialChatUnread: 2,
    });

    expect(hubOnChange).toHaveBeenCalled();
    expect(appIconOnChange).toHaveBeenCalledTimes(0);
    expect(getDomainBadgeSurfaceSnapshot().appIconTotal).toBe(2);
  });

  it("NativeBadgeSync runtime reader is domain-badge-surface-store only", () => {
    const src = fs.readFileSync(
      path.join(process.cwd(), "components/push/NativeBadgeSync.tsx"),
      "utf8"
    );
    expect(src).toContain("subscribeDomainBadgeSurface");
    expect(src).toContain("getDomainBadgeSurfaceSnapshot");
    expect(src).toContain("surface.appIconTotal");
    expect(src).toContain("lastAppliedRef");
    expect(src).not.toContain("getAppIconBadgeProjection");
    expect(src).not.toMatch(/from\s+["']@\/lib\/chat-domain\/projections\/app-icon-badge-projection["']/);
    expect(src).not.toContain("subscribeOwnerHubBadge");
  });

  it("NativeBadgeSync Android background reaffirm bypasses skip_same", () => {
    const src = fs.readFileSync(
      path.join(process.cwd(), "components/push/NativeBadgeSync.tsx"),
      "utf8"
    );
    expect(src).toContain("android_background_reaffirm");
    expect(src).toContain("forceReaffirm");
    expect(src).toContain('Capacitor.getPlatform() === "android"');
    expect(src).toContain('App.addListener("appStateChange"');
  });

  it("bridge uses complete snapshot only (no split shell/missedCall product path)", () => {
    const src = fs.readFileSync(
      path.join(process.cwd(), "lib/messenger/contracts/domain-badge-authority-product-bridge.ts"),
      "utf8"
    );
    expect(src).toContain("publishDomainAppIconCompleteSnapshot");
    expect(src).not.toContain("publishDomainBadgeShellToSurfaceStore");
    expect(src).not.toContain("publishMissedCallToDomainBadgeSurface");
    expect(src).not.toMatch(/void import\(["']@\/lib\/messenger\/contracts\/domain-badge-surface-store["']\)/);
  });

  it("deprecated split helpers still converge without requiring product use", () => {
    publishDomainBadgeShellToSurfaceStore({
      communityMessengerUnread: 1,
      tradeUnread: 0,
      storeOrderChatUnread: 0,
    });
    expect(getDomainBadgeSurfaceSnapshot().appIconTotal).toBe(1);
    publishMissedCallToDomainBadgeSurface(2);
    expect(getDomainBadgeSurfaceSnapshot().appIconTotal).toBe(3);
  });
});
