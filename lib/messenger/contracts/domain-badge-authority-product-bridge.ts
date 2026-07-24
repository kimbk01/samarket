/**
 * Notification/Badge Authority → Surface Apply (exactly one apply entry).
 *
 * LOCK:
 * - Surfaces receive Projection only (no per-path formulas).
 * - Builder is `buildNotificationBadgeProjection` (pure, single).
 * - DO NOT: hub↔App Icon cross-write, Bell total→App Icon, path-local Surface math.
 * - DO NOT overwrite store-scoped FAB field (`storeOrderChatUnread`) with global owner aggregate
 *   (prevents owner FAB 1→3→1 when customer route applies Domain badge-count).
 * Phase J4: half-publish + dead surface-resync helper removed (call-0).
 */
import { applyAppIconBadgeProjection } from "@/lib/chat-domain/projections/app-icon-badge-projection";
import { applyDomainAuthorityHubBadgeOptimistic } from "@/lib/chats/owner-hub-badge-store";
import type { NotificationBadgeProjection } from "@/lib/notifications/build-notification-badge-projection";
import { patchNotificationBadgeCountSnapshot } from "@/lib/notifications/notification-badge-count-store";

/**
 * THE Projection Apply — Bottom/Trade/Order Hub + App Icon + Bell + OS tray remove.
 * Call only with output of `buildNotificationBadgeProjection`.
 * App Icon uses projection.appIconTotal — NEVER Bell total mirror.
 */
export function applyNotificationBadgeProjection(
  projection: NotificationBadgeProjection,
  opts?: { applyBell?: boolean; projectionVersionMs?: number }
): void {
  if (typeof window === "undefined") return;
  const versionMs = Math.max(0, Math.floor(Number(opts?.projectionVersionMs) || Date.now()));
  applyDomainAuthorityHubBadgeOptimistic({
    communityMessengerUnread: projection.bottomChat,
    tradeUnread: projection.tradeHub,
    /** Global owner aggregate — never overwrite store-scoped FAB field. */
    storeOrderOwnerUnreadRooms: projection.storeOrderOwnerUnreadRooms,
    /** Customer messenger 「주문 채팅」 pillar — buyer_order room count. */
    buyerOrderAttention: projection.storeOrderCustomerUnreadRooms,
  });
  void import("@/lib/messenger/contracts/domain-badge-surface-store").then((mod) => {
    mod.publishDomainBadgeShellToSurfaceStore({
      communityMessengerUnread: projection.appIcon.messenger,
      tradeUnread: projection.appIcon.trade,
      storeOrderChatUnread: projection.appIcon.storeOrder,
    });
    mod.publishMissedCallToDomainBadgeSurface(projection.appIcon.missedCall);
  });
  applyAppIconBadgeProjection({
    totalUnread: Math.max(0, projection.appIconTotal),
    versionMs,
    source: "network",
  });
  if (opts?.applyBell !== false) {
    patchNotificationBadgeCountSnapshot(projection.bell, "network", versionMs);
  }
  if (projection.osNotificationRemove.length > 0) {
    void import("@/lib/push/native/remove-delivered-notifications").then((mod) => {
      for (const match of projection.osNotificationRemove) {
        void mod.removeDeliveredNotificationsMatching(match);
      }
    });
  }
}
