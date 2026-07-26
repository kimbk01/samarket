/**
 * @vitest-environment jsdom
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import fs from "node:fs";
import path from "node:path";
import {
  __resetDomainBadgeSurfaceStoreForTests,
  getDomainBadgeSurfaceSnapshot,
  publishDomainBadgeShellToSurfaceStore,
  publishMissedCallToDomainBadgeSurface,
  subscribeDomainBadgeSurface,
} from "@/lib/messenger/contracts/domain-badge-surface-store";
import { resolveDomainAppIconBadgeCount } from "@/lib/notifications/domain-app-icon-badge";
import {
  __resetOwnerHubBadgeStoreForTest,
  applyDomainAuthorityHubBadgeOptimistic,
  subscribeOwnerHubBadge,
} from "@/lib/chats/owner-hub-badge-store";

describe("App Icon runtime authority (Option A)", () => {
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

  it("same 4-axis values do not notify subscribers or bump generation", () => {
    const onChange = vi.fn();
    subscribeDomainBadgeSurface(onChange);
    publishDomainBadgeShellToSurfaceStore({
      communityMessengerUnread: 2,
      tradeUnread: 1,
      storeOrderChatUnread: 0,
    });
    publishMissedCallToDomainBadgeSurface(1);
    const gen = getDomainBadgeSurfaceSnapshot().generation;
    onChange.mockClear();

    publishDomainBadgeShellToSurfaceStore({
      communityMessengerUnread: 2,
      tradeUnread: 1,
      storeOrderChatUnread: 0,
    });
    publishMissedCallToDomainBadgeSurface(1);
    expect(onChange).toHaveBeenCalledTimes(0);
    expect(getDomainBadgeSurfaceSnapshot().generation).toBe(gen);
    expect(getDomainBadgeSurfaceSnapshot().appIconTotal).toBe(4);
  });

  it("notifies once per distinct axis change", () => {
    const onChange = vi.fn();
    subscribeDomainBadgeSurface(onChange);

    publishDomainBadgeShellToSurfaceStore({
      communityMessengerUnread: 1,
      tradeUnread: 0,
      storeOrderChatUnread: 0,
    });
    expect(onChange).toHaveBeenCalledTimes(1);

    publishDomainBadgeShellToSurfaceStore({
      communityMessengerUnread: 1,
      tradeUnread: 1,
      storeOrderChatUnread: 0,
    });
    expect(onChange).toHaveBeenCalledTimes(2);

    publishMissedCallToDomainBadgeSurface(1);
    expect(onChange).toHaveBeenCalledTimes(3);
    expect(getDomainBadgeSurfaceSnapshot().appIconTotal).toBe(3);
  });

  it("Owner hub-only changes do not notify App Icon surface subscribers", () => {
    publishDomainBadgeShellToSurfaceStore({
      communityMessengerUnread: 2,
      tradeUnread: 0,
      storeOrderChatUnread: 0,
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
    expect(src).not.toContain("getAppIconBadgeProjection");
    expect(src).not.toMatch(/from\s+["']@\/lib\/chat-domain\/projections\/app-icon-badge-projection["']/);
    expect(src).not.toContain("generation > 0");
    expect(src).not.toContain("subscribeOwnerHubBadge");
  });

  it("bridge separates Owner hub apply from App Icon runtime publish", () => {
    const src = fs.readFileSync(
      path.join(process.cwd(), "lib/messenger/contracts/domain-badge-authority-product-bridge.ts"),
      "utf8"
    );
    expect(src).toContain("applyOwnerHubSurfacesFromProjection");
    expect(src).toContain("applyAppIconRuntimeAuthorityFromProjection");
    expect(src).toContain("publishDomainBadgeShellToSurfaceStore");
    expect(src).toContain("Phase H contract mirror");
  });
});
