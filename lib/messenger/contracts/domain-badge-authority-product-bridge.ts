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
 * Phase 3-1 (2026-07-31): App Icon = one complete snapshot publish (no shell/missedCall split emit).
 *
 * App Icon runtime authority = domain-badge-surface-store only.
 * applyAppIconBadgeProjection remains a Phase H contract mirror (not NativeBadgeSync source).
 */
import { applyAppIconBadgeProjection } from "@/lib/chat-domain/projections/app-icon-badge-projection";
import { applyDomainAuthorityHubBadgeOptimistic } from "@/lib/chats/owner-hub-badge-store";
import type { NotificationBadgeProjection } from "@/lib/notifications/build-notification-badge-projection";
import { patchNotificationBadgeCountSnapshot } from "@/lib/notifications/notification-badge-count-store";
import {
  getDomainBadgeSurfaceAuthEpoch,
  publishDomainAppIconCompleteSnapshot,
} from "@/lib/messenger/contracts/domain-badge-surface-store";

/** Owner hub / FAB / Bottom Chat CM publish — not App Icon runtime authority. */
function applyOwnerHubSurfacesFromProjection(projection: NotificationBadgeProjection): void {
  applyDomainAuthorityHubBadgeOptimistic({
    communityMessengerUnread: projection.bottomChat,
    tradeUnread: projection.tradeHub,
    /** Global owner aggregate — never overwrite store-scoped FAB field. */
    storeOrderOwnerUnreadRooms: projection.storeOrderOwnerUnreadRooms,
    /** Customer messenger 「주문 채팅」 pillar — buyer_order room count. */
    buyerOrderAttention: projection.storeOrderCustomerUnreadRooms,
  });
}

/**
 * App Icon runtime publish (4-axis complete) + Phase H contract mirror.
 * Separated from Owner hub apply so hub-only writes cannot drive NativeBadgeSync.
 * Synchronous complete snapshot — one generation, one emit, one NativeBadgeSync reaction.
 */
function applyAppIconRuntimeAuthorityFromProjection(
  projection: NotificationBadgeProjection,
  versionMs: number
): void {
  const authEpochAtSchedule = getDomainBadgeSurfaceAuthEpoch();
  publishDomainAppIconCompleteSnapshot({
    communityMessengerUnread: projection.appIcon.messenger,
    tradeUnread: projection.appIcon.trade,
    storeOrderChatUnread: projection.appIcon.storeOrder,
    missedCall: projection.appIcon.missedCall,
    authEpochAtSchedule,
    projectionFactsVersion: versionMs,
  });
  /** Phase H contract mirror — NativeBadgeSync must not read this store. */
  applyAppIconBadgeProjection({
    totalUnread: Math.max(0, projection.appIconTotal),
    versionMs,
    source: "network",
  });
}

/**
 * THE Projection Apply — Owner hub + App Icon runtime + Bell + OS tray remove.
 * Call only with output of `buildNotificationBadgeProjection`.
 * App Icon runtime uses domain-badge-surface-store — NEVER Bell total / Owner hub aggregate.
 */
export function applyNotificationBadgeProjection(
  projection: NotificationBadgeProjection,
  opts?: { applyBell?: boolean; projectionVersionMs?: number }
): void {
  if (typeof window === "undefined") return;
  const versionMs = Math.max(0, Math.floor(Number(opts?.projectionVersionMs) || Date.now()));
  applyOwnerHubSurfacesFromProjection(projection);
  applyAppIconRuntimeAuthorityFromProjection(projection, versionMs);
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
