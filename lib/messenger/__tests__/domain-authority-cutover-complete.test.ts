/**
 * Domain Authority cutover — single writer / Bottom Chat isolation / room list / OS tray.
 * Red-team regression after cb4e478e + 38b409d1 hardening.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { resolveMessengerTabTotalUnreadBadgeCount } from "@/lib/notifications/samarket-messenger-notification-regulations";
import { OWNER_HUB_BADGE_EMPTY } from "@/lib/chats/owner-hub-badge-types";
import { resolvePushRouteFromFcmData } from "@/lib/push/resolve-push-route-from-fcm-data";
import { mergeTradePartialBootstrap, acceptTradeBootstrap } from "@/lib/messenger/trade/bootstrap";
import { buildTradeIdentity } from "@/lib/messenger/trade/identity";
import type { TradeRoomInput } from "@/lib/messenger/trade/types";
import {
  acceptStoreOrderBootstrap,
  mergeStoreOrderPartialBootstrap,
} from "@/lib/messenger/store-order/bootstrap";
import { buildStoreOrderIdentity } from "@/lib/messenger/store-order/identity";
import type { StoreOrderRoomInput } from "@/lib/messenger/store-order/types";
import {
  coerceNotificationId,
  matchDeliveredNotificationForTest,
} from "@/lib/push/native/remove-delivered-notifications";
import { resolveDibayDeepLinkToAppPath } from "@/lib/platform/deep-link-routes";

const root = process.cwd();

function read(rel: string): string {
  return readFileSync(join(root, rel), "utf8");
}

describe("domain authority cutover — writer uniqueness", () => {
  it("App Icon: hub store does not publish to surface store", () => {
    const hub = read("lib/chats/owner-hub-badge-store.ts");
    expect(hub).not.toContain("publishDomainBadgeShellToSurfaceStore");
    expect(hub).not.toContain("scheduleDomainBadgeSurfaceResync");
  });

  it("App Icon: surface resync does not write hub nav", () => {
    const bridge = read("lib/messenger/contracts/domain-badge-authority-product-bridge.ts");
    const resyncIdx = bridge.indexOf("export function scheduleDomainBadgeSurfaceResync");
    expect(resyncIdx).toBeGreaterThan(-1);
    const resyncBody = bridge.slice(resyncIdx, resyncIdx + 1800);
    expect(resyncBody).not.toContain("publishDomainBadgeAuthorityShellToNav");
    expect(resyncBody).toContain("resyncNotificationBadgeAuthorityFromBadgeCount");
  });

  it("Apply entry is single Projection apply", () => {
    const bridge = read("lib/messenger/contracts/domain-badge-authority-product-bridge.ts");
    expect(bridge).toContain("export function applyNotificationBadgeProjection");
  });

  it("NativeBadgeSync is App Icon OS adapter only (no Bell→surface write)", () => {
    const src = read("components/push/NativeBadgeSync.tsx");
    expect(src).toContain("getDomainBadgeSurfaceSnapshot");
    expect(src).toContain("syncNativeBadgeCount(surface.appIconTotal)");
    expect(src).not.toMatch(/syncNativeBadgeCount\(\s*getNotificationBadgeCountSnapshot/);
    expect(src).not.toContain("publishMissedCallToDomainBadgeSurface");
    expect(src).not.toContain("subscribeNotificationBadgeCount");
  });

  it("optimistic cm-read-ui does not schedule hub refresh", () => {
    const hub = read("lib/chats/owner-hub-badge-store.ts");
    expect(hub).toContain('source === "cm-read-ui-optimistic"');
    expect(hub).toMatch(/cm-read-ui-optimistic[\s\S]{0,80}return/);
  });

  it("DomainShellCanaryHomeGate does not write App Icon surface", () => {
    const src = read(
      "components/community-messenger/domain-shell-canary/DomainShellCanaryHomeGate.tsx"
    );
    expect(src).not.toContain("publishMissedCallToDomainBadgeSurface");
    expect(src).not.toContain("publishDomainBadgeShellToSurfaceStore");
  });

  it("atomic mark_read success invalidates badge cache (parity with Legacy)", () => {
    const route = read("app/api/community-messenger/rooms/[roomId]/route.ts");
    const atomicIdx = route.indexOf('authority: "domain_atomic_read"');
    expect(atomicIdx).toBeGreaterThan(-1);
    const window = route.slice(Math.max(0, atomicIdx - 600), atomicIdx + 200);
    expect(window).toContain("invalidateNotificationBadgeCache");
  });
});

describe("domain authority cutover — Bottom Chat GD+Group only", () => {
  it("excludes trade and store_order from Bottom Chat", () => {
    expect(
      resolveMessengerTabTotalUnreadBadgeCount({
        ...OWNER_HUB_BADGE_EMPTY,
        communityMessengerUnread: 5,
        chatUnread: 7,
        storeOrderChatUnread: 9,
      })
    ).toBe(5);
  });
});

describe("domain authority cutover — Push final room routes", () => {
  it("never routes trade to /chats", () => {
    const href = resolvePushRouteFromFcmData({ type: "trade_message", roomId: "r-trade" });
    expect(href).toContain("/community-messenger/rooms/r-trade");
    expect(href).not.toMatch(/^\/chats\//);
  });

  it("separates owner vs customer store_order", () => {
    expect(
      resolvePushRouteFromFcmData({
        domain: "store_order",
        orderId: "o1",
        surfaceRole: "owner",
      })
    ).toBe("/my/business/store-order-chat/o1");
    expect(
      resolvePushRouteFromFcmData({
        domain: "store_order",
        roomId: "so-room",
        orderId: "o1",
        surfaceRole: "customer",
      })
    ).toContain("/community-messenger/rooms/so-room");
  });

  it("Web/Android/iOS deep-link resolve to CM final rooms (not hub)", () => {
    expect(resolveDibayDeepLinkToAppPath("dibay://chat/room-gd")).toBe(
      "/community-messenger/rooms/room-gd"
    );
    expect(resolveDibayDeepLinkToAppPath("dibay://trade/chat/room-tr")).toContain(
      "/community-messenger/rooms/room-tr"
    );
    expect(resolveDibayDeepLinkToAppPath("dibay://trade/chat/room-tr")).not.toContain(
      "trade-chats"
    );
    expect(resolveDibayDeepLinkToAppPath("dibay://orders/ord-1")).toContain(
      "/mypage/store-orders/ord-1/chat"
    );
  });
});

describe("domain authority cutover — trade/store_order room-unit lists", () => {
  it("trade partial merge keeps one row per roomId", () => {
    const identity = buildTradeIdentity({
      itemId: "item-1",
      sellerUserId: "s1",
      counterpartyUserId: "b1",
    });
    const roomBase: TradeRoomInput = {
      roomId: "room-a",
      chatDomain: "trade",
      domainIdentityKey: identity.identityKey,
      itemId: "item-1",
      sellerUserId: "s1",
      counterpartyUserId: "b1",
      itemTitle: "A",
      itemImageUrl: null,
      peerDisplayName: "Peer",
      peerAvatarUrl: null,
      lastMessage: "first",
      lastMessageAt: "2026-01-01T00:00:00.000Z",
      unreadCount: 1,
    };
    const base = acceptTradeBootstrap({
      viewerUserId: "u1",
      generation: "g1",
      mode: "full",
      rooms: [roomBase],
    });
    expect(base.ok).toBe(true);
    if (!base.ok) return;
    const merged = mergeTradePartialBootstrap(base.snapshot, {
      generation: "g2",
      rooms: [
        {
          ...roomBase,
          lastMessage: "second",
          lastMessageAt: "2026-01-02T00:00:00.000Z",
          unreadCount: 0,
        },
      ],
    });
    expect(merged.ok).toBe(true);
    if (!merged.ok) return;
    expect(merged.snapshot.rows).toHaveLength(1);
    expect(merged.snapshot.rows[0]?.roomId).toBe("room-a");
    expect(merged.snapshot.rows[0]?.lastMessage).toBe("second");
  });

  it("store_order partial merge keeps one row per roomId", () => {
    const identity = buildStoreOrderIdentity("ord-1");
    const roomBase: StoreOrderRoomInput = {
      roomId: "so-room-a",
      chatDomain: "store_order",
      domainIdentityKey: identity.identityKey,
      orderId: "ord-1",
      storeId: "store-1",
      storeName: "Store",
      storeImageUrl: null,
      customerUserId: "u1",
      customerName: "Customer",
      customerAvatarUrl: null,
      latestChatMessageText: "first",
      latestChatMessageAt: "2026-01-01T00:00:00.000Z",
      unreadCount: 2,
    };
    const base = acceptStoreOrderBootstrap({
      viewerUserId: "u1",
      generation: "g1",
      mode: "full",
      rooms: [roomBase],
    });
    expect(base.ok).toBe(true);
    if (!base.ok) return;
    const merged = mergeStoreOrderPartialBootstrap(base.snapshot, {
      generation: "g2",
      rooms: [
        {
          ...roomBase,
          latestChatMessageText: "second",
          latestChatMessageAt: "2026-01-02T00:00:00.000Z",
          unreadCount: 0,
        },
      ],
    });
    expect(merged.ok).toBe(true);
    if (!merged.ok) return;
    expect(merged.snapshot.rows).toHaveLength(1);
    expect(merged.snapshot.rows[0]?.roomId).toBe("so-room-a");
    expect(merged.snapshot.rows[0]?.latestChatMessageText).toBe("second");
  });
});

describe("domain authority cutover — room entry / back blanks", () => {
  it("community-messenger loading is not empty body-only", () => {
    const src = read("app/(main)/community-messenger/loading.tsx");
    expect(src).not.toMatch(/return\s+null/);
    expect(src).toContain("CommunityMessengerHomeShellSkeleton");
  });

  it("forward navigation does not open OpeningOverlay", () => {
    const src = read("lib/community-messenger/community-messenger-room-forward-navigation.ts");
    expect(src).not.toContain("beginCmPreRouteRoomOpeningOverlay(");
  });

  it("BootstrapGate pending is not StableEntryShell", () => {
    const src = read("components/community-messenger/room/CommunityMessengerRoomBootstrapGate.tsx");
    expect(src).not.toContain("CommunityMessengerRoomStableEntryShell");
    expect(src).toContain("data-cm-room-bootstrap-pending");
  });
});

describe("domain authority cutover — OS tray removal contract", () => {
  it("exposes room-scoped removeDeliveredNotifications helper", () => {
    const src = read("lib/push/native/remove-delivered-notifications.ts");
    expect(src).toContain("removeDeliveredNotificationsMatching");
    expect(src).toContain("removeDeliveredNotificationsForRoomRead");
    expect(src).toContain("removeDeliveredNotificationOnPushTap");
    expect(src).not.toContain("removeAllDeliveredNotifications()");
  });

  it("PushRouteListener removes selected notification on tap with exact object", () => {
    const src = read("components/push/PushRouteListener.tsx");
    expect(src).toContain("removeDeliveredNotificationOnPushTap");
    expect(src).toContain("tappedNotification");
  });

  it("room mark_read clears delivered notifications for the room", () => {
    const src = read("lib/community-messenger/room/use-messenger-room-open-mark-read-effect.ts");
    expect(src).toContain("removeDeliveredNotificationsForRoomRead");
  });

  it("matches numeric OS id to string notificationId", () => {
    expect(coerceNotificationId(42)).toBe("42");
    expect(
      matchDeliveredNotificationForTest(
        { notificationId: "42", roomId: "r1" },
        42,
        { notificationId: "42" }
      )
    ).toBe(true);
    expect(
      matchDeliveredNotificationForTest(
        { tag: "n-99", roomId: "r1" },
        "other",
        { notificationId: "n-99" }
      )
    ).toBe(true);
    expect(
      matchDeliveredNotificationForTest(
        { roomId: "r1", domain: "trade" },
        "1",
        { roomId: "r1", domain: "trade" }
      )
    ).toBe(true);
    expect(
      matchDeliveredNotificationForTest(
        { roomId: "r1", domain: "trade" },
        "1",
        { roomId: "r2", domain: "trade" }
      )
    ).toBe(false);
  });
});
