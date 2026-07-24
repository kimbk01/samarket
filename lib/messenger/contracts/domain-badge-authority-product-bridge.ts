/**
 * Notification/Badge Authority → Surface Apply (exactly one apply entry).
 *
 * LOCK:
 * - Surfaces receive Projection only (no per-path formulas).
 * - Builder is `buildNotificationBadgeProjection` (pure, single).
 * - DO NOT: hub↔App Icon cross-write, Bell total→App Icon, path-local Surface math.
 */
import type { ChatDomainBadgeShellResult } from "@/lib/chat-domain/shell/hub-badge-shell-aggregator";
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
    storeOrderChatUnread: projection.storeOrderHub,
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

/**
 * @deprecated Prefer `applyNotificationBadgeProjection`. Nav-only half for transitional callers.
 */
export function publishDomainBadgeAuthorityShellToNav(input: {
  viewerUserId: string;
  shell: ChatDomainBadgeShellResult;
}): void {
  if (typeof window === "undefined") return;
  const viewer = input.viewerUserId.trim();
  if (!viewer) return;
  applyDomainAuthorityHubBadgeOptimistic({
    communityMessengerUnread: input.shell.communityMessengerUnread,
    tradeUnread: input.shell.tradeUnread,
    storeOrderChatUnread: input.shell.storeOrderChatUnread,
  });
}

/**
 * @deprecated Prefer `applyNotificationBadgeProjection`. App Icon half for transitional callers.
 */
export function publishDomainBadgeShellToAppIcon(shell: {
  communityMessengerUnread: number;
  tradeUnread: number;
  storeOrderChatUnread: number;
  missedCall?: number;
}): void {
  if (typeof window === "undefined") return;
  void import("@/lib/messenger/contracts/domain-badge-surface-store").then((mod) => {
    mod.publishDomainBadgeShellToSurfaceStore({
      communityMessengerUnread: shell.communityMessengerUnread,
      tradeUnread: shell.tradeUnread,
      storeOrderChatUnread: shell.storeOrderChatUnread,
    });
    if (shell.missedCall != null) {
      mod.publishMissedCallToDomainBadgeSurface(shell.missedCall);
    }
  });
}

/**
 * Cold/Resume/Poll/mark_read without Atomic Projection — Fact fetch → Builder → Apply.
 */
export function scheduleDomainBadgeSurfaceResync(viewerUserId?: string | null): void {
  if (typeof window === "undefined") return;
  void viewerUserId;
  void import("@/lib/notifications/apply-badge-count-authority-response").then((mod) => {
    void mod.resyncNotificationBadgeAuthorityFromBadgeCount();
  });
}
